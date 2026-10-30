// Own CSV engine (exceljs's csv needs node streams — not browser-safe).
// Auto-detects the delimiter (, ; or tab — Arabic Excel locales often use ;),
// falls back to windows-1256 decoding for legacy Arabic files, and prepends a
// UTF-8 BOM on export so Excel opens Arabic text correctly.
import type { ICellData, IWorkbookData, IWorksheetData } from '@univerjs/core'
import { CELL_TYPE } from './styleMap'

export function detectDelimiter(firstLine: string): string {
  const counts: Array<[string, number]> = [',', ';', '\t'].map((d) => {
    let n = 0
    let inQuotes = false
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes
      else if (!inQuotes && ch === d) n++
    }
    return [d, n]
  })
  counts.sort((a, b) => b[1] - a[1])
  return counts[0][1] > 0 ? counts[0][0] : ','
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const delim = delimiter ?? detectDelimiter(src.split(/\r\n|\n/, 1)[0] ?? '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  // drop a single trailing empty line
  if (rows.length && rows[rows.length - 1].every((f) => f === '')) rows.pop()
  return rows
}

/** Decode CSV bytes: UTF-8 first; heavy mojibake → retry windows-1256 (legacy Arabic). */
export function decodeCsvBytes(bytes: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes)
  const bad = (utf8.match(/�/g) ?? []).length
  if (bad > Math.max(2, utf8.length / 200)) {
    try {
      return new TextDecoder('windows-1256').decode(bytes)
    } catch {
      return utf8
    }
  }
  return utf8
}

const NUMERIC_RE = /^-?\d{1,15}(\.\d+)?$/

export function csvToWorkbook(text: string, workbookName: string, rightToLeft = false): IWorkbookData {
  const rows = parseCsv(text)
  const cellData: Record<number, Record<number, ICellData>> = {}
  let maxCol = 0
  rows.forEach((row, r) => {
    row.forEach((raw, c) => {
      if (raw === '') return
      const trimmed = raw.trim()
      const cell: ICellData = NUMERIC_RE.test(trimmed)
        ? { v: Number(trimmed), t: CELL_TYPE.NUMBER }
        : { v: raw, t: CELL_TYPE.STRING }
      ;(cellData[r] ??= {})[c] = cell
      maxCol = Math.max(maxCol, c + 1)
    })
  })
  const sheet: Partial<IWorksheetData> = {
    id: 'sheet-1',
    name: workbookName.replace(/\.[^.]+$/, '').slice(0, 31) || 'CSV',
    cellData,
    rowCount: Math.max(1000, rows.length + 100),
    columnCount: Math.max(26, maxCol + 5),
    ...(rightToLeft ? { rightToLeft: 1 } : {})
  }
  return {
    id: `wb-${Math.random().toString(36).slice(2, 10)}`,
    name: workbookName,
    appVersion: '0.25.1',
    locale: 'enUS' as IWorkbookData['locale'],
    styles: {},
    sheetOrder: ['sheet-1'],
    sheets: { 'sheet-1': sheet }
  }
}

function serializeField(v: unknown, delim: string): string {
  if (v == null) return ''
  const s = typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v)
  return s.includes('"') || s.includes(delim) || s.includes('\n') || s.includes('\r')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

/** Serialize one sheet's computed values to CSV text (with UTF-8 BOM). */
export function sheetToCsv(sheet: Partial<IWorksheetData>, delimiter = ','): string {
  const cellData = (sheet.cellData ?? {}) as Record<number, Record<number, ICellData>>
  let maxRow = -1
  let maxCol = -1
  for (const [r, cols] of Object.entries(cellData)) {
    for (const [c, cell] of Object.entries(cols ?? {})) {
      if (!cell || (cell.v == null && cell.f == null && cell.p == null)) continue
      maxRow = Math.max(maxRow, Number(r))
      maxCol = Math.max(maxCol, Number(c))
    }
  }
  const lines: string[] = []
  for (let r = 0; r <= maxRow; r++) {
    const fields: string[] = []
    for (let c = 0; c <= maxCol; c++) {
      const cell = cellData[r]?.[c]
      const doc = cell?.p as { body?: { dataStream?: string } } | null | undefined
      const value = doc?.body?.dataStream ? doc.body.dataStream.replace(/\r\n$/, '') : cell?.v
      fields.push(serializeField(value, delimiter))
    }
    lines.push(fields.join(delimiter))
  }
  return `﻿${lines.join('\r\n')}\r\n`
}
