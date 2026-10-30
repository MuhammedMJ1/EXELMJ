// EXELMJ touch gestures for the sheet grid.
//
// Every RTL fix in src/univer is built on Univer 0.25.1's DESKTOP UI, and that
// UI has no touch handling: a finger reaches its pointer handlers exactly like
// a mouse, so a swipe on a phone SELECTED a range instead of scrolling
// (verified in a touch-emulated 375×812 viewport: the swipe selected C2:C12 and
// the sheet stayed on row 1). Univer's own touch scrolling lives only in its
// mobile UI plugins, which replace the whole workbench.
//
// This layer takes TOUCH pointers on the grid canvas before Univer sees them
// (window capture phase) and turns them into gestures:
//   swipe             → scroll, with fling inertia
//   pinch             → zoom
//   tap               → select the cell        (a synthetic mouse click)
//   double-tap        → edit the cell          (a synthetic dblclick)
//   long-press + drag → select a range         (a synthetic mouse drag)
//   long-press + lift → the cell menu          (a synthetic right-click)
// Mouse and pen input never reach this code, so the desktop app is unchanged.
import type { FUniver } from '@univerjs/presets'

export type GestureAction =
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'doubleTap'; x: number; y: number }
  | { kind: 'pan'; dx: number; dy: number }
  | { kind: 'fling'; vx: number; vy: number }
  | { kind: 'pinchStart' }
  | { kind: 'pinch'; scale: number }
  | { kind: 'pressStart'; x: number; y: number }
  | { kind: 'pressMove'; x: number; y: number }
  | { kind: 'pressEnd'; x: number; y: number; moved: boolean }

/** How far (CSS px) a finger may wander and still count as a tap or a press. */
export const SLOP = 10
export const LONG_PRESS_MS = 450
export const DOUBLE_TAP_MS = 320
export const DOUBLE_TAP_DIST = 28
/** Velocity is measured over the last this-many ms before the finger lifts. */
const FLING_WINDOW_MS = 100
/** Slower than this (px/ms) at lift-off is a placed finger, not a flick. */
const MIN_FLING_SPEED = 0.25

type Sample = { x: number; y: number; t: number }
type Mode = 'idle' | 'pending' | 'pan' | 'pinch' | 'press' | 'ended'

/**
 * Pure gesture recognizer: feed it touch pointer events (and a timeout() call
 * at pressDeadline), get back the gestures they make. No DOM, no timers, so
 * the tests can drive it with plain numbers.
 */
export class TouchGestureTracker {
  private mode: Mode = 'idle'
  private pointers = new Map<number, { x: number; y: number }>()
  private primary = -1
  private start: Sample = { x: 0, y: 0, t: 0 }
  private last = { x: 0, y: 0 }
  private samples: Sample[] = []
  /** Which axis a swipe was locked to once it clearly went that way. */
  private axis: 'x' | 'y' | null = null
  private pinchStartDist = 0
  private pressMoved = false
  private lastTap: Sample | null = null

  /** True while this finger (accepted on the grid) is still down. */
  tracks(id: number): boolean {
    return this.pointers.has(id)
  }

  /** True while any accepted finger is still down. */
  get active(): boolean {
    return this.pointers.size > 0
  }

  /** When the glue should call timeout() for a long-press, or null. */
  get pressDeadline(): number | null {
    return this.mode === 'pending' ? this.start.t + LONG_PRESS_MS : null
  }

  down(id: number, x: number, y: number, t: number): GestureAction[] {
    this.pointers.set(id, { x, y })
    if (this.pointers.size === 1) {
      this.mode = 'pending'
      this.primary = id
      this.start = { x, y, t }
      this.last = { x, y }
      this.samples = [{ x, y, t }]
      this.axis = null
      this.pressMoved = false
      return []
    }
    if (this.pointers.size === 2 && (this.mode === 'pending' || this.mode === 'pan')) {
      this.mode = 'pinch'
      this.lastTap = null
      this.pinchStartDist = this.spread()
      return [{ kind: 'pinchStart' }]
    }
    // A third finger, or a second one during a long-press drag: ignored.
    return []
  }

  move(id: number, x: number, y: number, t: number): GestureAction[] {
    const p = this.pointers.get(id)
    if (!p) return []
    p.x = x
    p.y = y
    if (this.mode === 'pending') {
      if (id !== this.primary || Math.hypot(x - this.start.x, y - this.start.y) < SLOP) return []
      this.mode = 'pan'
      const adx = Math.abs(x - this.start.x)
      const ady = Math.abs(y - this.start.y)
      this.axis = adx > ady * 2 ? 'x' : ady > adx * 2 ? 'y' : null
    }
    if (this.mode === 'pan') {
      if (id !== this.primary) return []
      // The first pan step starts from the touch-down point, so the content
      // stays under the finger even across the slop distance.
      const dx = this.axis === 'y' ? 0 : x - this.last.x
      const dy = this.axis === 'x' ? 0 : y - this.last.y
      this.last = { x, y }
      this.pushSample(x, y, t)
      return dx || dy ? [{ kind: 'pan', dx, dy }] : []
    }
    if (this.mode === 'pinch') {
      const d = this.spread()
      return this.pinchStartDist > 0 && d > 0 ? [{ kind: 'pinch', scale: d / this.pinchStartDist }] : []
    }
    if (this.mode === 'press') {
      if (id !== this.primary) return []
      if (Math.hypot(x - this.start.x, y - this.start.y) >= SLOP) this.pressMoved = true
      this.last = { x, y }
      return [{ kind: 'pressMove', x, y }]
    }
    return []
  }

  up(id: number, x: number, y: number, t: number): GestureAction[] {
    if (!this.pointers.has(id)) return []
    this.pointers.delete(id)
    const out: GestureAction[] = []
    const isPrimary = id === this.primary
    if (this.mode === 'pending' && isPrimary) {
      const prev = this.lastTap
      if (prev && t - prev.t <= DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) <= DOUBLE_TAP_DIST) {
        // Reported at the FIRST tap's point: Univer only counts two clicks as a
        // double-click when they land within 2 px of each other, which two
        // finger taps never do.
        out.push({ kind: 'doubleTap', x: prev.x, y: prev.y })
        this.lastTap = null
      } else {
        out.push({ kind: 'tap', x, y })
        this.lastTap = { x, y, t }
      }
    } else if (this.mode === 'pan' && isPrimary) {
      this.pushSample(x, y, t)
      const v = this.velocity(t)
      if (v) out.push({ kind: 'fling', vx: this.axis === 'y' ? 0 : v.vx, vy: this.axis === 'x' ? 0 : v.vy })
      this.lastTap = null
    } else if (this.mode === 'press' && isPrimary) {
      out.push({ kind: 'pressEnd', x, y, moved: this.pressMoved })
      this.lastTap = null
    }
    if (this.pointers.size === 0) this.mode = 'idle'
    // A finger lifted mid-pinch (or the primary lifted mid-gesture): wait for
    // the rest to lift before anything new starts.
    else if (this.mode === 'pinch' || isPrimary) this.mode = 'ended'
    return out
  }

  /** The browser took the touch away (pointercancel): end cleanly. */
  cancel(): GestureAction[] {
    const out: GestureAction[] =
      this.mode === 'press' ? [{ kind: 'pressEnd', x: this.last.x, y: this.last.y, moved: true }] : []
    this.pointers.clear()
    this.mode = 'idle'
    this.lastTap = null
    return out
  }

  /** Called at pressDeadline: a finger that stayed put becomes a long-press. */
  timeout(t: number): GestureAction[] {
    if (this.mode !== 'pending' || t - this.start.t < LONG_PRESS_MS) return []
    this.mode = 'press'
    this.lastTap = null
    this.last = { x: this.start.x, y: this.start.y }
    return [{ kind: 'pressStart', x: this.start.x, y: this.start.y }]
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  private pushSample(x: number, y: number, t: number) {
    this.samples.push({ x, y, t })
    if (this.samples.length > 32) this.samples.shift()
  }

  private velocity(upT: number): { vx: number; vy: number } | null {
    const recent = this.samples.filter((s) => s.t >= upT - FLING_WINDOW_MS)
    if (recent.length < 2) return null
    const a = recent[0]
    const b = recent[recent.length - 1]
    const dt = b.t - a.t
    if (dt <= 0) return null
    const vx = (b.x - a.x) / dt
    const vy = (b.y - a.y) / dt
    return Math.hypot(vx, vy) >= MIN_FLING_SPEED ? { vx, vy } : null
  }
}

/**
 * Finger movement → Univer scroll offsets. The content follows the finger, so
 * the scroll runs opposite to the finger; offsets are in sheet units, hence
 * divided by the zoom. On a mirrored (RTL) grid the canvas x axis runs
 * opposite to the screen's, which flips the sign of x once more.
 */
export function panToScroll(
  dx: number,
  dy: number,
  mirrored: boolean,
  zoom: number
): { offsetX: number; offsetY: number } {
  const z = zoom > 0 ? zoom : 1
  return { offsetX: (mirrored ? dx : -dx) / z, offsetY: -dy / z }
}

export const MIN_ZOOM = 0.5
export const MAX_ZOOM = 3

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

// --- DOM glue ---------------------------------------------------------------

// SetScrollRelativeCommand (sheets-ui 0.25.1): adds to the current scroll
// offsets — the same command Univer's own wheel and touch scrolling use.
const SCROLL_CMD = 'sheet.command.set-scroll-relative'
/** Fling velocity kept per 16 ms frame. */
const FLING_DECAY = 0.95
/** px/ms below which a fling stops. */
const FLING_STOP = 0.02
/** How long after a touch the browser's own click/dblclick/contextmenu for it may still arrive. */
const TOUCH_ECHO_MS = 800

function isSheetCanvas(t: EventTarget | null): t is HTMLCanvasElement {
  return t instanceof HTMLCanvasElement && t.id.startsWith('univer-sheet-main-canvas')
}

/** rtlMirror marks the flipped grid host with this class while it is mirrored. */
function isMirrored(canvas: HTMLElement): boolean {
  return !!canvas.closest('.exelmj-rtl-host')
}

/**
 * The next animation frame, or 50 ms, whichever comes first. A page that is
 * hidden or occluded gets no frames at all (seen in a preview pane that
 * reported itself "visible"), and a gesture must never stall on that.
 * Returns the matching cancel.
 */
function nextFrame(cb: (now: number) => void): () => void {
  let done = false
  const run = (now: number) => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    clearTimeout(timer)
    cb(now)
  }
  const raf = requestAnimationFrame(run)
  const timer = window.setTimeout(() => run(performance.now()), 50)
  return () => {
    done = true
    cancelAnimationFrame(raf)
    clearTimeout(timer)
  }
}

/** A mouse-shaped event at (x, y) on the canvas, for Univer's desktop handlers. */
function send(canvas: HTMLCanvasElement, type: string, x: number, y: number, button = 0, buttons = 0) {
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button,
    buttons,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    view: window,
    detail: type === 'dblclick' ? 2 : 1
  }
  canvas.dispatchEvent(type === 'dblclick' ? new MouseEvent(type, init) : new PointerEvent(type, init))
}

let installed = false

export function initTouchSheet(univerAPI: FUniver) {
  if (installed) return
  installed = true

  const tracker = new TouchGestureTracker()
  let canvas: HTMLCanvasElement | null = null
  let pressTimer = 0
  let lastTouchAt = 0

  const sheet = () => univerAPI.getActiveWorkbook()?.getActiveSheet() ?? null
  const zoom = () => {
    try {
      return sheet()?.getZoom() ?? 1
    } catch {
      return 1
    }
  }

  // Pan steps are summed and applied once per frame: one scroll command per
  // frame instead of one per pointermove.
  let panX = 0
  let panY = 0
  let panFrame: (() => void) | null = null
  const flushPan = () => {
    panFrame = null
    if (!canvas || (!panX && !panY)) return
    const offsets = panToScroll(panX, panY, isMirrored(canvas), zoom())
    panX = 0
    panY = 0
    void univerAPI.executeCommand(SCROLL_CMD, offsets).catch(() => false)
  }
  const pan = (dx: number, dy: number) => {
    panX += dx
    panY += dy
    if (!panFrame) panFrame = nextFrame(flushPan)
  }

  let flingFrame: (() => void) | null = null
  const stopFling = () => {
    flingFrame?.()
    flingFrame = null
  }
  const fling = (vx: number, vy: number) => {
    stopFling()
    let last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(64, now - last)
      last = now
      pan(vx * dt, vy * dt)
      const keep = Math.pow(FLING_DECAY, dt / 16)
      vx *= keep
      vy *= keep
      flingFrame = Math.hypot(vx, vy) < FLING_STOP ? null : nextFrame(step)
    }
    flingFrame = nextFrame(step)
  }

  let pinchStartZoom = 1
  let pinchTarget = 0
  let pinchFrame: (() => void) | null = null
  const applyPinch = () => {
    pinchFrame = null
    if (!pinchTarget) return
    const target = pinchTarget
    pinchTarget = 0
    try {
      if (Math.abs(target - zoom()) > 0.01) sheet()?.zoom(target)
    } catch {
      // Univer refuses zooming while a cell editor is open — nothing to undo.
    }
  }

  const clearPressTimer = () => {
    if (pressTimer) clearTimeout(pressTimer)
    pressTimer = 0
  }
  const armPressTimer = () => {
    clearPressTimer()
    const deadline = tracker.pressDeadline
    if (deadline === null) return
    pressTimer = window.setTimeout(() => {
      pressTimer = 0
      apply(tracker.timeout(performance.now()))
    }, Math.max(0, deadline - performance.now()))
  }

  const apply = (actions: GestureAction[]) => {
    const c = canvas
    if (!c) return
    for (const a of actions) {
      switch (a.kind) {
        case 'tap':
          send(c, 'pointerdown', a.x, a.y, 0, 1)
          send(c, 'pointerup', a.x, a.y, 0, 0)
          send(c, 'click', a.x, a.y, 0, 0)
          break
        case 'doubleTap':
          // The first tap already selected the cell; this is its second click,
          // on the same point, so Univer's own double-click counter (two
          // pointer-ups within 500 ms and 2 px) opens the editor. The native
          // dblclick follows, as it does after a real mouse double-click.
          send(c, 'pointerdown', a.x, a.y, 0, 1)
          send(c, 'pointerup', a.x, a.y, 0, 0)
          send(c, 'click', a.x, a.y, 0, 0)
          send(c, 'dblclick', a.x, a.y, 0, 0)
          break
        case 'pan':
          pan(a.dx, a.dy)
          break
        case 'fling':
          fling(a.vx, a.vy)
          break
        case 'pinchStart':
          clearPressTimer()
          panX = 0
          panY = 0
          pinchStartZoom = zoom()
          break
        case 'pinch':
          pinchTarget = clampZoom(pinchStartZoom * a.scale)
          if (!pinchFrame) pinchFrame = nextFrame(applyPinch)
          break
        case 'pressStart':
          navigator.vibrate?.(12)
          send(c, 'pointerdown', a.x, a.y, 0, 1)
          break
        case 'pressMove':
          send(c, 'pointermove', a.x, a.y, 0, 1)
          break
        case 'pressEnd':
          send(c, 'pointerup', a.x, a.y, 0, 0)
          // A press that never moved asks for the cell menu (Univer opens it
          // on a right-button press, like a desktop right-click).
          if (!a.moved) {
            send(c, 'pointerdown', a.x, a.y, 2, 2)
            send(c, 'pointerup', a.x, a.y, 2, 0)
          }
          break
      }
    }
  }

  const opts: AddEventListenerOptions = { capture: true, passive: false }

  window.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch' || !isSheetCanvas(e.target)) return
      e.stopImmediatePropagation()
      e.preventDefault()
      canvas = e.target
      lastTouchAt = performance.now()
      stopFling()
      apply(tracker.down(e.pointerId, e.clientX, e.clientY, e.timeStamp || performance.now()))
      armPressTimer()
    },
    opts
  )
  window.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'touch' || !tracker.tracks(e.pointerId)) return
      e.stopImmediatePropagation()
      e.preventDefault()
      apply(tracker.move(e.pointerId, e.clientX, e.clientY, e.timeStamp || performance.now()))
      if (tracker.pressDeadline === null) clearPressTimer()
    },
    opts
  )
  const end = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !tracker.tracks(e.pointerId)) return
    e.stopImmediatePropagation()
    e.preventDefault()
    lastTouchAt = performance.now()
    clearPressTimer()
    apply(
      e.type === 'pointercancel'
        ? tracker.cancel()
        : tracker.up(e.pointerId, e.clientX, e.clientY, e.timeStamp || performance.now())
    )
  }
  window.addEventListener('pointerup', end, opts)
  window.addEventListener('pointercancel', end, opts)

  // The browser's own click / dblclick / long-press menu for a touch we already
  // turned into a gesture must not reach Univer a second time. Our synthetic
  // events are untrusted and pass.
  const swallowEcho = (e: Event) => {
    if (!e.isTrusted || !isSheetCanvas(e.target)) return
    // Chrome's click and contextmenu say which pointer made them; a bare
    // MouseEvent (dblclick) is judged by how recently a finger was down.
    const pt = (e as PointerEvent).pointerType
    const fromTouch = pt === 'touch' || (!pt && (tracker.active || performance.now() - lastTouchAt < TOUCH_ECHO_MS))
    if (!fromTouch) return
    e.stopImmediatePropagation()
    e.preventDefault()
  }
  window.addEventListener('click', swallowEcho, opts)
  window.addEventListener('dblclick', swallowEcho, opts)
  window.addEventListener('contextmenu', swallowEcho, opts)
}
