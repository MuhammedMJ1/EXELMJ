// Mail merge — دمج المراسلات: one letter plus a list of names becomes a letter
// for every name.
//
// The merge happens in the editor's own document, not in the OOXML: the fields
// are real nodes in the ProseMirror tree, so a merged run is just the document
// cloned once per record with every field node swapped for its text. That keeps
// one code path for the screen, the printer, the PDF and the .docx.
import { amountInWords } from './tafqit'
import { hijriTextFromSerial, serialFromDate } from '../univer/hijri'

/** What a field pulls in when the merge runs. */
export type MergeSource = 'column' | 'date' | 'hijri' | 'count'

/** How the pulled value is written. */
export type MergeFormat = 'plain' | 'words'

export interface MergeFieldAttrs {
  /** Column name for 'column' fields; ignored otherwise. */
  name: string
  source: MergeSource
  format: MergeFormat
  /** Currency code for `format: 'words'` — see tafqit's CURRENCIES. */
  currency: string
}

export interface TipTapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
  marks?: unknown[]
}

export const MERGE_FIELD = 'mergeField'

export function defaultFieldAttrs(): MergeFieldAttrs {
  return { name: '', source: 'column', format: 'plain', currency: '' }
}

/** Cells as read off a sheet → headers plus one record per row. */
export function sheetToRecords(matrix: string[][]): {
  headers: string[]
  records: Record<string, string>[]
} {
  // a list rarely starts in A1: skip down to the first row that has two or
  // more filled cells, and treat that as the header row
  let headerAt = -1
  for (let r = 0; r < matrix.length; r++) {
    const filled = (matrix[r] ?? []).filter((cell) => String(cell ?? '').trim()).length
    if (filled >= 2 || (filled === 1 && headerAt === -1 && matrix.length === 1)) {
      headerAt = r
      break
    }
  }
  if (headerAt < 0) return { headers: [], records: [] }

  const rawHeaders = (matrix[headerAt] ?? []).map((cell) => String(cell ?? '').trim())
  // an unnamed column still needs a name, or its values are unreachable
  const headers = rawHeaders.map((name, index) => name || `عمود ${index + 1}`)
  const records: Record<string, string>[] = []
  for (let r = headerAt + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? []
    if (!row.some((cell) => String(cell ?? '').trim())) continue
    const record: Record<string, string> = {}
    headers.forEach((name, index) => {
      record[name] = String(row[index] ?? '').trim()
    })
    records.push(record)
  }
  return { headers, records }
}

export interface MergeContext {
  record: Record<string, string>
  /** 1-based position of this record — what a "count" field shows. */
  index: number
  /** Merge date; passed in so a merge is reproducible and testable. */
  today: Date
  lang: 'ar' | 'en'
}

/** The text one field turns into for one record. */
export function fieldValue(attrs: MergeFieldAttrs, ctx: MergeContext): string {
  if (attrs.source === 'date') {
    return ctx.today.toLocaleDateString(ctx.lang === 'ar' ? 'ar' : 'en-GB', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  if (attrs.source === 'hijri') return hijriTextFromSerial(serialFromDate(ctx.today))
  if (attrs.source === 'count') return String(ctx.index)

  const raw = ctx.record[attrs.name] ?? ''
  if (attrs.format !== 'words') return raw
  if (!String(raw).trim()) return ''
  return amountInWords(raw, { currency: attrs.currency || undefined })
}

/** Every field name a document asks for — what the picker validates against. */
export function fieldsUsed(doc: TipTapNode): string[] {
  const names = new Set<string>()
  walk(doc, (node) => {
    if (node.type !== MERGE_FIELD) return
    const attrs = node.attrs as unknown as MergeFieldAttrs | undefined
    if (attrs?.source === 'column' && attrs.name) names.add(attrs.name)
  })
  return [...names]
}

/** Column names a document needs that the data does not have. */
export function missingFields(doc: TipTapNode, headers: string[]): string[] {
  const have = new Set(headers)
  return fieldsUsed(doc).filter((name) => !have.has(name))
}

/** One record's copy of the document, with every field turned into text. */
export function mergeOne(doc: TipTapNode, ctx: MergeContext): TipTapNode {
  return replace(doc, ctx)
}

export interface MergeAllOptions {
  today?: Date
  lang?: 'ar' | 'en'
  /** Start each record on a fresh page. Default true — these are letters. */
  pageBreaks?: boolean
}

/**
 * All records in one document, each starting on its own page — the form an
 * office actually wants, because it prints in a single pass.
 */
export function mergeAll(
  doc: TipTapNode,
  records: Record<string, string>[],
  options: MergeAllOptions = {}
): TipTapNode {
  const today = options.today ?? new Date()
  const lang = options.lang ?? 'ar'
  const pageBreaks = options.pageBreaks !== false
  const content: TipTapNode[] = []
  records.forEach((record, index) => {
    const one = mergeOne(doc, { record, index: index + 1, today, lang })
    if (index > 0 && pageBreaks) content.push({ type: 'pageBreak' })
    content.push(...(one.content ?? []))
  })
  return { type: 'doc', content }
}

/** A field's on-screen chip text, before any merge has run. */
export function fieldLabel(attrs: MergeFieldAttrs): string {
  if (attrs.source === 'date') return '«التاريخ»'
  if (attrs.source === 'hijri') return '«التاريخ الهجري»'
  if (attrs.source === 'count') return '«رقم السجل»'
  const suffix = attrs.format === 'words' ? ' (كتابةً)' : ''
  return `«${attrs.name || '؟'}${suffix}»`
}

function replace(node: TipTapNode, ctx: MergeContext): TipTapNode {
  if (node.type === MERGE_FIELD) {
    const attrs = { ...defaultFieldAttrs(), ...(node.attrs as object) } as MergeFieldAttrs
    const text = fieldValue(attrs, ctx)
    // an empty value must not leave an empty text node: ProseMirror rejects one
    return text ? { type: 'text', text } : { type: 'text', text: ' ' }
  }
  if (!node.content) return { ...node }
  return { ...node, content: node.content.map((child) => replace(child, ctx)) }
}

function walk(node: TipTapNode, visit: (node: TipTapNode) => void) {
  visit(node)
  for (const child of node.content ?? []) walk(child, visit)
}
