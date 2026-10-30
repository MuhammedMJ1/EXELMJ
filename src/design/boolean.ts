// EXELMJ Design — path boolean operations (union / subtract / intersect /
// exclude). Nothing else in this app does this, so it is new: the approach
// is to FLATTEN each shape's path to a polygon (path.ts's own flatten(), the
// same routine subPathContains uses for hit-testing) and hand the polygons
// to `polygon-clipping` — a small, well-tested MIT library — rather than
// hand-rolling polygon clipping ourselves. That mirrors why outline.ts reaches
// for bezier-js instead of hand-rolling stroke offsetting: polygon boolean
// ops (self-intersection, shared edges, holes) are exactly the kind of
// algorithm that is easy to get subtly wrong on real input.
//
// LIMITATION, stated plainly: the result is a POLYGON (straight line
// segments), not re-fitted curves — a boolean op on two circles comes back
// faceted, not round. Re-curving a clipped polygon is a separate algorithm
// (curve fitting) this does not attempt.
//
// The result carries NO id: designApp.ts assigns one from its own
// shapeIdSeq counter, exactly like every other shape-creating method there
// (releaseSelected, expandSelection) already does.

import * as polygonClipping from 'polygon-clipping'
import type { Pair, Polygon, MultiPolygon } from 'polygon-clipping'
import { shapeBBox, shapeToPathD, type Shape } from './shapes'
import { pathBBox, shiftPathD, splitSubPaths, flatten } from './path'

export type BooleanKind = 'union' | 'subtract' | 'intersect' | 'exclude'

/** Curve-to-polyline sampling density for boolean ops — higher than the
 * hit-testing default (8) since the facets here are part of the visible result. */
const FLATTEN_STEPS = 16

function shapeToPolygon(s: Shape): Polygon | null {
  const d = shapeToPathD(s)
  if (!d) return null
  const subs = splitSubPaths(d)
  if (!subs.length) return null
  const b = shapeBBox(s)
  const rings = subs
    .map((sub) => flatten(sub, FLATTEN_STEPS).map(([x, y]): Pair => [x + b.x, y + b.y]))
    .filter((ring) => ring.length >= 3)
  return rings.length ? rings : null
}

function ringToPathD(ring: Pair[]): string {
  if (ring.length < 3) return ''
  const n = (v: number): string => String(Math.round(v * 1000) / 1000)
  return `M${n(ring[0][0])} ${n(ring[0][1])}${ring
    .slice(1)
    .map(([x, y]) => `L${n(x)} ${n(y)}`)
    .join('')}Z`
}

function multiPolygonToPathD(mp: MultiPolygon): string {
  return mp
    .map((poly) => poly.map(ringToPathD).filter(Boolean).join(' '))
    .filter(Boolean)
    .join(' ')
}

/**
 * Combine `shapes` (2 or more) into ONE new path shape (id: ''). Returns
 * null when there is nothing to combine (fewer than 2 usable shapes, or an
 * op that clips everything away). The result inherits the FIRST shape's
 * fill/stroke/strokeWidth, matching the predictable "bottom object's style
 * wins" convention.
 */
export function booleanOp(shapes: Shape[], op: BooleanKind): Shape | null {
  if (shapes.length < 2) return null
  const polys = shapes.map(shapeToPolygon).filter((p): p is Polygon => p !== null)
  if (polys.length < 2) return null

  let result: MultiPolygon
  try {
    const [first, ...rest] = polys
    if (op === 'union') result = polygonClipping.union(first, ...rest)
    else if (op === 'intersect') result = polygonClipping.intersection(first, ...rest)
    else if (op === 'exclude') result = polygonClipping.xor(first, ...rest)
    else result = polygonClipping.difference(first, ...rest)
  } catch {
    return null
  }
  if (!result.length) return null

  const absoluteD = multiPolygonToPathD(result)
  if (!absoluteD) return null
  const box = pathBBox(absoluteD)
  if (!box || !(box.w > 0) || !(box.h > 0)) return null
  const localD = shiftPathD(absoluteD, -box.x, -box.y)
  if (!localD) return null

  const template = shapes[0]
  return {
    id: '',
    kind: 'path',
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: template.fill,
    stroke: template.stroke,
    strokeWidth: template.strokeWidth,
    d: localD
  }
}
