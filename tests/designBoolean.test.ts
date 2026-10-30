// Boolean path ops (union/subtract/intersect/exclude), now a Design-mode
// feature rather than a separate Vector page's — see docs/DECISIONS or the
// project's decision log for why the two pages were merged. Correctness is
// checked on simple, hand-verifiable shapes rather than exact pixel output
// (the result is a flattened polygon, so vertex counts and exact
// coordinates are an implementation detail — bounding box and area are the
// stable, verifiable contract).

import { describe, expect, it } from 'vitest'
import { booleanOp } from '../src/design/boolean'
import { pathBBox, splitSubPaths, flatten } from '../src/design/path'
import { shapeToPathD, type Shape } from '../src/design/shapes'

function rect(x: number, y: number, w: number, h: number): Shape {
  return { id: `r-${x}-${y}`, kind: 'rect', x, y, w, h, fill: '#ff0000', stroke: '', strokeWidth: 2 }
}

/** Shoelace area of the resulting shape, in absolute document space. */
function resultArea(shape: Shape): number {
  const d = shapeToPathD(shape)
  expect(d).not.toBeNull()
  let total = 0
  for (const sub of splitSubPaths(d!)) {
    const pts = flatten(sub, 16).map(([x, y]) => [x + shape.x, y + shape.y])
    let a = 0
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[(i + 1) % pts.length]
      a += x1 * y2 - x2 * y1
    }
    total += Math.abs(a) / 2
  }
  return total
}

describe('booleanOp', () => {
  it('returns null with fewer than 2 shapes', () => {
    expect(booleanOp([rect(0, 0, 10, 10)], 'union')).toBeNull()
    expect(booleanOp([], 'union')).toBeNull()
  })

  it('union of two disjoint squares covers both, area = sum', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(20, 0, 10, 10)
    const out = booleanOp([a, b], 'union')
    expect(out).not.toBeNull()
    const box = pathBBox(shapeToPathD(out!)!)!
    expect(out!.x).toBeCloseTo(0, 0)
    expect(out!.y).toBeCloseTo(0, 0)
    expect(out!.w + out!.x).toBeCloseTo(30, 0)
    expect(box.w).toBeCloseTo(30, 0)
    expect(resultArea(out!)).toBeCloseTo(200, 0)
  })

  it('union of two overlapping squares has area LESS than the sum (no double count)', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(5, 0, 10, 10) // 5x10 overlap
    const out = booleanOp([a, b], 'union')
    expect(out).not.toBeNull()
    expect(resultArea(out!)).toBeCloseTo(150, 0) // 100 + 100 - 50
  })

  it('intersect of two overlapping squares is just the overlap', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(5, 0, 10, 10)
    const out = booleanOp([a, b], 'intersect')
    expect(out).not.toBeNull()
    expect(resultArea(out!)).toBeCloseTo(50, 0) // 5x10 overlap
  })

  it('intersect of two disjoint squares yields nothing', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(20, 0, 10, 10)
    expect(booleanOp([a, b], 'intersect')).toBeNull()
  })

  it('subtract removes the second shape from the first', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(5, 0, 10, 10)
    const out = booleanOp([a, b], 'subtract')
    expect(out).not.toBeNull()
    expect(resultArea(out!)).toBeCloseTo(50, 0) // left half of a
  })

  it('subtract by a fully-covering shape yields nothing', () => {
    const a = rect(2, 2, 4, 4)
    const b = rect(0, 0, 20, 20)
    expect(booleanOp([a, b], 'subtract')).toBeNull()
  })

  it('exclude (xor) of two identical squares yields nothing (fully cancels)', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(0, 0, 10, 10)
    expect(booleanOp([a, b], 'exclude')).toBeNull()
  })

  it('exclude keeps only the non-overlapping parts', () => {
    const a = rect(0, 0, 10, 10)
    const b = rect(5, 0, 10, 10)
    const out = booleanOp([a, b], 'exclude')
    expect(out).not.toBeNull()
    // total 200 minus the 50 overlap counted twice = 100
    expect(resultArea(out!)).toBeCloseTo(100, 0)
  })

  it('the result inherits the first shape\'s style and carries no id yet', () => {
    const a = rect(0, 0, 10, 10)
    const b = { ...rect(5, 0, 10, 10), fill: '#00ff00' }
    const out = booleanOp([a, b], 'union')
    expect(out!.fill).toBe('#ff0000')
    expect(out!.id).toBe('')
  })
})
