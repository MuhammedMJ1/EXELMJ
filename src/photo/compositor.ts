// EXELMJ Photo — the layer compositor.
//
// Blend-mode math is implemented by hand (the W3C compositing/blending
// formulas) rather than delegated to canvas globalCompositeOperation, on
// purpose: the same code path then runs identically in Node (tests,
// pixel-exact) and in the renderer (real editing), so there is exactly ONE
// definition of what "multiply" means in this app, and it is unit-testable
// without a browser — the same reasoning src/studio/layout.ts gives for
// hand-writing its flexbox subset instead of embedding an engine.
//
// Alpha compositing follows the standard (non-premultiplied) formula:
//   mixed  = (1-ab)*Cs + ab*Blend(Cb,Cs)      -- blend only where there IS a backdrop
//   Co     = as*mixed + (1-as)*Cb             -- then plain source-over
//   ao     = as + ab*(1-as)
// with the source's alpha `as` pre-multiplied by the layer's own opacity.

import type { AdjustmentLayer, BlendMode, Layer, PhotoDocument, PixelBuffer } from './model'
import { emptyPixelBuffer, opaquePixelBuffer } from './model'
import { applyAdjustment } from './adjustments'

type RGB = [number, number, number]

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function lum(c: RGB): number {
  return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
}

function clipColor(c: RGB): RGB {
  const l = lum(c)
  const n = Math.min(c[0], c[1], c[2])
  const x = Math.max(c[0], c[1], c[2])
  let [r, g, b] = c
  if (n < 0 && l !== n) {
    r = l + ((r - l) * l) / (l - n)
    g = l + ((g - l) * l) / (l - n)
    b = l + ((b - l) * l) / (l - n)
  }
  if (x > 1 && x !== l) {
    r = l + ((r - l) * (1 - l)) / (x - l)
    g = l + ((g - l) * (1 - l)) / (x - l)
    b = l + ((b - l) * (1 - l)) / (x - l)
  }
  return [r, g, b]
}

function setLum(c: RGB, l: number): RGB {
  const d = l - lum(c)
  return clipColor([c[0] + d, c[1] + d, c[2] + d])
}

function sat(c: RGB): number {
  return Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2])
}

function setSat(c: RGB, s: number): RGB {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b])
  const out: RGB = [0, 0, 0]
  const minI = idx[0]
  const midI = idx[1]
  const maxI = idx[2]
  if (c[maxI] > c[minI]) {
    out[midI] = ((c[midI] - c[minI]) * s) / (c[maxI] - c[minI])
    out[maxI] = s
  }
  out[minI] = 0
  return out
}

function hardLight(cb: number, cs: number): number {
  return cs <= 0.5 ? 2 * cs * cb : 1 - 2 * (1 - cs) * (1 - cb)
}

function softLightChannel(cb: number, cs: number): number {
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb)
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb)
  return cb + (2 * cs - 1) * (d - cb)
}

function colorDodge(cb: number, cs: number): number {
  if (cb === 0) return 0
  if (cs >= 1) return 1
  return Math.min(1, cb / (1 - cs))
}

function colorBurn(cb: number, cs: number): number {
  if (cb >= 1) return 1
  if (cs === 0) return 0
  return 1 - Math.min(1, (1 - cb) / cs)
}

function blendSeparableChannel(mode: BlendMode, cb: number, cs: number): number {
  switch (mode) {
    case 'normal':
      return cs
    case 'multiply':
      return cb * cs
    case 'screen':
      return cb + cs - cb * cs
    case 'overlay':
      return hardLight(cs, cb)
    case 'darken':
      return Math.min(cb, cs)
    case 'lighten':
      return Math.max(cb, cs)
    case 'color-dodge':
      return colorDodge(cb, cs)
    case 'color-burn':
      return colorBurn(cb, cs)
    case 'hard-light':
      return hardLight(cb, cs)
    case 'soft-light':
      return softLightChannel(cb, cs)
    case 'difference':
      return Math.abs(cb - cs)
    case 'exclusion':
      return cb + cs - 2 * cb * cs
    default:
      return cs
  }
}

const NON_SEPARABLE: ReadonlySet<BlendMode> = new Set(['hue', 'saturation', 'color', 'luminosity'])

/** Blends one RGB triple (each channel 0..1) per `mode`. */
export function blendPixel(mode: BlendMode, cb: RGB, cs: RGB): RGB {
  if (!NON_SEPARABLE.has(mode)) {
    return [blendSeparableChannel(mode, cb[0], cs[0]), blendSeparableChannel(mode, cb[1], cs[1]), blendSeparableChannel(mode, cb[2], cs[2])]
  }
  switch (mode) {
    case 'hue':
      return setLum(setSat(cs, sat(cb)), lum(cb))
    case 'saturation':
      return setLum(setSat(cb, sat(cs)), lum(cb))
    case 'color':
      return setLum(cs, lum(cb))
    case 'luminosity':
      return setLum(cb, lum(cs))
    default:
      return cs
  }
}

/** Composites `source` onto `backdrop` IN PLACE, at `source`'s (srcX,srcY)
 * offset in backdrop's coordinate space. Pixels outside the backdrop are
 * dropped; pixels outside the source contribute nothing (backdrop unchanged). */
export function compositeOnto(backdrop: PixelBuffer, source: PixelBuffer, srcX: number, srcY: number, opacity: number, mode: BlendMode): void {
  const op = clamp01(opacity)
  if (op <= 0) return
  const x0 = Math.max(0, srcX)
  const y0 = Math.max(0, srcY)
  const x1 = Math.min(backdrop.width, srcX + source.width)
  const y1 = Math.min(backdrop.height, srcY + source.height)
  for (let by = y0; by < y1; by++) {
    const sy = by - srcY
    for (let bx = x0; bx < x1; bx++) {
      const sx = bx - srcX
      const sIdx = (sy * source.width + sx) * 4
      const as = (source.data[sIdx + 3] / 255) * op
      if (as <= 0) continue
      const bIdx = (by * backdrop.width + bx) * 4
      const ab = backdrop.data[bIdx + 3] / 255
      const cs: RGB = [source.data[sIdx] / 255, source.data[sIdx + 1] / 255, source.data[sIdx + 2] / 255]
      const cb: RGB = [backdrop.data[bIdx] / 255, backdrop.data[bIdx + 1] / 255, backdrop.data[bIdx + 2] / 255]
      const blended = mode === 'normal' ? cs : blendPixel(mode, cb, cs)
      const ao = as + ab * (1 - as)
      for (let ch = 0; ch < 3; ch++) {
        const mixed = (1 - ab) * cs[ch] + ab * blended[ch]
        const co = as * mixed + (1 - as) * cb[ch]
        backdrop.data[bIdx + ch] = Math.round(clamp01(ao > 0 ? co / ao : 0) * 255)
      }
      backdrop.data[bIdx + 3] = Math.round(clamp01(ao) * 255)
    }
  }
}

/** Full, non-incremental composite of every visible layer onto a fresh,
 * fully-transparent canvas the size of the document. An adjustment layer is
 * applied to the accumulated result in place, so it visually affects every
 * layer below it — the same scoping an ungrouped Photoshop adjustment layer has. */
export function compositeLayers(doc: PhotoDocument): PixelBuffer {
  const out = emptyPixelBuffer(doc.width, doc.height)
  for (const layer of doc.layers) {
    if (!layer.visible) continue
    if (layer.kind === 'raster') {
      compositeOnto(out, layer.pixels, layer.x, layer.y, layer.opacity, layer.blendMode)
    } else {
      applyAdjustment(out, (layer as AdjustmentLayer).adjustment, (layer as AdjustmentLayer).params, layer.opacity)
    }
  }
  return out
}

/** Incremental compositor for requirement 5 of the raster brief: changing
 * one layer must not re-composite the layers untouched below it. Keeps one
 * cached snapshot PER STACK POSITION (the running composite up to and
 * including that layer); a re-render from a known-dirty index reuses every
 * snapshot below it and only recomputes from there up. */
export class IncrementalCompositor {
  private snapshots: PixelBuffer[] = []
  private layerVersions: string[] = []
  private docSize = { width: 0, height: 0 }
  private _lastCount = 0

  /** Cheap version fingerprint: identity + a few scalar fields. Pixel
   * mutations must go through a NEW pixel buffer object (model.ts always
   * returns new PhotoDocuments) for this to notice the change. */
  private fingerprint(layer: Layer): string {
    const base = `${layer.id}|${layer.visible ? 1 : 0}|${layer.opacity}|${layer.blendMode}|${layer.x}|${layer.y}`
    if (layer.kind === 'raster') return `${base}|px:${objectTag(layer.pixels)}`
    return `${base}|${JSON.stringify(layer.params)}`
  }

  composite(doc: PhotoDocument): PixelBuffer {
    if (doc.width !== this.docSize.width || doc.height !== this.docSize.height) {
      this.snapshots = []
      this.layerVersions = []
      this.docSize = { width: doc.width, height: doc.height }
    }
    let firstDirty = doc.layers.length
    for (let i = 0; i < doc.layers.length; i++) {
      const fp = this.fingerprint(doc.layers[i])
      if (this.layerVersions[i] !== fp) {
        firstDirty = i
        break
      }
    }
    // Layer count shrank: everything from the new tail is "dirty" by definition.
    if (doc.layers.length < this.layerVersions.length) firstDirty = Math.min(firstDirty, doc.layers.length)

    let running = firstDirty === 0 || !this.snapshots[firstDirty - 1] ? emptyPixelBuffer(doc.width, doc.height) : clone(this.snapshots[firstDirty - 1])

    const nextSnapshots = this.snapshots.slice(0, firstDirty)
    const nextVersions = this.layerVersions.slice(0, firstDirty)
    for (let i = firstDirty; i < doc.layers.length; i++) {
      const layer = doc.layers[i]
      if (layer.visible) {
        if (layer.kind === 'raster') compositeOnto(running, layer.pixels, layer.x, layer.y, layer.opacity, layer.blendMode)
        else applyAdjustment(running, layer.adjustment, layer.params, layer.opacity)
      }
      nextSnapshots[i] = clone(running)
      nextVersions[i] = this.fingerprint(layer)
    }
    this.snapshots = nextSnapshots
    this.layerVersions = nextVersions
    this._lastCount = Math.max(0, doc.layers.length - firstDirty)
    return doc.layers.length ? clone(this.snapshots[doc.layers.length - 1]) : opaquePixelBuffer(doc.width, doc.height, [255, 255, 255])
  }

  /** How many layers were actually recomposited on the last call — test hook. */
  get lastRecomputeCount(): number {
    return this._lastCount
  }
}

function clone(buf: PixelBuffer): PixelBuffer {
  return { width: buf.width, height: buf.height, data: buf.data.slice() }
}

// Pixel buffers don't carry a version stamp of their own; identity-compare
// via a WeakMap-backed tag so two structurally-equal-but-distinct buffers
// (i.e. any edit, which always allocates a new Uint8ClampedArray) count as
// different without hashing the whole buffer on every frame.
const tags = new WeakMap<Uint8ClampedArray, number>()
let nextTag = 1
function objectTag(buf: PixelBuffer): number {
  let tag = tags.get(buf.data)
  if (tag === undefined) {
    tag = nextTag++
    tags.set(buf.data, tag)
  }
  return tag
}
