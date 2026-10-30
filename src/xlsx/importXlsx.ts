// xlsx bytes (exceljs) → Univer IWorkbookData snapshot.
// Fidelity contract lives in PROJECT_MAP.md [ARCHITECTURE].
import ExcelJS from 'exceljs'
import type { ICellData, IRange, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/core'
import {
  BOOL,
  CELL_TYPE,
  colWidthToPx,
  excelColorToRgb,
  excelStyleToUniver,
  parseAddress,
  ptToPx,
  shiftSharedFormula
} from './styleMap'
import { buildResources, NOTE_KEY } from './resourceMap'
import { parseNotesFromZip } from './notesParser'
import { META_SHEET_NAME, readMeta } from './chartMeta'

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30)

const dateToSerial = (d: Date): number => (d.getTime() - EXCEL_EPOCH_UTC) / 86400000

interface StylePool {
  keyToId: Map<string, string>
  styles: Record<string, IStyleData>
}

function poolStyle(pool: StylePool, style: IStyleData): string {
  const key = JSON.stringify(style)
  const hit = pool.keyToId.get(key)
  if (hit) return hit
  const id = `s${pool.keyToId.size + 1}`
  pool.keyToId.set(key, id)
  pool.styles[id] = style
  return id
}

function convertCellValue(ws: ExcelJS.Worksheet, cell: ExcelJS.Cell): ICellData {
  const v = cell.value
  if (v == null) return {}
  if (v instanceof Date) return { v: dateToSerial(v), t: CELL_TYPE.NUMBER }
  if (typeof v === 'number') return { v, t: CELL_TYPE.NUMBER }
  if (typeof v === 'boolean') return { v, t: CELL_TYPE.BOOLEAN }
  if (typeof v === 'string') return { v, t: CELL_TYPE.STRING }

  const obj = v as unknown as Record<string, unknown>
  if ('formula' in obj || 'sharedFormula' in obj) {
    let formula = typeof obj.formula === 'string' ? obj.formula : null
    if (!formula && typeof obj.sharedFormula === 'string') {
      // Shared-formula slave: translate the master formula by the cell offset.
      const masterAddr = obj.sharedFormula
      const masterVal = ws.getCell(masterAddr).value as Record<string, unknown> | null
      const masterFormula =
        masterVal && typeof masterVal === 'object' && typeof masterVal.formula === 'string'
          ? masterVal.formula
          : null
      const mPos = parseAddress(masterAddr)
      const cPos = parseAddress(cell.address)
      if (masterFormula && mPos && cPos) {
        formula = shiftSharedFormula(masterFormula, cPos.row - mPos.row, cPos.col - mPos.col)
      }
    }
    const rawResult = obj.result
    const result =
      rawResult instanceof Date
        ? dateToSerial(rawResult)
        : typeof rawResult === 'object'
          ? undefined // formula error objects — engine recalculates anyway
          : (rawResult as string | number | boolean | undefined)
    const out: ICellData = {}
    if (formula) out.f = `=${formula}`
    if (result !== undefined) {
      out.v = result
      out.t =
        typeof result === 'number'
          ? CELL_TYPE.NUMBER
          : typeof result === 'boolean'
            ? CELL_TYPE.BOOLEAN
            : CELL_TYPE.STRING
    }
    return out
  }
  if (Array.isArray(obj.richText)) {
    // Rich runs flattened to plain text; first-run styling comes via cell style.
    const text = (obj.richText as Array<{ text: string }>).map((r) => r.text).join('')
    return { v: text, t: CELL_TYPE.STRING }
  }
  if ('hyperlink' in obj) {
    const text = typeof obj.text === 'string' ? obj.text : String(obj.hyperlink ?? '')
    const url = String(obj.hyperlink ?? '')
    if (!url) return { v: text, t: CELL_TYPE.STRING }
    return { p: buildHyperlinkDoc(text, url) as unknown as ICellData['p'] }
  }
  if ('error' in obj) return { v: String(obj.error), t: CELL_TYPE.STRING }
  return {}
}

let linkCounter = 0

/**
 * Univer 0.25 stores hyperlinks INSIDE the cell as a rich-text doc whose
 * customRange (rangeType 0) carries the url — shape captured from a live
 * fWorkbook.save() after FRange.setHyperLink().
 */
function buildHyperlinkDoc(text: string, url: string) {
  const label = text || url
  const len = label.length
  return {
    id: 'd',
    documentStyle: {
      pageSize: { width: null, height: null },
      documentFlavor: 0,
      marginTop: 0,
      marginBottom: 2,
      marginRight: 2,
      marginLeft: 2,
      paragraphLineGapDefault: 0,
      renderConfig: {
        horizontalAlign: 0,
        verticalAlign: 0,
        centerAngle: 0,
        vertexAngle: 0,
        wrapStrategy: 0,
        zeroWidthParagraphBreak: 1
      }
    },
    body: {
      dataStream: `${label}\r\n`,
      textRuns: [],
      paragraphs: [{ startIndex: len, paragraphStyle: { horizontalAlign: 0 } }],
      sectionBreaks: [{ startIndex: len + 1 }],
      customRanges: [
        {
          startIndex: 0,
          endIndex: Math.max(0, len - 1),
          rangeType: 0,
          rangeId: `link-${++linkCounter}`,
          properties: { url }
        }
      ],
      customDecorations: []
    },
    drawings: {},
    drawingsOrder: []
  }
}

export async function importXlsx(bytes: Uint8Array | ArrayBuffer, workbookName: string): Promise<IWorkbookData> {
  const wb = new ExcelJS.Workbook()
  const ab =
    bytes instanceof Uint8Array
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : bytes
  await wb.xlsx.load(ab as ExcelJS.Buffer)

  const pool: StylePool = { keyToId: new Map(), styles: {} }
  const sheets: Record<string, Partial<IWorksheetData>> = {}
  const sheetOrder: string[] = []
  const meta = readMeta(wb)
  const dataSheets = wb.worksheets.filter((ws) => ws.name !== META_SHEET_NAME)
  // Reuse the original Univer sheet ids when our meta carries them — id-keyed
  // resources (e.g. protection passthrough) then match without remapping.
  const sheetIds = dataSheets.map((_, i) => meta.sheetIds?.[i] ?? `sheet-${i + 1}`)
  const workbookId = `wb-${Math.random().toString(36).slice(2, 10)}`

  dataSheets.forEach((ws, idx) => {
    const sheetId = sheetIds[idx]
    const cellData: Record<number, Record<number, ICellData>> = {}
    const rowData: Record<number, { h?: number; hd?: number; s?: string }> = {}
    const columnData: Record<number, { w?: number; hd?: number; s?: string }> = {}
    let maxRow = 0
    let maxCol = 0

    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      if (row.height != null) (rowData[rowNumber - 1] ??= {}).h = ptToPx(row.height)
      if (row.hidden) (rowData[rowNumber - 1] ??= {}).hd = BOOL.TRUE
      // Excel row-level styles (whole row colored/formatted without cells)
      const rowStyle = excelStyleToUniver(row as unknown as Parameters<typeof excelStyleToUniver>[0])
      if (rowStyle) (rowData[rowNumber - 1] ??= {}).s = poolStyle(pool, rowStyle)
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const data = convertCellValue(ws, cell)
        const style = excelStyleToUniver(cell)
        if (style) data.s = poolStyle(pool, style)
        if (data.v === undefined && data.f == null && data.s == null && data.p == null) return
        ;(cellData[rowNumber - 1] ??= {})[colNumber - 1] = data
        maxRow = Math.max(maxRow, rowNumber)
        maxCol = Math.max(maxCol, colNumber)
      })
    })

    for (let c = 1; c <= ws.columnCount; c++) {
      const col = ws.getColumn(c)
      if (col.width != null) (columnData[c - 1] ??= {}).w = colWidthToPx(col.width)
      if (col.hidden) (columnData[c - 1] ??= {}).hd = BOOL.TRUE
      // Excel column-level styles — Univer renders columnData.s (verified)
      const colStyle = excelStyleToUniver(col as unknown as Parameters<typeof excelStyleToUniver>[0])
      if (colStyle) (columnData[c - 1] ??= {}).s = poolStyle(pool, colStyle)
    }

    const mergeData: IRange[] = []
    const merges = (ws.model as { merges?: string[] }).merges ?? []
    for (const merge of merges) {
      const [a, b] = merge.split(':')
      const p1 = a ? parseAddress(a) : null
      const p2 = b ? parseAddress(b) : p1
      if (!p1 || !p2) continue
      mergeData.push({
        startRow: Math.min(p1.row, p2.row),
        endRow: Math.max(p1.row, p2.row),
        startColumn: Math.min(p1.col, p2.col),
        endColumn: Math.max(p1.col, p2.col)
      })
    }

    const view = ws.views?.[0]
    const sheet: Partial<IWorksheetData> = {
      id: sheetId,
      name: ws.name,
      cellData,
      rowData,
      columnData,
      mergeData,
      rowCount: Math.max(1000, maxRow + 100),
      columnCount: Math.max(26, maxCol + 5),
      showGridlines: view && view.showGridLines === false ? BOOL.FALSE : BOOL.TRUE
    }
    if (ws.state === 'hidden' || ws.state === 'veryHidden') sheet.hidden = BOOL.TRUE
    if (view?.rightToLeft) sheet.rightToLeft = BOOL.TRUE
    const tabColor = excelColorToRgb(ws.properties?.tabColor as ExcelJS.Color | undefined)
    if (tabColor) sheet.tabColor = tabColor
    const defaultColWidth = colWidthToPx(ws.properties?.defaultColWidth)
    if (defaultColWidth) sheet.defaultColumnWidth = defaultColWidth
    const defaultRowHeight = ptToPx(ws.properties?.defaultRowHeight)
    if (defaultRowHeight) sheet.defaultRowHeight = defaultRowHeight
    if (view && view.state === 'frozen' && ((view.xSplit ?? 0) > 0 || (view.ySplit ?? 0) > 0)) {
      sheet.freeze = {
        xSplit: view.xSplit ?? 0,
        ySplit: view.ySplit ?? 0,
        startRow: view.ySplit ?? 0,
        startColumn: view.xSplit ?? 0
      }
    }

    sheets[sheetId] = sheet
    sheetOrder.push(sheetId)
  })

  const resources = buildResources(
    wb,
    dataSheets.map((ws, i) => ({ ws, sheetId: sheetIds[i] })),
    workbookId
  )
  for (const extra of meta.extraResources) {
    if (!resources.some((r) => r.name === extra.name)) resources.push(extra)
  }

  // Restore EXELMJ-only formulas (HIJRI…) that export as plain values.
  for (const cf of meta.customFormulas) {
    const sheetKey = sheetIds[cf.sheetIndex]
    const sheet = sheetKey ? sheets[sheetKey] : undefined
    if (!sheet) continue
    const cellData = (sheet.cellData ??= {}) as Record<number, Record<number, ICellData>>
    const cell = ((cellData[cf.row] ??= {})[cf.col] ??= {})
    cell.f = cf.f
  }

  // exceljs never surfaces notes on read — parse them straight from the zip.
  const notesByOrdinal = await parseNotesFromZip(ab as ArrayBuffer)
  if (notesByOrdinal.size) {
    type NoteCell = { row: number; col: number; id: string; note: string; width: number; height: number; show: boolean }
    const noteMap: Record<string, Record<number, Record<number, NoteCell>>> = {}
    let noteId = 0
    let dataIdx = 0
    wb.worksheets.forEach((ws, ordinal) => {
      if (ws.name === META_SHEET_NAME) return
      const myIdx = dataIdx++
      const notes = notesByOrdinal.get(ordinal)
      if (!notes?.length) return
      const sheetKey = sheetIds[myIdx]
      for (const n of notes) {
        ;((noteMap[sheetKey] ??= {})[n.row] ??= {})[n.col] = {
          row: n.row,
          col: n.col,
          id: `note-${++noteId}`,
          note: n.text,
          width: 216,
          height: 92,
          show: false
        }
      }
    })
    if (Object.keys(noteMap).length) {
      const existing = resources.find((r) => r.name === NOTE_KEY)
      if (existing) existing.data = JSON.stringify(noteMap)
      else resources.push({ name: NOTE_KEY, data: JSON.stringify(noteMap) })
    }
  }

  return {
    id: workbookId,
    name: workbookName,
    appVersion: '0.25.1',
    locale: 'enUS' as IWorkbookData['locale'],
    styles: pool.styles,
    sheetOrder,
    sheets,
    ...(resources.length ? { resources } : {}),
    ...(meta.charts.length || meta.pivots.length
      ? {
          custom: {
            ...(meta.charts.length ? { exelmjCharts: meta.charts } : {}),
            ...(meta.pivots.length ? { exelmjPivots: meta.pivots } : {})
          }
        }
      : {})
  }
}
