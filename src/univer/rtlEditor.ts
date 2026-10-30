// EXELMJ RTL cell-editing overlay.
//
// Univer 0.25.1's doc canvas editor has NO Unicode Bidi Algorithm: its shaper
// (ArabicHandler) naively REVERSES each Arabic run and lays runs out left-to-
// right; `paragraph.direction` / `section.contentDirection` are stored but
// ignored by layout (verified in the engine source and by live pixel/x-probe).
// So typing Arabic — and especially MIXED Arabic+Latin+digits — inside a cell
// shows garbled, back-to-front, left-flowing text, even though the committed
// GRID (which draws each cell as one browser-bidi fillText) looks correct.
//
// Fix: while an RTL sheet's TEXT cell is being edited, cover Univer's canvas
// editor with a native <textarea dir="auto"; unicode-bidi:plaintext>. The
// browser does full, correct bidi + Arabic shaping + caret + right-to-left flow
// during editing. On commit we write the plain LOGICAL string to the cell via
// the facade (which parses numbers and formulas), and the grid renders it.
//
// EXISTING formulas (cell already holds `=…`) keep Univer's own editor so its
// autocomplete / range-picking still work; a formula typed fresh in the overlay
// still commits correctly (just without live assist). Activation follows the
// active sheet's rightToLeft flag — the same signal the grid mirror uses.
//
// The FORMULA BAR (a second univer-doc-main-canvas, inside <header>) has the
// same no-bidi limit. This app never types into it (clicking it opens the cell
// editor), so we cover it with a READ-ONLY, pointer-events:none bidi <div> that
// shows the active cell's value/formula correctly and mirrors the live cell
// editor while typing — see syncFxOverlay.
import type { FUniver } from '@univerjs/presets'

const CELL_EDITOR_UNIT = '__INTERNAL_EDITOR__DOCS_NORMAL'

let api: FUniver | null = null
let installed = false
let overlay: HTMLTextAreaElement | null = null
let active = false
let suppressBlur = false
let editCell: { row: number; col: number } | null = null
let anchor = { right: 0, top: 0, height: 0, minWidth: 0 }

function rtlSheet(): boolean {
  try {
    const ws = api?.getActiveWorkbook()?.getActiveSheet()
    const cfg = (
      ws as unknown as { getSheet?: () => { getConfig?: () => { rightToLeft?: number } } }
    ).getSheet?.()?.getConfig?.()
    return cfg?.rightToLeft === 1
  } catch {
    return false
  }
}

// The cell editor and the formula bar share the id `univer-doc-main-canvas`; the
// formula bar lives inside <header>, the cell editor sits over the grid. When
// editing, the cell-editor canvas has a real on-screen box.
function cellEditorCanvas(): HTMLCanvasElement | null {
  for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas')) {
    if (c.id === 'univer-doc-main-canvas' && !c.closest('header') && c.getBoundingClientRect().width > 1) {
      return c
    }
  }
  return null
}

// Univer terminates a doc body with \r (paragraph) then \n (section); the cell's
// logical text is everything before the trailing marks.
function editorLogicalText(): string {
  try {
    const inst = (api as unknown as { _univerInstanceService?: { getUnit(id: string): unknown } })
      ._univerInstanceService
    const ed = inst?.getUnit(CELL_EDITOR_UNIT) as
      | { getSnapshot?: () => { body?: { dataStream?: string } } }
      | undefined
    return (ed?.getSnapshot?.()?.body?.dataStream ?? '').replace(/[\r\n]+$/, '')
  } catch {
    return ''
  }
}

function activeCell(): { row: number; col: number } | null {
  try {
    const r = api?.getActiveWorkbook()?.getActiveSheet()?.getSelection()?.getActiveRange()
    if (!r) return null
    return { row: r.getRow(), col: r.getColumn() }
  } catch {
    return null
  }
}

function isFormulaCell(cell: { row: number; col: number }): boolean {
  try {
    const rng = api?.getActiveWorkbook()?.getActiveSheet()?.getRange(cell.row, cell.col)
    const f = (rng as unknown as { getFormula?: () => string })?.getFormula?.() ?? ''
    return typeof f === 'string' && f.startsWith('=')
  } catch {
    return false
  }
}

function ensureOverlay(): HTMLTextAreaElement {
  if (overlay) return overlay
  const ta = document.createElement('textarea')
  ta.id = 'exelmj-rtl-editor'
  ta.setAttribute('dir', 'auto')
  ta.spellcheck = false
  ta.rows = 1
  Object.assign(ta.style, {
    position: 'fixed',
    // Above the grid/canvas content but BELOW Univer's floating UI layer
    // (tooltips are z-1081) so hover tooltips are never covered by our overlay.
    zIndex: '1001',
    margin: '0',
    padding: '0 3px',
    border: '2px solid #4b7bec',
    outline: 'none',
    background: '#ffffff',
    color: '#000000',
    resize: 'none',
    overflow: 'hidden',
    // pre-wrap (not pre) so Alt+Enter newlines render as real lines and long
    // text still wraps instead of running off the left edge.
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    textAlign: 'right',
    unicodeBidi: 'plaintext',
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif'
  })
  ta.addEventListener('keydown', onKeydown)
  ta.addEventListener('input', layout)
  ta.addEventListener('blur', onBlur)
  document.body.appendChild(ta)
  overlay = ta
  return ta
}

// Keep the RIGHT edge pinned to the cell and grow leftward with the widest
// line; grow DOWNWARD with the number of lines (Alt+Enter). RTL text always
// starts at the same right-hand origin as the cell.
function layout() {
  if (!overlay) return
  overlay.style.width = 'auto'
  overlay.style.height = 'auto'
  const content = Math.max(overlay.scrollWidth + 10, anchor.minWidth)
  const maxWidth = Math.min(anchor.right - 6, window.innerWidth - 12)
  const width = Math.min(content, maxWidth)
  overlay.style.width = `${width}px`
  overlay.style.left = `${Math.max(4, anchor.right - width)}px`
  // height fits all lines, capped to the viewport (then it scrolls internally)
  const maxHeight = Math.max(anchor.height + 2, window.innerHeight - anchor.top - 12)
  const needed = overlay.scrollHeight
  const height = Math.min(Math.max(anchor.height + 2, needed), maxHeight)
  overlay.style.height = `${height}px`
  overlay.style.overflowY = needed > maxHeight ? 'auto' : 'hidden'
  scheduleFxSync() // mirror live typing into the fx bar
}

function open() {
  const canvas = cellEditorCanvas()
  const cell = activeCell()
  if (!canvas || !cell) return
  const r = canvas.getBoundingClientRect()
  const ta = ensureOverlay()
  editCell = cell
  anchor = { right: r.right, top: r.top, height: r.height, minWidth: Math.max(r.width, 70) }
  const fontSize = Math.max(11, Math.round(r.height * 0.66))
  ta.style.top = `${r.top - 1}px`
  ta.style.height = `${r.height + 2}px`
  // Per-LINE height (not the cell height) so multi-line (Alt+Enter) content
  // stacks correctly; a single line still fills the cell box via padding.
  ta.style.lineHeight = `${Math.round(fontSize * 1.35)}px`
  ta.style.paddingTop = `${Math.max(0, Math.round((r.height - fontSize * 1.35) / 2))}px`
  ta.style.fontSize = `${fontSize}px`
  ta.value = editorLogicalText()
  ta.style.display = 'block'
  active = true
  // Hide Univer's (back-to-front) canvas editor behind our opaque overlay.
  canvas.style.opacity = '0'
  layout()
  // TYPE-TO-EDIT RACE: the keystroke that STARTED the edit was delivered to
  // Univer's editor (which holds focus), and its `char`/textInput half is still
  // in flight. Focusing synchronously here made that same character ALSO land in
  // our textarea — every first letter came out doubled ("س" → "سس") and input
  // appeared broken. Seeding + focusing one tick later lets the in-flight key
  // finish on Univer's (hidden) editor, then we read the authoritative text —
  // including any keys typed during the gap — and take focus for the rest.
  setTimeout(() => {
    if (!active || !overlay) return
    overlay.value = editorLogicalText()
    overlay.focus()
    const end = overlay.value.length
    overlay.setSelectionRange(end, end)
    layout()
  }, 0)
  scheduleFxSync() // mirror the opened content in the fx bar
}

// Univer keeps a hidden contenteditable (id `__editor__<unit>`) focused so that
// typing on a SELECTED cell starts an edit session. Our overlay takes that focus
// while editing; if we never hand it back, focus falls to <body> and the next
// keystroke goes nowhere — no edit session opens, nothing is typed and the cell
// stays empty (exactly the "text appears once, then typing does nothing" report).
// Verified live: focusing this element again immediately restores typing.
const UNIVER_EDITOR_EL_ID = `__editor__${CELL_EDITOR_UNIT}`

function restoreUniverFocus() {
  try {
    document.getElementById(UNIVER_EDITOR_EL_ID)?.focus({ preventScroll: true })
  } catch {
    // ignore — worst case the user clicks a cell again
  }
}

function cleanup() {
  active = false
  const canvas = cellEditorCanvas()
  if (canvas) canvas.style.opacity = ''
  if (overlay) {
    suppressBlur = true
    overlay.style.display = 'none'
    overlay.value = ''
    suppressBlur = false
  }
  scheduleFxSync() // restore the fx bar to the committed cell value
  // after Univer has finished tearing the session down
  setTimeout(restoreUniverFocus, 0)
}

// Close Univer's own editor session (it holds unchanged content, so this is a
// no-op write) so state stays consistent, then we own the value.
function closeUniverEditor() {
  try {
    void api?.executeCommand('sheet.operation.set-cell-edit-visible', {
      visible: false,
      eventType: 3,
      keepEditorFocus: false
    })
  } catch {
    // ignore
  }
}

function commit(move: 'down' | 'up' | 'right' | 'left' | null, skipClose = false) {
  if (!active || !overlay) return
  const text = overlay.value
  const cell = editCell // captured at open — activeCell() may have moved on click-away
  cleanup()
  if (!skipClose) closeUniverEditor()
  if (!cell) return
  // Defer the write so it lands AFTER Univer's own editor commit (which fires on
  // click-away, writing the hidden editor's stale content to the same cell) —
  // ours must win. Enter/Tab paths stop propagation, so there is no race there.
  setTimeout(() => {
    try {
      const ws = api?.getActiveWorkbook()?.getActiveSheet()
      const rng = ws?.getRange(cell.row, cell.col)
      rng?.setValue(text)
      // Excel turns wrap-text ON when a cell gains a line break — without it the
      // grid renders the whole value on one line and the breaks are invisible.
      if (text.includes('\n')) {
        try {
          ;(rng as unknown as { setWrap?: (w: boolean) => void })?.setWrap?.(true)
        } catch {
          // wrap unsupported — value is still correct, just single-line visually
        }
      }
      if (move) {
        const row = cell.row + (move === 'down' ? 1 : move === 'up' ? -1 : 0)
        const col = cell.col + (move === 'right' ? 1 : move === 'left' ? -1 : 0)
        if (row >= 0 && col >= 0) ws?.getRange(row, col).activate()
      }
    } catch {
      // ignore commit failure (keeps the app alive)
    }
  }, 0)
}

function cancel() {
  if (!active) return
  cleanup()
  closeUniverEditor()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.altKey) {
    // Alt+Enter = newline inside the cell (Excel behaviour). The textarea would
    // not insert it itself because Univer swallows the key, so we do it here.
    e.preventDefault()
    e.stopPropagation()
    const ta = overlay
    if (!ta) return
    const s = ta.selectionStart ?? ta.value.length
    const t = ta.selectionEnd ?? s
    ta.value = `${ta.value.slice(0, s)}\n${ta.value.slice(t)}`
    ta.setSelectionRange(s + 1, s + 1)
    layout()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    commit(e.shiftKey ? 'up' : 'down')
  } else if (e.key === 'Tab') {
    e.preventDefault()
    e.stopPropagation()
    commit(e.shiftKey ? 'left' : 'right')
  } else if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    cancel()
  } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    // Ordinary typing/navigation belongs to OUR textarea only. Univer still has
    // global key handlers bound (its editor is alive behind the overlay); if they
    // also see these keys they mirror the text into the hidden editor and can
    // steal focus back mid-word. Shortcut combos (Ctrl/Cmd/Alt) pass through so
    // save/undo/redo keep working.
    e.stopPropagation()
  }
}

function onBlur() {
  // Clicking another cell (or elsewhere) commits, like Excel.
  if (suppressBlur || !active) return
  commit(null)
}

// ---------------------------------------------------------------------------
// Formula bar (fx) read-only bidi display.
// ---------------------------------------------------------------------------
let fxOverlay: HTMLDivElement | null = null
let fxScheduled = false

function formulaBarCanvas(): HTMLCanvasElement | null {
  for (const c of document.querySelectorAll<HTMLCanvasElement>('canvas')) {
    if (c.id === 'univer-doc-main-canvas' && c.closest('header') && c.getBoundingClientRect().width > 1) {
      return c
    }
  }
  return null
}

// What the fx bar shows for the active cell: the FORMULA if any, else the value.
function activeCellFxValue(): string {
  try {
    const cell = activeCell()
    if (!cell) return ''
    const rng = api?.getActiveWorkbook()?.getActiveSheet()?.getRange(cell.row, cell.col) as
      | { getFormula?: () => string; getValue?: () => unknown }
      | undefined
    const f = rng?.getFormula?.() ?? ''
    if (typeof f === 'string' && f.startsWith('=')) return f
    const v = rng?.getValue?.()
    return v === null || v === undefined || v === '' ? '' : String(v)
  } catch {
    return ''
  }
}

function ensureFxOverlay(): HTMLDivElement {
  if (fxOverlay) return fxOverlay
  const d = document.createElement('div')
  d.id = 'exelmj-rtl-fx'
  d.setAttribute('dir', 'auto')
  Object.assign(d.style, {
    position: 'fixed',
    // Below the cell-editor overlay and below Univer's tooltip layer (z-1081)
    // so toolbar hover tooltips render on top of the formula bar, not hidden.
    zIndex: '1000',
    margin: '0',
    padding: '0 2px',
    background: '#ffffff',
    color: '#000000',
    overflow: 'hidden',
    whiteSpace: 'pre',
    textAlign: 'right',
    unicodeBidi: 'plaintext',
    pointerEvents: 'none', // clicks fall through to the canvas → formulaBarFix opens the cell editor
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
    display: 'none'
  })
  document.body.appendChild(d)
  fxOverlay = d
  return d
}

/** The overlay is position:fixed, so while design/word mode is on screen it
 * would paint a white band across their top. The sheet host carries the mode. */
function sheetVisible(): boolean {
  const host = document.getElementById('app')
  return !!host && host.style.display !== 'none'
}

function hideFxOverlay() {
  const c = formulaBarCanvas()
  if (c) c.style.opacity = ''
  if (fxOverlay) fxOverlay.style.display = 'none'
}

// Draw the active cell's text (or, while editing, the live cell-overlay content)
// over the formula bar with correct browser bidi, hiding Univer's reversed one.
function syncFxOverlay() {
  if (!rtlSheet() || !sheetVisible()) {
    hideFxOverlay()
    return
  }
  const canvas = formulaBarCanvas()
  if (!canvas) {
    hideFxOverlay()
    return
  }
  const r = canvas.getBoundingClientRect()
  if (r.width < 1) {
    hideFxOverlay()
    return
  }
  // The bar is one line tall: show multi-line cells on a single visual line
  // (Excel does the same until you expand the bar).
  const text = (active && overlay ? overlay.value : activeCellFxValue()).replace(/\r?\n/g, ' ')
  const d = ensureFxOverlay()
  const fontSize = Math.max(11, Math.round(r.height * 0.62))
  Object.assign(d.style, {
    left: `${r.left}px`,
    top: `${r.top}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
    lineHeight: `${r.height}px`,
    fontSize: `${fontSize}px`,
    display: 'block'
  })
  d.textContent = text
  canvas.style.opacity = '0'
}

// Coalesce the many commands Univer fires per interaction into one sync/tick.
function scheduleFxSync() {
  if (fxScheduled) return
  fxScheduled = true
  setTimeout(() => {
    fxScheduled = false
    syncFxOverlay()
  }, 0)
}

/** Re-evaluate the formula-bar overlay after a mode switch: it is
 * position:fixed, so it must be hidden while another mode is on screen. */
export function refreshRtlOverlay() {
  scheduleFxSync()
}

export function initRtlEditor(univerAPI: FUniver) {
  if (installed) return
  installed = true
  api = univerAPI
  setTimeout(syncFxOverlay, 800) // initial paint once the sheet is up
  univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
    const e = event as unknown as { id?: string; params?: { visible?: boolean } }
    // Any command may change the selection or a value — keep the fx bar current.
    scheduleFxSync()
    if (String(e.id ?? '') !== 'sheet.operation.set-cell-edit-visible') return
    if (e.params?.visible) {
      // Edit session opening. Only take over RTL sheets' non-formula cells.
      if (!rtlSheet()) return
      const cell = activeCell()
      if (cell && isFormulaCell(cell)) return
      // Let Univer build + place its editor first, then cover it.
      setTimeout(() => {
        if (rtlSheet()) open()
      }, 0)
    } else if (active) {
      // Univer ended the edit session while our overlay is still up — this is
      // the click-away / Tab-out path (clicking a non-focusable canvas doesn't
      // blur our textarea, so onBlur never fires). Treat it as a COMMIT: our
      // deferred write runs after Univer's own stale commit and overwrites it.
      // skipClose — Univer already closed the session (we're inside its event).
      commit(null, true)
    }
  })
}
