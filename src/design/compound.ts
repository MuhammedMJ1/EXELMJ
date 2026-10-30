// Releasing a compound path — turning one traced blob into separately
// selectable, separately COLOURABLE shapes.
//
// THE PROBLEM THIS SOLVES
// trace.ts emits one Shape per colour layer, and each of those carries every
// region of that colour as a single `d` with many subpaths. So a traced logo
// arrives as a handful of opaque blobs: the user can move a whole colour, and
// nothing else. "Recolour just this petal" has no handle to grab.
//
// THE OBVIOUS FIX IS WRONG
// Splitting every subpath into its own shape turns a donut into a solid disc,
// because the inner ring stops being a hole and becomes a second filled
// circle. Holes are not separate regions; they are part of their parent.
//
// So: group each subpath with the holes it contains, and emit one shape per
// GROUP. A hole travels with its outer ring, keeps the evenodd fill rule, and
// the donut stays a donut. This needs no model change at all — the output is
// ordinary path Shapes, which every renderer and exporter already handles.

import {
  joinSubPaths,
  pathBBox,
  shiftPathD,
  splitSubPaths,
  subPathArea,
  subPathContains,
  type SubPath
} from './path'
import type { Shape } from './shapes'

export interface Region {
  /** The enclosing ring. */
  outer: SubPath
  /** Rings fully inside `outer` — rendered as holes by the evenodd rule. */
  holes: SubPath[]
}

/**
 * Group subpaths into regions.
 *
 * Containment is decided by testing a point of the candidate against the
 * possible parent, and ties are broken by area: a ring inside two others
 * belongs to the SMALLER one, which is what makes a hole-inside-an-island
 * (a letter 'B' counter inside a shape inside a frame) nest correctly rather
 * than attaching to the outermost ring.
 */
export function groupRegions(subs: SubPath[]): Region[] {
  // A ring needs three anchors to enclose anything; anything with fewer is a
  // stray `M x y Z` the tracer left behind — invisible, and it would otherwise
  // become a zero-area region that swallows containment tests.
  const anchors = (s: SubPath): number => s.segs.reduce((n, g) => n + (g.c === 'Z' ? 0 : 1), 0)
  const drawable = subs.filter((s) => anchors(s) >= 2)
  const closed = drawable.filter((s) => s.closed && anchors(s) >= 3)
  const open = drawable.filter((s) => !(s.closed && anchors(s) >= 3))
  const withArea = closed.map((s) => ({ sub: s, area: Math.abs(subPathArea(s)) }))
  // biggest first, so a parent is always seen before its children
  withArea.sort((a, b) => b.area - a.area)

  const regions: Region[] = []
  const parentOf = new Map<number, number>()

  for (let i = 0; i < withArea.length; i++) {
    const pt = anchorOf(withArea[i].sub)
    if (!pt) continue
    let best = -1
    let bestArea = Infinity
    for (let j = 0; j < i; j++) {
      if (!subPathContains(withArea[j].sub, pt[0], pt[1])) continue
      if (withArea[j].area < bestArea) {
        bestArea = withArea[j].area
        best = j
      }
    }
    if (best >= 0) parentOf.set(i, best)
  }

  // depth parity decides hole-ness: a ring inside a hole is solid again
  const depth = (i: number): number => {
    let d = 0
    let cur = parentOf.get(i)
    while (cur !== undefined) {
      d++
      cur = parentOf.get(cur)
    }
    return d
  }

  const indexOfRegion = new Map<number, number>()
  for (let i = 0; i < withArea.length; i++) {
    if (depth(i) % 2 === 0) {
      indexOfRegion.set(i, regions.length)
      regions.push({ outer: withArea[i].sub, holes: [] })
    }
  }
  for (let i = 0; i < withArea.length; i++) {
    if (depth(i) % 2 === 0) continue
    const p = parentOf.get(i)
    const ri = p === undefined ? undefined : indexOfRegion.get(p)
    if (ri !== undefined) regions[ri].holes.push(withArea[i].sub)
  }

  // an open run cannot enclose anything; it is its own region
  for (const s of open) if (s.segs.length) regions.push({ outer: s, holes: [] })
  return regions
}

/** A point that is actually ON the ring — used as the containment probe. */
function anchorOf(sub: SubPath): [number, number] | null {
  for (const s of sub.segs) if (s.c !== 'Z') return [s.x, s.y]
  return null
}

export function regionToD(r: Region): string {
  return joinSubPaths([r.outer, ...r.holes])
}

/**
 * Release a traced path shape into one shape per region.
 *
 * Each result keeps the parent's fill, stroke and gradient, and gets its own
 * x/y/w/h — so it can be moved, deleted and RECOLOURED on its own, which is
 * the whole point. `d` is rebased to each region's own local origin, matching
 * the contract that a path's geometry is local to its shape.
 *
 * Returns [shape] unchanged when there is nothing to release, so the caller can
 * apply it unconditionally.
 */
export function releaseCompound(shape: Shape, idPrefix = shape.id): Shape[] {
  if (shape.kind !== 'path' || !shape.d) return [shape]
  const regions = groupRegions(splitSubPaths(shape.d))
  if (regions.length < 2) return [shape]

  const out: Shape[] = []
  for (const [i, region] of regions.entries()) {
    const d = regionToD(region)
    const local = pathBBox(d)
    // A region with NO extent on one axis is still a real object — a straight
    // rule, one bar of a hamburger icon, a hairline divider. Requiring extent
    // on BOTH axes rejected every one of them, and since the whole shape was
    // rejected the split silently reported "nothing to split" on exactly the
    // icons it was most useful for. Only a POINT is genuinely nothing.
    if (!local || (local.w <= 0 && local.h <= 0)) continue
    // Rebase so the region's own top-left is its origin. A plain SHIFT, not a
    // box-to-box transform: the target is the same size as the source, and the
    // transform kernel refuses a source box with a zero side — which is the
    // flat region this now has to keep.
    const rebased = shiftPathD(d, -local.x, -local.y)
    if (!rebased) continue
    out.push({
      ...shape,
      id: `${idPrefix}-r${i + 1}`,
      x: shape.x + local.x,
      y: shape.y + local.y,
      // Clamped so the bounding box stays hit-testable and the selection frame
      // has something to draw, the same floor the pen uses for a flat run.
      w: Math.max(local.w, 0.01),
      h: Math.max(local.h, 0.01),
      d: rebased,
      // A gradient is expressed in the PARENT's local space; carrying it onto
      // a rebased child would silently shift its ramp. Dropping to the flat
      // fill is the honest answer — the alternative is a wrong gradient.
      ...(shape.gradient ? { gradient: undefined } : {})
    })
  }
  return out.length > 1 ? out.map(stripUndefined) : [shape]
}

/** `{...shape, gradient: undefined}` leaves the KEY present, which would then
 * serialise as `"gradient": undefined` -> dropped by JSON but still tripping
 * `'gradient' in shape` checks. Remove it properly. */
function stripUndefined(s: Shape): Shape {
  const out = { ...s }
  if (out.gradient === undefined) delete out.gradient
  return out
}

/**
 * The region under a point, as an index into groupRegions()'s output — what a
 * click on a traced logo must resolve to before it can be recoloured.
 * Holes count as NOT hit, because a click through a donut's centre should fall
 * to whatever is behind it, exactly as the painted result suggests.
 */
export function regionAt(regions: Region[], x: number, y: number): number {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i]
    if (!subPathContains(r.outer, x, y)) continue
    if (r.holes.some((h) => subPathContains(h, x, y))) continue
    return i
  }
  return -1
}
