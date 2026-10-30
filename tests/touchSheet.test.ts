import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  DOUBLE_TAP_MS,
  LONG_PRESS_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  panToScroll,
  TouchGestureTracker,
  type GestureAction
} from '../src/univer/touchSheet'

const kinds = (a: GestureAction[]) => a.map((x) => x.kind)

/** Drive one finger along a path: [x, y, t] points; the first is the touch-down. */
function swipe(tr: TouchGestureTracker, id: number, path: Array<[number, number, number]>) {
  const out: GestureAction[] = []
  const [x0, y0, t0] = path[0]
  out.push(...tr.down(id, x0, y0, t0))
  for (const [x, y, t] of path.slice(1, -1)) out.push(...tr.move(id, x, y, t))
  const [xe, ye, te] = path[path.length - 1]
  out.push(...tr.move(id, xe, ye, te))
  out.push(...tr.up(id, xe, ye, te))
  return out
}

describe('touch gestures on the sheet grid', () => {
  it('a finger that goes down and up in place is a tap at the lift point', () => {
    const tr = new TouchGestureTracker()
    expect(tr.down(1, 100, 100, 0)).toEqual([])
    expect(tr.up(1, 103, 101, 90)).toEqual([{ kind: 'tap', x: 103, y: 101 }])
  })

  it('two quick taps in the same place make a double-tap, reported at the first tap', () => {
    // Univer only sees a double-click when both clicks land within 2 px, so the
    // second click must be replayed where the first finger landed.
    const tr = new TouchGestureTracker()
    tr.down(1, 100, 100, 0)
    expect(kinds(tr.up(1, 100, 100, 60))).toEqual(['tap'])
    tr.down(2, 104, 98, 180)
    expect(tr.up(2, 104, 98, 240)).toEqual([{ kind: 'doubleTap', x: 100, y: 100 }])
  })

  it('taps too far apart in time or space stay two separate taps', () => {
    const tr = new TouchGestureTracker()
    tr.down(1, 100, 100, 0)
    tr.up(1, 100, 100, 50)
    tr.down(2, 100, 100, 50 + DOUBLE_TAP_MS + 100)
    expect(kinds(tr.up(2, 100, 100, 50 + DOUBLE_TAP_MS + 150))).toEqual(['tap'])
    tr.down(3, 300, 100, 1000)
    tr.up(3, 300, 100, 1040)
    tr.down(4, 100, 300, 1100)
    expect(kinds(tr.up(4, 100, 300, 1140))).toEqual(['tap'])
  })

  it('a swipe pans by exactly the finger distance — the content stays under the finger', () => {
    const tr = new TouchGestureTracker()
    const out = swipe(tr, 1, [
      [100, 400, 0],
      [100, 380, 200],
      [100, 300, 400],
      [100, 250, 600]
    ])
    const pans = out.filter((a) => a.kind === 'pan') as Array<{ dx: number; dy: number }>
    expect(pans.reduce((s, p) => s + p.dy, 0)).toBe(-150)
    expect(out.some((a) => a.kind === 'tap')).toBe(false)
  })

  it('locks a clearly vertical swipe to the vertical axis (no sideways drift)', () => {
    const tr = new TouchGestureTracker()
    const out = swipe(tr, 1, [
      [100, 400, 0],
      [101, 380, 100],
      [106, 330, 200],
      [109, 280, 300]
    ])
    const pans = out.filter((a) => a.kind === 'pan') as Array<{ dx: number; dy: number }>
    expect(pans.every((p) => p.dx === 0)).toBe(true)
    expect(pans.reduce((s, p) => s + p.dy, 0)).toBe(-120)
  })

  it('a quick flick ends in a fling; a finger that rested before lifting does not', () => {
    const quick = new TouchGestureTracker()
    const flick = swipe(quick, 1, [
      [100, 400, 0],
      [100, 360, 20],
      [100, 320, 40],
      [100, 280, 60]
    ])
    const f = flick.find((a) => a.kind === 'fling') as { vx: number; vy: number } | undefined
    expect(f).toBeDefined()
    expect(f!.vy).toBeCloseTo(-2, 1)
    expect(f!.vx).toBe(0)

    const slow = new TouchGestureTracker()
    slow.down(1, 100, 400, 0)
    slow.move(1, 100, 300, 100)
    // held still for half a second, then lifted where it rested
    expect(kinds(slow.up(1, 100, 300, 600))).toEqual([])
  })

  it('two fingers spreading apart pinch-zoom relative to where they started', () => {
    const tr = new TouchGestureTracker()
    tr.down(1, 100, 100, 0)
    expect(tr.down(2, 200, 100, 10)).toEqual([{ kind: 'pinchStart' }])
    expect(tr.move(2, 300, 100, 50)).toEqual([{ kind: 'pinch', scale: 2 }])
    expect(tr.move(1, 150, 100, 60)).toEqual([{ kind: 'pinch', scale: 1.5 }])
    // one finger lifts: nothing new starts until the other lifts too
    expect(tr.up(2, 300, 100, 80)).toEqual([])
    expect(tr.move(1, 120, 140, 90)).toEqual([])
    expect(tr.up(1, 120, 140, 100)).toEqual([])
    expect(tr.active).toBe(false)
  })

  it('a finger held still becomes a long-press; dragging it selects, lifting ends', () => {
    const tr = new TouchGestureTracker()
    tr.down(1, 50, 60, 0)
    expect(tr.pressDeadline).toBe(LONG_PRESS_MS)
    expect(tr.timeout(LONG_PRESS_MS - 1)).toEqual([])
    expect(tr.timeout(LONG_PRESS_MS)).toEqual([{ kind: 'pressStart', x: 50, y: 60 }])
    expect(tr.move(1, 50, 140, 600)).toEqual([{ kind: 'pressMove', x: 50, y: 140 }])
    expect(tr.up(1, 50, 140, 700)).toEqual([{ kind: 'pressEnd', x: 50, y: 140, moved: true }])
  })

  it('a long-press lifted in place reports moved:false (it asks for the cell menu)', () => {
    const tr = new TouchGestureTracker()
    tr.down(1, 50, 60, 0)
    tr.timeout(LONG_PRESS_MS + 5)
    expect(tr.up(1, 52, 61, 900)).toEqual([{ kind: 'pressEnd', x: 52, y: 61, moved: false }])
  })

  it('once a finger starts moving it can no longer become a long-press', () => {
    const tr = new TouchGestureTracker()
    tr.down(1, 50, 60, 0)
    tr.move(1, 50, 120, 100)
    expect(tr.pressDeadline).toBeNull()
    expect(tr.timeout(LONG_PRESS_MS + 100)).toEqual([])
  })

  it('a cancelled touch ends a long-press drag cleanly and forgets everything else', () => {
    const tr = new TouchGestureTracker()
    tr.down(1, 50, 60, 0)
    tr.timeout(LONG_PRESS_MS)
    tr.move(1, 70, 90, 500)
    expect(tr.cancel()).toEqual([{ kind: 'pressEnd', x: 70, y: 90, moved: true }])
    expect(tr.active).toBe(false)

    const pan = new TouchGestureTracker()
    pan.down(1, 50, 60, 0)
    pan.move(1, 50, 160, 50)
    expect(pan.cancel()).toEqual([])
  })
})

describe('finger movement → Univer scroll offsets', () => {
  it('scrolls opposite to the finger so the content follows it', () => {
    // finger moves up 50 px → the sheet scrolls down 50 px
    expect(panToScroll(0, -50, false, 1)).toEqual({ offsetX: -0, offsetY: 50 })
    // finger moves right 30 px on a normal grid → scroll left
    expect(panToScroll(30, 0, false, 1).offsetX).toBe(-30)
  })

  it('flips the x axis on a mirrored (right-to-left) grid', () => {
    expect(panToScroll(30, 0, true, 1).offsetX).toBe(30)
  })

  it('divides by the zoom so the content tracks the finger at any zoom', () => {
    expect(panToScroll(-40, -40, false, 2)).toEqual({ offsetX: 20, offsetY: 20 })
    expect(panToScroll(10, 0, false, 0)).toEqual({ offsetX: -10, offsetY: -0 })
  })

  it('keeps pinch zoom inside a usable range', () => {
    expect(clampZoom(0.1)).toBe(MIN_ZOOM)
    expect(clampZoom(9)).toBe(MAX_ZOOM)
    expect(clampZoom(1.25)).toBe(1.25)
  })
})
