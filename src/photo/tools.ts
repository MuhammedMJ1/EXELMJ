// EXELMJ Photo — pixel-level tool logic. Every function is pure (takes a
// PixelBuffer/mask, returns a new or mutated one) so brush stamping and
// selection-shape math are unit-testable without a canvas; photoApp.ts only
// turns pointer events into the point lists these functions consume.

import type { PixelBuffer } from './model'
import { emptyPixelBuffer } from './model'

export interface BrushPoint {
  x: number
  y: number
  /** 0..1, defaults to 1 for a mouse (no pressure sensor). */
  pressure?: number
}

export interface BrushOptions {
  size: number
  /** 0 = soft feathered edge, 1 = hard edge. */
  hardness: number
  color: [number, number, number, number]
  erase: boolean
  /** Fraction of the brush diameter between stamps — smaller = smoother, slower. */
  spacing?: number
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** Stamps one soft circular dab centred at (cx,cy) into `buf`, alpha-blending
 * (or erasing) rather than overwriting, so overlapping dabs in one stroke
 * build up density the way a real brush does. */
export function stampBrush(buf: PixelBuffer, cx: number, cy: number, opts: BrushOptions, pressure = 1): void {
  const radius = Math.max(0.5, (opts.size * Math.max(0.05, pressure)) / 2)
  const hardness = Math.min(1, Math.max(0, opts.hardness))
  const x0 = Math.max(0, Math.floor(cx - radius - 1))
  const x1 = Math.min(buf.width - 1, Math.ceil(cx + radius + 1))
  const y0 = Math.max(0, Math.floor(cy - radius - 1))
  const y1 = Math.min(buf.height - 1, Math.ceil(cy + radius + 1))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > radius) continue
      const edge = radius * (1 - hardness)
      let coverage = 1
      if (edge > 0.001 && dist > radius - edge) coverage = Math.max(0, (radius - dist) / edge)
      const idx = (y * buf.width + x) * 4
      if (opts.erase) {
        const a0 = buf.data[idx + 3]
        buf.data[idx + 3] = clamp255(a0 * (1 - coverage))
        continue
      }
      const as = coverage * (opts.color[3] / 255)
      if (as <= 0) continue
      const ab = buf.data[idx + 3] / 255
      const ao = as + ab * (1 - as)
      for (let ch = 0; ch < 3; ch++) {
        const co = as * opts.color[ch] + (1 - as) * buf.data[idx + ch]
        buf.data[idx + ch] = clamp255(ao > 0 ? co / ao : 0)
      }
      buf.data[idx + 3] = clamp255(ao * 255)
    }
  }
}

/** Rasterizes a whole stroke by resampling the point path at `spacing *
 * radius` intervals and stamping along it — otherwise a fast pointer move
 * leaves visible gaps between dabs. */
export function paintBrushStroke(buf: PixelBuffer, points: BrushPoint[], opts: BrushOptions): void {
  if (points.length === 0) return
  const spacing = Math.max(0.05, opts.spacing ?? 0.25)
  const step = Math.max(1, opts.size * spacing)
  stampBrush(buf, points[0].x, points[0].y, opts, points[0].pressure ?? 1)
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    const steps = Math.max(1, Math.floor(dist / step))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const pressure = (a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t
      stampBrush(buf, a.x + dx * t, a.y + dy * t, opts, pressure)
    }
  }
}

/** An 8-bit coverage mask the same size as the document — 255 = fully
 * selected, 0 = not selected. Feeds gradient fills, crop, and (later) copy. */
export interface SelectionMask {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function emptyMask(width: number, height: number): SelectionMask {
  return { width, height, data: new Uint8ClampedArray(width * height) }
}

export function rectSelection(width: number, height: number, rect: { x: number; y: number; width: number; height: number }): SelectionMask {
  const mask = emptyMask(width, height)
  const x0 = Math.max(0, Math.round(rect.x))
  const y0 = Math.max(0, Math.round(rect.y))
  const x1 = Math.min(width, Math.round(rect.x + rect.width))
  const y1 = Math.min(height, Math.round(rect.y + rect.height))
  for (let y = y0; y < y1; y++) {
    const row = y * width
    for (let x = x0; x < x1; x++) mask.data[row + x] = 255
  }
  return mask
}

export function ellipseSelection(width: number, height: number, rect: { x: number; y: number; width: number; height: number }): SelectionMask {
  const mask = emptyMask(width, height)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const rx = Math.max(0.5, rect.width / 2)
  const ry = Math.max(0.5, rect.height / 2)
  const x0 = Math.max(0, Math.floor(rect.x))
  const y0 = Math.max(0, Math.floor(rect.y))
  const x1 = Math.min(width, Math.ceil(rect.x + rect.width))
  const y1 = Math.min(height, Math.ceil(rect.y + rect.height))
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const nx = (x + 0.5 - cx) / rx
      const ny = (y + 0.5 - cy) / ry
      if (nx * nx + ny * ny <= 1) mask.data[y * width + x] = 255
    }
  }
  return mask
}

/** Point-in-polygon (even-odd rule) rasterization for the lasso tool. */
export function lassoSelection(width: number, height: number, points: { x: number; y: number }[]): SelectionMask {
  const mask = emptyMask(width, height)
  if (points.length < 3) return mask
  let minY = height
  let maxY = 0
  for (const p of points) {
    minY = Math.min(minY, Math.floor(p.y))
    maxY = Math.max(maxY, Math.ceil(p.y))
  }
  minY = Math.max(0, minY)
  maxY = Math.min(height - 1, maxY)
  for (let y = minY; y <= maxY; y++) {
    const yc = y + 0.5
    const xs: number[] = []
    for (let i = 0; i < points.length; i++) {
      const a = points[i]
      const b = points[(i + 1) % points.length]
      if (a.y === b.y) continue
      if (yc < Math.min(a.y, b.y) || yc >= Math.max(a.y, b.y)) continue
      const t = (yc - a.y) / (b.y - a.y)
      xs.push(a.x + t * (b.x - a.x))
    }
    xs.sort((a, b) => a - b)
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const x0 = Math.max(0, Math.round(xs[i]))
      const x1 = Math.min(width, Math.round(xs[i + 1]))
      for (let x = x0; x < x1; x++) mask.data[y * width + x] = 255
    }
  }
  return mask
}

export function sampleColor(buf: PixelBuffer, x: number, y: number): [number, number, number, number] | null {
  const px = Math.round(x)
  const py = Math.round(y)
  if (px < 0 || py < 0 || px >= buf.width || py >= buf.height) return null
  const idx = (py * buf.width + px) * 4
  return [buf.data[idx], buf.data[idx + 1], buf.data[idx + 2], buf.data[idx + 3]]
}

export interface GradientStop {
  offset: number // 0..1
  color: [number, number, number, number]
}

function colorAtStop(stops: GradientStop[], t: number): [number, number, number, number] {
  const sorted = stops.slice().sort((a, b) => a.offset - b.offset)
  if (t <= sorted[0].offset) return sorted[0].color
  if (t >= sorted[sorted.length - 1].offset) return sorted[sorted.length - 1].color
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (t >= a.offset && t <= b.offset) {
      const local = b.offset === a.offset ? 0 : (t - a.offset) / (b.offset - a.offset)
      return [
        a.color[0] + (b.color[0] - a.color[0]) * local,
        a.color[1] + (b.color[1] - a.color[1]) * local,
        a.color[2] + (b.color[2] - a.color[2]) * local,
        a.color[3] + (b.color[3] - a.color[3]) * local
      ]
    }
  }
  return sorted[sorted.length - 1].color
}

/** Paints a linear gradient into `buf`, optionally restricted by `mask`
 * (SelectionMask coverage multiplies the painted alpha at each pixel). */
export function paintLinearGradient(buf: PixelBuffer, from: { x: number; y: number }, to: { x: number; y: number }, stops: GradientStop[], mask?: SelectionMask): void {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lenSq = dx * dx + dy * dy || 1
  for (let y = 0; y < buf.height; y++) {
    for (let x = 0; x < buf.width; x++) {
      const coverage = mask ? mask.data[y * buf.width + x] / 255 : 1
      if (coverage <= 0) continue
      const t = Math.max(0, Math.min(1, ((x + 0.5 - from.x) * dx + (y + 0.5 - from.y) * dy) / lenSq))
      const color = colorAtStop(stops, t)
      const idx = (y * buf.width + x) * 4
      const as = coverage * (color[3] / 255)
      if (as <= 0) continue
      const ab = buf.data[idx + 3] / 255
      const ao = as + ab * (1 - as)
      for (let ch = 0; ch < 3; ch++) {
        const co = as * color[ch] + (1 - as) * buf.data[idx + ch]
        buf.data[idx + ch] = clamp255(ao > 0 ? co / ao : 0)
      }
      buf.data[idx + 3] = clamp255(ao * 255)
    }
  }
}

/** Fresh transparent buffer masked by `mask` from an existing buffer —
 * used by "move" to lift the selected pixels off a layer. */
export function extractMasked(buf: PixelBuffer, mask: SelectionMask): PixelBuffer {
  const out = emptyPixelBuffer(buf.width, buf.height)
  for (let i = 0, p = 0; i < mask.data.length; i++, p += 4) {
    const coverage = mask.data[i] / 255
    if (coverage <= 0) continue
    out.data[p] = buf.data[p]
    out.data[p + 1] = buf.data[p + 1]
    out.data[p + 2] = buf.data[p + 2]
    out.data[p + 3] = clamp255(buf.data[p + 3] * coverage)
  }
  return out
}
