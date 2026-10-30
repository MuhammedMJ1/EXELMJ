// Expand, and the geometry it stands on.
//
// The owner's report: small elements are hard to control, icons cannot be
// enlarged, and there is no way to turn a stroked object into flat artwork.
// The first two are the grip ring and the group transform; the third is
// shapeToPathD + dashPathD feeding outlineStroke.

import { describe, expect, it } from 'vitest'
import { shapeBBox, shapeToPathD, type Shape } from '../src/design/shapes'
import { dashPathD, outlineStroke } from '../src/design/outline'
import { pathBBox } from '../src/design/path'
import { handlePoint, hitHandle, strokeScaleFactor, type Box } from '../src/design/transform'

const base = (over: Partial<Shape>): Shape => ({
  id: 's1',
  kind: 'rect',
  x: 10,
  y: 20,
  w: 100,
  h: 60,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 2,
  ...over
})

/** How far the path's own bounds reach, in its local frame. */
const bounds = (d: string): Box => {
  const b = pathBBox(d)
  if (!b) throw new Error('unparsable path')
  return b
}

describe('shapeToPathD: every kind becomes path data', () => {
  it('a plain rect is its four corners, local to its own box', () => {
    expect(shapeToPathD(base({}))).toBe('M0 0L100 0L100 60L0 60Z')
  })

  it('a rounded rect keeps its box but rounds the corners', () => {
    const d = shapeToPathD(base({ radius: [8, 8, 8, 8] }))!
    const b = bounds(d)
    expect([b.x, b.y, b.w, b.h]).toEqual([0, 0, 100, 60])
    // A corner that was square is now a curve, so the path must carry cubics.
    expect(d).toContain('C')
  })

  it('clamps a radius bigger than the shape can hold', () => {
    // Half the shorter side is the most a corner can take; beyond that the two
    // corners of one edge would overlap and the outline would cross itself.
    const b = bounds(shapeToPathD(base({ radius: [999, 999, 999, 999] }))!)
    expect([b.w, b.h]).toEqual([100, 60])
  })

  it('an ellipse fills its box', () => {
    const b = bounds(shapeToPathD(base({ kind: 'ellipse' }))!)
    expect(b.w).toBeCloseTo(100, 1)
    expect(b.h).toBeCloseTo(60, 1)
  })

  it('a line drawn RIGHT-to-LEFT still starts where it was drawn', () => {
    // (x,y) is the first endpoint and (w,h) a SIGNED delta, so a leftward line
    // has its first point at the box's right edge — reading x/y as the origin
    // would silently mirror it.
    expect(shapeToPathD(base({ kind: 'line', w: -40, h: -20, stroke: '#000' }))).toBe('M40 20L0 0')
  })

  it('a line drawn LEFT-to-RIGHT runs the other way', () => {
    expect(shapeToPathD(base({ kind: 'line', w: 40, h: 20, stroke: '#000' }))).toBe('M0 0L40 20')
  })

  it('an arrow carries its head across', () => {
    const d = shapeToPathD(base({ kind: 'arrow', w: 60, h: 0, stroke: '#000' }))!
    // shaft plus a closed triangle
    expect(d.split('M').length - 1).toBe(2)
    expect(d.endsWith('Z')).toBe(true)
  })

  it('a path is returned as it stands', () => {
    expect(shapeToPathD(base({ kind: 'path', d: 'M0 0L5 5' }))).toBe('M0 0L5 5')
  })

  it('refuses a zero-size rect rather than emitting a degenerate path', () => {
    expect(shapeToPathD(base({ w: 0, h: 0 }))).toBe(null)
  })
})

describe('expand: a stroke becomes fillable artwork', () => {
  it('outlines a converted rect, and the result grows by half the stroke', () => {
    const s = base({ fill: '', stroke: '#000000', strokeWidth: 4 })
    const d = shapeToPathD(s)!
    const out = outlineStroke(d, s.strokeWidth, { cap: 'round', join: 'round' })!
    const b = bounds(out)
    // A 4pt stroke sticks out 2pt on every side of the 100x60 box.
    expect(b.w).toBeCloseTo(104, 0)
    expect(b.h).toBeCloseTo(64, 0)
  })

  it('outlines an ellipse without collapsing it', () => {
    const s = base({ kind: 'ellipse', fill: '', stroke: '#000000', strokeWidth: 3 })
    const out = outlineStroke(shapeToPathD(s)!, 3, { cap: 'round', join: 'round' })!
    const b = bounds(out)
    expect(b.w).toBeCloseTo(103, 0)
    expect(b.h).toBeCloseTo(63, 0)
  })

  it('the expanded box is what setPathGeometry would record', () => {
    // Expand rebases the geometry onto its own origin and moves the shape's
    // x/y by the overhang, or the frame drifts off the artwork.
    const s = base({ kind: 'line', w: 60, h: 0, fill: '', stroke: '#000000', strokeWidth: 6 })
    const origin = shapeBBox(s)
    const out = outlineStroke(shapeToPathD(s)!, 6, { cap: 'round', join: 'round' })!
    const b = bounds(out)
    expect(origin.x + b.x).toBeCloseTo(10 - 3, 0)
    expect(origin.y + b.y).toBeCloseTo(20 - 3, 0)
  })
})

describe('dashPathD: the dash becomes real geometry', () => {
  it('cuts a straight run into separate sub-paths', () => {
    // 100pt at 10 on / 10 off is five dashes.
    const d = dashPathD('M0 0L100 0', [10, 10])!
    expect(d.split('M').length - 1).toBe(5)
  })

  it('the first dash is exactly as long as the pattern says', () => {
    const d = dashPathD('M0 0L100 0', [10, 10])!
    const first = d.slice(0, d.indexOf('M', 1))
    expect(bounds(first).w).toBeCloseTo(10, 2)
  })

  it('keeps the run inside its original bounds', () => {
    expect(bounds(dashPathD('M0 0L100 0', [7, 3])!).w).toBeLessThanOrEqual(100.001)
  })

  it('walks a closed shape all the way back to its start', () => {
    // Without closing the loop the last dash stops short of the first corner.
    const d = dashPathD('M0 0L40 0L40 40L0 40Z', [8, 4])!
    const b = bounds(d)
    expect(b.w).toBeCloseTo(40, 1)
    expect(b.h).toBeCloseTo(40, 1)
  })

  it('refuses a pattern that is not a pattern', () => {
    expect(dashPathD('M0 0L100 0', [])).toBe(null)
    expect(dashPathD('M0 0L100 0', [0, 0])).toBe(null)
  })

  it('a dashed path outlines to MORE than one region', () => {
    // This is the whole point of Expand Appearance: outlining without baking
    // the dash first produces the outline of one unbroken run.
    const baked = dashPathD('M0 0L100 0', [10, 10])!
    const out = outlineStroke(baked, 2, { cap: 'butt', join: 'miter' })!
    expect(out.split('M').length - 1).toBeGreaterThan(1)
  })
})

describe('the selection frame sits ON the box', () => {
  const tiny: Box = { x: 100, y: 100, w: 4, h: 4 }
  const big: Box = { x: 0, y: 0, w: 400, h: 300 }

  it('puts each grip exactly on the edge it controls', () => {
    // The ring was briefly pushed OUTWARD, to leave a small object's interior
    // free to grab. The move plate covers the interior now, so the grips
    // belong where the eye expects the corner it is dragging.
    expect(handlePoint(big, 0, 'nw')).toEqual([big.x, big.y])
    expect(handlePoint(big, 0, 'se')).toEqual([big.x + big.w, big.y + big.h])
    expect(handlePoint(big, 0, 'n')).toEqual([big.x + big.w / 2, big.y])
  })

  it('does the same for an object too small to hold them apart', () => {
    expect(handlePoint(tiny, 0, 'nw')).toEqual([tiny.x, tiny.y])
  })

  it('hit-tests the grip where it is drawn', () => {
    const [x, y] = handlePoint(big, 0, 'se')
    expect(hitHandle(big, 0, x, y, 5)).toBe('se')
  })

  it('rotates the ring with the object', () => {
    // A frame that stayed axis-aligned would put the "top edge" grip somewhere
    // the top edge no longer is.
    const [x, y] = handlePoint(big, 90, 'n')
    expect(x).toBeCloseTo(big.x + big.w / 2 + big.h / 2, 6)
    expect(y).toBeCloseTo(big.y + big.h / 2, 6)
  })

  it('keeps the rotation grip clear of the top edge', () => {
    const [, ry] = handlePoint(big, 0, 'rot')
    expect(ry).toBeLessThan(big.y)
  })
})

describe('strokeScaleFactor: the stroke rides the resize', () => {
  const box = (w: number, h: number): Box => ({ x: 0, y: 0, w, h })

  it('a uniform scale is that scale exactly', () => {
    expect(strokeScaleFactor(box(50, 50), box(100, 100))).toBeCloseTo(2, 9)
    expect(strokeScaleFactor(box(100, 100), box(50, 50))).toBeCloseTo(0.5, 9)
  })

  it('a stretch splits the difference — one stroke, two axis factors', () => {
    // The geometric mean: doubling one axis alone thickens by √2.
    expect(strokeScaleFactor(box(50, 50), box(100, 50))).toBeCloseTo(Math.SQRT2, 9)
  })

  it('a collapsed axis scales by 1 rather than zeroing the stroke', () => {
    expect(strokeScaleFactor(box(50, 0), box(100, 40))).toBe(1)
    expect(strokeScaleFactor(box(50, 50), box(0, 40))).toBe(1)
  })

  it('no resize, no change', () => {
    expect(strokeScaleFactor(box(80, 60), box(80, 60))).toBe(1)
  })
})
