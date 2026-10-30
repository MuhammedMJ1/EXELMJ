// Cover patches that DISAPPEAR into the artwork.
//
// A flat median-colored rectangle is invisible on a solid background and
// glaringly obvious on a gradient one (the manager's real files are gradient
// posters — "يصبح واضح انك وضعت شيء فوق الصورة"). So instead of one color we
// RECONSTRUCT the background across the covered area:
//
//   for every interior pixel, blend the horizontal interpolation between the
//   ring pixels on its row with the vertical interpolation between the ring
//   pixels on its column.
//
// That reproduces a linear gradient in ANY direction almost exactly (each
// interpolation is already correct along its own axis), stays smooth across
// two-tone blends, and degrades to the plain average on a solid area — while
// costing one getImageData + a per-pixel loop.
//
// Nothing here can recover what was hidden UNDER the glyphs (that information
// is not in the file); it recovers the surrounding background, which is what
// makes the replacement invisible.

export interface CoverPatch {
  /** flat fallback color, always present (used by old sidecars + tiny rects) */
  bg: string
  /** PNG data URL reconstructing the background; absent when a flat fill suffices */
  img?: string
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MAX_PATCH_PX = 1400 // bound the data URL for the sidecar
const FLAT_SPREAD = 12 // ring variation below this means a solid background
const SMOOTH_WINDOW = 7 // median window over each ring strip

export type RGB = [number, number, number]

/** The four strips of background pixels surrounding a covered rect. */
export interface Ring {
  top: RGB[]
  bottom: RGB[]
  left: RGB[]
  right: RGB[]
}

/** One row/column of pixels as RGB triples. */
function stripToRgb(d: Uint8ClampedArray, n: number): RGB[] {
  const out: RGB[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]]
  return out
}

/**
 * Median-filter a strip.
 *
 * The ring runs 2px outside the covered rect, so on tightly-leaded artwork it
 * can clip the NEIGHBOURING line of text; those few dark pixels would smear
 * streaks across the whole reconstruction. A median is edge-preserving: it
 * deletes thin glyph spikes, leaves a real color boundary (a banner edge)
 * standing, and barely touches a smooth gradient.
 */
export function medianSmooth(s: RGB[]): RGB[] {
  const n = s.length
  const win = Math.min(SMOOTH_WINDOW, n % 2 === 0 ? n - 1 : n)
  if (win < 3) return s
  const half = (win - 1) / 2
  const out: RGB[] = new Array(n)
  const bucket: number[] = new Array(win)
  for (let i = 0; i < n; i++) {
    const px: RGB = [0, 0, 0]
    for (let c = 0; c < 3; c++) {
      for (let k = 0; k < win; k++) {
        bucket[k] = s[Math.min(n - 1, Math.max(0, i - half + k))][c]
      }
      bucket.sort((a, b) => a - b)
      px[c] = bucket[half]
    }
    out[i] = px
  }
  return out
}

const midpoint = (a: RGB, b: RGB): RGB => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]

/**
 * The Coons surface interpolating the ring — pure math, no canvas, so it is
 * unit-tested directly.
 *
 * Every pixel = horizontal interpolation between the left/right strips on its
 * row + vertical interpolation between the top/bottom strips on its column −
 * the bilinear corner term (which cancels the corner energy both
 * interpolations count twice). A linear gradient in ANY direction comes back
 * out exactly; a smooth blend stays smooth; a solid area stays solid.
 *
 * @returns RGBA bytes, pw*ph*4, fully opaque
 */
export function coonsSurface(ring: Ring, pw: number, ph: number): Uint8ClampedArray {
  const { top, bottom, left, right } = ring
  const w = top.length
  const h = left.length
  const corners = {
    tl: midpoint(top[0], left[0]),
    tr: midpoint(top[w - 1], right[0]),
    bl: midpoint(bottom[0], left[h - 1]),
    br: midpoint(bottom[w - 1], right[h - 1])
  }
  const out = new Uint8ClampedArray(pw * ph * 4)
  for (let py = 0; py < ph; py++) {
    const sy = Math.min(h - 1, Math.floor((py / ph) * h))
    const fy = ph > 1 ? py / (ph - 1) : 0
    const l = left[sy]
    const r = right[sy]
    for (let px = 0; px < pw; px++) {
      const sx = Math.min(w - 1, Math.floor((px / pw) * w))
      const fx = pw > 1 ? px / (pw - 1) : 0
      const tcol = top[sx]
      const bcol = bottom[sx]
      const o = (py * pw + px) * 4
      for (let c = 0; c < 3; c++) {
        const horiz = l[c] * (1 - fx) + r[c] * fx
        const vert = tcol[c] * (1 - fy) + bcol[c] * fy
        const cornerTerm =
          corners.tl[c] * (1 - fx) * (1 - fy) +
          corners.tr[c] * fx * (1 - fy) +
          corners.bl[c] * (1 - fx) * fy +
          corners.br[c] * fx * fy
        out[o + c] = Math.round(Math.min(255, Math.max(0, horiz + vert - cornerTerm)))
      }
      out[o + 3] = 255
    }
  }
  return out
}

/**
 * Rebuild what the background looks like across `rect`.
 *
 * @param canvas the rendered artwork (any scale)
 * @param rect   the area to cover, in CANVAS pixels
 * @returns the flat fallback color, plus a patch canvas when the area is not uniform
 */
export function reconstructBackground(
  canvas: HTMLCanvasElement,
  rect: Rect
): { bg: string; patch: HTMLCanvasElement | null } {
  const flat = { bg: '#ffffff', patch: null }
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return flat
    const x0 = Math.max(0, Math.floor(rect.x))
    const y0 = Math.max(0, Math.floor(rect.y))
    const w = Math.min(canvas.width - x0, Math.ceil(rect.w))
    const h = Math.min(canvas.height - y0, Math.ceil(rect.h))
    if (w < 2 || h < 2) return flat

    // Ring samples are taken OUTSIDE the rect (2px out) so the glyph's own
    // antialiased fringe never leaks into the reconstruction. One strip read
    // per side beats w*h single-pixel reads.
    const pad = 2
    const top = medianSmooth(stripToRgb(ctx.getImageData(x0, Math.max(0, y0 - pad), w, 1).data, w))
    const bottom = medianSmooth(
      stripToRgb(ctx.getImageData(x0, Math.min(canvas.height - 1, y0 + h + pad), w, 1).data, w)
    )
    const left = medianSmooth(stripToRgb(ctx.getImageData(Math.max(0, x0 - pad), y0, 1, h).data, h))
    const right = medianSmooth(
      stripToRgb(ctx.getImageData(Math.min(canvas.width - 1, x0 + w + pad), y0, 1, h).data, h)
    )

    // flat-vs-gradient decision from the ring's spread
    const samples: RGB[] = []
    for (let i = 0; i < w; i += Math.max(1, Math.floor(w / 12))) {
      samples.push(top[i], bottom[i])
    }
    for (let j = 0; j < h; j += Math.max(1, Math.floor(h / 12))) {
      samples.push(left[j], right[j])
    }
    const mean = [0, 0, 0]
    for (const s of samples) {
      mean[0] += s[0]
      mean[1] += s[1]
      mean[2] += s[2]
    }
    mean[0] /= samples.length
    mean[1] /= samples.length
    mean[2] /= samples.length
    let spread = 0
    for (const s of samples) {
      spread = Math.max(
        spread,
        Math.abs(s[0] - mean[0]) + Math.abs(s[1] - mean[1]) + Math.abs(s[2] - mean[2])
      )
    }
    const hex = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
    const bg = `#${hex(mean[0])}${hex(mean[1])}${hex(mean[2])}`
    // a nearly-uniform ring means a solid background — the flat fill is exact
    // and keeps the sidecar tiny
    if (spread <= FLAT_SPREAD) return { bg, patch: null }

    // --- reconstruct ---
    const scale = Math.min(1, MAX_PATCH_PX / Math.max(w, h))
    const pw = Math.max(2, Math.round(w * scale))
    const ph = Math.max(2, Math.round(h * scale))
    const patch = document.createElement('canvas')
    patch.width = pw
    patch.height = ph
    const pctx = patch.getContext('2d')
    if (!pctx) return { bg, patch: null }
    const img = pctx.createImageData(pw, ph)
    img.data.set(coonsSurface({ top, bottom, left, right }, pw, ph))
    pctx.putImageData(img, 0, 0)
    return { bg, patch }
  } catch {
    return flat
  }
}

/** The reconstruction as a storable PNG — this is what the sidecar keeps. */
export function buildCoverPatch(canvas: HTMLCanvasElement, rect: Rect): CoverPatch {
  const { bg, patch } = reconstructBackground(canvas, rect)
  if (!patch) return { bg }
  try {
    return { bg, img: patch.toDataURL('image/png') }
  } catch {
    return { bg }
  }
}

/**
 * Erase `rect` on a canvas we are about to export, rebuilding the background
 * in place. Used for the runs the AI→Word converter wipes, which have no
 * stored patch of their own.
 */
export function wipeRect(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, rect: Rect) {
  const { bg, patch } = reconstructBackground(canvas, rect)
  if (patch) {
    ctx.drawImage(patch, rect.x, rect.y, rect.w, rect.h)
    return
  }
  ctx.fillStyle = bg
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
}
