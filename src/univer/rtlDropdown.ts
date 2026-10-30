// EXELMJ RTL data-validation dropdown.
//
// Proven on the packaged app with two files identical except for the sheet's
// rightToLeft flag: with the flag OFF Univer's own list dropdown opens on the
// first click (literal lists AND range-sourced ones); with it ON it never opens
// at ANY point of the cell — although the chip is drawn, the rule is loaded and
// hovering it still switches the cursor to a pointer (so the rule, the widget
// and its hit-test are all fine). The cell-anchored popup layer works under the
// mirror too — the column filter menu opens correctly — so what breaks is
// Univer's pointer-down → show-dropdown path inside the flipped host.
//
// Rather than fight the engine, RTL sheets get their own list: a plain DOM
// popup appended to <body>, i.e. OUTSIDE the mirrored host, so it is never
// flipped (the same rule the editor overlay follows). It opens on a click on a
// cell carrying a `list` rule and writes the picked value through the facade.
// LTR sheets are untouched and keep Univer's native dropdown.
import type { FUniver } from '@univerjs/presets'
import { isRtlMirrorActive } from './rtlMirror'

const POPUP_ID = 'exelmj-rtl-dv'
const DRAG_SLOP = 4 // px — beyond this the gesture was a range drag, not a click

let api: FUniver | null = null
let installed = false
let popup: HTMLDivElement | null = null
let down: { x: number; y: number } | null = null

/**
 * Univer serializes a literal list with JSON.stringify (serializeListOptions),
 * but hand-made rules and older files use a plain comma list — accept both, the
 * same order deserializeListOptions uses.
 */
export function parseListOptions(formula1: unknown): string[] {
  const raw = typeof formula1 === 'string' ? formula1.trim() : ''
  if (!raw || raw.startsWith('=')) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean)
  } catch {
    // not JSON — fall through to the comma form
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** `Sheet1!$A$1:$A$6` / `'ورقة 2'!A1:A6` / `A1:A6` → the values it points at. */
function rangeOptions(formula1: string): string[] {
  const ref = formula1.slice(1).trim()
  const m = /^(?:'([^']+)'|([^'!]+))!(.+)$/.exec(ref)
  const wb = api?.getActiveWorkbook()
  if (!wb) return []
  const sheet = m ? wb.getSheetByName(m[1] ?? m[2] ?? '') : wb.getActiveSheet()
  const a1 = (m ? m[3] : ref).replace(/\$/g, '')
  if (!sheet) return []
  const values = sheet.getRange(a1).getValues() as unknown[][]
  const seen = new Set<string>()
  for (const row of values) {
    for (const v of row) {
      const s = v == null ? '' : String(v).trim()
      if (s) seen.add(s)
    }
  }
  return [...seen]
}

/** The list a cell offers, or [] when it carries no list rule. */
function optionsForCell(row: number, col: number): string[] {
  try {
    const sheet = api?.getActiveWorkbook()?.getActiveSheet()
    const rule = sheet?.getRange(row, col).getDataValidation() as unknown as
      | { getCriteriaType(): string; getCriteriaValues(): Array<string | undefined> }
      | null
      | undefined
    if (!rule || rule.getCriteriaType() !== 'list') return []
    const formula1 = rule.getCriteriaValues()[1] ?? ''
    return formula1.trim().startsWith('=') ? rangeOptions(formula1.trim()) : parseListOptions(formula1)
  } catch {
    return []
  }
}

function closePopup() {
  popup?.remove()
  popup = null
}

function pick(row: number, col: number, value: string) {
  closePopup()
  try {
    api?.getActiveWorkbook()?.getActiveSheet()?.getRange(row, col).setValue(value)
  } catch (err) {
    console.warn('[rtlDropdown] could not write the picked value', err)
  }
}

function openPopup(x: number, y: number, row: number, col: number, options: string[], current: string) {
  closePopup()
  const box = document.createElement('div')
  box.id = POPUP_ID
  Object.assign(box.style, {
    position: 'fixed',
    // Above the grid and the editor overlay (1001) but below Univer's tooltips
    // (1081), so nothing of its own UI gets covered.
    zIndex: '1002',
    direction: 'rtl',
    minWidth: '140px',
    maxWidth: '320px',
    maxHeight: '260px',
    overflowY: 'auto',
    padding: '4px',
    background: '#ffffff',
    border: '1px solid #d0d5dd',
    borderRadius: '6px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
    font: '13px Arial, sans-serif',
    color: '#101828'
  })
  for (const option of options) {
    const item = document.createElement('button')
    item.type = 'button'
    item.textContent = option
    Object.assign(item.style, {
      display: 'block',
      width: '100%',
      textAlign: 'right',
      padding: '6px 10px',
      border: '0',
      borderRadius: '4px',
      background: option === current ? '#eef4ff' : 'transparent',
      color: 'inherit',
      font: 'inherit',
      cursor: 'pointer'
    })
    item.addEventListener('mouseenter', () => (item.style.background = '#f2f4f7'))
    item.addEventListener('mouseleave', () => {
      item.style.background = option === current ? '#eef4ff' : 'transparent'
    })
    item.addEventListener('click', () => pick(row, col, option))
    box.append(item)
  }
  document.body.append(box)
  popup = box

  // Right edge under the click (RTL reading order), clamped to the viewport.
  const rect = box.getBoundingClientRect()
  const left = Math.max(4, Math.min(x - rect.width, window.innerWidth - rect.width - 4))
  const top = y + rect.height + 8 > window.innerHeight ? Math.max(4, y - rect.height - 4) : y + 4
  box.style.left = `${left}px`
  box.style.top = `${top}px`
}

function isGridCanvas(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLCanvasElement &&
    (target.id.startsWith('univer-sheet-main') || (target.width > 300 && target.height > 200))
  )
}

function onPointerDown(e: PointerEvent) {
  if (popup && !popup.contains(e.target as Node)) closePopup()
  down = { x: e.clientX, y: e.clientY }
}

function onPointerUp(e: PointerEvent) {
  const start = down
  down = null
  if (!start || !isRtlMirrorActive() || !isGridCanvas(e.target)) return
  if (Math.abs(e.clientX - start.x) > DRAG_SLOP || Math.abs(e.clientY - start.y) > DRAG_SLOP) return
  const x = e.clientX
  const y = e.clientY
  // Univer moves the selection asynchronously — read the cell it landed on.
  setTimeout(() => {
    try {
      // A double-click opens the RTL cell editor on this very cell; leaving the
      // list up would let a stray pick overwrite what is being typed.
      const editor = document.getElementById('exelmj-rtl-editor')
      if (editor && editor.style.display !== 'none') return
      const sheet = api?.getActiveWorkbook()?.getActiveSheet()
      const range = sheet?.getSelection()?.getActiveRange()
      if (!range) return
      const row = range.getRow()
      const col = range.getColumn()
      const options = optionsForCell(row, col)
      if (!options.length) return
      openPopup(x, y, row, col, options, String(sheet?.getRange(row, col).getValue() ?? ''))
    } catch {
      // a transient state (workbook swap, no selection) — just don't open
    }
  }, 60)
}

export function initRtlDropdown(univerAPI: FUniver) {
  api = univerAPI
  if (installed) return
  installed = true
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointerup', onPointerUp, true)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePopup()
  })
  window.addEventListener('wheel', closePopup, { passive: true })
  window.addEventListener('resize', closePopup)
}
