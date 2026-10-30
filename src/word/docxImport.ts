// EXELMJ docx importer — .docx bytes → HTML for the TipTap editor.
//
// Written in-house (same precedent as src/xlsx/): the popular converters are
// unusable for Arabic — mammoth deliberately drops alignment, direction, fonts
// and colors (a right-aligned RTL paragraph comes out as a bare LTR <p>), and
// docx-preview is read-only. This importer keeps exactly what the editor
// models: paragraphs/headings with LOGICAL alignment + direction, run
// formatting (incl. the complex-script mirrors Word uses for Arabic), lists,
// tables, and embedded images.
//
// OOXML bidi rules honored here (see PROJECT_MAP):
// - w:bidi (paragraph) flips paragraph geometry; w:jc start/end are LOGICAL:
//   start = RIGHT in an RTL paragraph, LEFT in LTR. left/right/center are
//   physical. We resolve to a physical text-align for display but keep dir as
//   its own attribute, so exporting maps back to logical start/end losslessly.
// - Direction/alignment often live in styles.xml (docDefaults or the paragraph
//   style), not on each w:pPr — both are resolved through the style chain.
// - Arabic formatting arrives via CS mirrors (w:bCs/w:szCs): accepted as
//   fallbacks when the base property is absent.
import JSZip from 'jszip'
import type { CommentReply, CommentThread } from './comments'
import { XMLParser } from 'fast-xml-parser'
import { defaultPageSetup, PAPER_MM, type PageSetup } from './pageSetup'

export interface DocxImportResult {
  html: string
  warnings: string[]
  /** Section properties + header/footer text, when the file carries them. */
  page?: PageSetup
  /** Review notes, if the file carries any. */
  comments?: CommentThread[]
}

// fast-xml-parser preserveOrder node: { [tagName]: children[], ':@'?: attrs }
type XNode = Record<string, unknown>

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  removeNSPrefix: false,
  trimValues: false,
  // Never coerce text to numbers — "07717835312" must keep its leading zero.
  parseTagValue: false,
  parseAttributeValue: false
})

function tagName(node: XNode): string {
  return Object.keys(node).find((k) => k !== ':@') ?? ''
}
function children(node: XNode): XNode[] {
  const name = tagName(node)
  const kids = node[name]
  return Array.isArray(kids) ? (kids as XNode[]) : []
}
function attrs(node: XNode): Record<string, string> {
  return (node[':@'] as Record<string, string>) ?? {}
}
function findChild(node: XNode, name: string): XNode | undefined {
  return children(node).find((c) => tagName(c) === name)
}
function findChildren(node: XNode, name: string): XNode[] {
  return children(node).filter((c) => tagName(c) === name)
}
/** <w:b/> style toggles: present with no val, or an OnOff val negating it. */
function toggle(pr: XNode | undefined, name: string): boolean | undefined {
  if (!pr) return undefined
  const el = findChild(pr, name)
  if (!el) return undefined
  const v = attrs(el)['w:val']
  return v === '0' || v === 'false' || v === 'none' || v === 'off' ? false : true
}
function val(pr: XNode | undefined, name: string): string | undefined {
  if (!pr) return undefined
  const el = findChild(pr, name)
  return el ? attrs(el)['w:val'] : undefined
}

const HIGHLIGHT_HEX: Record<string, string> = {
  yellow: '#ffff00', green: '#00ff00', cyan: '#00ffff', magenta: '#ff00ff',
  blue: '#0000ff', red: '#ff0000', darkBlue: '#00008b', darkCyan: '#008b8b',
  darkGreen: '#006400', darkMagenta: '#8b008b', darkRed: '#8b0000',
  darkYellow: '#808000', darkGray: '#a9a9a9', lightGray: '#d3d3d3', black: '#000000'
}

interface ParaProps {
  lineHeight?: number
  spaceBefore?: number
  spaceAfter?: number
  bidi?: boolean
  jc?: string
  heading?: number
  numId?: string
  ilvl?: number
}
interface RunProps {
  vertical?: 'super' | 'sub'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  color?: string
  sizePt?: number
  font?: string
  highlight?: string
}

interface StyleDef extends ParaProps {
  basedOn?: string
  run: RunProps
}

function readParaProps(pPr: XNode | undefined): ParaProps {
  if (!pPr) return {}
  const out: ParaProps = {}
  if (findChild(pPr, 'w:bidi')) {
    const v = attrs(findChild(pPr, 'w:bidi')!)['w:val']
    out.bidi = !(v === '0' || v === 'false')
  }
  const jc = val(pPr, 'w:jc')
  if (jc) out.jc = jc
  const style = val(pPr, 'w:pStyle')
  if (style) {
    const m = /^Heading([1-9])$/i.exec(style)
    if (m) out.heading = Math.min(4, Number(m[1]))
  }
  const numPr = findChild(pPr, 'w:numPr')
  if (numPr) {
    out.numId = val(numPr, 'w:numId')
    out.ilvl = Number(val(numPr, 'w:ilvl') ?? '0')
  }
  // w:line is 240ths of a line under the "auto" rule — the CSS multiplier.
  const spacing = findChild(pPr, 'w:spacing')
  if (spacing) {
    const a = attrs(spacing)
    const line = Number(a['w:line'])
    const rule = a['w:lineRule'] ?? 'auto'
    if (Number.isFinite(line) && line > 0 && rule === 'auto') {
      const mult = Math.round((line / 240) * 100) / 100
      if (mult >= 0.5 && mult <= 5) out.lineHeight = mult
    }
    const before = Number(a['w:before'])
    const after = Number(a['w:after'])
    if (Number.isFinite(before) && before > 0) out.spaceBefore = Math.round(before / 20)
    if (Number.isFinite(after) && after > 0) out.spaceAfter = Math.round(after / 20)
  }
  return out
}

function readRunProps(rPr: XNode | undefined): RunProps {
  if (!rPr) return {}
  const out: RunProps = {}
  // Base property first, complex-script (Arabic) mirror as fallback.
  const b = toggle(rPr, 'w:b') ?? toggle(rPr, 'w:bCs')
  const i = toggle(rPr, 'w:i') ?? toggle(rPr, 'w:iCs')
  if (b) out.bold = true
  if (i) out.italic = true
  const u = val(rPr, 'w:u')
  if (u && u !== 'none') out.underline = true
  if (toggle(rPr, 'w:strike')) out.strike = true
  // Attribute-bound values are validated/sanitized — file content must never
  // be able to break out of the style/data attributes it is interpolated into.
  const color = val(rPr, 'w:color')
  if (color && /^[0-9a-fA-F]{6}$/.test(color)) out.color = `#${color.toLowerCase()}`
  const sz = val(rPr, 'w:sz') ?? val(rPr, 'w:szCs')
  if (sz && Number.isFinite(Number(sz))) out.sizePt = Number(sz) / 2
  const fonts = findChild(rPr, 'w:rFonts')
  if (fonts) {
    const a = attrs(fonts)
    // letters/digits/space/dot/hyphen only — no way to smuggle markup or
    // style separators through a font name
    const family = (a['w:cs'] ?? a['w:ascii'] ?? a['w:hAnsi'])
      ?.replace(/[^\w ؀-ۿ.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (family) out.font = family
  }
  const vert = val(rPr, 'w:vertAlign')
  if (vert === 'superscript') out.vertical = 'super'
  else if (vert === 'subscript') out.vertical = 'sub'
  const hl = val(rPr, 'w:highlight')
  if (hl && hl !== 'none') {
    if (HIGHLIGHT_HEX[hl]) out.highlight = HIGHLIGHT_HEX[hl]
    else if (/^[0-9a-fA-F]{6}$/.test(hl)) out.highlight = `#${hl.toLowerCase()}`
    // anything else is dropped, never passed through raw
  }
  // Word only has 15 named highlights, so anything else (ours included) is
  // written as run shading — read it back or the colour is lost on reopen.
  if (!out.highlight) {
    const shd = findChild(rPr, 'w:shd')
    const fill = shd ? attrs(shd)['w:fill'] : undefined
    if (fill && /^[0-9a-fA-F]{6}$/.test(fill) && fill.toLowerCase() !== 'ffffff') {
      out.highlight = `#${fill.toLowerCase()}`
    }
  }
  return out
}

/** styles.xml → docDefaults + styleId map (each with its basedOn chain). */
function readStyles(stylesXml: string | null): { defaults: ParaProps; byId: Map<string, StyleDef> } {
  const byId = new Map<string, StyleDef>()
  let defaults: ParaProps = {}
  if (!stylesXml) return { defaults, byId }
  try {
    const root = parser.parse(stylesXml) as XNode[]
    const styles = root.map((n) => (tagName(n) === 'w:styles' ? n : undefined)).find(Boolean)
    if (!styles) return { defaults, byId }
    const docDefaults = findChild(styles, 'w:docDefaults')
    const pPrDefault = docDefaults && findChild(docDefaults, 'w:pPrDefault')
    if (pPrDefault) defaults = readParaProps(findChild(pPrDefault, 'w:pPr'))
    for (const st of findChildren(styles, 'w:style')) {
      const id = attrs(st)['w:styleId']
      if (!id) continue
      const def: StyleDef = {
        ...readParaProps(findChild(st, 'w:pPr')),
        run: readRunProps(findChild(st, 'w:rPr'))
      }
      const basedOn = val(st, 'w:basedOn')
      if (basedOn) def.basedOn = basedOn
      const name = val(st, 'w:name') ?? ''
      const m = /^heading ([1-9])$/i.exec(name) ?? /^Heading([1-9])$/.exec(id)
      if (m) def.heading = Math.min(3, Number(m[1]))
      else {
        // Localized Word builds rename styles; w:outlineLvl is the invariant.
        const pPr = findChild(st, 'w:pPr')
        const outline = pPr ? val(pPr, 'w:outlineLvl') : undefined
        if (outline !== undefined && Number(outline) <= 5) def.heading = Math.min(3, Number(outline) + 1)
      }
      byId.set(id, def)
    }
  } catch {
    // styles are an enhancement — a paragraph-level parse still works
  }
  return { defaults, byId }
}

/** numbering.xml → numId → 'bullet' | 'ordered'. */
function readNumbering(numberingXml: string | null): Map<string, 'bullet' | 'ordered'> {
  const kinds = new Map<string, 'bullet' | 'ordered'>()
  if (!numberingXml) return kinds
  try {
    const root = parser.parse(numberingXml) as XNode[]
    const numbering = root.find((n) => tagName(n) === 'w:numbering')
    if (!numbering) return kinds
    const abstractKind = new Map<string, 'bullet' | 'ordered'>()
    for (const a of findChildren(numbering, 'w:abstractNum')) {
      const id = attrs(a)['w:abstractNumId']
      const lvl0 = findChildren(a, 'w:lvl').find((l) => attrs(l)['w:ilvl'] === '0')
      const fmt = lvl0 ? val(lvl0, 'w:numFmt') : undefined
      abstractKind.set(id, fmt === 'bullet' ? 'bullet' : 'ordered')
    }
    for (const n of findChildren(numbering, 'w:num')) {
      const id = attrs(n)['w:numId']
      const abstractId = val(n, 'w:abstractNumId')
      if (id && abstractId != null) kinds.set(id, abstractKind.get(abstractId) ?? 'ordered')
    }
  } catch {
    // fall back to ordered
  }
  return kinds
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Resolve jc against bidi: logical start/end become a physical align. */
export function resolveAlign(jc: string | undefined, rtl: boolean): string | undefined {
  switch (jc) {
    case 'start': return rtl ? 'right' : 'left'
    case 'end': return rtl ? 'left' : 'right'
    case 'left': return 'left'
    case 'right': return 'right'
    case 'center': return 'center'
    case 'both':
    case 'distribute':
    case 'thaiDistribute':
    // The kashida trio is what Arabic Word writes for justified text.
    case 'lowKashida':
    case 'mediumKashida':
    case 'highKashida': return 'justify'
    default: return undefined
  }
}

interface DocContext {
  styles: { defaults: ParaProps; byId: Map<string, StyleDef> }
  numbering: Map<string, 'bullet' | 'ordered'>
  images: Map<string, { dataUrl: string }>
  links: Map<string, string>
  warnings: string[]
  /** Word comment ids currently open around the runs being read. */
  openComments?: Set<string>
  /** The tracked edit the current runs sit inside, if any. */
  tracked?: { kind: 'ins' | 'del'; author: string; date: string }
  /** Word footnote id → its number and text, read from footnotes.xml. */
  footnotes?: Map<string, { number: number; html: string }>
}

/** Effective paragraph props: docDefaults ← style chain ← direct pPr. */
function effectiveParaProps(pPr: XNode | undefined, ctx: DocContext): ParaProps {
  const direct = readParaProps(pPr)
  const chain: StyleDef[] = []
  let styleId = pPr ? val(pPr, 'w:pStyle') : undefined
  let guard = 0
  while (styleId && guard++ < 8) {
    const def = ctx.styles.byId.get(styleId)
    if (!def) break
    chain.unshift(def)
    styleId = def.basedOn
  }
  const merged: ParaProps = { ...ctx.styles.defaults }
  for (const def of chain) {
    if (def.bidi !== undefined) merged.bidi = def.bidi
    if (def.jc !== undefined) merged.jc = def.jc
    if (def.heading !== undefined) merged.heading = def.heading
    if (def.lineHeight !== undefined) merged.lineHeight = def.lineHeight
    if (def.spaceBefore !== undefined) merged.spaceBefore = def.spaceBefore
    if (def.spaceAfter !== undefined) merged.spaceAfter = def.spaceAfter
  }
  for (const [k, v] of Object.entries(direct) as Array<[keyof ParaProps, never]>) {
    if (v !== undefined) (merged as Record<string, unknown>)[k] = v
  }
  return merged
}

function runToHtml(r: XNode, ctx: DocContext): string {
  const props = readRunProps(findChild(r, 'w:rPr'))
  let text = ''
  for (const child of children(r)) {
    const name = tagName(child)
    if (name === 'w:t' || name === 'w:delText') {
      const kids = children(child)
      text += esc(kids.map((k) => String((k as Record<string, unknown>)['#text'] ?? '')).join(''))
    } else if (name === 'w:br') {
      text += attrs(child)['w:type'] === 'page' ? '<span data-page-break="true"></span>' : '<br>'
    } else if (name === 'w:tab') {
      text += '&emsp;'
    } else if (name === 'w:footnoteReference') {
      const id = attrs(child)['w:id']
      const number = id ? (ctx.footnotes?.get(id)?.number ?? 0) : 0
      if (number) {
        text +=
          `<sup id="fnref:${number}"><a class="footnote-ref" data-id="fn-${number}"` +
          ` data-reference-number="${number}" href="#fn:${number}">${number}</a></sup>`
      }
    } else if (name === 'w:drawing') {
      text += drawingToHtml(child, ctx)
    } else if (name === 'w:pict') {
      ctx.warnings.push('pict')
    }
  }
  if (!text) return ''
  const styleParts: string[] = []
  if (props.color) styleParts.push(`color: ${props.color}`)
  if (props.sizePt) styleParts.push(`font-size: ${props.sizePt}pt`)
  // Quoted: names starting with a digit ("29LT Adir") or holding spaces are
  // not valid unquoted CSS identifiers, and the whole declaration is dropped.
  if (props.font) styleParts.push(`font-family: '${props.font}'`)
  if (styleParts.length) text = `<span style="${styleParts.join('; ')}">${text}</span>`
  if (props.highlight) text = `<mark data-color="${props.highlight}" style="background-color: ${props.highlight}">${text}</mark>`
  if (props.vertical === 'super') text = `<sup>${text}</sup>`
  else if (props.vertical === 'sub') text = `<sub>${text}</sub>`
  if (props.strike) text = `<s>${text}</s>`
  if (props.underline) text = `<u>${text}</u>`
  if (props.italic) text = `<em>${text}</em>`
  if (props.bold) text = `<strong>${text}</strong>`
  // a run inside a commentRangeStart/End pair carries the mark the editor reads
  const tracked = ctx.tracked
  if (tracked) {
    const tag = tracked.kind === 'ins' ? 'ins' : 'del'
    const id = `${tracked.kind}-${tracked.date || ''}-${tracked.author || ''}`.replace(/[^\w-]/g, '') || tracked.kind
    // Two spellings on purpose: data-change-id is what the mark's tag selector
    // matches, and the BARE names are what TipTap's default attribute parser
    // reads (node.getAttribute(attrName) — no data- prefix). Emitting only the
    // data- form gives an <ins> with every attribute null, so the change comes
    // back anonymous and cannot be accepted or rejected.
    text =
      `<${tag} data-change-id="${esc(id)}" changeId="${esc(id)}"` +
      ` authorName="${esc(tracked.author)}" timestamp="${esc(tracked.date)}"` +
      ` authorId="${esc(tracked.author)}">${text}</${tag}>`
  }
  const open = ctx.openComments
  if (open && open.size) {
    // the same "w" prefix readComments() gives the thread, or the mark would
    // point at a thread id that does not exist and no card would appear
    for (const id of open) text = `<span data-comment-id="w${esc(id)}">${text}</span>`
  }
  return text
}

function drawingToHtml(drawing: XNode, ctx: DocContext): string {
  // w:drawing → (wp:inline|wp:anchor) → a:graphic…a:blip r:embed → media part.
  let embedId: string | undefined
  let cx = 0
  let cy = 0
  const walk = (node: XNode) => {
    const name = tagName(node)
    if (name === 'a:blip') {
      embedId = attrs(node)['r:embed'] ?? embedId
    } else if (name === 'wp:extent' || name === 'a:ext') {
      const a = attrs(node)
      if (a.cx) cx = Number(a.cx)
      if (a.cy) cy = Number(a.cy)
    }
    for (const child of children(node)) walk(child)
  }
  walk(drawing)
  if (!embedId) return ''
  const media = ctx.images.get(embedId)
  if (!media) return ''
  // EMU → CSS px (914400 EMU per inch, 96 px per inch)
  const w = cx ? Math.round(cx / 9525) : 0
  const h = cy ? Math.round(cy / 9525) : 0
  const dims = w && h ? ` width="${w}" height="${h}"` : ''
  return `<img src="${media.dataUrl}"${dims}>`
}

/**
 * Inline content in DOCUMENT ORDER, recursing into the inline containers Word
 * wraps runs in: hyperlinks (kept as links), tracked-change insertions,
 * simple fields and content controls. A `||` shortcut here silently DELETED
 * hyperlink text from mixed paragraphs — never again.
 */
function inlineToHtml(parent: XNode, ctx: DocContext): string {
  let out = ''
  for (const child of children(parent)) {
    const name = tagName(child)
    if (name === 'w:r') {
      out += runToHtml(child, ctx)
    } else if (name === 'w:hyperlink') {
      const href = attrs(child)['r:id'] ? ctx.links.get(attrs(child)['r:id']) : undefined
      const inner = inlineToHtml(child, ctx)
      out += href && /^https?:|^mailto:/i.test(href) ? `<a href="${esc(href)}">${inner}</a>` : inner
    } else if (name === 'w:commentRangeStart') {
      const id = attrs(child)['w:id']
      if (id) (ctx.openComments ??= new Set()).add(id)
    } else if (name === 'w:commentRangeEnd') {
      const id = attrs(child)['w:id']
      if (id) ctx.openComments?.delete(id)
    } else if (name === 'w:ins' || name === 'w:del') {
      // a tracked edit: keep it tracked instead of silently accepting it
      const a = attrs(child)
      const previous = ctx.tracked
      ctx.tracked = {
        kind: name === 'w:ins' ? 'ins' : 'del',
        author: a['w:author'] ?? '',
        date: a['w:date'] ?? ''
      }
      out += inlineToHtml(child, ctx)
      ctx.tracked = previous
    } else if (name === 'w:fldSimple' || name === 'w:smartTag' || name === 'w:bdo' || name === 'w:dir') {
      out += inlineToHtml(child, ctx)
    } else if (name === 'w:sdt') {
      const content = findChild(child, 'w:sdtContent')
      if (content) out += inlineToHtml(content, ctx)
    }
  }
  return out
}

function paragraphToHtml(p: XNode, ctx: DocContext): { html: string; list?: { kind: 'bullet' | 'ordered'; level: number } } {
  const pPr = findChild(p, 'w:pPr')
  const props = effectiveParaProps(pPr, ctx)
  const inner = inlineToHtml(p, ctx)
  const rtl = props.bidi === true
  const align = resolveAlign(props.jc, rtl)
  const attrParts: string[] = []
  if (rtl) attrParts.push(' dir="rtl"')
  else if (props.bidi === false && ctx.styles.defaults.bidi) attrParts.push(' dir="ltr"')
  const styleBits: string[] = []
  if (align) styleBits.push(`text-align: ${align}`)
  if (props.lineHeight) styleBits.push(`line-height: ${props.lineHeight}`)
  if (props.spaceBefore) styleBits.push(`margin-top: ${props.spaceBefore}pt`)
  if (props.spaceAfter) styleBits.push(`margin-bottom: ${props.spaceAfter}pt`)
  if (styleBits.length) attrParts.push(` style="${styleBits.join('; ')}"`)
  const attrStr = attrParts.join('')
  if (props.numId && ctx.numbering.size) {
    const kind = ctx.numbering.get(props.numId)
    if (kind) {
      // bare paragraph — renderListRun wraps it in <li> at the right depth
      return {
        html: `<p${attrStr}>${inner}</p>`,
        list: { kind, level: props.ilvl ?? 0 }
      }
    }
  }
  const tag = props.heading ? `h${props.heading}` : 'p'
  return { html: `<${tag}${attrStr}>${inner}</${tag}>` }
}

function tableToHtml(tbl: XNode, ctx: DocContext): string {
  // Two passes so w:vMerge becomes real rowspans: a "restart" cell absorbs the
  // "continue" cells below it in the same grid column; continues are skipped.
  interface Cell {
    span: number
    vMerge?: 'restart' | 'continue'
    html: string
    rowspan: number
    bg?: string
  }
  const grid: Cell[][] = []
  for (const tr of findChildren(tbl, 'w:tr')) {
    const row: Cell[] = []
    for (const tc of findChildren(tr, 'w:tc')) {
      const tcPr = findChild(tc, 'w:tcPr')
      const span = Math.max(1, Number(tcPr ? val(tcPr, 'w:gridSpan') : 1) || 1)
      let vMerge: Cell['vMerge']
      const vm = tcPr && findChild(tcPr, 'w:vMerge')
      if (vm) vMerge = attrs(vm)['w:val'] === 'restart' ? 'restart' : 'continue'
      const shd = tcPr && findChild(tcPr, 'w:shd')
      const fillRaw = shd ? attrs(shd)['w:fill'] : undefined
      const bg = fillRaw && /^[0-9a-fA-F]{6}$/.test(fillRaw) ? `#${fillRaw.toLowerCase()}` : undefined
      const body = blocksToHtml(children(tc).filter((c) => ['w:p', 'w:tbl'].includes(tagName(c))), ctx)
      row.push({ span, vMerge, html: body || '<p></p>', rowspan: 1, bg })
    }
    grid.push(row)
  }
  // resolve rowspans column-position-wise
  for (let r = 0; r < grid.length; r++) {
    let col = 0
    for (const cell of grid[r]) {
      if (cell.vMerge !== 'continue') {
        let extra = 0
        for (let rr = r + 1; rr < grid.length; rr++) {
          let cc = 0
          let hit = false
          for (const below of grid[rr]) {
            if (cc === col && below.vMerge === 'continue') {
              hit = true
              break
            }
            cc += below.span
            if (cc > col) break
          }
          if (!hit) break
          extra++
        }
        cell.rowspan = 1 + extra
      }
      col += cell.span
    }
  }
  const rows = grid.map(
    (row) =>
      `<tr>${row
        .filter((c) => c.vMerge !== 'continue')
        .map(
          (c) =>
            `<td${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}${
              c.bg ? ` data-bg="${c.bg}" style="background-color: ${c.bg}"` : ''
            }>${c.html}</td>`
        )
        .join('')}</tr>`
  )
  return `<table><tbody>${rows.join('')}</tbody></table>`
}

interface ListEntry {
  kind: 'bullet' | 'ordered'
  level: number
  html: string
}

/** Sequential list paragraphs (with ilvl) → properly NESTED ul/ol markup. */
function renderListRun(items: ListEntry[]): string {
  // normalize levels so nesting never jumps more than one step
  let prev = -1
  for (const item of items) {
    item.level = Math.max(0, Math.min(item.level, prev + 1))
    prev = item.level
  }
  const pos = { i: 0 }
  const build = (level: number, kind: 'bullet' | 'ordered'): string => {
    let html = kind === 'bullet' ? '<ul>' : '<ol>'
    while (pos.i < items.length) {
      const it = items[pos.i]
      if (it.level < level || (it.level === level && it.kind !== kind)) break
      pos.i++
      let li = it.html
      const next = items[pos.i]
      if (next && next.level > level) li += build(level + 1, next.kind)
      html += `<li>${li}</li>`
    }
    return html + (kind === 'bullet' ? '</ul>' : '</ol>')
  }
  let out = ''
  while (pos.i < items.length) out += build(items[pos.i].level, items[pos.i].kind)
  return out
}

function blocksToHtml(blocks: XNode[], ctx: DocContext): string {
  const out: string[] = []
  // Consecutive list paragraphs form one run, nested by their ilvl.
  let listBuffer: ListEntry[] = []
  const flushList = () => {
    if (!listBuffer.length) return
    out.push(renderListRun(listBuffer))
    listBuffer = []
  }
  for (const block of blocks) {
    const name = tagName(block)
    if (name === 'w:p') {
      const { html, list } = paragraphToHtml(block, ctx)
      if (list) {
        listBuffer.push({ kind: list.kind, level: list.level, html })
      } else {
        flushList()
        out.push(html)
      }
    } else if (name === 'w:tbl') {
      flushList()
      out.push(tableToHtml(block, ctx))
    }
  }
  flushList()
  return out.join('')
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml'
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return typeof btoa === 'function'
    ? btoa(bin)
    : Buffer.from(bytes).toString('base64')
}


const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'"
}

/** Plain text of a header/footer part, plus what we cannot model. */
export function bandFromXml(xml: string | null): {
  text: string
  pageNumber: boolean
  complex: boolean
} {
  if (!xml) return { text: '', pageNumber: false, complex: false }
  const pageNumber = /\bPAGE\b/.test(xml)
  const complex = /<w:drawing|<w:tbl|<w:pict|<w:txbxContent/.test(xml)
  const pieces: string[] = []
  for (const m of xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)) {
    const raw = m[1].replace(/&(amp|lt|gt|quot|apos);/g, (e) => XML_ENTITIES[e] ?? e)
    // the cached result of a PAGE field is a bare number — not user text
    if (pageNumber && /^\s*\d+\s*$/.test(raw)) continue
    pieces.push(raw)
  }
  let text = pieces.join('').replace(/\s+/g, ' ').trim()
  // The writer joins the text and the page number with " - "; with the number
  // itself dropped above, that separator would come back as trailing punctuation.
  if (pageNumber) text = text.replace(/^[\s–—-]+|[\s–—-]+$/g, '')
  return { text, pageNumber, complex }
}

const TWIP_PER_MM = 1440 / 25.4

function twipToMm(value: string | undefined): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round((n / TWIP_PER_MM) * 10) / 10 : undefined
}

/** Paper size + margins out of the body's section properties. */
export function readSectionSetup(sectPr: XNode | undefined): Partial<PageSetup> {
  if (!sectPr) return {}
  const out: Partial<PageSetup> = {}
  const pgSz = findChild(sectPr, 'w:pgSz')
  if (pgSz) {
    const a = attrs(pgSz)
    const w = twipToMm(a['w:w'])
    const h = twipToMm(a['w:h'])
    const landscape = a['w:orient'] === 'landscape' || (!!w && !!h && w > h)
    const shortSide = landscape ? h : w
    if (shortSide) {
      out.size = Math.abs(shortSide - PAPER_MM.Letter.width) < Math.abs(shortSide - PAPER_MM.A4.width)
        ? 'Letter'
        : 'A4'
    }
    out.orientation = landscape ? 'landscape' : 'portrait'
  }
  const pgMar = findChild(sectPr, 'w:pgMar')
  if (pgMar) {
    const a = attrs(pgMar)
    const base = defaultPageSetup().margin
    out.margin = {
      top: twipToMm(a['w:top']) ?? base.top,
      bottom: twipToMm(a['w:bottom']) ?? base.bottom,
      left: twipToMm(a['w:left']) ?? base.left,
      right: twipToMm(a['w:right']) ?? base.right
    }
  }
  return out
}

/**
 * word/comments.xml → the threads the gutter shows. Word stores each reply as
 * its own comment linked to its parent in commentsExtended; a file written
 * anywhere else may have no link at all, in which case every comment stands
 * alone — which is what Word itself shows for those files too.
 */
export function readComments(
  commentsXml: string | null,
  extendedXml: string | null
): CommentThread[] {
  if (!commentsXml) return []
  const root = parser.parse(commentsXml) as XNode[]
  const list = findDeep(root, 'w:comments')
  if (!list) return []

  // paraId → parent paraId, the only place Word records the reply structure
  const parentOf = new Map<string, string>()
  if (extendedXml) {
    const ext = parser.parse(extendedXml) as XNode[]
    const holder = findDeep(ext, 'w15:commentsEx')
    for (const node of holder ? children(holder) : []) {
      if (tagName(node) !== 'w15:commentEx') continue
      const a = attrs(node)
      if (a['w15:paraId'] && a['w15:paraIdParent']) {
        parentOf.set(a['w15:paraId'], a['w15:paraIdParent'])
      }
    }
  }

  const threads: CommentThread[] = []
  const byParaId = new Map<string, CommentThread>()
  const pending: Array<{ paraId: string; reply: CommentReply }> = []
  for (const node of children(list)) {
    if (tagName(node) !== 'w:comment') continue
    const a = attrs(node)
    const id = a['w:id'] ?? String(threads.length)
    const paragraphs = findChildren(node, 'w:p')
    const paraId = paragraphs.length ? (attrs(paragraphs[0])['w14:paraId'] ?? '') : ''
    const text = paragraphs.map((p) => plainText(p)).filter(Boolean).join('\n')
    const entry: CommentReply = {
      author: a['w:author'] ?? '',
      created: a['w:date'] ?? new Date().toISOString(),
      text
    }
    const parentPara = paraId ? parentOf.get(paraId) : undefined
    if (parentPara) {
      pending.push({ paraId: parentPara, reply: entry })
      continue
    }
    const thread: CommentThread = { id: `w${id}`, ...entry, resolved: false, replies: [] }
    threads.push(thread)
    if (paraId) byParaId.set(paraId, thread)
  }
  // replies are attached after every thread is known: Word does not guarantee
  // a parent comes before its reply in the file
  for (const { paraId, reply } of pending) {
    const parent = byParaId.get(paraId)
    if (parent) parent.replies.push(reply)
    else threads.push({ id: `w${threads.length}r`, ...reply, resolved: false, replies: [] })
  }
  return threads
}

/** All the text inside a w:p, ignoring formatting. */
function plainText(node: XNode): string {
  let out = ''
  const walk = (n: XNode) => {
    for (const child of children(n)) {
      if (tagName(child) === 'w:t') {
        out += children(child)
          .map((k) => String((k as Record<string, unknown>)['#text'] ?? ''))
          .join('')
      } else {
        walk(child)
      }
    }
  }
  walk(node)
  return out.trim()
}

/** First node with this tag anywhere in the tree. */
function findDeep(nodes: XNode[], name: string): XNode | undefined {
  for (const node of nodes) {
    if (tagName(node) === name) return node
    const hit = findDeep(children(node), name)
    if (hit) return hit
  }
  return undefined
}

/**
 * word/footnotes.xml → the footnote list the editor keeps at the end of the
 * document. Word reserves ids 0 and -1 for the separator marks, which are not
 * footnotes at all and must never be numbered.
 */
export function readFootnotes(
  footnotesXml: string | null,
  ctx: DocContext
): Map<string, { number: number; html: string }> {
  const map = new Map<string, { number: number; html: string }>()
  if (!footnotesXml) return map
  const root = parser.parse(footnotesXml) as XNode[]
  const holder = findDeep(root, 'w:footnotes')
  if (!holder) return map
  let number = 0
  for (const node of children(holder)) {
    if (tagName(node) !== 'w:footnote') continue
    const a = attrs(node)
    const type = a['w:type']
    if (type === 'separator' || type === 'continuationSeparator' || type === 'continuationNotice') continue
    const id = a['w:id']
    if (!id || Number(id) < 1) continue
    number += 1
    const html = blocksToHtml(
      children(node).filter((c) => ['w:p', 'w:tbl'].includes(tagName(c))),
      ctx
    )
    map.set(id, { number, html })
  }
  return map
}

export async function importDocx(bytes: Uint8Array | ArrayBuffer): Promise<DocxImportResult> {
  const zip = await JSZip.loadAsync(bytes)
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('not a docx: word/document.xml missing')
  const [docXml, stylesXml, numberingXml, relsXml] = await Promise.all([
    docFile.async('string'),
    zip.file('word/styles.xml')?.async('string') ?? Promise.resolve(null),
    zip.file('word/numbering.xml')?.async('string') ?? Promise.resolve(null),
    zip.file('word/_rels/document.xml.rels')?.async('string') ?? Promise.resolve(null)
  ])
  const [footnotesXml] = await Promise.all([
    zip.file('word/footnotes.xml')?.async('string') ?? Promise.resolve(null)
  ])
  const [commentsXml, commentsExtXml] = await Promise.all([
    zip.file('word/comments.xml')?.async('string') ?? Promise.resolve(null),
    zip.file('word/commentsExtended.xml')?.async('string') ?? Promise.resolve(null)
  ])

  const warnings: string[] = []
  // Unsupported-part detection: warn once, up front, so saving is informed.
  // Plain-text headers/footers are now KEPT (read below), so they no longer
  // warn — only the parts we still cannot model do.
  if (docXml.includes('<w:txbxContent')) warnings.push('textboxes')

  // rels → media data URLs + external hyperlink targets
  const images = new Map<string, { dataUrl: string }>()
  const links = new Map<string, string>()
  const partTargets = new Map<string, string>()
  if (relsXml) {
    for (const m of relsXml.matchAll(/<Relationship [^>]*\/?>/g)) {
      const tag = m[0]
      const id = /Id="([^"]+)"/.exec(tag)?.[1]
      const target = /Target="([^"]+)"/.exec(tag)?.[1]
      if (!id || !target) continue
      partTargets.set(id, target.replace(/^\//, '').replace(/^(\.\.\/)+/, ''))
      if (/TargetMode="External"/.test(tag)) {
        links.set(id, target.replace(/&amp;/g, '&'))
        continue
      }
      if (!/media\//.test(target)) continue
      const norm = target.replace(/^\//, '').replace(/^(\.\.\/)+/, '')
      const media = zip.file(`word/${norm}`) ?? zip.file(norm)
      if (!media) continue
      const ext = norm.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = MIME_BY_EXT[ext]
      if (!mime) continue
      const data = await media.async('uint8array')
      images.set(id, { dataUrl: `data:${mime};base64,${bytesToBase64(data)}` })
    }
  }

  const ctx: DocContext = {
    styles: readStyles(stylesXml),
    numbering: readNumbering(numberingXml),
    images,
    links,
    warnings
  }

  const root = parser.parse(docXml) as XNode[]
  const document = root.find((n) => tagName(n) === 'w:document')
  const body = document && findChild(document, 'w:body')
  if (!body) throw new Error('docx has no body')
  const blocks = children(body).filter((c) => ['w:p', 'w:tbl'].includes(tagName(c)))
  ctx.footnotes = readFootnotes(footnotesXml, ctx)
  const html = blocksToHtml(blocks, ctx)
  // the editor keeps its footnotes in one list at the very end
  // Both attributes are REQUIRED by the footnote node: leaving `id` off makes
  // ProseMirror reject the whole document, which surfaced as the file simply
  // refusing to open.
  const footnoteList = [...ctx.footnotes.values()]
    .map(
      (note) =>
        `<li id="fn:${note.number}" data-id="fn-${note.number}">${note.html || '<p></p>'}</li>`
    )
    .join('')
  const withFootnotes = footnoteList ? `${html}<ol class="footnotes">${footnoteList}</ol>` : html

  // --- section properties + header/footer -------------------------------
  const sectPr = findChild(body, 'w:sectPr')
  const page: PageSetup = { ...defaultPageSetup(), ...readSectionSetup(sectPr) }
  const bandXml = async (kind: 'header' | 'footer') => {
    const ref = sectPr
      ? findChildren(sectPr, `w:${kind}Reference`).find((r) => attrs(r)['w:type'] !== 'first')
      : undefined
    const id = ref ? attrs(ref)['r:id'] : undefined
    const target = id ? partTargets.get(id) : undefined
    const file = target ? (zip.file(`word/${target}`) ?? zip.file(target)) : null
    return file ? file.async('string') : null
  }
  const [headerXml, footerXml] = await Promise.all([bandXml('header'), bandXml('footer')])
  const head = bandFromXml(headerXml)
  const foot = bandFromXml(footerXml)
  page.header = head.text
  page.footer = foot.text
  page.pageNumbers = head.pageNumber || foot.pageNumber
  // Anything richer than text + a page number would be dropped on save.
  if (head.complex || foot.complex) warnings.push('headers')

  const comments = readComments(commentsXml, commentsExtXml)
  return {
    html: withFootnotes || '<p></p>',
    warnings: [...new Set(warnings)],
    page,
    ...(comments.length ? { comments } : {})
  }
}
