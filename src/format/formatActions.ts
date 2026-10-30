// Fine-grained "professional" controls the manager asked for — every action
// wraps a VERIFIED Univer facade API or command id (checked against 0.25.1)
// and operates on the ACTIVE selection. Menu-driven from electron/menu.ts via
// main.ts dispatch. Includes the previously-impossible «بدون حدود» (border
// type 'none') plus row/column, size, hide/show, freeze and clear controls.
import type { FUniver } from '@univerjs/presets'
import { t } from '../i18n/i18n'

export type BorderChoice =
  | 'all'
  | 'outside'
  | 'inside'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'none'

const BORDER_THIN = 1 // BorderStyleTypes.THIN

export class FormatActions {
  constructor(private readonly api: FUniver) {}

  private ctx() {
    const wb = this.api.getActiveWorkbook()
    const ws = wb?.getActiveSheet()
    const rng = ws?.getSelection()?.getActiveRange() ?? null
    return { wb, ws, rng }
  }

  /** Selected row span [start, count] (falls back to the active row). */
  private rowSpan() {
    const { rng } = this.ctx()
    if (!rng) return null
    const start = rng.getRow()
    return { start, count: Math.max(rng.getLastRow() - start + 1, 1) }
  }

  private colSpan() {
    const { rng } = this.ctx()
    if (!rng) return null
    const start = rng.getColumn()
    return { start, count: Math.max(rng.getLastColumn() - start + 1, 1) }
  }

  // ---- borders (incl. NONE — the manager's concrete complaint) ------------

  setBorder(choice: BorderChoice) {
    const { rng } = this.ctx()
    if (!rng) return
    try {
      ;(
        rng as unknown as {
          setBorder(type: string, style: number, color?: string): unknown
        }
      ).setBorder(choice, BORDER_THIN, '#000000')
    } catch (err) {
      console.warn('[format] setBorder failed', err)
    }
  }

  // ---- merge / wrap --------------------------------------------------------

  mergeAll() {
    void this.api.executeCommand('sheet.command.add-worksheet-merge-all')
  }

  unmerge() {
    void this.api.executeCommand('sheet.command.remove-worksheet-merge')
  }

  toggleWrap(on: boolean) {
    const { rng } = this.ctx()
    try {
      ;(rng as unknown as { setWrap(v: boolean): unknown } | null)?.setWrap(on)
    } catch (err) {
      console.warn('[format] setWrap failed', err)
    }
  }

  // ---- rows / columns ------------------------------------------------------

  insertRowsAbove() {
    const span = this.rowSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.insertRowsBefore(span.start, span.count)
  }

  insertRowsBelow() {
    const span = this.rowSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.insertRowsAfter(span.start + span.count - 1, span.count)
  }

  insertColsBefore() {
    const span = this.colSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.insertColumnsBefore(span.start, span.count)
  }

  insertColsAfter() {
    const span = this.colSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.insertColumnsAfter(span.start + span.count - 1, span.count)
  }

  deleteRows() {
    const span = this.rowSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.deleteRows(span.start, span.count)
  }

  deleteCols() {
    const span = this.colSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.deleteColumns(span.start, span.count)
  }

  hideRows() {
    const span = this.rowSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.hideRows(span.start, span.count)
  }

  showAllRows() {
    const { ws } = this.ctx()
    if (!ws) return
    ws.showRows(0, ws.getMaxRows())
  }

  hideCols() {
    const span = this.colSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    ws.hideColumns(span.start, span.count)
  }

  showAllCols() {
    const { ws } = this.ctx()
    if (!ws) return
    ws.showColumns(0, ws.getMaxColumns())
  }

  async setRowHeight() {
    const span = this.rowSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    const px = await promptNumber(t('rowHeightTitle'), 24)
    if (px == null) return
    ws.setRowHeightsForced(span.start, span.count, clamp(px, 2, 2000))
  }

  async setColWidth() {
    const span = this.colSpan()
    const { ws } = this.ctx()
    if (!span || !ws) return
    const px = await promptNumber(t('colWidthTitle'), 88)
    if (px == null) return
    ws.setColumnWidths(span.start, span.count, clamp(px, 2, 2000))
  }

  // ---- freeze --------------------------------------------------------------

  freezeAtSelection() {
    const { ws, rng } = this.ctx()
    if (!ws || !rng) return
    const row = rng.getRow()
    const col = rng.getColumn()
    if (row === 0 && col === 0) {
      ws.cancelFreeze()
      return
    }
    ws.setFreeze({ startRow: row, startColumn: col, ySplit: row, xSplit: col })
  }

  cancelFreeze() {
    const { ws } = this.ctx()
    ws?.cancelFreeze()
  }

  // ---- clears --------------------------------------------------------------

  clearFormat() {
    void this.api.executeCommand('sheet.command.clear-selection-format')
  }

  clearContent() {
    void this.api.executeCommand('sheet.command.clear-selection-content')
  }

  clearAll() {
    void this.api.executeCommand('sheet.command.clear-selection-all')
  }

  // ---- inserts (menu «إدراج») ----------------------------------------------

  insertSheet() {
    void this.api.executeCommand('sheet.command.insert-sheet')
  }

  insertImage() {
    void this.api.executeCommand('sheet.command.insert-float-image')
  }

  insertHyperlink() {
    void this.api.executeCommand('sheet.operation.insert-hyper-link-toolbar')
  }

  insertComment() {
    void this.api.executeCommand('sheet.operation.toggle-comment-panel')
  }

  /** =TODAY() — recalculates in EXELMJ and in real Excel. */
  insertToday() {
    this.insertFormula('=TODAY()')
  }

  /** =HIJRITODAY() — our Umm al-Qura function (exported as value + restored). */
  insertHijriToday() {
    this.insertFormula('=HIJRITODAY()')
  }

  private insertFormula(f: string) {
    const { rng } = this.ctx()
    if (!rng) return
    try {
      ;(rng as unknown as { setValue(v: unknown): unknown }).setValue({ f })
    } catch (err) {
      console.warn('[format] insertFormula failed', err)
    }
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi)

/** Tiny numeric prompt (window.prompt is unavailable in Electron renderers). */
function promptNumber(title: string, initial: number): Promise<number | null> {
  return new Promise((resolve) => {
    document.getElementById('exelmj-number-prompt')?.remove()
    const overlay = document.createElement('div')
    overlay.id = 'exelmj-number-prompt'
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1000;display:flex;align-items:center;justify-content:center;'
    const panel = document.createElement('div')
    panel.style.cssText =
      'background:#fff;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:16px;width:260px;font-size:13px;'
    const heading = document.createElement('h3')
    heading.textContent = title
    heading.style.cssText = 'margin:0 0 10px;font-size:14px;'
    const input = document.createElement('input')
    input.type = 'number'
    input.value = String(initial)
    input.dir = 'ltr'
    input.style.cssText = 'width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;'
    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:12px;'
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = t('cancel')
    cancelBtn.style.cssText = 'padding:5px 12px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;'
    const okBtn = document.createElement('button')
    okBtn.type = 'button'
    okBtn.textContent = t('ok')
    okBtn.style.cssText =
      'padding:5px 12px;border:1px solid #0f6cbd;border-radius:4px;background:#0f6cbd;color:#fff;cursor:pointer;'
    const done = (value: number | null) => {
      overlay.remove()
      resolve(value)
    }
    cancelBtn.addEventListener('click', () => done(null))
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) done(null)
    })
    okBtn.addEventListener('click', () => {
      const n = Number(input.value)
      done(Number.isFinite(n) && n > 0 ? n : null)
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') okBtn.click()
      if (e.key === 'Escape') done(null)
    })
    buttons.append(cancelBtn, okBtn)
    panel.append(heading, input, buttons)
    overlay.append(panel)
    document.body.append(overlay)
    input.focus()
    input.select()
  })
}
