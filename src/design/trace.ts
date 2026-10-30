// Raster → vector tracing (the manager's «تحويل إلى SVG», Illustrator's Image
// Trace in spirit — our own implementation, no third-party tracer).
//
// The pipeline, in four exact steps:
//   1. VARIANCE-CUT quantisation → a small deterministic palette (see
//      buildPalette: a median cut splits by rank and loses a small logo on a
//      big white page, so the split point is chosen by variance instead).
//   2. STACKED LAYERS (the Inkscape "stack scans" idea): colours are ordered
//      biggest-first and layer i's region is "this colour plus every colour
//      painted above it". Lower layers extend UNDERNEATH upper ones, so every
//      boundary between two colours is traced exactly once and a seam between
//      two independently fitted curves cannot exist — matching is structural,
//      not a post-fix.
//   3. A SOFT MEMBERSHIP field per layer — 0.5 exactly where a pixel sits
//      half-way between the layer's colours and the rest — then SUB-PIXEL
//      CONTOURS: marching squares on that field (isoContour.ts), so the
//      outline passes through the middle of an anti-aliased edge instead of
//      snapping to a pixel boundary. Holes come back as their own loops wound
//      the opposite way, so fill-rule="evenodd" cuts them for free.
//   4. Corner detection, then least-squares cubic Bézier fitting.
//
// Everything here is pure — no canvas, no DOM — so the whole tracer is
// unit-testable in node, which is the only way to trust step 3.

import { findCorners, fitCubics, sharpenCorners, type Cubic, type Pt } from './curveFit'
import { denoiseMedian, isoContours, offsetLoop, StackedFields } from './isoContour'
import { fitLinearGradient, type LinearGradient } from './gradientFit'
import { centerlineOf, type Centerline } from './centerline'

export interface TracedPath {
  /** SVG path data in SOURCE PIXEL coordinates, top-left origin */
  d: string
  /** '#rrggbb' — also the fallback wherever a gradient cannot be drawn */
  fill: string
  /** pixels of this path's OWN colour (paint order is the array order) */
  area: number
  /** set when this region's pixels form a smooth ramp (see gradientFit.ts) */
  gradient?: LinearGradient
  /**
   * Set when the region was traced as a CENTRELINE: `d` is then open polylines
   * down the middle of the stroke, to be STROKED at this weight rather than
   * filled. See centerline.ts for why line art needs this.
   */
  strokeWidth?: number
}

export interface TraceOptions {
  /**
   * Called after every colour layer is fitted, with the layer just produced
   * (null when it yielded nothing). Return false to STOP EARLY and return the
   * layers computed so far.
   *
   * This is the only concession the pure pipeline makes to being driven from a
   * Worker: it is what turns a multi-second freeze into progressive layers and
   * a cancel that actually stops. It is NOT part of the serialisable options —
   * a function cannot cross postMessage, so the worker supplies its own.
   */
  onLayer?: (done: number, total: number, path: TracedPath | null) => boolean | void
  /** palette size 2..MAX_COLORS, or 'auto' — keep splitting while a cluster is
   * still mixed, like Illustrator's Auto-Color. */
  colors?: number | 'auto'
  /** drop specks with fewer than this many pixels */
  minArea?: number
  /** RDP tolerance in pixels; 0 keeps every step of the staircase */
  simplify?: number
  /** fit smooth curves; off gives the raw polygon */
  smooth?: boolean
  /** 3x3 median pre-pass — removes JPEG speckle without moving edges */
  denoise?: boolean
  /** colour handling: full colour, greys only, or ink/paper by threshold */
  mode?: 'color' | 'grayscale' | 'bw'
  /**
   * Angle (degrees) a bend must exceed to count as a CORNER — the knob
   * Illustrator's engine calls CornerFidelity. Lower detects more corners
   * (technical drawings); higher lets more bends smooth over (silhouettes).
   */
  cornerDeg?: number
  /**
   * Emit a straight L segment when a fitted cubic is flat within tolerance —
   * Illustrator's snapcurvestolines. Kills the faint wobble on ruler-straight
   * edges and shrinks the output.
   */
  snapLines?: boolean
  /** bw mode only: luma (0..255) below which a pixel counts as ink */
  threshold?: number
  /**
   * Emit a linear gradient for regions whose ORIGINAL pixels form a smooth
   * ramp (Illustrator's enableGradient). Quantisation slices a ramp into flat
   * bands and the steps between them read as banding; a per-region gradient
   * makes neighbouring bands meet at the same colour and the banding goes.
   */
  gradients?: boolean
  /**
   * Trace thin regions as centrelines (Illustrator's Strokes output): one open
   * path down the middle of the stroke plus a weight, instead of a closed
   * outline wrapping both of its sides.
   */
  strokes?: boolean
  /** widest region still treated as a stroke, in pixels (maxstrokeweight) */
  maxStrokeWidth?: number
  /**
   * What to do with the dominant colour — the paper a logo was scanned on.
   *   'auto'  (default) drop it ONLY when it is near-white, which is the
   *           "logo on a white page" case and leaves real artwork intact
   *   true    always drop it
   *   false   keep everything
   */
  ignoreBackground?: 'auto' | boolean
  /**
   * Colours the user picked with the eyedropper to knock out — every palette
   * entry within `dropTolerance` of one of these is skipped. This is how a
   * coloured (not white) background gets removed, which 'auto' cannot do
   * because it only knows about paper.
   */
  dropColors?: RGB[]
  /** RGB distance under which a palette colour counts as "the picked one" */
  dropTolerance?: number
  /**
   * Extra pixels each region is grown by. With stacked layering seams cannot
   * occur between colours, so this now only matters against the transparent
   * page and defaults to off.
   */
  seamOverlap?: number
}

// onLayer is deliberately excluded: there is no sensible DEFAULT callback, and
// forcing a no-op stub would make `opt.onLayer?.()` look optional while always
// firing. Omitting it keeps the optional chain meaningful.
const DEFAULTS: Required<Omit<TraceOptions, 'onLayer'>> = {
  colors: 'auto',
  // Small enough to keep thin ornament detail. Dropping a feature does not just
  // lose it — it leaves a HOLE that shows the page through, which reads as a
  // white outline around the shape that was kept.
  minArea: 3,
  simplify: 1,
  smooth: true,
  denoise: true,
  mode: 'color',
  threshold: 128,
  cornerDeg: 62,
  snapLines: true,
  gradients: true,
  strokes: false,
  maxStrokeWidth: 12,
  ignoreBackground: 'auto',
  dropColors: [],
  dropTolerance: 60,
  seamOverlap: 0
}

/** Rec. 709 luma, 0..1 — "is this basically paper?" */
export function luma(c: RGB): number {
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255
}

export type RGB = [number, number, number]

// ---------------------------------------------------------------- quantise

interface Box {
  /** channel values of this box's pixels, kept sorted per split */
  pixels: RGB[]
  /** within-box sum of squared error — how badly this box needs splitting */
  sse: number
}

function sseOf(pixels: RGB[]): number {
  const n = pixels.length
  if (n < 2) return 0
  let total = 0
  for (let c = 0; c < 3; c++) {
    let sum = 0
    let sum2 = 0
    for (const p of pixels) {
      sum += p[c]
      sum2 += p[c] * p[c]
    }
    total += sum2 - (sum * sum) / n
  }
  return total
}

/**
 * The split point along one channel that minimises the two halves' combined
 * variance — the 1-D optimum, found in a single pass over the sorted values.
 *
 * This is the one place a plain median cut fails the job we actually have: a
 * dark logo on a white page is a handful of pixels against thousands, so the
 * MEDIAN falls deep inside the white cluster and both halves come out grey.
 * Splitting where the variance drops instead puts ink and paper on opposite
 * sides no matter how lopsided the counts are.
 */
function bestSplit(sorted: number[]): { index: number; sse: number } {
  const n = sorted.length
  const pre = new Float64Array(n + 1)
  const pre2 = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    pre[i + 1] = pre[i] + sorted[i]
    pre2[i + 1] = pre2[i] + sorted[i] * sorted[i]
  }
  const sse = (from: number, to: number): number => {
    const m = to - from
    if (m < 2) return 0
    const sum = pre[to] - pre[from]
    return pre2[to] - pre2[from] - (sum * sum) / m
  }
  let bestIndex = -1
  let best = Infinity
  for (let i = 1; i < n; i++) {
    const v = sse(0, i) + sse(i, n)
    if (v < best) {
      best = v
      bestIndex = i
    }
  }
  return { index: bestIndex, sse: best }
}

/**
 * Deterministic palette by variance-minimising cuts (a median cut whose split
 * point is chosen by variance rather than by rank).
 *
 * Deterministic matters: k-means seeds randomly and would trace the same logo
 * differently on every run, which is unusable for a client deliverable.
 */
/**
 * The largest palette the tracer will build.
 *
 * It is a REAL limit, not a label: the quantiser splits until it has this many
 * clusters and every one of them becomes its own traced layer. Cost grows with
 * the SQUARE of it — each layer is matched against the whole palette — which
 * is why the caller lowers the raster resolution as the palette grows.
 */
export const MAX_COLORS = 200

export function buildPalette(pixels: RGB[], colors: number, auto = false): RGB[] {
  if (!pixels.length) return [[0, 0, 0]]
  const target = Math.max(1, Math.min(MAX_COLORS, Math.floor(colors)))
  let boxes: Box[] = [{ pixels, sse: sseOf(pixels) }]
  while (boxes.length < target) {
    // split whichever box carries the most error, not merely the widest range
    let worst = -1
    let worstSse = 0
    boxes.forEach((b, i) => {
      if (b.pixels.length > 1 && b.sse > worstSse) {
        worstSse = b.sse
        worst = i
      }
    })
    if (worst < 0 || worstSse <= 0) break
    // auto mode: stop once every remaining cluster is visually one colour —
    // per-pixel error under ~11 RGB units per channel (3 * 11²)
    if (auto && worstSse / boxes[worst].pixels.length < 360) break
    const box = boxes[worst]

    // Cut along the channel that SPREADS the most — picking the channel by
    // lowest split error instead would choose the least informative one (a
    // near-constant green channel splits perfectly while mixing red with blue).
    let bestChannel = 0
    let bestSpread = -1
    for (let c = 0; c < 3; c++) {
      let sum = 0
      let sum2 = 0
      for (const px of box.pixels) {
        sum += px[c]
        sum2 += px[c] * px[c]
      }
      const spread = sum2 - (sum * sum) / box.pixels.length
      if (spread > bestSpread) {
        bestSpread = spread
        bestChannel = c
      }
    }
    if (bestSpread <= 0) break
    // …then place the cut where the two halves' variance is lowest
    const bestSorted = [...box.pixels].sort((a, b) => a[bestChannel] - b[bestChannel])
    const { index: bestIndex } = bestSplit(bestSorted.map((px) => px[bestChannel]))
    if (bestIndex <= 0) break
    const left = bestSorted.slice(0, bestIndex)
    const right = bestSorted.slice(bestIndex)
    if (!left.length || !right.length) break
    boxes = boxes.filter((_, i) => i !== worst)
    boxes.push({ pixels: left, sse: sseOf(left) }, { pixels: right, sse: sseOf(right) })
  }
  return boxes.map((b) => {
    const sum: RGB = [0, 0, 0]
    for (const p of b.pixels) {
      sum[0] += p[0]
      sum[1] += p[1]
      sum[2] += p[2]
    }
    const n = Math.max(1, b.pixels.length)
    return [Math.round(sum[0] / n), Math.round(sum[1] / n), Math.round(sum[2] / n)] as RGB
  })
}

export function nearestIndex(palette: RGB[], r: number, g: number, b: number): number {
  let best = 0
  let bestD = Infinity
  for (let i = 0; i < palette.length; i++) {
    const p = palette[i]
    const dr = p[0] - r
    const dg = p[1] - g
    const db = p[2] - b
    const d = dr * dr + dg * dg + db * db
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

// ------------------------------------------------------------- simplify

/** Ramer–Douglas–Peucker on a CLOSED ring. */
export function simplifyRing(points: number[][], epsilon: number): number[][] {
  if (epsilon <= 0 || points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const dist = (p: number[], a: number[], b: number[]): number => {
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len2 = dx * dx + dy * dy
    if (!len2) return Math.hypot(p[0] - a[0], p[1] - a[1])
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
    t = Math.max(0, Math.min(1, t))
    return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t))
  }

  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [lo, hi] = stack.pop() as [number, number]
    let far = -1
    let farD = epsilon
    for (let i = lo + 1; i < hi; i++) {
      const d = dist(points[i], points[lo], points[hi])
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([lo, far], [far, hi])
    }
  }
  const out: number[][] = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out.length >= 3 ? out : points
}

/** Shoelace area — also tells inner rings from outer ones by its sign. */
export function ringArea(points: number[][]): number {
  let a = 0
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j][0] * points[i][1] - points[i][0] * points[j][1]
  }
  return a / 2
}

const fmt = (n: number): string => (Math.round(n * 100) / 100).toString()

/**
 * A ring as SVG path data.
 *
 * With smoothing off you get the polygon verbatim. With it on, the ring is cut
 * at its real CORNERS and each run between them is fitted with least-squares
 * cubics (curveFit.ts). That is the difference between a straight letter stroke
 * and a wavy one: a midpoint-quadratic scheme turns every pixel step into a
 * bump, whereas a fit averages the staircase away and still stops dead at a
 * corner because the run was split there.
 */
export function ringToPath(
  points: number[][],
  smooth: boolean,
  tolerance = 0.4,
  cornerDeg = 62,
  snapLines = true
): string {
  if (points.length < 3) return ''
  if (!smooth) {
    const head = `M${fmt(points[0][0])} ${fmt(points[0][1])}`
    const rest = points.slice(1).map((p) => `L${fmt(p[0])} ${fmt(p[1])}`).join('')
    return `${head}${rest}Z`
  }

  const raw: Pt[] = points.map((p) => [p[0], p[1]] as Pt)
  // put back the corners the grid sampling chamfered, THEN re-find them: the
  // indices shift when the chamfer points are dropped
  const ring = sharpenCorners(raw, findCorners(raw, 3, cornerDeg))
  const corners = findCorners(ring, 3, cornerDeg)
  const n = ring.length

  // runs of points between consecutive corners; no corners at all → one closed
  // run starting anywhere, which fits a blob (a dot, a rounded seal) smoothly
  const runs: Pt[][] = []
  if (corners.length < 2) {
    runs.push([...ring, ring[0]])
  } else {
    for (let i = 0; i < corners.length; i++) {
      const from = corners[i]
      const to = corners[(i + 1) % corners.length]
      const run: Pt[] = []
      for (let k = from; ; k = (k + 1) % n) {
        run.push(ring[k])
        if (k === to) break
      }
      if (run.length >= 2) runs.push(run)
    }
  }

  let d = ''
  let started = false
  for (const run of runs) {
    const curves: Cubic[] = fitCubics(run, tolerance)
    if (!curves.length) continue
    if (!started) {
      d += `M${fmt(run[0][0])} ${fmt(run[0][1])}`
      started = true
    }
    // Snap at RUN level: when every source point between two corners hugs the
    // start→end chord, the whole edge IS a line — one L replaces the curves.
    // Judging per-cubic instead would also flatten short arcs of a circle.
    if (snapLines && runIsStraight(run, Math.max(0.5, tolerance))) {
      const last = run[run.length - 1]
      d += `L${fmt(last[0])} ${fmt(last[1])}`
    } else {
      for (const c of curves) {
        d += `C${fmt(c.c1[0])} ${fmt(c.c1[1])} ${fmt(c.c2[0])} ${fmt(c.c2[1])} ${fmt(c.end[0])} ${fmt(c.end[1])}`
      }
    }
  }
  return d ? `${d}Z` : ''
}

/** True when every interior point of the run lies within eps of the chord
 * from its first to its last point — i.e. the edge is genuinely straight,
 * give or take the sampling staircase. */
function runIsStraight(run: Pt[], eps: number): boolean {
  if (run.length < 3) return true
  const a = run[0]
  const b = run[run.length - 1]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len < 2) return false // closed or near-degenerate — not a straight edge
  for (let i = 1; i < run.length - 1; i++) {
    const px = run[i][0] - a[0]
    const py = run[i][1] - a[1]
    // distance to the SEGMENT, so a hook past either endpoint fails the test
    const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (len * len)))
    const ex = px - dx * t
    const ey = py - dy * t
    if (Math.hypot(ex, ey) > eps) return false
  }
  return true
}

/**
 * A few k-means steps seeded from the cut result — deterministic (no random
 * seeding), and it slides each palette entry onto the true centre of the
 * pixels that actually chose it. This is where "close" colours become the
 * EXACT colours of the artwork.
 */
export function refinePalette(pixels: RGB[], palette: RGB[], iterations = 6): RGB[] {
  let current = palette.map((c) => [...c] as RGB)
  for (let it = 0; it < iterations; it++) {
    const sums = current.map(() => [0, 0, 0, 0])
    for (const px of pixels) {
      const k = nearestIndex(current, px[0], px[1], px[2])
      sums[k][0] += px[0]
      sums[k][1] += px[1]
      sums[k][2] += px[2]
      sums[k][3]++
    }
    let moved = false
    const next = current.map((c, k) => {
      if (!sums[k][3]) return c // an orphaned entry keeps its place
      const m: RGB = [
        Math.round(sums[k][0] / sums[k][3]),
        Math.round(sums[k][1] / sums[k][3]),
        Math.round(sums[k][2] / sums[k][3])
      ]
      if (m[0] !== c[0] || m[1] !== c[1] || m[2] !== c[2]) moved = true
      return m
    })
    current = next
    if (!moved) break
  }
  return current
}

// ------------------------------------------------------------- the tracer

const hex = (c: RGB): string =>
  `#${c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`

/** Sample at most ~50k pixels for the palette — the rescue pass then covers
 * whatever a sample this size can still miss. */
function samplePixels(data: Uint8ClampedArray, w: number, h: number): RGB[] {
  const total = w * h
  const step = Math.max(1, Math.floor(total / 50000))
  const out: RGB[] = []
  for (let i = 0; i < total; i += step) {
    const o = i * 4
    if (data[o + 3] < 128) continue // transparent pixels have no colour
    out.push([data[o], data[o + 1], data[o + 2]])
  }
  return out.length ? out : [[0, 0, 0]]
}

export function traceImage(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  options: TraceOptions = {}
): TracedPath[] {
  const opt = { ...DEFAULTS, ...options }
  // kill sensor/JPEG speckle first: a lone off-colour pixel would otherwise
  // claim its own palette slot and pepper the result with specks
  let pixels = opt.denoise && w > 2 && h > 2 ? denoiseMedian(data, w, h) : data
  // Grayscale / black-and-white are PRE-passes: collapse the colours first and
  // the whole pipeline (palette, stacking, fitting) works unchanged on the
  // reduced picture — the same shape Illustrator's Mode dropdown has.
  if (opt.mode !== 'color') {
    const mapped = new Uint8ClampedArray(pixels.length)
    mapped.set(pixels)
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      const y = 0.2126 * pixels[o] + 0.7152 * pixels[o + 1] + 0.0722 * pixels[o + 2]
      const v = opt.mode === 'bw' ? (y < opt.threshold ? 0 : 255) : Math.round(y)
      mapped[o] = v
      mapped[o + 1] = v
      mapped[o + 2] = v
    }
    pixels = mapped
  }
  const sampled = samplePixels(pixels, w, h)
  const auto = opt.colors === 'auto'
  let palette = refinePalette(
    sampled,
    buildPalette(sampled, auto ? 24 : (opt.colors as number), auto)
  )

  // RESCUE PASS over the FULL image: palette building works on a sample, so a
  // small but distinct colour (a thin red rule, one gold seal) can be missed
  // entirely — the complaint "يهمل الكثير من الألوان". Any sizable population
  // of pixels still far from every palette entry gets its own entries.
  // The rescue pass may grow the palette past what was asked for, but never
  // past the bigger of 32 and the request: 32 is what it has always used, and
  // holding that floor keeps a default trace byte-for-byte what it was before
  // the limit was raised.
  const ceiling = auto ? 32 : Math.max(32, Math.min(MAX_COLORS, opt.colors as number))
  for (let pass = 0; pass < 2 && palette.length < ceiling; pass++) {
    const missed: RGB[] = []
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      if (pixels[o + 3] < 128) continue
      const k = nearestIndex(palette, pixels[o], pixels[o + 1], pixels[o + 2])
      const c = palette[k]
      const dr = pixels[o] - c[0]
      const dg = pixels[o + 1] - c[1]
      const db = pixels[o + 2] - c[2]
      if (dr * dr + dg * dg + db * db > 44 * 44) missed.push([pixels[o], pixels[o + 1], pixels[o + 2]])
    }
    if (missed.length < Math.max(30, (w * h) / 1000)) break
    const extra = refinePalette(missed, buildPalette(missed, Math.min(6, ceiling - palette.length), true))
      // only genuinely NEW colours — a near-duplicate would split one region in two
      .filter((c) => {
        const k = nearestIndex(palette, c[0], c[1], c[2])
        const e = palette[k]
        return Math.hypot(c[0] - e[0], c[1] - e[1], c[2] - e[2]) > 28
      })
    if (!extra.length) break
    palette = [...palette, ...extra]
  }

  // One assignment pass, reused for the counts AND for each region's gradient
  // mask — recomputing nearestIndex per layer would double the cost of the
  // most expensive loop in the tracer.
  const assign = new Int16Array(w * h).fill(-1)
  const counts = new Array(palette.length).fill(0)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    if (pixels[o + 3] < 128) continue
    const k = nearestIndex(palette, pixels[o], pixels[o + 1], pixels[o + 2])
    assign[i] = k
    counts[k]++
  }

  // The most common colour is the background. Dropping it leaves a cut-out
  // logo instead of a white box that hides whatever sits behind it.
  const background = counts.indexOf(Math.max(...counts))
  const dropBackground =
    opt.ignoreBackground === true ||
    (opt.ignoreBackground === 'auto' && luma(palette[background]) > 0.92)

  /** Did the user point the eyedropper at (something very close to) this? */
  const picked = (c: RGB): boolean =>
    opt.dropColors.some((p) => {
      const dr = p[0] - c[0]
      const dg = p[1] - c[1]
      const db = p[2] - c[2]
      return Math.sqrt(dr * dr + dg * dg + db * db) <= opt.dropTolerance
    })

  // Paint order: kept colours, biggest first, so large fields form the bottom
  // of the stack. Dropped colours are OUTSIDE every layer — their pixels end up
  // painted by nothing, which is exactly what "remove this colour" means.
  const kept = palette
    .map((_, k) => k)
    .filter((k) => counts[k] > 0 && !(dropBackground && k === background) && !picked(palette[k]))
    .sort((a, b) => counts[b] - counts[a] || a - b)
  const dropped = palette.filter((_, k) => !kept.includes(k))

  const paths: TracedPath[] = []
  // One engine for the whole stack rather than a fresh scan per layer: layer i
  // is kept[i..] against kept[0..i) plus the dropped colours, and computing
  // that from scratch every time is what made a large palette quadratic.
  const stack = new StackedFields(pixels, w, h, kept.map((k) => palette[k]), dropped)
  for (let i = 0; i < kept.length; i++) {
    const field = stack.field(i)
    const loops = isoContours(field, stack.gw, stack.gh, 0.5)
    let d = ''
    for (const raw of loops) {
      if (Math.abs(ringArea(raw)) < opt.minArea) continue
      const loop = opt.seamOverlap ? offsetLoop(raw, opt.seamOverlap) : raw
      const ring = opt.smooth ? loop : simplifyRing(loop, opt.simplify)
      const seg = ringToPath(ring, opt.smooth, opt.simplify, opt.cornerDeg, opt.snapLines)
      if (seg) d += seg
    }
    const colorIndex = kept[i]
    // Centreline FIRST: a thin region traced as a stroke must not also be
    // emitted as an outline, or every line would be drawn twice.
    if (opt.strokes) {
      const own = new Uint8Array(w * h)
      let ownCount = 0
      for (let px = 0; px < w * h; px++) {
        if (assign[px] === colorIndex) {
          own[px] = 1
          ownCount++
        }
      }
      if (ownCount >= opt.minArea) {
        const cl = centerlineOf(own, w, h, opt.maxStrokeWidth)
        if (cl) {
          let sd = ''
          for (const line of cl.lines) {
            sd += centerlineToPath(line, opt.smooth, opt.simplify)
          }
          if (sd) {
            const strokePath: TracedPath = {
              d: sd,
              fill: hex(palette[colorIndex]),
              area: counts[colorIndex],
              strokeWidth: Math.max(0.25, Math.round(cl.width * 100) / 100)
            }
            paths.push(strokePath)
            if (opt.onLayer?.(i + 1, kept.length, strokePath) === false) return paths
            continue
          }
        }
      }
    }
    if (!d) {
      if (opt.onLayer?.(i + 1, kept.length, null) === false) return paths
      continue
    }
    let gradient: LinearGradient | undefined
    if (opt.gradients) {
      // fit the ramp on the pixels this layer actually SHOWS (its own colour),
      // not the whole stacked region — the layers above it are painted over
      const mask = new Uint8Array(w * h)
      for (let px = 0; px < w * h; px++) if (assign[px] === colorIndex) mask[px] = 1
      gradient = fitLinearGradient(pixels, w, h, mask) ?? undefined
    }
    const layer: TracedPath = {
      d,
      fill: hex(palette[colorIndex]),
      area: counts[colorIndex],
      ...(gradient ? { gradient } : {})
    }
    paths.push(layer)
    if (opt.onLayer?.(i + 1, kept.length, layer) === false) return paths
  }
  // NO sort: the array order IS the paint order — bottom of the stack first.
  return paths
}

/**
 * A centreline run as path data. Open runs stay open — that is the whole point
 * of centreline tracing — and smoothing goes through the same cubic fitter the
 * outlines use, so a traced pen stroke curves like a drawn one.
 */
function centerlineToPath(line: Centerline, smooth: boolean, tolerance: number): string {
  let pts = line.points
  if (pts.length < 2) return ''
  if (tolerance > 0) pts = simplifyRing(pts, tolerance)
  if (pts.length < 2) return ''
  const head = `M${fmt(pts[0][0])} ${fmt(pts[0][1])}`
  if (!smooth || pts.length < 4) {
    const rest = pts.slice(1).map((p) => `L${fmt(p[0])} ${fmt(p[1])}`).join('')
    return `${head}${rest}${line.closed ? 'Z' : ''}`
  }
  const run: Pt[] = pts.map((p) => [p[0], p[1]] as Pt)
  if (line.closed) run.push([...run[0]] as Pt)
  const curves = fitCubics(run, Math.max(0.4, tolerance))
  if (!curves.length) {
    const rest = pts.slice(1).map((p) => `L${fmt(p[0])} ${fmt(p[1])}`).join('')
    return `${head}${rest}${line.closed ? 'Z' : ''}`
  }
  let d = head
  for (const c of curves) {
    d += `C${fmt(c.c1[0])} ${fmt(c.c1[1])} ${fmt(c.c2[0])} ${fmt(c.c2[1])} ${fmt(c.end[0])} ${fmt(c.end[1])}`
  }
  return `${d}${line.closed ? 'Z' : ''}`
}

/**
 * Multiply every coordinate in a path by (kx, ky). The tracer works in source
 * PIXELS while a placed shape stores LOCAL pt, so this is what bridges them.
 * ringToPath only ever emits M/L/Q/Z, so walking the numbers in x,y pairs is
 * exact — there are no arc flags to mistake for coordinates.
 */
export function scalePathData(d: string, kx: number, ky: number): string {
  let axis = 0
  return d.replace(/[A-Za-z]|-?\d*\.?\d+/g, (tok) => {
    if (/[A-Za-z]/.test(tok)) {
      axis = 0
      return tok
    }
    const v = Number(tok) * (axis % 2 === 0 ? kx : ky)
    axis++
    return String(Math.round(v * 100) / 100)
  })
}

/** Wrap traced paths into a standalone SVG document. */
export function pathsToSvg(paths: TracedPath[], w: number, h: number): string {
  const defs = paths
    .map((p, i) =>
      p.gradient
        ? `<linearGradient id="g${i}" gradientUnits="userSpaceOnUse" ` +
          `x1="${fmt(p.gradient.x1)}" y1="${fmt(p.gradient.y1)}" ` +
          `x2="${fmt(p.gradient.x2)}" y2="${fmt(p.gradient.y2)}">` +
          `<stop offset="0" stop-color="${p.gradient.from}"/>` +
          `<stop offset="1" stop-color="${p.gradient.to}"/></linearGradient>`
        : ''
    )
    .join('')
  const body = paths
    .map((p, i) =>
      p.strokeWidth
        ? `<path fill="none" stroke="${p.fill}" stroke-width="${p.strokeWidth}" ` +
          `stroke-linecap="round" stroke-linejoin="round" d="${p.d}"/>`
        : `<path fill="${p.gradient ? `url(#g${i})` : p.fill}" fill-rule="evenodd" d="${p.d}"/>`
    )
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">` +
    `${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`
  )
}
