// The contract that makes frames cheap: layout RESOLVES TO ABSOLUTE POINTS.
//
// Every exporter in src/design (PDF, SVG, PNG, Word) iterates the flat arrays
// and knows nothing about frames. That is only safe if running a layout leaves
// those arrays holding plain coordinates. These tests pin exactly that, using
// the same layoutFrame + applyBoxToShape pair designApp uses.

import { describe, expect, it } from 'vitest'
import { layoutFrame, type LayoutChild } from '../src/studio/layout'
import { applyBoxToShape } from '../src/design/transform'
import { shapeBBox, type Shape } from '../src/design/shapes'
import type { Frame } from '../src/studio/model'

const rect = (id: string, x: number, y: number, w: number, h: number): Shape => ({
  id,
  kind: 'rect',
  x,
  y,
  w,
  h,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 1
})

const frame = (over: Partial<Frame> = {}, layout: Partial<NonNullable<Frame['layout']>> = {}): Frame => ({
  id: 'f',
  x: 100,
  y: 60,
  w: 400,
  h: 120,
  children: ['a', 'b', 'c'],
  layout: {
    direction: 'row',
    gap: 10,
    padding: [0, 0, 0, 0],
    align: 'start',
    justify: 'start',
    wrap: false,
    dir: 'ltr',
    ...layout
  },
  ...over
})

/** What designApp does: lay out, then write absolute boxes back onto shapes. */
function apply(f: Frame, shapes: Shape[]): Shape[] {
  const children: LayoutChild[] = shapes.map((s) => {
    const b = shapeBBox(s)
    return { id: s.id, w: b.w, h: b.h }
  })
  const result = layoutFrame(f, children)
  return shapes.map((s) => {
    const laid = result.children.find((c) => c.id === s.id)
    return laid
      ? applyBoxToShape(s, { x: f.x + laid.x, y: f.y + laid.y, w: laid.w, h: laid.h })
      : s
  })
}

describe('layout writes ABSOLUTE points back onto the shapes', () => {
  const shapes = (): Shape[] => [rect('a', 0, 0, 50, 20), rect('b', 0, 0, 60, 30), rect('c', 0, 0, 40, 20)]

  it('offsets every child by the frame origin', () => {
    const out = apply(frame(), shapes())
    expect(out[0].x).toBe(100)
    expect(out[0].y).toBe(60)
    expect(out[1].x).toBe(160)
    expect(out[2].x).toBe(230)
  })

  it('leaves plain numbers an exporter can read with no frame knowledge', () => {
    for (const s of apply(frame(), shapes())) {
      expect(Number.isFinite(s.x)).toBe(true)
      expect(Number.isFinite(s.y)).toBe(true)
      expect(Number.isFinite(s.w)).toBe(true)
      expect(Number.isFinite(s.h)).toBe(true)
      // nothing frame-shaped leaks onto the shape
      expect('frame' in s).toBe(false)
      expect('layout' in s).toBe(false)
    }
  })

  it('does not resize a child that is not filling', () => {
    const out = apply(frame(), shapes())
    expect(out[0].w).toBe(50)
    expect(out[1].w).toBe(60)
  })

  it('MIRRORS a row under rtl, without changing any size', () => {
    const ltr = apply(frame(), shapes())
    const rtl = apply(frame({}, { dir: 'rtl' }), shapes())
    expect(rtl.map((s) => s.w)).toEqual(ltr.map((s) => s.w))
    // first child sits at the RIGHT end
    expect(rtl[0].x).toBeGreaterThan(rtl[2].x)
    expect(ltr[0].x).toBeLessThan(ltr[2].x)
  })

  it('stacks a column downward from the frame origin', () => {
    const out = apply(frame({ w: 120, h: 400 }, { direction: 'column', gap: 5 }), shapes())
    expect(out[0].y).toBe(60)
    expect(out[1].y).toBe(85)
    expect(out[2].y).toBe(120)
  })

  it('is idempotent — laying out twice does not drift', () => {
    const f = frame()
    const once = apply(f, shapes())
    const twice = apply(f, once)
    expect(twice.map((s) => [s.x, s.y, s.w, s.h])).toEqual(once.map((s) => [s.x, s.y, s.w, s.h]))
  })

  it('re-running after a property change moves the children, not the frame', () => {
    const f = frame()
    const before = apply(f, shapes())
    f.layout!.gap = 30
    const after = apply(f, shapes())
    expect(before[1].x).not.toBe(after[1].x)
    // the first child still starts at the frame origin
    expect(after[0].x).toBe(f.x)
  })
})

describe('shapes that are not plain rectangles', () => {
  it('keeps a line pointing the way it was drawn', () => {
    const line: Shape = {
      id: 'a',
      kind: 'line',
      x: 0,
      y: 0,
      w: -40,
      h: -20,
      fill: '',
      stroke: '#000000',
      strokeWidth: 2
    }
    const out = apply(frame({ children: ['a', 'b'] }), [line, rect('b', 0, 0, 30, 20)])
    // applyBoxToShape preserves the SIGNED delta; assigning the box would flip it
    expect(out[0].w).toBeLessThan(0)
    expect(out[0].h).toBeLessThan(0)
  })

  it('rewrites a path geometry rather than only its origin', () => {
    const path: Shape = {
      id: 'a',
      kind: 'path',
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      fill: '#000000',
      stroke: '',
      strokeWidth: 1,
      d: 'M0 0 L20 0 L20 20 Z'
    }
    const out = apply(
      frame({ children: ['a', 'b'] }, { align: 'stretch' }),
      [path, rect('b', 0, 0, 30, 60)]
    )
    // stretch makes it 60 tall, so `d` must have grown with it
    expect(out[0].h).toBe(60)
    expect(out[0].d).not.toBe('M0 0 L20 0 L20 20 Z')
  })
})

describe('a frame with nothing usable', () => {
  it('lays out an empty child list without throwing', () => {
    expect(() => apply(frame({ children: [] }), [])).not.toThrow()
  })

  it('ignores a child id that does not exist', () => {
    const out = apply(frame({ children: ['a', 'ghost'] }), [rect('a', 0, 0, 50, 20)])
    expect(out).toHaveLength(1)
    expect(out[0].x).toBe(100)
  })
})

describe('hug sizing reports the frame size back', () => {
  it('a hug frame reports the size its content needs', () => {
    const f = frame({ sizing: { w: 'hug', h: 'fixed' } }, { gap: 10 })
    const result = layoutFrame(f, [
      { id: 'a', w: 50, h: 20 },
      { id: 'b', w: 60, h: 30 }
    ])
    expect(result.frame.w).toBe(120)
  })
})
