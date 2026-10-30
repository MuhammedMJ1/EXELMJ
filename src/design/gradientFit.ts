// Linear-gradient detection for traced regions (Illustrator's enableGradient /
// GradientFidelity, our own implementation).
//
// Why it matters: quantisation slices a smooth ramp into flat bands, and the
// step between two bands is visible as a hard edge — the classic "posterised"
// trace. Fitting the ORIGINAL pixels of each region with a linear colour ramp
// and emitting that instead of one flat colour makes neighbouring bands meet at
// the same colour, so the banding dissolves without adding a single path.
//
// The fit is least-squares in closed form (no iteration, no random seeding), so
// the same picture always produces the same gradient.
//
// Pure maths, no DOM — unit-tested in node.

export interface LinearGradient {
  /** start point, SOURCE PIXEL coordinates */
  x1: number
  y1: number
  /** end point */
  x2: number
  y2: number
  /** '#rrggbb' at x1,y1 */
  from: string
  /** '#rrggbb' at x2,y2 */
  to: string
}

export interface GradientFitOptions {
  /** smallest end-to-end colour distance worth calling a gradient (0..441) */
  minDelta?: number
  /** largest per-channel RMS error still considered "linear" (0..255) */
  maxRms?: number
  /** ignore regions with fewer pixels than this — a fit needs evidence */
  minPixels?: number
}

const DEFAULTS = { minDelta: 14, maxRms: 12, minPixels: 64 }

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))

const hex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('')}`

/**
 * Fit `value = a + b·x + c·y` by least squares over the listed samples.
 * Returns null when the normal equations are singular (all samples on a line).
 */
function fitPlane(
  xs: Float64Array,
  ys: Float64Array,
  vs: Float64Array,
  n: number
): { a: number; b: number; c: number } | null {
  let sx = 0
  let sy = 0
  let sv = 0
  for (let i = 0; i < n; i++) {
    sx += xs[i]
    sy += ys[i]
    sv += vs[i]
  }
  const mx = sx / n
  const my = sy / n
  const mv = sv / n
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sxv = 0
  let syv = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    const dv = vs[i] - mv
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
    sxv += dx * dv
    syv += dy * dv
  }
  const det = sxx * syy - sxy * sxy
  if (Math.abs(det) < 1e-9) return null
  const b = (syy * sxv - sxy * syv) / det
  const c = (sxx * syv - sxy * sxv) / det
  return { a: mv - b * mx - c * my, b, c }
}

/**
 * The direction along which the three colour planes vary most.
 *
 * Each channel contributes a gradient vector (b, c); the direction that
 * captures the most variation is the dominant eigenvector of the summed outer
 * products — a 2x2 symmetric eigenproblem with a closed form. Using one shared
 * direction (rather than per-channel) is what keeps the result a single
 * two-point gradient instead of three unrelated ramps.
 */
export function dominantDirection(
  planes: { b: number; c: number }[]
): { ux: number; uy: number } {
  let m00 = 0
  let m01 = 0
  let m11 = 0
  for (const p of planes) {
    m00 += p.b * p.b
    m01 += p.b * p.c
    m11 += p.c * p.c
  }
  if (m00 + m11 < 1e-12) return { ux: 1, uy: 0 }
  // largest eigenvalue of [[m00, m01], [m01, m11]]
  const tr = m00 + m11
  const diff = Math.sqrt(Math.max(0, (m00 - m11) * (m00 - m11) + 4 * m01 * m01))
  const lambda = (tr + diff) / 2
  // eigenvector for lambda; pick the better-conditioned row
  let ux = m01
  let uy = lambda - m00
  if (Math.hypot(ux, uy) < 1e-9) {
    ux = lambda - m11
    uy = m01
  }
  const len = Math.hypot(ux, uy)
  if (len < 1e-9) return { ux: 1, uy: 0 }
  // canonical sign: never return a direction and its negative for the same
  // picture, or the gradient would flip between runs
  const sx = ux / len
  const sy = uy / len
  return sx < 0 || (sx === 0 && sy < 0) ? { ux: -sx, uy: -sy } : { ux: sx, uy: sy }
}

/**
 * Fit a linear gradient to the pixels a mask selects, or return null when the
 * region is flat, too noisy, or too small to justify one.
 *
 * `mask` is w*h bytes; a pixel counts when mask[i] === 1.
 */
export function fitLinearGradient(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  mask: Uint8Array,
  options: GradientFitOptions = {}
): LinearGradient | null {
  const opt = { ...DEFAULTS, ...options }

  // collect the region's samples (subsampled — a fit needs spread, not volume)
  let total = 0
  for (let i = 0; i < w * h; i++) if (mask[i] === 1) total++
  if (total < opt.minPixels) return null
  const step = Math.max(1, Math.floor(total / 20000))

  const cap = Math.ceil(total / step) + 1
  const xs = new Float64Array(cap)
  const ys = new Float64Array(cap)
  const rs = new Float64Array(cap)
  const gs = new Float64Array(cap)
  const bs = new Float64Array(cap)
  let n = 0
  let seen = 0
  for (let y = 0; y < h && n < cap; y++) {
    for (let x = 0; x < w && n < cap; x++) {
      const i = y * w + x
      if (mask[i] !== 1) continue
      if (seen++ % step) continue
      const o = i * 4
      xs[n] = x
      ys[n] = y
      rs[n] = data[o]
      gs[n] = data[o + 1]
      bs[n] = data[o + 2]
      n++
    }
  }
  if (n < 8) return null

  const pr = fitPlane(xs, ys, rs, n)
  const pg = fitPlane(xs, ys, gs, n)
  const pb = fitPlane(xs, ys, bs, n)
  if (!pr || !pg || !pb) return null

  const { ux, uy } = dominantDirection([pr, pg, pb])

  // centre of the samples — the gradient line runs through it
  let mx = 0
  let my = 0
  for (let i = 0; i < n; i++) {
    mx += xs[i]
    my += ys[i]
  }
  mx /= n
  my /= n

  // project onto the direction and refit each channel as a 1-D ramp: this is
  // the model actually emitted, so its own residual is the honest error
  const ts = new Float64Array(n)
  for (let i = 0; i < n; i++) ts[i] = (xs[i] - mx) * ux + (ys[i] - my) * uy

  const fit1d = (vs: Float64Array): { p: number; q: number } => {
    let st = 0
    let sv = 0
    for (let i = 0; i < n; i++) {
      st += ts[i]
      sv += vs[i]
    }
    const mt = st / n
    const mv = sv / n
    let stt = 0
    let stv = 0
    for (let i = 0; i < n; i++) {
      const dt = ts[i] - mt
      stt += dt * dt
      stv += dt * (vs[i] - mv)
    }
    const q = Math.abs(stt) < 1e-9 ? 0 : stv / stt
    return { p: mv - q * mt, q }
  }
  const fr = fit1d(rs)
  const fg = fit1d(gs)
  const fb = fit1d(bs)

  // residual of the emitted model
  let sse = 0
  for (let i = 0; i < n; i++) {
    const dr = rs[i] - (fr.p + fr.q * ts[i])
    const dg = gs[i] - (fg.p + fg.q * ts[i])
    const db = bs[i] - (fb.p + fb.q * ts[i])
    sse += dr * dr + dg * dg + db * db
  }
  const rms = Math.sqrt(sse / (n * 3))
  if (rms > opt.maxRms) return null

  // trim the ends: a couple of stray pixels must not stretch the ramp
  const sorted = Array.from(ts.subarray(0, n)).sort((a, b) => a - b)
  const lo = sorted[Math.floor(n * 0.02)]
  const hi = sorted[Math.min(n - 1, Math.ceil(n * 0.98))]
  if (!(hi > lo)) return null

  const at = (t: number): [number, number, number] => [
    fr.p + fr.q * t,
    fg.p + fg.q * t,
    fb.p + fb.q * t
  ]
  const c0 = at(lo)
  const c1 = at(hi)
  const delta = Math.hypot(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2])
  if (delta < opt.minDelta) return null

  return {
    x1: mx + ux * lo,
    y1: my + uy * lo,
    x2: mx + ux * hi,
    y2: my + uy * hi,
    from: hex(c0[0], c0[1], c0[2]),
    to: hex(c1[0], c1[1], c1[2])
  }
}
