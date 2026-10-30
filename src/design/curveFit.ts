// Least-squares cubic Bézier fitting (Schneider's algorithm, Graphics Gems).
//
// This is what separates a usable trace from a lumpy one. A pixel boundary is a
// staircase; routing a curve through the midpoint of every step — the cheap
// trick — turns each step into a bump, so a straight letter stroke comes out
// wavy. Fitting instead asks: what single cubic passes closest to ALL these
// points? The staircase averages out and the stroke comes back straight, while
// a genuine corner is preserved because the caller splits the run there first.
//
// Pure maths, no DOM — unit-tested in node.

export type Pt = [number, number]

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]]
const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k]
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1]
const len = (a: Pt): number => Math.hypot(a[0], a[1])

function normalize(v: Pt): Pt {
  const l = len(v)
  return l ? [v[0] / l, v[1] / l] : [0, 0]
}

/** A cubic segment: the two control points and the end point. */
export interface Cubic {
  c1: Pt
  c2: Pt
  end: Pt
}

const B0 = (u: number) => (1 - u) ** 3
const B1 = (u: number) => 3 * u * (1 - u) ** 2
const B2 = (u: number) => 3 * u * u * (1 - u)
const B3 = (u: number) => u ** 3

function bezierAt(bez: Pt[], u: number): Pt {
  return [
    bez[0][0] * B0(u) + bez[1][0] * B1(u) + bez[2][0] * B2(u) + bez[3][0] * B3(u),
    bez[0][1] * B0(u) + bez[1][1] * B1(u) + bez[2][1] * B2(u) + bez[3][1] * B3(u)
  ]
}

/** Parameterise by cumulative chord length — the standard first guess. */
function chordLengths(points: Pt[]): number[] {
  const u = [0]
  for (let i = 1; i < points.length; i++) {
    u.push(u[i - 1] + len(sub(points[i], points[i - 1])))
  }
  const total = u[u.length - 1] || 1
  return u.map((v) => v / total)
}

/**
 * The cubic whose two inner control points minimise the squared distance to
 * the sample points, given fixed endpoints and end tangents.
 */
function generateBezier(points: Pt[], u: number[], tan1: Pt, tan2: Pt): Pt[] {
  const first = points[0]
  const last = points[points.length - 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = 0; i < points.length; i++) {
    const a1 = mul(tan1, B1(u[i]))
    const a2 = mul(tan2, B2(u[i]))
    c00 += dot(a1, a1)
    c01 += dot(a1, a2)
    c11 += dot(a2, a2)
    const tmp = sub(
      points[i],
      add(
        add(mul(first, B0(u[i])), mul(first, B1(u[i]))),
        add(mul(last, B2(u[i])), mul(last, B3(u[i])))
      )
    )
    x0 += dot(a1, tmp)
    x1 += dot(a2, tmp)
  }
  const det = c00 * c11 - c01 * c01
  let alpha1: number
  let alpha2: number
  if (Math.abs(det) < 1e-12) {
    // degenerate normal equations — fall back to the classic thirds
    const d = len(sub(last, first)) / 3
    alpha1 = d
    alpha2 = d
  } else {
    alpha1 = (x0 * c11 - x1 * c01) / det
    alpha2 = (c00 * x1 - c01 * x0) / det
  }
  const segLen = len(sub(last, first))
  if (alpha1 < 1e-6 || alpha2 < 1e-6) {
    alpha1 = segLen / 3
    alpha2 = segLen / 3
  }
  return [first, add(first, mul(tan1, alpha1)), add(last, mul(tan2, alpha2)), last]
}

function maxError(points: Pt[], bez: Pt[], u: number[]): { error: number; index: number } {
  let error = 0
  let index = Math.floor(points.length / 2)
  for (let i = 1; i < points.length - 1; i++) {
    const p = bezierAt(bez, u[i])
    const d = len(sub(p, points[i]))
    const sq = d * d
    if (sq >= error) {
      error = sq
      index = i
    }
  }
  return { error, index }
}

/** One Newton–Raphson step pulling each sample onto its closest curve point. */
function reparameterize(points: Pt[], bez: Pt[], u: number[]): number[] {
  return u.map((ui, i) => {
    const p = points[i]
    const d = bezierAt(bez, ui)
    // first and second derivatives of the cubic at ui
    const q1: Pt[] = [
      mul(sub(bez[1], bez[0]), 3),
      mul(sub(bez[2], bez[1]), 3),
      mul(sub(bez[3], bez[2]), 3)
    ]
    const q2: Pt[] = [mul(sub(q1[1], q1[0]), 2), mul(sub(q1[2], q1[1]), 2)]
    const qu: Pt = [
      q1[0][0] * (1 - ui) ** 2 + q1[1][0] * 2 * ui * (1 - ui) + q1[2][0] * ui * ui,
      q1[0][1] * (1 - ui) ** 2 + q1[1][1] * 2 * ui * (1 - ui) + q1[2][1] * ui * ui
    ]
    const quu: Pt = [q2[0][0] * (1 - ui) + q2[1][0] * ui, q2[0][1] * (1 - ui) + q2[1][1] * ui]
    const diff = sub(d, p)
    const denominator = dot(qu, qu) + dot(diff, quu)
    if (Math.abs(denominator) < 1e-12) return ui
    const next = ui - dot(diff, qu) / denominator
    return Number.isFinite(next) ? Math.min(1, Math.max(0, next)) : ui
  })
}

/**
 * Fit one run of points with as few cubics as the error budget allows,
 * splitting at the worst-fitting sample when one curve cannot hold.
 */
export function fitCubics(points: Pt[], tolerance: number, tan1?: Pt, tan2?: Pt): Cubic[] {
  if (points.length < 2) return []
  const t1 = tan1 ?? normalize(sub(points[1], points[0]))
  const t2 = tan2 ?? normalize(sub(points[points.length - 2], points[points.length - 1]))

  if (points.length === 2) {
    const d = len(sub(points[1], points[0])) / 3
    return [{ c1: add(points[0], mul(t1, d)), c2: add(points[1], mul(t2, d)), end: points[1] }]
  }

  let u = chordLengths(points)
  let bez = generateBezier(points, u, t1, t2)
  let { error, index } = maxError(points, bez, u)
  const tol2 = tolerance * tolerance

  if (error < tol2) return [{ c1: bez[1], c2: bez[2], end: bez[3] }]

  // a near miss usually converges in a couple of Newton steps
  if (error < tol2 * 16) {
    for (let i = 0; i < 12; i++) {
      u = reparameterize(points, bez, u)
      bez = generateBezier(points, u, t1, t2)
      const m = maxError(points, bez, u)
      error = m.error
      index = m.index
      if (error < tol2) return [{ c1: bez[1], c2: bez[2], end: bez[3] }]
    }
  }

  // still too far off: split at the worst point and fit each half
  const split = Math.min(points.length - 2, Math.max(1, index))
  const center = normalize(sub(points[split - 1], points[split + 1]))
  const left = fitCubics(points.slice(0, split + 1), tolerance, t1, center)
  const right = fitCubics(points.slice(split), tolerance, mul(center, -1), t2)
  return [...left, ...right]
}

/**
 * Indices where the outline genuinely turns a corner, measured over a WINDOW
 * so the 1-pixel zig-zag of a diagonal edge is not mistaken for one.
 */
export function findCorners(ring: Pt[], window = 3, thresholdDeg = 62): number[] {
  const n = ring.length
  if (n < window * 2 + 2) return []
  const corners: number[] = []
  const cos = Math.cos((thresholdDeg * Math.PI) / 180)
  for (let i = 0; i < n; i++) {
    const prev = ring[(i - window + n) % n]
    const next = ring[(i + window) % n]
    const a = normalize(sub(ring[i], prev))
    const b = normalize(sub(next, ring[i]))
    if (!len(a) || !len(b)) continue
    if (dot(a, b) < cos) corners.push(i)
  }
  // collapse neighbouring hits down to one corner each
  const merged: number[] = []
  for (const c of corners) {
    if (!merged.length || c - merged[merged.length - 1] > window) merged.push(c)
  }
  if (merged.length > 1 && n - merged[merged.length - 1] + merged[0] <= window) merged.pop()
  return merged
}

/** Where two infinite lines cross, or null if they are parallel. */
function lineIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d1 = sub(a2, a1)
  const d2 = sub(b2, b1)
  const den = d1[0] * d2[1] - d1[1] * d2[0]
  if (Math.abs(den) < 1e-9) return null
  const t = ((b1[0] - a1[0]) * d2[1] - (b1[1] - a1[1]) * d2[0]) / den
  return [a1[0] + d1[0] * t, a1[1] + d1[1] * t]
}

/**
 * Restore corners that marching squares chamfered off.
 *
 * Sampling a hard edge on a grid always cuts a 45° facet across a right angle —
 * a square comes back as an octagon, losing an eighth of a pixel at each
 * corner. Extending the two straight edges that meet there and taking their
 * INTERSECTION puts the corner back exactly where the geometry says it is.
 * A genuinely rounded corner is untouched: findCorners never flags it, and the
 * `maxShift` guard drops any intersection that would fly off to infinity on a
 * nearly-straight join.
 */
export function sharpenCorners(ring: Pt[], corners: number[], gap = 2, span = 3, maxShift = 3): Pt[] {
  const n = ring.length
  if (corners.length < 2 || n < (gap + span) * 2 + 2) return ring
  const at = (i: number) => ring[((i % n) + n) % n]
  const replacement = new Map<number, Pt>()
  for (const i of corners) {
    // two points on each straight run, clear of the chamfer itself
    const p = lineIntersect(at(i - gap - span), at(i - gap), at(i + gap), at(i + gap + span))
    if (p && len(sub(p, ring[i])) <= maxShift) replacement.set(((i % n) + n) % n, p)
  }
  if (!replacement.size) return ring
  // the chamfer's own points are what rounded the corner — drop them
  const drop = new Set<number>()
  for (const i of replacement.keys()) {
    drop.add(((i - 1) % n + n) % n)
    drop.add((i + 1) % n)
  }
  const out: Pt[] = []
  for (let i = 0; i < n; i++) {
    const sharp = replacement.get(i)
    if (sharp) out.push(sharp)
    else if (!drop.has(i)) out.push(ring[i])
  }
  return out.length >= 3 ? out : ring
}
