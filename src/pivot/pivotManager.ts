// Pivot lifecycle: read the source range, compute via the pure engine, and
// write the result into a dedicated TARGET sheet (values + light styling —
// plain cells, so the sheet opens as-is in real Excel). Definitions live in
// memory here, ride snapshot.custom.exelmjPivots on save (→ _EXELMJ_META) and
// come back through importXlsx, so refresh keeps working after reopen.
import type { FUniver } from '@univerjs/presets'
import type { ICellData } from '@univerjs/core'
import { buildPivot, type PivotCell } from './pivotEngine'
import type { PivotAgg, PivotDef } from './pivotTypes'
import { t } from '../i18n/i18n'

type FWorkbook = NonNullable<ReturnType<FUniver['getActiveWorkbook']>>
type FWorksheet = ReturnType<FWorkbook['getActiveSheet']>

export interface PivotInput {
  sourceSheetId: string
  range: string
  rowField: number
  colField: number | null
  valueField: number
  agg: PivotAgg
}

const AGG_KEY: Record<PivotAgg, string> = {
  sum: 'aggSum',
  count: 'aggCount',
  average: 'aggAverage',
  min: 'aggMin',
  max: 'aggMax'
}

export class PivotManager {
  private readonly defs = new Map<string, PivotDef>()
  private changeHandler: (() => void) | null = null
  private counter = 0

  constructor(private readonly api: FUniver) {}

  /** Fired on user-driven add/refresh/remove (NOT on restore) — used for dirty. */
  onChange(handler: () => void) {
    this.changeHandler = handler
  }

  list() {
    return [...this.defs.values()]
  }

  /** Defs to persist — skip any whose source or target sheet no longer exists. */
  serialize(): PivotDef[] {
    const fwb = this.api.getActiveWorkbook()
    if (!fwb) return []
    return this.list().filter(
      (d) => fwb.getSheetBySheetId(d.sourceSheetId) && fwb.getSheetBySheetId(d.targetSheetId)
    )
  }

  /** Replace all defs (used on file open). Silent — no onChange. */
  restore(defs: PivotDef[]) {
    this.defs.clear()
    for (const def of defs) this.defs.set(def.id, def)
  }

  clear() {
    this.defs.clear()
  }

  /** Field names = the header row of the range (fallback: عمود N). */
  readHeaders(sourceSheetId: string, range: string): string[] | null {
    const values = this.readRange(sourceSheetId, range)
    if (!values?.length) return null
    return (values[0] ?? []).map((h, i) =>
      h == null || String(h).trim() === '' ? `${t('pivotColumnFallback')} ${i + 1}` : String(h)
    )
  }

  /** Create the pivot: compute, make the target sheet, write, register. */
  async addPivot(input: PivotInput): Promise<PivotDef | null> {
    const fwb = this.api.getActiveWorkbook()
    if (!fwb) return null
    const grid = this.compute(input)
    if (!grid) return null

    const name = this.uniqueSheetName(fwb)
    let target: FWorksheet
    try {
      target = fwb.create(name, Math.max(grid.length + 20, 60), Math.max((grid[0]?.length ?? 2) + 6, 26))
    } catch (err) {
      console.warn('[pivot] create sheet failed', err)
      return null
    }

    const def: PivotDef = {
      ...input,
      id: `pivot-${++this.counter}-${Date.now().toString(36)}`,
      name,
      targetSheetId: target.getSheetId()
    }
    this.writeGrid(target, grid)
    await this.matchSourceDirection(fwb, def)
    this.defs.set(def.id, def)
    this.changeHandler?.()
    return def
  }

  /** Recompute every pivot into its target sheet. */
  refreshAll(): { refreshed: number; broken: number } {
    const fwb = this.api.getActiveWorkbook()
    let refreshed = 0
    let broken = 0
    if (!fwb) return { refreshed, broken: this.defs.size }
    for (const def of this.defs.values()) {
      const target = fwb.getSheetBySheetId(def.targetSheetId)
      const grid = this.compute(def)
      if (!target || !grid) {
        broken++
        continue
      }
      try {
        target.clear()
      } catch {
        // clearing may fail on protected sheets — still try to write
      }
      this.writeGrid(target, grid)
      refreshed++
    }
    if (refreshed) this.changeHandler?.()
    return { refreshed, broken }
  }

  // ---- internals ----------------------------------------------------------

  private readRange(sourceSheetId: string, range: string): unknown[][] | null {
    const fwb = this.api.getActiveWorkbook()
    const fws = fwb?.getSheetBySheetId(sourceSheetId)
    if (!fws) return null
    try {
      return fws.getRange(range).getValues() as unknown[][]
    } catch {
      return null
    }
  }

  private compute(input: PivotInput): PivotCell[][] | null {
    const values = this.readRange(input.sourceSheetId, input.range)
    if (!values || values.length < 2) return null
    const headers = (values[0] ?? []).map((h, i) =>
      h == null || String(h).trim() === '' ? `${t('pivotColumnFallback')} ${i + 1}` : String(h)
    )
    const valueName = headers[input.valueField] ?? `${t('pivotColumnFallback')} ${input.valueField + 1}`
    return buildPivot(values.slice(1), input, {
      total: t('pivotTotal'),
      empty: t('pivotEmptyLabel'),
      valueTitle: `${t(AGG_KEY[input.agg])} ${valueName}`
    })
  }

  private writeGrid(target: FWorksheet, grid: PivotCell[][]) {
    const rows = grid.length
    const cols = grid[0]?.length ?? 0
    if (!rows || !cols) return
    try {
      const cells: ICellData[][] = grid.map((row) => row.map((v) => (v === null ? {} : { v })))
      target.getRange(0, 0, rows, cols).setValues(cells)
    } catch (err) {
      console.warn('[pivot] write failed', err)
      return
    }
    // Light, Excel-safe styling — never fatal if a facade API is missing.
    try {
      target.getRange(0, 0, 1, cols).setFontWeight('bold').setBackground('#eef2fb')
      target.getRange(rows - 1, 0, 1, cols).setFontWeight('bold').setBackground('#f4f4f4')
      target.getRange(0, 0, rows, 1).setFontWeight('bold')
      if (cols > 2) target.getRange(0, cols - 1, rows, 1).setFontWeight('bold')
      const ws = target as unknown as { setColumnWidth?: (index: number, width: number) => unknown }
      ws.setColumnWidth?.(0, 150)
      for (let c = 1; c < cols; c++) ws.setColumnWidth?.(c, 110)
    } catch {
      // values are in — styling is best-effort
    }
  }

  /** New sheets should read in the same direction as their source sheet. */
  private async matchSourceDirection(fwb: FWorkbook, def: PivotDef) {
    try {
      const rtl = fwb.save().sheets[def.sourceSheetId]?.rightToLeft === 1
      await this.api.executeCommand('sheet.command.set-worksheet-right-to-left', {
        rightToLeft: rtl ? 1 : 0,
        subUnitId: def.targetSheetId
      })
    } catch {
      // direction stays at workbook default — cosmetic only
    }
  }

  private uniqueSheetName(fwb: FWorkbook): string {
    const base = t('pivotSheetName')
    const taken = new Set<string>()
    for (const sheet of fwb.getSheets()) {
      const s = sheet as unknown as { getSheetName?: () => string; getName?: () => string }
      const n = s.getSheetName?.() ?? s.getName?.()
      if (n) taken.add(n)
    }
    for (let i = 1; ; i++) {
      const name = `${base} ${i}`
      if (!taken.has(name)) return name
    }
  }
}
