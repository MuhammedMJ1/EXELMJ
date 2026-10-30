// EXELMJ metadata rides INSIDE the xlsx in a veryHidden sheet (single-file
// promise). v3 payload: charts + pivot definitions (sheets referenced by
// ORDER INDEX), the original Univer sheet ids (so id-keyed resources like
// protection survive a round trip), and passthrough resources Excel has no
// mapping for. Invisible in Excel's Unhide dialog.
import type ExcelJS from 'exceljs'
import type { ChartDef } from '../charts/chartTypes'
import type { PivotDef } from '../pivot/pivotTypes'

export const META_SHEET_NAME = '_EXELMJ_META'
const MAGIC = 'EXELMJ-META'
const CHUNK = 30000

type StoredChart = Omit<ChartDef, 'sheetId'> & { sheetIndex: number }
type StoredPivot = Omit<PivotDef, 'sourceSheetId' | 'targetSheetId'> & {
  sourceSheetIndex: number
  targetSheetIndex: number
}

export interface CustomFormulaRef {
  sheetIndex: number
  row: number
  col: number
  f: string
}

export interface ExelmjMeta {
  charts: ChartDef[]
  pivots: PivotDef[]
  sheetIds?: string[]
  extraResources: Array<{ name: string; data: string }>
  customFormulas: CustomFormulaRef[]
}

interface StoredMeta {
  version: number
  charts?: StoredChart[]
  pivots?: StoredPivot[]
  sheetIds?: string[]
  extraResources?: Array<{ name: string; data: string }>
  customFormulas?: CustomFormulaRef[]
}

export function writeMeta(
  wb: ExcelJS.Workbook,
  input: {
    charts: ChartDef[]
    sheetIds: string[]
    pivots?: PivotDef[]
    extraResources?: Array<{ name: string; data: string }>
    customFormulas?: CustomFormulaRef[]
  }
) {
  const charts: StoredChart[] = input.charts
    .map((chart) => {
      const { sheetId, ...rest } = chart
      return { ...rest, sheetIndex: input.sheetIds.indexOf(sheetId) }
    })
    .filter((chart) => chart.sheetIndex >= 0)
  const pivots: StoredPivot[] = (input.pivots ?? [])
    .map((pivot) => {
      const { sourceSheetId, targetSheetId, ...rest } = pivot
      return {
        ...rest,
        sourceSheetIndex: input.sheetIds.indexOf(sourceSheetId),
        targetSheetIndex: input.sheetIds.indexOf(targetSheetId)
      }
    })
    .filter((pivot) => pivot.sourceSheetIndex >= 0 && pivot.targetSheetIndex >= 0)
  const extraResources = input.extraResources ?? []
  const customFormulas = input.customFormulas ?? []
  if (!charts.length && !pivots.length && !extraResources.length && !customFormulas.length) return

  const ws = wb.addWorksheet(META_SHEET_NAME)
  ws.state = 'veryHidden'
  ws.getCell(1, 1).value = MAGIC
  const payload: StoredMeta = {
    version: 3,
    charts,
    pivots,
    sheetIds: input.sheetIds,
    extraResources,
    customFormulas
  }
  const json = JSON.stringify(payload)
  for (let i = 0, row = 2; i < json.length; i += CHUNK, row++) {
    ws.getCell(row, 1).value = json.slice(i, i + CHUNK)
  }
}

export function readMeta(wb: ExcelJS.Workbook): ExelmjMeta {
  const empty: ExelmjMeta = { charts: [], pivots: [], extraResources: [], customFormulas: [] }
  const ws = wb.worksheets.find((w) => w.name === META_SHEET_NAME)
  if (!ws || String(ws.getCell(1, 1).value) !== MAGIC) return empty
  let json = ''
  for (let row = 2; row <= ws.rowCount; row++) {
    const v = ws.getCell(row, 1).value
    if (typeof v === 'string') json += v
  }
  try {
    const parsed = JSON.parse(json) as StoredMeta
    const sheetIds = Array.isArray(parsed.sheetIds) ? parsed.sheetIds : undefined
    const idFor = (index: number) => sheetIds?.[index] ?? `sheet-${index + 1}`
    return {
      charts: (parsed.charts ?? []).map(({ sheetIndex, ...rest }) => ({
        ...rest,
        sheetId: idFor(sheetIndex)
      })),
      pivots: (parsed.pivots ?? [])
        .filter((p) => p.sourceSheetIndex >= 0 && p.targetSheetIndex >= 0)
        .map(({ sourceSheetIndex, targetSheetIndex, ...rest }) => ({
          ...rest,
          sourceSheetId: idFor(sourceSheetIndex),
          targetSheetId: idFor(targetSheetIndex)
        })),
      sheetIds,
      extraResources: Array.isArray(parsed.extraResources) ? parsed.extraResources : [],
      customFormulas: Array.isArray(parsed.customFormulas) ? parsed.customFormulas : []
    }
  } catch {
    return empty
  }
}
