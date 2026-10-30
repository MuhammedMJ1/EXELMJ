// EXELMJ Photo — the layered raster document model.
//
// Pure data + pure functions only: no DOM, no canvas, so this is fully
// unit-testable in Node (tests/photoModel.test.ts) exactly like
// src/design/shapes.ts is. The compositor (./compositor.ts) turns this into
// pixels; photoApp.ts is the only place that touches the DOM.
//
// Every edit that reaches a document goes through one of the functions below
// and returns a NEW PhotoDocument — never mutates the one it was given. That
// is what lets history.ts build undo/redo out of plain apply/invert pairs.

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'

export const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity'
]

export type AdjustmentKind = 'brightness-contrast' | 'hue-saturation' | 'levels' | 'black-white'

export interface AdjustmentParamsMap {
  'brightness-contrast': { brightness: number; contrast: number }
  'hue-saturation': { hue: number; saturation: number; lightness: number }
  levels: { inBlack: number; inWhite: number; gamma: number; outBlack: number; outWhite: number }
  'black-white': { strength: number }
}

export function defaultAdjustmentParams<K extends AdjustmentKind>(kind: K): AdjustmentParamsMap[K] {
  const table: AdjustmentParamsMap = {
    'brightness-contrast': { brightness: 0, contrast: 0 },
    'hue-saturation': { hue: 0, saturation: 0, lightness: 0 },
    levels: { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 },
    'black-white': { strength: 1 }
  }
  return table[kind]
}

/** Non-premultiplied RGBA, row-major, top-left origin — the same layout
 * ImageData uses, so photoApp.ts can hand this straight to putImageData. */
export interface PixelBuffer {
  width: number
  height: number
  data: Uint8ClampedArray
}

export function emptyPixelBuffer(width: number, height: number): PixelBuffer {
  return { width: Math.max(1, width | 0), height: Math.max(1, height | 0), data: new Uint8ClampedArray(Math.max(1, width | 0) * Math.max(1, height | 0) * 4) }
}

export function opaquePixelBuffer(width: number, height: number, rgb: [number, number, number] = [255, 255, 255]): PixelBuffer {
  const buf = emptyPixelBuffer(width, height)
  for (let i = 0; i < buf.data.length; i += 4) {
    buf.data[i] = rgb[0]
    buf.data[i + 1] = rgb[1]
    buf.data[i + 2] = rgb[2]
    buf.data[i + 3] = 255
  }
  return buf
}

export function clonePixelBuffer(buf: PixelBuffer): PixelBuffer {
  return { width: buf.width, height: buf.height, data: buf.data.slice() }
}

interface LayerBase {
  id: string
  name: string
  /** 0..1 */
  opacity: number
  blendMode: BlendMode
  visible: boolean
  locked: boolean
  /** Top-left of the layer's pixel buffer, in document pixels. */
  x: number
  y: number
}

export interface RasterLayer extends LayerBase {
  kind: 'raster'
  pixels: PixelBuffer
}

/** Affects the flattened result of every layer BELOW it in the stack —
 * the same scoping Photoshop uses for an ungrouped adjustment layer. */
export interface AdjustmentLayer extends LayerBase {
  kind: 'adjustment'
  adjustment: AdjustmentKind
  params: AdjustmentParamsMap[AdjustmentKind]
}

export type Layer = RasterLayer | AdjustmentLayer

export interface PhotoDocument {
  width: number
  height: number
  /** Dots per inch, carried for export sizing only — v1 renders at 1 doc px = 1 CSS px. */
  dpi: number
  /** Bottom to top: layers[0] paints first, layers[length-1] paints last (on top). */
  layers: Layer[]
  activeLayerId: string | null
}

let idCounter = 0
export function newLayerId(prefix = 'layer'): string {
  idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${(idCounter % 0xffff).toString(36)}`
}

export function createPhotoDocument(width: number, height: number, dpi = 72, backgroundName = 'Background'): PhotoDocument {
  const layer: RasterLayer = {
    id: newLayerId('bg'),
    kind: 'raster',
    name: backgroundName,
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    pixels: opaquePixelBuffer(width, height, [255, 255, 255])
  }
  return { width: Math.max(1, width | 0), height: Math.max(1, height | 0), dpi, layers: [layer], activeLayerId: layer.id }
}

export function createEmptyLayer(doc: PhotoDocument, name: string): RasterLayer {
  return {
    id: newLayerId('layer'),
    kind: 'raster',
    name,
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    pixels: emptyPixelBuffer(doc.width, doc.height)
  }
}

export function createAdjustmentLayer(name: string, adjustment: AdjustmentKind): AdjustmentLayer {
  return {
    id: newLayerId('adj'),
    kind: 'adjustment',
    name,
    opacity: 1,
    blendMode: 'normal',
    visible: true,
    locked: false,
    x: 0,
    y: 0,
    adjustment,
    params: defaultAdjustmentParams(adjustment)
  }
}

export function findLayerIndex(doc: PhotoDocument, id: string): number {
  return doc.layers.findIndex((l) => l.id === id)
}

export function getLayer(doc: PhotoDocument, id: string | null): Layer | null {
  if (!id) return null
  return doc.layers.find((l) => l.id === id) ?? null
}

function withLayers(doc: PhotoDocument, layers: Layer[], activeLayerId?: string | null): PhotoDocument {
  return { ...doc, layers, activeLayerId: activeLayerId === undefined ? doc.activeLayerId : activeLayerId }
}

export function addLayer(doc: PhotoDocument, layer: Layer, atIndex?: number): PhotoDocument {
  const layers = doc.layers.slice()
  const idx = atIndex === undefined ? layers.length : Math.max(0, Math.min(atIndex, layers.length))
  layers.splice(idx, 0, layer)
  return withLayers(doc, layers, layer.id)
}

export function removeLayer(doc: PhotoDocument, id: string): PhotoDocument {
  const idx = findLayerIndex(doc, id)
  if (idx === -1) return doc
  const layers = doc.layers.slice()
  layers.splice(idx, 1)
  const activeLayerId = doc.activeLayerId === id ? (layers[Math.min(idx, layers.length - 1)]?.id ?? null) : doc.activeLayerId
  return withLayers(doc, layers, activeLayerId)
}

/** toIndex is measured in the array AFTER the layer is pulled out — the same
 * contract Array.prototype.splice's insertion index has. */
export function reorderLayer(doc: PhotoDocument, id: string, toIndex: number): PhotoDocument {
  const layers = doc.layers.slice()
  const from = layers.findIndex((l) => l.id === id)
  if (from === -1) return doc
  const [layer] = layers.splice(from, 1)
  const clamped = Math.max(0, Math.min(toIndex, layers.length))
  layers.splice(clamped, 0, layer)
  return withLayers(doc, layers)
}

export function updateLayer(doc: PhotoDocument, id: string, patch: Partial<RasterLayer> | Partial<AdjustmentLayer>): PhotoDocument {
  const layers = doc.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l))
  return withLayers(doc, layers)
}

export function cloneDocument(doc: PhotoDocument): PhotoDocument {
  return {
    ...doc,
    layers: doc.layers.map((l) => (l.kind === 'raster' ? { ...l, pixels: clonePixelBuffer(l.pixels) } : { ...l, params: { ...l.params } }))
  }
}

/** Crops every raster layer's buffer to `rect` (document-space, pre-clamped
 * to the document bounds) and repositions layers so nothing shifts on screen. */
export function cropDocument(doc: PhotoDocument, rect: { x: number; y: number; width: number; height: number }): PhotoDocument {
  const rx = Math.max(0, Math.round(rect.x))
  const ry = Math.max(0, Math.round(rect.y))
  const rw = Math.max(1, Math.min(Math.round(rect.width), doc.width - rx))
  const rh = Math.max(1, Math.min(Math.round(rect.height), doc.height - ry))
  const layers = doc.layers.map((l): Layer => {
    if (l.kind !== 'raster') return { ...l, x: l.x - rx, y: l.y - ry }
    const out = emptyPixelBuffer(rw, rh)
    for (let y = 0; y < rh; y++) {
      const srcY = y + ry - l.y
      if (srcY < 0 || srcY >= l.pixels.height) continue
      for (let x = 0; x < rw; x++) {
        const srcX = x + rx - l.x
        if (srcX < 0 || srcX >= l.pixels.width) continue
        const si = (srcY * l.pixels.width + srcX) * 4
        const di = (y * rw + x) * 4
        out.data[di] = l.pixels.data[si]
        out.data[di + 1] = l.pixels.data[si + 1]
        out.data[di + 2] = l.pixels.data[si + 2]
        out.data[di + 3] = l.pixels.data[si + 3]
      }
    }
    return { ...l, x: 0, y: 0, pixels: out }
  })
  return { ...doc, width: rw, height: rh, layers }
}
