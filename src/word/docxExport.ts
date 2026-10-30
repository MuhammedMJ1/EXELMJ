// EXELMJ docx exporter — TipTap JSON → .docx bytes via the `docx` library.
//
// Arabic-correctness rules (verified against OOXML docs + docx#3419):
// - Every RTL paragraph gets BOTH `bidirectional: true` (w:bidi) AND an
//   explicit `alignment` — bidirectional alone leaves text stuck LEFT in Word.
// - Physical editor alignment maps to LOGICAL jc: rtl+right → START,
//   rtl+left → END (and mirrored for LTR), center/justify pass through. That
//   round-trips with the importer without ever flipping sides.
// - Runs containing Arabic get `rightToLeft: true` (w:rtl), and bold/italic/
//   size are emitted with their complex-script mirrors (w:bCs/w:iCs/w:szCs) —
//   without those Word applies the format to Latin text only.
// - Tables in an RTL document get `visuallyRightToLeft`.
import {
  AlignmentType,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  LevelFormat,
  PageBreak,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  SimpleMailMergeField,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import { docxComments, type CommentThread } from './comments'
import {
  contentWidthPx,
  defaultPageSetup,
  mmToTwip,
  PAPER_MM,
  type PageSetup
} from './pageSetup'

// Minimal structural view of TipTap's getJSON() output.
export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>
  text?: string
}

const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/

const NUMBERED_REF = 'exelmj-numbered'

const HIGHLIGHT_NAMES: Record<string, string> = {
  '#ffff00': 'yellow', '#00ff00': 'green', '#00ffff': 'cyan', '#ff00ff': 'magenta',
  '#0000ff': 'blue', '#ff0000': 'red', '#00008b': 'darkBlue', '#008b8b': 'darkCyan',
  '#006400': 'darkGreen', '#8b008b': 'darkMagenta', '#8b0000': 'darkRed',
  '#808000': 'darkYellow', '#a9a9a9': 'darkGray', '#d3d3d3': 'lightGray', '#000000': 'black'
}

/** Physical editor alignment + direction → logical OOXML alignment. */
export function alignForExport(
  align: string | undefined,
  rtl: boolean
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (align) {
    case 'right': return rtl ? AlignmentType.START : AlignmentType.END
    case 'left': return rtl ? AlignmentType.END : AlignmentType.START
    case 'center': return AlignmentType.CENTER
    case 'justify': return AlignmentType.JUSTIFIED
    default: return rtl ? AlignmentType.START : undefined
  }
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp' } | null {
  const m = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return null
  const kind = m[1].toLowerCase()
  const type =
    kind === 'jpeg' || kind === 'jpg' ? 'jpg' : kind === 'gif' ? 'gif' : kind === 'bmp' ? 'bmp' : kind === 'png' ? 'png' : null
  // webp/svg would corrupt the file if stamped with a false type — skip them.
  if (!type) return null
  const bin = typeof atob === 'function' ? atob(m[2]) : Buffer.from(m[2], 'base64').toString('binary')
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, type }
}

/**
 * Intrinsic pixel size straight out of the file header. Needed because an
 * image can reach the document without width/height attributes (a paste, or an
 * older file), and falling back to a fixed 300x200 box squashed every wide
 * picture the moment it was saved to Word.
 */
export function intrinsicSize(
  bytes: Uint8Array,
  type: 'png' | 'jpg' | 'gif' | 'bmp'
): { width: number; height: number } | null {
  const be32 = (i: number) => (bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]
  const le32 = (i: number) => bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)
  const le16 = (i: number) => bytes[i] | (bytes[i + 1] << 8)
  try {
    if (type === 'png' && bytes.length > 24) {
      return { width: be32(16), height: be32(20) }
    }
    if (type === 'gif' && bytes.length > 10) {
      return { width: le16(6), height: le16(8) }
    }
    if (type === 'bmp' && bytes.length > 26) {
      return { width: le32(18), height: Math.abs(le32(22)) }
    }
    if (type === 'jpg') {
      let i = 2
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) {
          i++
          continue
        }
        const marker = bytes[i + 1]
        // SOF0..SOF15, skipping the four that are not frame headers
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: (bytes[i + 7] << 8) | bytes[i + 8], height: (bytes[i + 5] << 8) | bytes[i + 6] }
        }
        i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3])
      }
    }
  } catch {
    return null
  }
  return null
}

/** Display size in CSS pixels: the node's own attrs, else the file's own size
 *  scaled down to the text column. Never a fixed box — that distorts. */
export function imageBoxPx(
  node: TipTapNode,
  bytes: Uint8Array,
  type: 'png' | 'jpg' | 'gif' | 'bmp',
  maxWidth: number
): { width: number; height: number } {
  const attrW = Number(node.attrs?.width) || 0
  const attrH = Number(node.attrs?.height) || 0
  const natural = intrinsicSize(bytes, type)
  let width = attrW || natural?.width || 300
  let height = attrH || natural?.height || (natural ? natural.height : 200)
  if (attrW && !attrH && natural?.width) height = Math.round((attrW * natural.height) / natural.width)
  if (!attrW && attrH && natural?.height) width = Math.round((attrH * natural.width) / natural.height)
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width)
    width = Math.round(maxWidth)
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
}

/** thread id → Word's numeric comment id, for the current export. */
let commentIds: Map<string, number> = new Map()
/** Word wants a unique id per revision; they are numbered per export. */
let revisionId = 1
/** footnote data-id → Word's 1-based footnote number, for the current export. */
let footnoteNumbers: Map<string, number> = new Map()

function textRunsFor(
  node: TipTapNode,
  paraRtl: boolean,
  maxImageWidth = contentWidthPx(defaultPageSetup())
): (
  | TextRun
  | ImageRun
  | ExternalHyperlink
  | SimpleMailMergeField
  | CommentRangeStart
  | CommentRangeEnd
  | CommentReference
  | InsertedTextRun
  | DeletedTextRun
)[] {
  if (node.type === 'hardBreak') return [new TextRun({ break: 1 })]
  if (node.type === 'image') {
    const src = String(node.attrs?.src ?? '')
    const img = dataUrlToBytes(src)
    if (!img) return []
    const box = imageBoxPx(node, img.bytes, img.type, maxImageWidth)
    return [new ImageRun({ type: img.type, data: img.bytes, transformation: box })]
  }
  // An unmerged field becomes Word's own MERGEFIELD, so a .docx handed to
  // someone else still opens as a real merge document there.
  if (node.type === 'mergeField') {
    const attrs = (node.attrs ?? {}) as Record<string, unknown>
    const source = String(attrs.source ?? 'column')
    const name =
      source === 'column'
        ? String(attrs.name ?? '')
        : source === 'date'
          ? 'التاريخ'
          : source === 'hijri'
            ? 'التاريخ الهجري'
            : 'رقم السجل'
    return [new SimpleMailMergeField(name || 'حقل')]
  }
  if (node.type === 'footnoteReference') {
    const id = String((node.attrs ?? {})['data-id'] ?? '')
    const number = footnoteNumbers.get(id)
    // a reference with no footnote behind it would renumber the whole document
    return number ? [new FootnoteReferenceRun(number)] : []
  }
  if (node.type !== 'text' || !node.text) return []

  const opts: Record<string, unknown> = { text: node.text }
  let highlightHex: string | undefined
  let linkHref: string | undefined
  let commentId: number | undefined
  let tracked: { kind: 'ins' | 'del'; author: string; date: string } | undefined
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'link':
        if (typeof mark.attrs?.href === 'string') linkHref = mark.attrs.href
        break
      case 'bold':
        opts.bold = true
        opts.boldComplexScript = true
        break
      case 'italic':
        opts.italics = true
        opts.italicsComplexScript = true
        break
      case 'underline':
        opts.underline = {}
        break
      case 'strike':
        opts.strike = true
        break
      case 'superscript':
        opts.superScript = true
        break
      case 'subscript':
        opts.subScript = true
        break
      case 'insertion':
      case 'deletion': {
        tracked = {
          kind: mark.type === 'insertion' ? 'ins' : 'del',
          author: String(mark.attrs?.authorName ?? '—'),
          date: String(mark.attrs?.timestamp ?? new Date().toISOString())
        }
        break
      }
      case 'comment': {
        const id = commentIds.get(String(mark.attrs?.commentId ?? ''))
        if (id !== undefined) commentId = id
        break
      }
      case 'highlight':
        highlightHex = String(mark.attrs?.color ?? '#ffff00').toLowerCase()
        break
      case 'textStyle': {
        const a = mark.attrs ?? {}
        if (typeof a.color === 'string' && a.color) opts.color = a.color.replace('#', '')
        if (typeof a.fontFamily === 'string' && a.fontFamily) {
          const family = a.fontFamily.split(',')[0].trim().replace(/^['"]|['"]$/g, '')
          opts.font = { ascii: family, hAnsi: family, cs: family }
        }
        const size = typeof a.fontSize === 'string' ? a.fontSize : ''
        const pt = /^([\d.]+)pt$/.exec(size)?.[1] ?? (/^([\d.]+)px$/.exec(size) ? String(Number(/^([\d.]+)px$/.exec(size)![1]) * 0.75) : undefined)
        if (pt) {
          const half = Math.round(Number(pt) * 2)
          opts.size = half
          opts.sizeComplexScript = half
        }
        break
      }
    }
  }
  if (highlightHex) {
    const named = HIGHLIGHT_NAMES[highlightHex]
    if (named) opts.highlight = named
    else opts.shading = { type: ShadingType.CLEAR, fill: highlightHex.replace('#', '') }
  }
  if (paraRtl || ARABIC_RE.test(node.text)) opts.rightToLeft = true
  // A tracked edit is a Word revision, not styled text: the reviewer opening
  // the file gets the real Accept/Reject buttons.
  if (tracked) {
    // id/author/date sit FLAT on the options; nesting them under `revision`
    // writes w:rPrChange instead, which means "formatting changed", not
    // "this text was inserted" — Word then shows no revision at all.
    const runOpts = {
      ...opts,
      id: revisionId++,
      author: tracked.author,
      date: tracked.date
    } as ConstructorParameters<typeof InsertedTextRun>[0]
    return [tracked.kind === 'ins' ? new InsertedTextRun(runOpts) : new DeletedTextRun(runOpts)]
  }
  const run = new TextRun(opts as ConstructorParameters<typeof TextRun>[0])
  const body: (TextRun | ExternalHyperlink)[] =
    linkHref && /^https?:|^mailto:/i.test(linkHref)
      ? [new ExternalHyperlink({ children: [run], link: linkHref })]
      : [run]
  // A commented range is bracketed by the range marks plus a reference, which
  // is what makes Word draw the balloon in the margin.
  if (commentId !== undefined) {
    return [
      new CommentRangeStart(commentId),
      ...body,
      new CommentRangeEnd(commentId),
      new CommentReference(commentId)
    ]
  }
  return body
}

interface ParaOpts {
  heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]
  bullet?: { level: number }
  numbering?: { reference: string; level: number; instance: number }
  quote?: boolean
}

function paragraphFor(
  node: TipTapNode,
  docRtl: boolean,
  extra: ParaOpts = {},
  maxImageWidth?: number
): Paragraph {
  const attrs = node.attrs ?? {}
  const dir = typeof attrs.dir === 'string' ? attrs.dir : undefined
  const rtl = dir ? dir === 'rtl' : docRtl
  const align = typeof attrs.textAlign === 'string' ? attrs.textAlign : undefined
  const children = (node.content ?? []).flatMap((child) => textRunsFor(child, rtl, maxImageWidth))
  // w:line is in 240ths of a line ("auto" rule = a multiplier), which is
  // exactly what the editor's CSS line-height means.
  const lineHeight = Number(attrs.lineHeight)
  const before = Number(attrs.spaceBefore)
  const after = Number(attrs.spaceAfter)
  const spacingParts = {
    ...(Number.isFinite(lineHeight) && lineHeight > 0
      ? { line: Math.round(lineHeight * 240), lineRule: 'auto' as const }
      : {}),
    // w:before / w:after are twentieths of a point
    ...(Number.isFinite(before) && before > 0 ? { before: Math.round(before * 20) } : {}),
    ...(Number.isFinite(after) && after > 0 ? { after: Math.round(after * 20) } : {})
  }
  const spacing = Object.keys(spacingParts).length ? spacingParts : undefined
  return new Paragraph({
    children,
    bidirectional: rtl || undefined,
    alignment: alignForExport(align, rtl),
    ...(spacing ? { spacing } : {}),
    ...(extra.quote
      ? {
          indent: { start: 720 },
          // OOXML paragraph borders are PHYSICAL, so the rule follows the
          // paragraph's own direction to stay on the reading-start side.
          border: rtl
            ? { right: { style: BorderStyle.SINGLE, size: 12, color: 'D0D5DD', space: 8 } }
            : { left: { style: BorderStyle.SINGLE, size: 12, color: 'D0D5DD', space: 8 } }
        }
      : {}),
    ...(extra.heading ? { heading: extra.heading } : {}),
    ...(extra.bullet ? { bullet: extra.bullet } : {}),
    ...(extra.numbering ? { numbering: extra.numbering } : {})
  })
}

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4
] as const

function blockToDocx(
  node: TipTapNode,
  docRtl: boolean,
  state: { numberedInstance: number; maxImageWidth: number }
): (Paragraph | Table)[] {
  switch (node.type) {
    case 'paragraph':
      return [paragraphFor(node, docRtl, {}, state.maxImageWidth)]
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level) || 1))
      return [paragraphFor(node, docRtl, { heading: HEADING_LEVELS[level - 1] }, state.maxImageWidth)]
    }
    case 'bulletList':
    case 'orderedList': {
      const out: (Paragraph | Table)[] = []
      // Each list node keeps ITS OWN kind — a bullet list nested inside a
      // numbered one must not inherit numbering (and vice versa). Every
      // ordered list gets a fresh numbering instance so it restarts at 1.
      const walkList = (list: TipTapNode, level: number) => {
        const ordered = list.type === 'orderedList'
        const instance = ordered ? ++state.numberedInstance : 0
        for (const item of list.content ?? []) {
          for (const child of item.content ?? []) {
            if (child.type === 'paragraph') {
              out.push(
                paragraphFor(
                  child,
                  docRtl,
                  ordered
                    ? { numbering: { reference: NUMBERED_REF, level: Math.min(level, 2), instance } }
                    : { bullet: { level: Math.min(level, 8) } },
                  state.maxImageWidth
                )
              )
            } else if (child.type === 'bulletList' || child.type === 'orderedList') {
              walkList(child, level + 1)
            }
          }
        }
      }
      walkList(node, 0)
      return out
    }
    case 'pageBreak':
      return [new Paragraph({ children: [new PageBreak()] })]
    case 'horizontalRule':
      // OOXML has no <hr>: a bordered empty paragraph is how Word draws one.
      return [
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } },
          bidirectional: docRtl || undefined
        })
      ]
    case 'blockquote':
      // Word has no quote NODE: its Quote style is an indented paragraph with a
      // rule down the side, so each child paragraph is emitted that way.
      return (node.content ?? []).flatMap((child) =>
        child.type === 'paragraph'
          ? [paragraphFor(child, docRtl, { quote: true }, state.maxImageWidth)]
          : blockToDocx(child, docRtl, state)
      )
    case 'table': {
      const rows: TableRow[] = []
      for (const tr of node.content ?? []) {
        const cells: TableCell[] = []
        for (const tc of tr.content ?? []) {
          const cellBlocks = (tc.content ?? []).flatMap((b) => blockToDocx(b, docRtl, state))
          const colspan = Number(tc.attrs?.colspan) || 1
          const rowspan = Number(tc.attrs?.rowspan) || 1
          const bg = String(tc.attrs?.backgroundColor ?? '')
          const shading = /^#[0-9a-fA-F]{6}$/.test(bg)
            ? { shading: { type: ShadingType.CLEAR, fill: bg.slice(1).toLowerCase() } }
            : {}
          // a cell that only lines text up (a converted PDF header block) must
          // not gain a grid it never had in the original
          const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
          // colwidth is what the editor stores when a table is sized (and what
          // the PDF importer copies out of the file): 1px = 15 twentieths of a
          // point, so a converted table keeps its columns in Word too.
          const colwidth = Array.isArray(tc.attrs?.colwidth)
            ? Number((tc.attrs.colwidth as unknown[])[0])
            : Number(tc.attrs?.colwidth)
          cells.push(
            new TableCell({
              children: cellBlocks.length ? cellBlocks : [new Paragraph({ bidirectional: docRtl || undefined })],
              ...(Number.isFinite(colwidth) && colwidth > 0
                ? { width: { size: Math.round(colwidth * 15), type: WidthType.DXA } }
                : {}),
              ...(tc.attrs?.borderless
                ? { borders: { top: none, bottom: none, left: none, right: none } }
                : {}),
              ...(colspan > 1 ? { columnSpan: colspan } : {}),
              ...(rowspan > 1 ? { rowSpan: rowspan } : {}),
              ...shading
            })
          )
        }
        // Word repeats a row flagged tblHeader at the top of every page the
        // table spills onto — the same job <thead> does when printing.
        const heads = (tr.content ?? []).length > 0 &&
          (tr.content ?? []).every((tc) => tc.type === 'tableHeader')
        rows.push(new TableRow({ children: cells, tableHeader: heads || undefined }))
      }
      return [
        new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          visuallyRightToLeft: docRtl || undefined
        })
      ]
    }
    default:
      return []
  }
}

/** True when the document's overall base direction should be RTL. */
export function docIsRtl(doc: TipTapNode, uiLang: string): boolean {
  const blocks = doc.content ?? []
  let rtlVotes = 0
  let votes = 0
  for (const block of blocks) {
    const dir = typeof block.attrs?.dir === 'string' ? (block.attrs.dir as string) : undefined
    if (dir) {
      votes++
      if (dir === 'rtl') rtlVotes++
    }
  }
  if (votes) return rtlVotes * 2 >= votes
  return uiLang === 'ar'
}

/** Header/footer band: the user's text plus, optionally, the live page number. */
function bandParagraph(text: string, withNumber: boolean, rtl: boolean): Paragraph {
  const runs: TextRun[] = []
  if (text) runs.push(new TextRun({ text, rightToLeft: rtl || ARABIC_RE.test(text) }))
  if (withNumber) {
    if (text) runs.push(new TextRun({ text: '  -  ', rightToLeft: rtl }))
    runs.push(new TextRun({ children: [PageNumber.CURRENT] }))
  }
  return new Paragraph({
    children: runs,
    bidirectional: rtl || undefined,
    alignment: alignForExport(rtl ? 'right' : 'left', rtl)
  })
}

export interface ExportOptions {
  page?: PageSetup
  /** Review notes to write as real Word comments. */
  comments?: CommentThread[]
}

export async function exportDocx(
  doc: TipTapNode,
  uiLang: string,
  options: ExportOptions = {}
): Promise<Uint8Array> {
  const docRtl = docIsRtl(doc, uiLang)
  const page = options.page ?? defaultPageSetup()
  const state = { numberedInstance: 0, maxImageWidth: contentWidthPx(page) }
  revisionId = 1
  // The footnote list lives at the END of the ProseMirror document; Word keeps
  // it in its own part, so it is numbered first, then skipped in the body.
  const footnoteBlocks = (doc.content ?? []).filter((block) => block.type === 'footnotes')
  const footnoteItems = footnoteBlocks.flatMap((block) => block.content ?? [])
  footnoteNumbers = new Map(
    footnoteItems.map((item, index) => [String((item.attrs ?? {})['data-id'] ?? ''), index + 1])
  )
  const threads = options.comments ?? []
  const flat = docxComments(threads)
  commentIds = flat.ids
  const children = (doc.content ?? [])
    .filter((block) => block.type !== 'footnotes')
    .flatMap((block) => blockToDocx(block, docRtl, state))
  const footnotes: Record<number, { children: Paragraph[] }> = {}
  footnoteItems.forEach((item, index) => {
    const blocks = (item.content ?? []).flatMap((block) => blockToDocx(block, docRtl, state))
    footnotes[index + 1] = {
      children: blocks.filter((block): block is Paragraph => block instanceof Paragraph)
    }
  })
  const document = new Document({
    ...(footnoteItems.length ? { footnotes } : {}),
    ...(flat.comments.length
      ? {
          comments: {
            children: flat.comments.map((comment) => ({
              id: comment.id,
              author: comment.author,
              initials: comment.initials,
              date: new Date(comment.date),
              ...(comment.parentId !== undefined ? { parentId: comment.parentId } : {}),
              ...(comment.resolved ? { resolved: true } : {}),
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: comment.text, rightToLeft: docRtl || ARABIC_RE.test(comment.text) })
                  ],
                  bidirectional: docRtl || undefined,
                  alignment: alignForExport(docRtl ? 'right' : 'left', docRtl)
                })
              ]
            }))
          }
        }
      : {}),
    numbering: {
      config: [
        {
          reference: NUMBERED_REF,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } }
          }))
        }
      ]
    },
    styles: {
      default: {
        document: {
          // half-points: the document's own body size, so a file converted from
          // a 6pt statement opens in Word at 6pt, not at the editor's default
          run: {
            font: { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial' },
            size: Math.round((page.baseFontPt || 11) * 2),
            sizeComplexScript: Math.round((page.baseFontPt || 11) * 2)
          }
        }
      }
    },
    sections: [
      {
        properties: {
          page: {
            // Portrait dimensions plus the orientation flag: the docx library
            // swaps them itself for landscape, so swapping here too would undo it.
            size: {
              width: mmToTwip(PAPER_MM[page.size].width),
              height: mmToTwip(PAPER_MM[page.size].height),
              orientation:
                page.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT
            },
            margin: {
              top: mmToTwip(page.margin.top),
              bottom: mmToTwip(page.margin.bottom),
              left: mmToTwip(page.margin.left),
              right: mmToTwip(page.margin.right)
            }
          }
        },
        ...(page.header || page.watermark
          ? {
              headers: {
                default: new Header({
                  children: [
                    ...(page.header ? [bandParagraph(page.header, false, docRtl)] : []),
                    // Word draws a watermark as a shape in the header; the docx
                    // library has no shape API, so it goes in as large pale
                    // text there — it still repeats on every page, which is the
                    // whole point of a "DRAFT" or "CONFIDENTIAL" stamp.
                    ...(page.watermark
                      ? [
                          new Paragraph({
                            alignment: AlignmentType.CENTER,
                            bidirectional: docRtl || undefined,
                            children: [
                              new TextRun({
                                text: page.watermark,
                                bold: true,
                                size: 72,
                                sizeComplexScript: 72,
                                color: 'D9D9D9',
                                rightToLeft: docRtl || undefined
                              })
                            ]
                          })
                        ]
                      : [])
                  ]
                })
              }
            }
          : {}),
        ...(page.footer || page.pageNumbers
          ? {
              footers: {
                default: new Footer({
                  children: [bandParagraph(page.footer, page.pageNumbers, docRtl)]
                })
              }
            }
          : {}),
        children: children.length ? children : [new Paragraph({})]
      }
    ]
  })
  const base64 = await Packer.toBase64String(document)
  if (typeof atob === 'function') {
    const bin = atob(base64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes
  }
  return new Uint8Array(Buffer.from(base64, 'base64'))
}
