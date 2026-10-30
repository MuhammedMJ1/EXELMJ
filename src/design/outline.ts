// Stroke → outline: turning a stroked run into a filled shape.
//
// WHY IT MATTERS HERE
// Two callers need it. Icon authoring (M4) has to ship outlined paths, because
// a stroked icon scaled to 16px renders its stroke at whatever width the
// consumer's renderer decides, while an outlined one is exact at every size.
// And centreline traces (centerline.ts) come back as stroked runs down the
// middle of a pen stroke — outlining them is what makes them fillable,
// gradient-able and boolean-able like every other region.
//
// WHY NOT RASTERISE
// The two popular libraries for this (svg-outline-stroke, oslllo/svg-fixer)
// both rasterise the stroke and re-trace the bitmap. A 1.5pt stroke rasterised
// at 16px and re-traced comes back as garbage, and one of them exact-pins a
// native image module that will not build on Electron 43. bezier-js works on
// the curve itself, so a hairline survives.
//
// Pure: no canvas, no DOM. Unit-tested in node.

import { Bezier } from 'bezier-js'
import { flatten, parse, segsToD, splitSubPaths, type Seg, type SubPath } from './path'

export type LineCap = 'butt' | 'round' | 'square'
export type LineJoin = 'miter' | 'round' | 'bevel'

export interface OutlineOpts {
  cap?: LineCap
  join?: LineJoin
  /** Segments a curve is reduced to before offsetting. Higher = closer to the
   * analytic offset, and slower. 0.05pt accuracy needs surprisingly few. */
  quality?: number
}

/**
 * Outline a stroked path of the given width.
 *
 * Returns null (never a wrong shape) when the input has no drawable geometry —
 * the caller then leaves the stroke as it was rather than replacing artwork
 * with something the user did not draw.
 */
export function outlineStroke(d: string, width: number, opts: OutlineOpts = {}): string | null {
  if (!(width > 0)) return null
  const subs = splitSubPaths(d)
  if (!subs.length) return null
  const half = width / 2
  const out: string[] = []
  for (const sub of subs) {
    const piece = outlineSub(sub, half, opts)
    if (piece) out.push(piece)
  }
  return out.length ? out.join(' ') : null
}

function outlineSub(sub: SubPath, half: number, opts: OutlineOpts): string | null {
  const curves = toCurves(sub)
  if (!curves.length) {
    // A single point with a round cap is a dot; with any other cap it is
    // nothing at all. Both are correct answers, so say so explicitly.
    const p = firstPoint(sub)
    return p && opts.cap === 'round' ? circleD(p[0], p[1], half) : null
  }

  const forward: Seg[] = []
  const backward: Seg[] = []
  for (const c of curves) {
    appendOffset(forward, c, half, opts.quality ?? 0)
    appendOffset(backward, c, -half, opts.quality ?? 0)
  }
  if (!forward.length || !backward.length) return null

  // The far side is walked in reverse so the two offsets form one ring.
  const back = reverseSegs(backward)

  if (sub.closed) {
    // A closed stroke outlines as two independent rings (outer and inner),
    // which the evenodd rule then renders as a band — exactly what a stroked
    // ring looks like. Joining them into one ring would fill the middle.
    return `${asRing(forward)} ${asRing(back)}`
  }

  // A cap must bulge AWAY from the stroke, and only the travel direction knows
  // which way that is — deriving it from the chord alone gives a semicircle
  // that curves back into the line (measurably: the outline stops being longer
  // than the source).
  const last = curves[curves.length - 1]
  const first = curves[0]
  const endDir = unit(last.derivative(1))
  const startDir = unit(first.derivative(0))
  const capA = capSegs(endPoint(forward), startPoint(back), opts.cap ?? 'butt', half, endDir)
  const capB = capSegs(endPoint(back), startPoint(forward), opts.cap ?? 'butt', half, [
    -startDir[0],
    -startDir[1]
  ])
  return segsToD([...forward, ...capA, ...dropLeadingM(back), ...capB, { c: 'Z' }])
}

/** The subpath as bezier-js curves; straight runs become degenerate cubics so
 * one code path handles both. */
function toCurves(sub: SubPath): Bezier[] {
  const out: Bezier[] = []
  let cx = 0
  let cy = 0
  // Where the run STARTED, which is where `Z` returns to.
  let sx = 0
  let sy = 0
  let started = false
  /** A straight run as a degenerate cubic, so one code path handles both. */
  const line = (x0: number, y0: number, x1: number, y1: number): Bezier =>
    new Bezier(x0, y0, x0 + (x1 - x0) / 3, y0 + (y1 - y0) / 3, x0 + (2 * (x1 - x0)) / 3, y0 + (2 * (y1 - y0)) / 3, x1, y1)
  for (const s of sub.segs) {
    if (s.c === 'Z') continue
    if (s.c === 'M') {
      cx = s.x
      cy = s.y
      sx = s.x
      sy = s.y
      started = true
      continue
    }
    if (!started) continue
    if (s.x === cx && s.y === cy) continue // zero-length: nothing to offset
    out.push(s.c === 'L' ? line(cx, cy, s.x, s.y) : new Bezier(cx, cy, s.x1, s.y1, s.x2, s.y2, s.x, s.y))
    cx = s.x
    cy = s.y
  }
  // `Z` is a real EDGE, not punctuation. A closed run whose last point is not
  // already its first has one more straight segment back to the start, and
  // dropping it left that whole side of every closed shape un-outlined — a
  // rectangle expanded with three thick sides and one hairline.
  if (started && sub.closed && (Math.abs(cx - sx) > 1e-9 || Math.abs(cy - sy) > 1e-9)) {
    out.push(line(cx, cy, sx, sy))
  }
  return out
}

/**
 * Offset one curve by `dist` and append it.
 *
 * bezier-js's offset() is only accurate on a "simple" curve, so reduce() is
 * called first — that is the whole trick, and skipping it is why naive offset
 * implementations pinch on tight bends.
 */
function appendOffset(into: Seg[], c: Bezier, dist: number, quality: number): void {
  let parts: Bezier[]
  try {
    parts = c.reduce()
  } catch {
    parts = [c]
  }
  if (!parts.length) parts = [c]
  if (quality > 0) {
    const finer: Bezier[] = []
    for (const p of parts) {
      const n = Math.max(1, Math.round(quality))
      if (n === 1) {
        finer.push(p)
        continue
      }
      for (let i = 0; i < n; i++) finer.push(p.split(i / n, (i + 1) / n))
    }
    parts = finer
  } else {
    // reduce() splits at extrema and inflections, which is enough for a thin
    // stroke and NOT enough for a wide one: offset error grows with the
    // distance, so a 12pt stroke on a bend overshoots where a 1.5pt one does
    // not. Rather than guess a subdivision count, split until each piece's
    // own offset actually measures right — the same criterion the test uses.
    parts = parts.flatMap((p) => refineForOffset(p, dist, 0))
  }
  for (const p of parts) {
    let off: Bezier | Bezier[]
    try {
      off = p.offset(dist) as Bezier | Bezier[]
    } catch {
      continue
    }
    const list = Array.isArray(off) ? off : [off]
    for (const o of list) {
      const pts = o.points
      if (!pts || pts.length < 2) continue
      if (!into.length) into.push({ c: 'M', x: pts[0].x, y: pts[0].y })
      if (pts.length === 4) {
        into.push({ c: 'C', x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y, x: pts[3].x, y: pts[3].y })
      } else if (pts.length === 3) {
        // quadratic -> cubic, exact
        const [p0, p1, p2] = pts
        into.push({
          c: 'C',
          x1: p0.x + (2 / 3) * (p1.x - p0.x),
          y1: p0.y + (2 / 3) * (p1.y - p0.y),
          x2: p2.x + (2 / 3) * (p1.x - p2.x),
          y2: p2.y + (2 / 3) * (p1.y - p2.y),
          x: p2.x,
          y: p2.y
        })
      } else {
        into.push({ c: 'L', x: pts[pts.length - 1].x, y: pts[pts.length - 1].y })
      }
    }
  }
}

/** Half the width may be large; this is the deviation we accept, in pt. */
const OFFSET_TOL = 0.02
const MAX_REFINE_DEPTH = 6

/**
 * Split one simple curve until offsetting it lands within OFFSET_TOL.
 *
 * The check is direct: offset the piece, take the midpoint of the result, and
 * measure how far it actually is from the source piece. If that is not |dist|,
 * halve and recurse. Bounded by depth so a pathological curve degrades to a
 * slightly coarse outline instead of hanging.
 */
function refineForOffset(p: Bezier, dist: number, depth: number): Bezier[] {
  if (depth >= MAX_REFINE_DEPTH) return [p]
  let mid: { x: number; y: number } | null = null
  try {
    const off = p.offset(dist) as Bezier | Bezier[]
    const list = Array.isArray(off) ? off : [off]
    if (!list.length) return [p]
    mid = list[Math.floor(list.length / 2)].get(0.5)
  } catch {
    return [p]
  }
  if (!mid) return [p]
  const near = p.project(mid)
  const err = near.d === undefined ? 0 : Math.abs(near.d - Math.abs(dist))
  if (err <= OFFSET_TOL) return [p]
  return [
    ...refineForOffset(p.split(0, 0.5), dist, depth + 1),
    ...refineForOffset(p.split(0.5, 1), dist, depth + 1)
  ]
}

function reverseSegs(segs: Seg[]): Seg[] {
  const pts: Seg[] = []
  // walk backwards, flipping each curve's control points
  const anchors: Array<[number, number]> = []
  for (const s of segs) if (s.c !== 'Z') anchors.push([s.x, s.y])
  if (!anchors.length) return []
  pts.push({ c: 'M', x: anchors[anchors.length - 1][0], y: anchors[anchors.length - 1][1] })
  for (let i = segs.length - 1; i >= 1; i--) {
    const s = segs[i]
    const prev = segs[i - 1]
    if (s.c === 'Z' || prev.c === 'Z') continue
    if (s.c === 'C') {
      pts.push({ c: 'C', x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, x: prev.x, y: prev.y })
    } else {
      pts.push({ c: 'L', x: prev.x, y: prev.y })
    }
  }
  return pts
}

function dropLeadingM(segs: Seg[]): Seg[] {
  if (segs.length && segs[0].c === 'M') return [{ c: 'L', x: segs[0].x, y: segs[0].y }, ...segs.slice(1)]
  return segs
}

function asRing(segs: Seg[]): string {
  return segsToD([...segs, { c: 'Z' }])
}

function startPoint(segs: Seg[]): [number, number] {
  for (const s of segs) if (s.c !== 'Z') return [s.x, s.y]
  return [0, 0]
}

function endPoint(segs: Seg[]): [number, number] {
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]
    if (s.c !== 'Z') return [s.x, s.y]
  }
  return [0, 0]
}

function firstPoint(sub: SubPath): [number, number] | null {
  for (const s of sub.segs) if (s.c !== 'Z') return [s.x, s.y]
  return null
}

function unit(v: { x: number; y: number }): [number, number] {
  const len = Math.hypot(v.x, v.y) || 1
  return [v.x / len, v.y / len]
}

/**
 * The join between the two offset sides at one end of an open stroke.
 * `outward` is the unit direction the stroke is travelling AT that end, which
 * is the only reliable way to know which side of the chord the cap belongs on.
 */
function capSegs(
  from: [number, number],
  to: [number, number],
  cap: LineCap,
  half: number,
  outward: [number, number]
): Seg[] {
  if (cap === 'butt') return [{ c: 'L', x: to[0], y: to[1] }]
  if (cap === 'square') {
    const nx = outward[0] * half
    const ny = outward[1] * half
    return [
      { c: 'L', x: from[0] + nx, y: from[1] + ny },
      { c: 'L', x: to[0] + nx, y: to[1] + ny },
      { c: 'L', x: to[0], y: to[1] }
    ]
  }
  return semicircle(from, to, outward)
}

/** kappa for a quarter circle: the standard cubic circle approximation. */
const K = 0.5522847498307936

function semicircle(from: [number, number], to: [number, number], outward: [number, number]): Seg[] {
  const cx = (from[0] + to[0]) / 2
  const cy = (from[1] + to[1]) / 2
  const rx = from[0] - cx
  const ry = from[1] - cy
  // The apex is one radius along the OUTWARD direction. Deriving it by
  // rotating the radius instead picks a side arbitrarily, and half the time
  // that side is back inside the stroke.
  const r = Math.hypot(rx, ry)
  const ax = cx + outward[0] * r
  const ay = cy + outward[1] * r
  // Two quarter arcs. For a quarter from P0 to P1 about the centre, the
  // controls sit K*r along each endpoint's TANGENT: outward at `from`, the
  // inward radius at the apex, and -outward at `to`.
  const ox = outward[0] * K * r
  const oy = outward[1] * K * r
  return [
    {
      c: 'C',
      x1: from[0] + ox,
      y1: from[1] + oy,
      x2: ax + rx * K,
      y2: ay + ry * K,
      x: ax,
      y: ay
    },
    {
      c: 'C',
      x1: ax - rx * K,
      y1: ay - ry * K,
      x2: to[0] + ox,
      y2: to[1] + oy,
      x: to[0],
      y: to[1]
    }
  ]
}

function circleD(cx: number, cy: number, r: number): string {
  return segsToD([
    { c: 'M', x: cx + r, y: cy },
    { c: 'C', x1: cx + r, y1: cy + r * K, x2: cx + r * K, y2: cy + r, x: cx, y: cy + r },
    { c: 'C', x1: cx - r * K, y1: cy + r, x2: cx - r, y2: cy + r * K, x: cx - r, y: cy },
    { c: 'C', x1: cx - r, y1: cy - r * K, x2: cx - r * K, y2: cy - r, x: cx, y: cy - r },
    { c: 'C', x1: cx + r * K, y1: cy - r, x2: cx + r, y2: cy - r * K, x: cx + r, y: cy },
    { c: 'Z' }
  ])
}

/**
 * How far the outline actually sits from the source path, sampled — the number
 * the accuracy test asserts against. Exposed because "it looked right" is not
 * a verification method for an offset curve.
 */
/**
 * Bake a dash pattern into real geometry: one open sub-path per dash.
 *
 * This is the "appearance" half of Expand Appearance. A dash is a RENDERING
 * instruction — outlining a dashed path without baking it first produces the
 * outline of the whole unbroken run, and the dashes silently disappear.
 *
 * Curves are walked as a fine polyline rather than split analytically. A dash
 * is a visual rhythm measured in points, and the error from flattening at this
 * resolution is far below the width of the stroke it is cutting.
 */
export function dashPathD(d: string, pattern: number[], steps = 24): string | null {
  const on = pattern.filter((v) => Number.isFinite(v) && v >= 0)
  if (!on.length || on.every((v) => v <= 0)) return null
  const total = on.reduce((a, b) => a + b, 0)
  if (total <= 0) return null
  const subs = splitSubPaths(d)
  if (!subs.length) return null
  const out: string[] = []
  const r = (v: number): string => String(Math.round(v * 1000) / 1000)
  for (const sub of subs) {
    const pts = flatten(sub, steps)
    if (pts.length < 2) continue
    // A closed run has to come back to its start, or the last dash stops short
    // of the corner it should turn.
    if (sub.closed) pts.push(pts[0])
    let idx = 0
    let left = on[0]
    let drawing = true
    let run: Array<[number, number]> = [pts[0]]
    const flush = () => {
      if (drawing && run.length > 1) {
        out.push(`M${r(run[0][0])} ${r(run[0][1])}` + run.slice(1).map((q) => `L${r(q[0])} ${r(q[1])}`).join(''))
      }
      run = []
    }
    for (let i = 1; i < pts.length; i++) {
      let [ax, ay] = pts[i - 1]
      const [bx, by] = pts[i]
      let seg = Math.hypot(bx - ax, by - ay)
      while (seg > left) {
        const t = left / seg
        const mx = ax + (bx - ax) * t
        const my = ay + (by - ay) * t
        run.push([mx, my])
        flush()
        drawing = !drawing
        run = [[mx, my]]
        ax = mx
        ay = my
        seg -= left
        idx = (idx + 1) % on.length
        left = on[idx] || 1e-6
      }
      left -= seg
      run.push([bx, by])
    }
    flush()
  }
  return out.length ? out.join('') : null
}

export function maxOffsetError(sourceD: string, outlineD: string, half: number, samples = 40): number {
  const src = toCurves({ segs: parse(sourceD), closed: false })
  const out = toCurves({ segs: parse(outlineD), closed: false })
  if (!src.length || !out.length) return Infinity
  let worst = 0
  for (const c of out) {
    for (let i = 0; i <= samples; i++) {
      const p = c.get(i / samples)
      let best = Infinity
      let bestT = 0
      for (const s of src) {
        const near = s.project(p)
        if (near.d !== undefined && near.d < best) {
          best = near.d
          bestT = near.t ?? 0
        }
      }
      // Points whose nearest source point is an ENDPOINT are on a cap, and a
      // cap legitimately crosses the stroke's own end — measuring it would
      // report the cap's geometry as offset error. Only the two side offsets
      // are being verified here.
      if (bestT <= 0.002 || bestT >= 0.998) continue
      if (Number.isFinite(best)) worst = Math.max(worst, Math.abs(best - half))
    }
  }
  return worst
}
