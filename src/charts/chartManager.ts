import { CommandType, type FUniver } from '@univerjs/presets'
import * as echarts from 'echarts'
import type { ChartDef } from './chartTypes'

export interface ChartSeriesData {
  categories: string[]
  series: Array<{ name: string; values: number[] }>
}

const COMPONENT_KEY = 'exelmj-chart'

type FloatHandle = { id: string; dispose: () => void }

// Owns chart definitions and their float-DOM lifecycle. Charts live over the
// grid (Univer drawing layer: movable/resizable) and re-render when sheet
// values change. Persistence goes through serialize()/restore() — the
// converter stores defs in the _EXELMJ_META veryHidden sheet.
export class ChartManager {
  private readonly api: FUniver
  private readonly defs = new Map<string, ChartDef>()
  private readonly handles = new Map<string, FloatHandle>()
  private readonly renderListeners = new Map<string, () => void>()
  private editHandler: ((def: ChartDef) => void) | null = null
  private changeHandler: (() => void) | null = null
  private counter = 0

  constructor(api: FUniver, component: unknown) {
    this.api = api
    ;(api as unknown as { registerComponent(key: string, comp: unknown): void }).registerComponent(
      COMPONENT_KEY,
      component
    )
    let timer: ReturnType<typeof setTimeout> | null = null
    api.addEvent(api.Event.CommandExecuted, (event) => {
      const e = event as unknown as { id?: string; type?: number }
      if (e.type !== CommandType.MUTATION) return
      if (!String(e.id ?? '').startsWith('sheet.mutation.set-range-values')) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => this.rerenderAll(), 250)
    })
  }

  onEdit(handler: (def: ChartDef) => void) {
    this.editHandler = handler
  }

  /** Fired on user-driven add/update/remove (NOT on restore) — used for dirty. */
  onChange(handler: () => void) {
    this.changeHandler = handler
  }

  getDef(id: string) {
    return this.defs.get(id)
  }

  list() {
    return [...this.defs.values()]
  }

  addChart(input: Omit<ChartDef, 'id'>): ChartDef | null {
    const def: ChartDef = { ...input, id: `chart-${++this.counter}-${Date.now().toString(36)}` }
    if (!this.mount(def)) return null
    this.defs.set(def.id, def)
    this.changeHandler?.()
    return def
  }

  updateChart(id: string, patch: Partial<Pick<ChartDef, 'kind' | 'range' | 'title'>>) {
    const def = this.defs.get(id)
    if (!def) return
    Object.assign(def, patch)
    this.renderListeners.get(id)?.()
    this.changeHandler?.()
  }

  remove(id: string) {
    if (!this.defs.has(id)) return
    try {
      this.handles.get(id)?.dispose()
    } catch (err) {
      console.warn('[charts] dispose failed', err)
    }
    this.handles.delete(id)
    this.defs.delete(id)
    this.renderListeners.delete(id)
    this.changeHandler?.()
  }

  requestEdit(id: string) {
    const def = this.defs.get(id)
    if (def) this.editHandler?.(def)
  }

  subscribe(id: string, render: () => void): () => void {
    this.renderListeners.set(id, render)
    return () => {
      if (this.renderListeners.get(id) === render) this.renderListeners.delete(id)
    }
  }

  /** Sync positions back from the live float-DOMs, then return defs to save. */
  serialize(): ChartDef[] {
    const fwb = this.api.getActiveWorkbook()
    for (const fws of fwb?.getSheets() ?? []) {
      const doms =
        (
          fws as unknown as {
            getAllFloatDoms?: () => Array<{ id: string; position?: Record<string, number> }>
          }
        ).getAllFloatDoms?.() ?? []
      for (const dom of doms) {
        const def = this.defs.get(dom.id)
        const p = dom.position
        if (!def || !p) continue
        if (typeof p.left === 'number') def.x = p.left
        if (typeof p.top === 'number') def.y = p.top
        if (typeof p.width === 'number') def.w = p.width
        if (typeof p.height === 'number') def.h = p.height
      }
    }
    return this.list()
  }

  /** Replace all charts (used on file open). Silent — no onChange. */
  restore(defs: ChartDef[]) {
    this.clear()
    for (const def of defs) {
      if (this.mount(def)) this.defs.set(def.id, def)
    }
  }

  clear() {
    for (const handle of this.handles.values()) {
      try {
        handle.dispose()
      } catch {
        // the workbook (and its float-DOMs) may already be disposed
      }
    }
    this.handles.clear()
    this.defs.clear()
    this.renderListeners.clear()
  }

  /** Read the chart's range into categories + numeric series. */
  getData(id: string): ChartSeriesData {
    const empty: ChartSeriesData = { categories: [], series: [] }
    const def = this.defs.get(id)
    if (!def) return empty
    const fws = this.sheetById(def.sheetId)
    if (!fws) return empty
    let values: unknown[][] = []
    try {
      values = fws.getRange(def.range).getValues() as unknown[][]
    } catch {
      return empty
    }
    if (!values.length) return empty
    const cols = Math.max(...values.map((r) => r?.length ?? 0))
    if (!cols) return empty

    const hasHeader = (values[0] ?? []).some((v, i) => i > 0 && v != null && typeof v !== 'number')
    const startRow = hasHeader ? 1 : 0
    const rows = values.slice(startRow)

    if (cols === 1) {
      return {
        categories: rows.map((_, i) => String(i + 1)),
        series: [{ name: def.title || '1', values: rows.map((r) => toNumber(r?.[0])) }]
      }
    }

    const categories = rows.map((r, i) => (r?.[0] == null ? String(i + 1) : String(r[0])))
    const series: ChartSeriesData['series'] = []
    for (let c = 1; c < cols; c++) {
      series.push({
        name: hasHeader && values[0]?.[c] != null ? String(values[0][c]) : String(c),
        values: rows.map((r) => toNumber(r?.[c]))
      })
    }
    return { categories, series }
  }

  private rerenderAll() {
    for (const render of this.renderListeners.values()) render()
  }

  /** Render each chart offscreen and return PNG data URLs (for print/PDF). */
  async captureImages(): Promise<Array<{ title: string; dataUrl: string }>> {
    const { buildOption } = await import('./ChartFloat')
    const out: Array<{ title: string; dataUrl: string }> = []
    for (const def of this.defs.values()) {
      const div = document.createElement('div')
      div.style.cssText = `position:fixed;left:-10000px;top:0;width:${def.w}px;height:${def.h}px;`
      document.body.append(div)
      try {
        const chart = echarts.init(div)
        chart.setOption(buildOption(def, this.getData(def.id)), true)
        out.push({ title: def.title, dataUrl: chart.getDataURL({ pixelRatio: 2, backgroundColor: '#fff' }) })
        chart.dispose()
      } catch (err) {
        console.warn('[charts] capture failed', err)
      } finally {
        div.remove()
      }
    }
    return out
  }

  private mount(def: ChartDef): boolean {
    const fws = this.sheetById(def.sheetId) ?? this.api.getActiveWorkbook()?.getActiveSheet()
    if (!fws) return false
    const handle = (
      fws as unknown as {
        addFloatDomToPosition(layer: object, id?: string): FloatHandle | null | undefined
      }
    ).addFloatDomToPosition(
      {
        componentKey: COMPONENT_KEY,
        initPosition: { startX: def.x, endX: def.x + def.w, startY: def.y, endY: def.y + def.h },
        data: { chartId: def.id }
      },
      def.id
    )
    if (!handle) return false
    this.handles.set(def.id, handle)
    return true
  }

  private sheetById(sheetId: string) {
    return this.api.getActiveWorkbook()?.getSheets().find((s) => s.getSheetId() === sheetId) ?? null
  }
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
