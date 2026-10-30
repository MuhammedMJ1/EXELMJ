import { CommandType, type FUniver } from '@univerjs/presets'
import { getLang, t } from '../i18n/i18n'
import { importXlsx } from '../xlsx/importXlsx'
import { exportXlsx } from '../xlsx/exportXlsx'
import { csvToWorkbook, decodeCsvBytes, sheetToCsv } from '../xlsx/csv'
import { fidelityMerge } from '../xlsx/fidelityShield'
import { refreshRtlMirror, syncRtlMirror } from '../univer/rtlMirror'
import { reportSheetDirty } from '../word/dirtyMux'
import { askForm } from '../word/askForm'
import { buildPrintHtml, styleToCss, type PrintCell } from '../print/printHtml'
import type { ICellData, IRange, IStyleData } from '@univerjs/core'
import { buildTemplate, type TemplateId } from '../templates/templates'
import type { ChartManager } from '../charts/chartManager'
import type { ChartDef } from '../charts/chartTypes'
import type { PivotManager } from '../pivot/pivotManager'
import type { PivotDef } from '../pivot/pivotTypes'

const basename = (p: string) => p.split(/[\\/]/).pop() ?? p

// Owns the document lifecycle: new/open/save/save-as, dirty state, window title.
export class DocController {
  private readonly api: FUniver
  private readonly charts: ChartManager | null
  private readonly pivots: PivotManager | null
  private filePath: string | null = null
  private dirty = false
  private loading = false
  /** Pristine bytes of the opened xlsx/xlsm — source for the fidelity shield. */
  private originalBytes: Uint8Array | null = null

  constructor(api: FUniver, charts?: ChartManager, pivots?: PivotManager) {
    this.api = api
    this.charts = charts ?? null
    this.pivots = pivots ?? null
    // Any model MUTATION marks the document dirty, EXCEPT:
    // - formula.mutation.* — recalc bookkeeping (fires right after open/boot)
    // - doc.* — the embedded rich-text cell editor's own unit (fires on boot;
    //   committed cell text arrives as sheet.mutation.set-range-values anyway)
    // - anything flagged fromFormula — recalculated values written back into
    //   the cells (sheet.mutation.set-range-values too). The first calculation
    //   after launch lands after the load window, so a file opened at launch
    //   showed as unsaved at once.
    // Selection/scroll are OPERATIONs and never match the MUTATION check.
    this.api.addEvent(this.api.Event.CommandExecuted, (event) => {
      const e = event as unknown as {
        id?: string
        type?: number
        params?: { sheet?: { id?: string } }
        options?: { fromFormula?: boolean }
      }
      const id = typeof e.id === 'string' ? e.id : ''
      // Arabic mode: sheets added by the user default to right-to-left too.
      if (id === 'sheet.mutation.insert-sheet' && getLang() === 'ar') {
        const newSheetId = e.params?.sheet?.id
        if (newSheetId) setTimeout(() => void this.setSheetRtl(true, newSheetId), 0)
      }
      if (this.loading || this.dirty) return
      if (e.type !== CommandType.MUTATION) return
      if (id.startsWith('formula.mutation.') || id.startsWith('doc.')) return
      if (e.options?.fromFormula) return
      this.setDirty(true)
    })
  }

  newWorkbook() {
    this.loading = true
    try {
      this.charts?.clear()
      this.pivots?.clear()
      this.replaceWorkbook({ name: t('newWorkbookName') })
      // Arabic UI → the sheet direction defaults to right-to-left (Excel-style).
      if (getLang() === 'ar') void this.setSheetRtl(true)
      this.filePath = null
      this.originalBytes = null
      this.setDirty(false)
    } finally {
      this.endLoadingSoon()
    }
  }

  /** Set the RTL flag on a sheet (active one when subUnitId is omitted). */
  async setSheetRtl(rtl: boolean, subUnitId?: string): Promise<boolean> {
    try {
      return await this.api.executeCommand('sheet.command.set-worksheet-right-to-left', {
        rightToLeft: rtl ? 1 : 0,
        ...(subUnitId ? { subUnitId } : {})
      })
    } catch (err) {
      console.warn('[doc] setSheetRtl failed', err)
      return false
    }
  }

  /** Menu toggle: flip the active sheet's direction and tell the user. */
  async toggleActiveSheetRtl() {
    const wb = this.api.getActiveWorkbook()
    const fws = wb?.getActiveSheet()
    if (!wb || !fws) return
    const sheetId = fws.getSheetId()
    const snapshot = wb.save()
    const current = snapshot.sheets[sheetId]?.rightToLeft === 1
    const ok = await this.setSheetRtl(!current, sheetId)
    if (ok) alert(t(current ? 'rtlOffMsg' : 'rtlOnMsg'))
  }

  async openViaDialog() {
    if (!window.exelmj) return
    const res = await window.exelmj.openFile()
    if (res) await this.openFromBytes(res.path, res.bytes)
  }

  async openPath(path: string) {
    if (!window.exelmj) return
    try {
      const res = await window.exelmj.readFile(path)
      if (res) await this.openFromBytes(res.path, res.bytes)
    } catch (err) {
      this.reportError('openFailed', err)
    }
  }

  async openFromBytes(path: string, bytes: Uint8Array) {
    this.loading = true
    try {
      const isCsv = path.toLowerCase().endsWith('.csv')
      const data = isCsv
        ? csvToWorkbook(decodeCsvBytes(bytes), basename(path), getLang() === 'ar')
        : await importXlsx(bytes, basename(path))
      this.originalBytes = isCsv ? null : bytes
      this.charts?.clear()
      this.pivots?.clear()
      this.replaceWorkbook(data)
      const custom = data.custom as Record<string, unknown> | undefined
      const chartDefs = custom?.exelmjCharts as ChartDef[] | undefined
      if (chartDefs?.length) {
        // Mount after the sheet canvas has rendered.
        setTimeout(() => this.charts?.restore(chartDefs), 400)
      }
      const pivotDefs = custom?.exelmjPivots as PivotDef[] | undefined
      if (pivotDefs?.length) this.pivots?.restore(pivotDefs)
      this.filePath = path
      this.setDirty(false)
    } catch (err) {
      this.reportError('openFailed', err)
    } finally {
      this.endLoadingSoon()
    }
  }

  async save(): Promise<boolean> {
    if (!window.exelmj) return false
    // CSV-opened docs are saved as a fresh .xlsx (CSV can't hold formatting).
    if (!this.filePath || this.filePath.toLowerCase().endsWith('.csv')) return this.saveAs()
    try {
      const bytes = await this.snapshotBytes()
      if (!bytes) return false
      const ok = await window.exelmj.saveFile(this.filePath, bytes)
      if (ok) this.setDirty(false)
      return !!ok
    } catch (err) {
      this.reportError('saveFailed', err)
      return false
    }
  }

  async saveAs(): Promise<boolean> {
    if (!window.exelmj) return false
    try {
      const bytes = await this.snapshotBytes()
      if (!bytes) return false
      const suggested = this.filePath ? basename(this.filePath) : `${t('newWorkbookName')}.xlsx`
      const savedPath = await window.exelmj.saveFileAs(bytes, suggested)
      if (!savedPath) return false
      this.filePath = savedPath
      this.setDirty(false)
      return true
    } catch (err) {
      this.reportError('saveFailed', err)
      return false
    }
  }

  /** Close-guard flow: save, then ask main to really close (only if saved). */
  async saveThenClose() {
    const ok = await this.save()
    if (ok) window.exelmj?.requestClose()
  }

  newFromTemplate(id: TemplateId) {
    this.loading = true
    try {
      this.charts?.clear()
      this.pivots?.clear()
      this.replaceWorkbook(buildTemplate(id))
      this.filePath = null
      this.originalBytes = null
      this.setDirty(false)
    } finally {
      this.endLoadingSoon()
    }
  }

  /** Export the ACTIVE sheet's values as CSV (UTF-8 BOM for Arabic Excel). */
  async exportCsv() {
    if (!window.exelmj?.exportCsv) return
    const wb = this.api.getActiveWorkbook()
    const fws = wb?.getActiveSheet()
    if (!wb || !fws) return
    const snapshot = wb.save()
    const sheet = snapshot.sheets[fws.getSheetId()]
    if (!sheet) return
    try {
      const bytes = new TextEncoder().encode(sheetToCsv(sheet))
      await window.exelmj.exportCsv(bytes, `${sheet.name ?? 'sheet'}.csv`)
    } catch (err) {
      this.reportError('saveFailed', err)
    }
  }

  /** Print the ACTIVE sheet, or export it as PDF, via a hidden window. */
  async printActiveSheet(mode: 'print' | 'pdf') {
    if (!window.exelmj?.printSheet) return
    const wb = this.api.getActiveWorkbook()
    const fws = wb?.getActiveSheet()
    if (!wb || !fws) return
    const snapshot = wb.save()
    const sheet = snapshot.sheets[fws.getSheetId()]
    if (!sheet) return

    type CellMap = Record<number, Record<number, ICellData>>
    const cellData = (sheet.cellData ?? {}) as CellMap
    let maxRow = -1
    let maxCol = -1
    for (const [r, cols] of Object.entries(cellData)) {
      for (const [c, cell] of Object.entries(cols ?? {})) {
        if (!cell || (cell.v == null && cell.f == null && cell.p == null && cell.s == null)) continue
        maxRow = Math.max(maxRow, Number(r))
        maxCol = Math.max(maxCol, Number(c))
      }
    }
    if (maxRow < 0) {
      alert(t('printEmpty'))
      return
    }

    let displays: string[][] | null = null
    try {
      const fr = fws.getRange(0, 0, maxRow + 1, maxCol + 1) as unknown as {
        getDisplayValues?: () => string[][]
      }
      displays = fr.getDisplayValues?.() ?? null
    } catch {
      displays = null
    }

    const resolve = (s: ICellData['s']): IStyleData | undefined =>
      typeof s === 'string' ? ((snapshot.styles?.[s] as IStyleData | undefined) ?? undefined) : (s ?? undefined)

    const spans = new Map<string, { rowspan: number; colspan: number }>()
    const covered = new Set<string>()
    for (const m of (sheet.mergeData ?? []) as IRange[]) {
      spans.set(`${m.startRow}:${m.startColumn}`, {
        rowspan: m.endRow - m.startRow + 1,
        colspan: m.endColumn - m.startColumn + 1
      })
      for (let r = m.startRow; r <= m.endRow; r++) {
        for (let c = m.startColumn; c <= m.endColumn; c++) {
          if (r !== m.startRow || c !== m.startColumn) covered.add(`${r}:${c}`)
        }
      }
    }

    const rowStyles = (sheet.rowData ?? {}) as Record<number, { s?: ICellData['s'] }>
    const colStyles = (sheet.columnData ?? {}) as Record<number, { s?: ICellData['s']; w?: number }>
    const rows: Array<Array<PrintCell | null>> = []
    for (let r = 0; r <= maxRow; r++) {
      const rowArr: Array<PrintCell | null> = []
      for (let c = 0; c <= maxCol; c++) {
        const key = `${r}:${c}`
        if (covered.has(key)) {
          rowArr.push(null)
          continue
        }
        const cell = cellData[r]?.[c]
        const doc = cell?.p as { body?: { dataStream?: string } } | null | undefined
        const text =
          displays?.[r]?.[c] ??
          (doc?.body?.dataStream
            ? doc.body.dataStream.replace(/\r\n$/, '')
            : cell?.v != null
              ? String(cell.v)
              : '')
        const merged: IStyleData = {
          ...(resolve(colStyles[c]?.s) ?? {}),
          ...(resolve(rowStyles[r]?.s) ?? {}),
          ...(resolve(cell?.s) ?? {})
        }
        rowArr.push({ text, css: styleToCss(merged), ...(spans.get(key) ?? {}) })
      }
      rows.push(rowArr)
    }

    const columnWidthsPx = Array.from(
      { length: maxCol + 1 },
      (_, c) => colStyles[c]?.w ?? sheet.defaultColumnWidth ?? 88
    )
    const charts = (await this.charts?.captureImages()) ?? []
    const html = buildPrintHtml({
      title: this.filePath ? basename(this.filePath) : t('newWorkbookName'),
      sheetName: sheet.name ?? '',
      rtl: (sheet as { rightToLeft?: number }).rightToLeft === 1,
      columnWidthsPx,
      rows,
      charts
    })
    try {
      await window.exelmj.printSheet(html, mode, `${sheet.name ?? 'sheet'}.pdf`)
    } catch (err) {
      if (!/cancel/i.test(String(err))) this.reportError('printFailed', err)
    }
  }

  // --- autosave & crash recovery ---

  private autosaving = false

  startAutosave(intervalMs = 120_000) {
    setInterval(() => void this.autosaveNow(), intervalMs)
  }

  /** Also called by the web edition the moment the app is hidden (main.ts). */
  async autosaveNow() {
    if (!this.dirty || this.autosaving || !window.exelmj?.saveAutosave) return
    this.autosaving = true
    try {
      const bytes = await this.snapshotBytes()
      if (bytes) {
        window.exelmj.saveAutosave(bytes, JSON.stringify({ path: this.filePath, at: Date.now() }))
      }
    } catch (err) {
      console.warn('[autosave] failed', err)
    } finally {
      this.autosaving = false
    }
  }

  /** Boot-time crash recovery. Returns true when an autosave was restored. */
  async tryRecoverAutosave(): Promise<boolean> {
    const rec = await window.exelmj?.getAutosave?.()
    if (!rec?.bytes?.length) return false
    let meta: { path?: string | null; at?: number } = {}
    try {
      meta = JSON.parse(rec.meta ?? '{}')
    } catch {
      meta = {}
    }
    const when = meta.at ? new Date(meta.at).toLocaleString() : ''
    // The app's own modal, not window.confirm: the native task dialog blocks
    // the renderer, so the app looks frozen at exactly the moment it is trying
    // to hand back work that was nearly lost.
    const answer = await askForm(t('recoverTitle'), [
      {
        key: 'note',
        // The file's NAME: a web-edition path is an internal id + name.
        label: `${t('recoverPrompt')}\n${meta.path ? basename(meta.path) : t('newWorkbookName')}${when ? ` — ${when}` : ''}`,
        type: 'note'
      }
    ])
    if (!answer) {
      window.exelmj?.clearAutosave?.()
      return false
    }
    await this.openFromBytes(meta.path ?? `${t('newWorkbookName')}.xlsx`, rec.bytes)
    this.setDirty(true) // recovered content is unsaved by definition
    void this.autosaveNow()
    return true
  }

  get file() {
    return this.filePath
  }

  get isDirty() {
    return this.dirty
  }

  /**
   * The active sheet's cells as plain strings, for the word mode's mail merge:
   * a list of names in the sheet is the data source an office actually has.
   * Values are read off the snapshot rather than cell by cell — the same
   * source the exporter trusts.
   */
  activeSheetCells(): string[][] {
    const wb = this.api.getActiveWorkbook()
    const sheet = wb?.getActiveSheet()
    if (!wb || !sheet) return []
    const cellData = (wb.save().sheets?.[sheet.getSheetId()]?.cellData ?? {}) as Record<
      string,
      Record<string, { v?: unknown } | null> | null
    >
    const rows: string[][] = []
    let width = 0
    for (const [r, cells] of Object.entries(cellData)) {
      const row: string[] = []
      for (const [c, cell] of Object.entries(cells ?? {})) {
        const value = cell?.v
        row[Number(c)] = value === null || value === undefined ? '' : String(value)
      }
      width = Math.max(width, row.length)
      rows[Number(r)] = row
    }
    // holes are real (an empty cell writes nothing), so square the matrix off
    return Array.from({ length: rows.length }, (_, r) =>
      Array.from({ length: width }, (_, c) => rows[r]?.[c] ?? '')
    )
  }

  setDirty(dirty: boolean) {
    this.dirty = dirty
    // Through the mux — the word document feeds the same main-process flag.
    reportSheetDirty(dirty)
    if (!dirty) window.exelmj?.clearAutosave?.()
    this.updateTitle()
  }

  private replaceWorkbook(data: Parameters<FUniver['createWorkbook']>[0]) {
    const active = this.api.getActiveWorkbook()
    if (active) this.api.disposeUnit(active.getId())
    this.api.createWorkbook(data)
    // Fresh grid canvases/buffers — re-arm the RTL mirror so recovered/opened
    // content isn't drawn mirrored until the first user repaint.
    refreshRtlMirror()
  }

  private async snapshotBytes(): Promise<Uint8Array | null> {
    const wb = this.api.getActiveWorkbook()
    if (!wb) return null
    const snapshot = wb.save()
    snapshot.custom = {
      ...((snapshot.custom as Record<string, unknown> | null | undefined) ?? {}),
      exelmjCharts: this.charts?.serialize() ?? [],
      exelmjPivots: this.pivots?.serialize() ?? []
    }
    const exported = await exportXlsx(snapshot)
    if (!this.originalBytes) return exported
    // Fidelity shield: re-inject pivots / native charts / macros from the
    // opened file so saving in EXELMJ never destroys them.
    try {
      const { bytes, report } = await fidelityMerge(exported, this.originalBytes)
      console.info('[fidelity]', report)
      return bytes
    } catch (err) {
      console.warn('[fidelity] merge failed — saving without preserved parts', err)
      return exported
    }
  }

  private endLoadingSoon() {
    // Creation/recalc mutations can trail the load by a tick or two.
    setTimeout(() => {
      this.loading = false
      syncRtlMirror()
    }, 300)
  }

  private reportError(key: 'openFailed' | 'saveFailed' | 'printFailed', err: unknown) {
    console.error(`[doc] ${key}`, err)
    alert(`${t(key)}\n${String(err)}`)
  }

  private updateTitle() {
    const name = this.filePath ? basename(this.filePath) : t('newWorkbookName')
    document.title = `${this.dirty ? '* ' : ''}${name} — ${t('appName')}`
  }
}
