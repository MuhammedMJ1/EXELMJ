// EXELMJ formula-bar fix — in Univer 0.25.1 the formula bar is display-only
// until a cell edit session exists: clicking it cold moves DOM focus but every
// keystroke is dropped (verified live; Excel starts editing on that click).
// Dispatching `sheet.operation.set-cell-edit-visible` alone does NOT help —
// the editor bridge is never primed and input stays dead. The only cold-start
// path that opens a WORKING session with the cell content preserved is a real
// double-click on the cell, so we intercept the cold formula-bar click and
// replay a synthetic double-click on the ACTIVE cell (mirror-aware). Once a
// session is open the bar's native input routing works, so we step aside.
import type { FUniver } from '@univerjs/presets'

let editing = false
let installed = false

interface ActivePoint {
  grid: HTMLCanvasElement
  x: number
  y: number
}

function activeCellPoint(api: FUniver): ActivePoint | null {
  try {
    const ws = api.getActiveWorkbook()?.getActiveSheet()
    const active = ws?.getSelection()?.getActiveRange()
    if (!ws || !active) return null
    const rect = (
      ws.getRange(active.getRow(), active.getColumn()) as unknown as {
        getCellRect(): { x: number; y: number; width: number; height: number }
      }
    ).getCellRect()
    if (!rect) return null
    const grid = [...document.querySelectorAll<HTMLCanvasElement>('#app canvas')]
      .filter((c) => c.width > 300 && c.height > 200)
      .sort((a, b) => b.width * b.height - a.width * a.height)[0]
    const hostEl = grid?.parentElement
    if (!grid || !hostEl) return null
    const hr = hostEl.getBoundingClientRect()
    // getCellRect is logical (unmirrored) host space; under the RTL mirror the
    // browser inverse-maps pointer coords through scaleX(-1), so dispatch at
    // the VISUAL (mirrored) position for the hit-test to land on the cell.
    const cellCx = rect.x + rect.width / 2
    const mirrored = hostEl.classList.contains('exelmj-rtl-host')
    const x = mirrored ? hr.left + (hr.width - cellCx) : hr.left + cellCx
    const y = hr.top + rect.y + rect.height / 2
    return { grid, x, y }
  } catch {
    return null
  }
}

function synthesizeDblClick(grid: HTMLCanvasElement, x: number, y: number) {
  const pointer = (type: string, down: boolean) =>
    grid.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: down ? 1 : 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        view: window
      })
    )
  const mouse = (type: string, detail: number) =>
    grid.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: x,
        clientY: y,
        button: 0,
        detail,
        view: window
      })
    )
  pointer('pointerdown', true)
  pointer('pointerup', false)
  mouse('click', 1)
  pointer('pointerdown', true)
  pointer('pointerup', false)
  mouse('click', 2)
  mouse('dblclick', 2)
}

function openEditorOnActiveCell(api: FUniver, attempt = 0) {
  const pt = activeCellPoint(api)
  if (!pt) return
  const cr = pt.grid.getBoundingClientRect()
  const inside = pt.x >= cr.left && pt.x <= cr.right && pt.y >= cr.top && pt.y <= cr.bottom
  if (!inside) {
    // active cell scrolled out of view — bring it back once, then retry
    if (attempt >= 1) return
    const active = api.getActiveWorkbook()?.getActiveSheet()?.getSelection()?.getActiveRange()
    if (!active) return
    void api.executeCommand('sheet.operation.scroll-to-range', {
      range: {
        startRow: active.getRow(),
        startColumn: active.getColumn(),
        endRow: active.getRow(),
        endColumn: active.getColumn()
      }
    })
    setTimeout(() => openEditorOnActiveCell(api, 1), 80)
    return
  }
  synthesizeDblClick(pt.grid, pt.x, pt.y)
}

export function initFormulaBarFix(api: FUniver) {
  if (installed) return
  installed = true
  api.addEvent(api.Event.CommandExecuted, (event) => {
    const e = event as unknown as { id?: string; params?: { visible?: boolean } }
    if (String(e.id ?? '') === 'sheet.operation.set-cell-edit-visible') {
      editing = !!e.params?.visible
    }
  })
  window.addEventListener(
    'pointerdown',
    (ev) => {
      if (editing) return // session open — the bar's native routing works
      const t = ev.target
      // the formula bar is the only canvas inside the HEADER area
      if (!(t instanceof HTMLCanvasElement) || !t.closest('header')) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      openEditorOnActiveCell(api)
    },
    { capture: true }
  )
}
