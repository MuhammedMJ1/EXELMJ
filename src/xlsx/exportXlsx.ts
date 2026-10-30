// Univer IWorkbookData snapshot → xlsx bytes (exceljs).
// Sets fullCalcOnLoad so real Excel recalculates all formulas on open.
import ExcelJS from 'exceljs'
import type { ICellData, IStyleData, IWorkbookData } from '@univerjs/core'
import {
  applyUniverStyleToExcelCell,
  BOOL,
  CELL_TYPE,
  pxToColWidth,
  pxToPt,
  rgbToArgb,
  univerStyleToExcelStyle
} from './styleMap'
import { applyResources } from './resourceMap'
import { writeMeta, type CustomFormulaRef } from './chartMeta'
import { HIJRI_FN_RE } from '../univer/hijri'
import type { ChartDef } from '../charts/chartTypes'
import type { PivotDef } from '../pivot/pivotTypes'

// Univer resources Excel has no mapping for — carried through _EXELMJ_META so
// in-app state (e.g. sheet protection) survives save/reopen in EXELMJ.
const PASSTHROUGH_RESOURCES = [
  'SHEET_RANGE_PROTECTION_PLUGIN',
  'SHEET_WORKSHEET_PROTECTION_PLUGIN',
  'SHEET_WORKSHEET_PROTECTION_POINT_PLUGIN'
]

function resolveStyle(
  styles: IWorkbookData['styles'],
  s: ICellData['s']
): IStyleData | undefined {
  if (!s) return undefined
  return typeof s === 'string' ? (styles?.[s] ?? undefined) : s
}

function sanitizeSheetName(name: string | undefined, idx: number): string {
  const cleaned = (name ?? '').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return cleaned || `Sheet${idx + 1}`
}

function normalizeValue(data: ICellData): string | number | boolean | undefined {
  const { v, t } = data
  if (v == null || typeof v === 'object') return undefined
  if (t === CELL_TYPE.BOOLEAN) return typeof v === 'boolean' ? v : Number(v) !== 0
  if (t === CELL_TYPE.NUMBER) return typeof v === 'number' ? v : Number(v)
  if (t === CELL_TYPE.STRING || t === CELL_TYPE.FORCE_STRING) return String(v)
  return v
}

function setCellValue(cell: ExcelJS.Cell, data: ICellData) {
  if (data.f) {
    const formula = data.f.startsWith('=') ? data.f.slice(1) : data.f
    cell.value = { formula, result: normalizeValue(data) } as ExcelJS.CellFormulaValue
    return
  }
  const doc = data.p as
    | { body?: { dataStream?: string; customRanges?: Array<{ rangeType?: number; properties?: { url?: string } }> } }
    | null
    | undefined
  if (doc?.body?.dataStream) {
    const text = doc.body.dataStream.replace(/\r\n$/, '')
    // Hyperlink lives in a customRange (rangeType 0) inside the cell doc.
    const url = doc.body.customRanges?.find((r) => r.rangeType === 0 && r.properties?.url)?.properties?.url
    cell.value = url ? ({ text, hyperlink: url } as ExcelJS.CellHyperlinkValue) : text
    return
  }
  const v = normalizeValue(data)
  if (v !== undefined) cell.value = v
}

export async function exportXlsx(snapshot: IWorkbookData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'EXELMJ'
  wb.calcProperties = { fullCalcOnLoad: true } as typeof wb.calcProperties

  const order = snapshot.sheetOrder?.length ? snapshot.sheetOrder : Object.keys(snapshot.sheets ?? {})
  const sheetIdToWs = new Map<string, ExcelJS.Worksheet>()
  const customFormulas: CustomFormulaRef[] = []
  order.forEach((sheetId, idx) => {
    const sheet = snapshot.sheets?.[sheetId]
    if (!sheet) return
    const ws = wb.addWorksheet(sanitizeSheetName(sheet.name, idx))
    sheetIdToWs.set(sheetId, ws)

    if (sheet.hidden === BOOL.TRUE) ws.state = 'hidden'
    const tab = rgbToArgb(sheet.tabColor)
    if (tab) ws.properties.tabColor = { argb: tab }
    const defColW = pxToColWidth(sheet.defaultColumnWidth)
    if (defColW) ws.properties.defaultColWidth = defColW
    const defRowH = pxToPt(sheet.defaultRowHeight)
    if (defRowH) ws.properties.defaultRowHeight = defRowH

    const showGridLines = sheet.showGridlines !== BOOL.FALSE
    const rightToLeft = sheet.rightToLeft === BOOL.TRUE ? true : undefined
    const fz = sheet.freeze
    if (fz && (fz.xSplit > 0 || fz.ySplit > 0)) {
      ws.views = [{ state: 'frozen', xSplit: fz.xSplit, ySplit: fz.ySplit, showGridLines, rightToLeft }]
    } else {
      ws.views = [{ showGridLines, rightToLeft } as ExcelJS.WorksheetView]
    }

    for (const [cIdx, colData] of Object.entries(sheet.columnData ?? {})) {
      if (!colData) continue
      const col = ws.getColumn(Number(cIdx) + 1)
      const w = pxToColWidth(colData.w ?? undefined)
      if (w != null) col.width = w
      if (colData.hd === BOOL.TRUE) col.hidden = true
      const colStyle = resolveStyle(snapshot.styles, colData.s as ICellData['s'])
      if (colStyle) {
        const s = univerStyleToExcelStyle(colStyle)
        if (s.font) col.font = s.font as ExcelJS.Font
        if (s.fill) col.fill = s.fill
        if (s.border) col.border = s.border
        if (s.alignment) col.alignment = s.alignment
        if (s.numFmt) col.numFmt = s.numFmt
      }
    }

    for (const [rIdx, rowData] of Object.entries(sheet.rowData ?? {})) {
      if (!rowData) continue
      const row = ws.getRow(Number(rIdx) + 1)
      // Auto-height rows (ia) are left for Excel to size itself.
      if (rowData.ia !== BOOL.TRUE && rowData.h != null) {
        const h = pxToPt(rowData.h)
        if (h != null) row.height = h
      }
      if (rowData.hd === BOOL.TRUE) row.hidden = true
      const rowStyle = resolveStyle(snapshot.styles, rowData.s as ICellData['s'])
      if (rowStyle) {
        const s = univerStyleToExcelStyle(rowStyle)
        if (s.font) row.font = s.font as ExcelJS.Font
        if (s.fill) row.fill = s.fill
        if (s.border) row.border = s.border
        if (s.alignment) row.alignment = s.alignment
        if (s.numFmt) row.numFmt = s.numFmt
      }
    }

    const cellRows = Object.entries(sheet.cellData ?? {}) as Array<
      [string, Record<string, ICellData | undefined> | undefined]
    >
    for (const [rIdx, rowCells] of cellRows) {
      for (const [cIdx, cellData] of Object.entries(rowCells ?? {})) {
        if (!cellData) continue
        const cell = ws.getCell(Number(rIdx) + 1, Number(cIdx) + 1)
        // EXELMJ-only functions (HIJRI…) would show #NAME? in Excel — export
        // the computed VALUE and stash the formula in the meta sheet.
        if (cellData.f && HIJRI_FN_RE.test(cellData.f)) {
          customFormulas.push({ sheetIndex: idx, row: Number(rIdx), col: Number(cIdx), f: cellData.f })
          setCellValue(cell, { ...cellData, f: undefined })
        } else {
          setCellValue(cell, cellData)
        }
        const style = resolveStyle(snapshot.styles, cellData.s)
        if (style) applyUniverStyleToExcelCell(style, cell)
      }
    }

    for (const m of sheet.mergeData ?? []) {
      try {
        ws.mergeCells(m.startRow + 1, m.startColumn + 1, m.endRow + 1, m.endColumn + 1)
      } catch {
        // overlapping/invalid merge — skip rather than corrupt the file
      }
    }
  })

  applyResources(wb, snapshot.resources, sheetIdToWs)

  const custom = snapshot.custom as Record<string, unknown> | null | undefined
  const charts = (custom?.exelmjCharts ?? []) as ChartDef[]
  const pivots = (custom?.exelmjPivots ?? []) as PivotDef[]
  const extraResources = (snapshot.resources ?? []).filter(
    (r) => PASSTHROUGH_RESOURCES.includes(r.name) && r.data && r.data !== '{}' && r.data !== '[]'
  )
  writeMeta(wb, { charts, pivots, sheetIds: order, extraResources, customFormulas })

  const buf = (await wb.xlsx.writeBuffer()) as unknown
  return buf instanceof Uint8Array
    ? new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    : new Uint8Array(buf as ArrayBuffer)
}
