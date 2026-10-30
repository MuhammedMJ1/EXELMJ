// EXELMJ Photo — file IO.
//
// Two halves, deliberately kept apart:
//  - manifest building/parsing is PURE (no DOM), so it is unit-tested in
//    tests/photoModel.test.ts the same way src/design/overlayModel.ts's
//    serializeProject/parseProject are.
//  - PNG/JPEG encode/decode needs a real <canvas>, so it only runs inside
//    the Electron renderer (photoApp.ts) and is verified by hand there —
//    same split src/design/designApp.ts draws between shapes.ts (pure) and
//    its own canvas painting.
//
// Native container: a zip (via the same `jszip` dependency xlsx/zipUtils.ts
// already uses) holding `manifest.json` plus one PNG per raster layer —
// OpenRaster's idea, scaled down. Extension: `.exelmjphoto`.

import JSZip from 'jszip'
import type { AdjustmentKind, AdjustmentParamsMap, BlendMode, Layer, PhotoDocument, PixelBuffer, RasterLayer } from './model'
import { createPhotoDocument, emptyPixelBuffer, newLayerId } from './model'

export const PHOTO_MANIFEST_VERSION = 1

interface ManifestLayerCommon {
  id: string
  name: string
  opacity: number
  blendMode: BlendMode
  visible: boolean
  locked: boolean
  x: number
  y: number
}

interface ManifestRasterLayer extends ManifestLayerCommon {
  kind: 'raster'
  file: string
}

interface ManifestAdjustmentLayer extends ManifestLayerCommon {
  kind: 'adjustment'
  adjustment: AdjustmentKind
  params: AdjustmentParamsMap[AdjustmentKind]
}

export type ManifestLayer = ManifestRasterLayer | ManifestAdjustmentLayer

export interface PhotoManifest {
  version: number
  width: number
  height: number
  dpi: number
  activeLayerId: string | null
  layers: ManifestLayer[]
}

/** `layer-<2-digit index>-<id>.png` — the index keeps the zip listing in
 * paint order even though a zip's own file order is not guaranteed. */
export function layerFileName(index: number, id: string): string {
  return `layer-${String(index).padStart(2, '0')}-${id}.png`
}

export function buildManifest(doc: PhotoDocument): PhotoManifest {
  return {
    version: PHOTO_MANIFEST_VERSION,
    width: doc.width,
    height: doc.height,
    dpi: doc.dpi,
    activeLayerId: doc.activeLayerId,
    layers: doc.layers.map((l, i): ManifestLayer => {
      const common: ManifestLayerCommon = { id: l.id, name: l.name, opacity: l.opacity, blendMode: l.blendMode, visible: l.visible, locked: l.locked, x: l.x, y: l.y }
      if (l.kind === 'raster') return { ...common, kind: 'raster', file: layerFileName(i, l.id) }
      return { ...common, kind: 'adjustment', adjustment: l.adjustment, params: l.params }
    })
  }
}

/** Rebuilds a PhotoDocument from a manifest plus a lookup from file name to
 * already-decoded pixels (photoApp.ts decodes the PNGs; this stays pure). */
export function documentFromManifest(manifest: PhotoManifest, pixelsByFile: Map<string, PixelBuffer>): PhotoDocument {
  const layers: Layer[] = manifest.layers.map((l) => {
    if (l.kind === 'raster') {
      const pixels = pixelsByFile.get(l.file) ?? emptyPixelBuffer(manifest.width, manifest.height)
      return { id: l.id, kind: 'raster', name: l.name, opacity: l.opacity, blendMode: l.blendMode, visible: l.visible, locked: l.locked, x: l.x, y: l.y, pixels }
    }
    return { id: l.id, kind: 'adjustment', name: l.name, opacity: l.opacity, blendMode: l.blendMode, visible: l.visible, locked: l.locked, x: l.x, y: l.y, adjustment: l.adjustment, params: l.params }
  })
  const activeLayerId = manifest.activeLayerId && layers.some((l) => l.id === manifest.activeLayerId) ? manifest.activeLayerId : (layers[layers.length - 1]?.id ?? null)
  return { width: manifest.width, height: manifest.height, dpi: manifest.dpi, layers, activeLayerId }
}

// ---------------------------------------------------------------------------
// DOM-dependent half — canvas encode/decode. Not unit-tested (no headless
// canvas in this project's Node toolchain); verified by hand in the running app.

function pixelBufferToCanvas(pixels: PixelBuffer): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = pixels.width
  canvas.height = pixels.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.putImageData(new ImageData(pixels.data.slice(), pixels.width, pixels.height), 0, 0)
  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas encode failed'))), mime, quality)
  })
}

export async function encodePixelsToPng(pixels: PixelBuffer): Promise<Uint8Array> {
  const blob = await canvasToBlob(pixelBufferToCanvas(pixels), 'image/png')
  return new Uint8Array(await blob.arrayBuffer())
}

export async function encodePixelsToJpeg(pixels: PixelBuffer, quality = 0.92): Promise<Uint8Array> {
  const blob = await canvasToBlob(pixelBufferToCanvas(pixels), 'image/jpeg', quality)
  return new Uint8Array(await blob.arrayBuffer())
}

/** Decodes ANY raster the browser understands (PNG/JPEG/WebP/GIF/BMP) into a
 * PixelBuffer — used both for the native container's layer PNGs and for
 * "place image as new layer". */
export async function decodeRasterToPixels(bytes: Uint8Array): Promise<PixelBuffer> {
  const blob = new Blob([bytes as unknown as BlobPart])
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  ctx.drawImage(bitmap, 0, 0)
  const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
  return { width: data.width, height: data.height, data: data.data }
}

export async function savePhotoDocument(doc: PhotoDocument): Promise<Uint8Array> {
  const zip = new JSZip()
  const manifest = buildManifest(doc)
  zip.file('manifest.json', JSON.stringify(manifest, null, 2))
  for (let i = 0; i < doc.layers.length; i++) {
    const layer = doc.layers[i]
    if (layer.kind !== 'raster') continue
    const png = await encodePixelsToPng(layer.pixels)
    zip.file(layerFileName(i, layer.id), png)
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

export async function openPhotoDocument(bytes: Uint8Array): Promise<PhotoDocument> {
  const zip = await JSZip.loadAsync(bytes)
  const manifestText = await zip.file('manifest.json')?.async('string')
  if (!manifestText) throw new Error('corrupt .exelmjphoto: missing manifest.json')
  const manifest = JSON.parse(manifestText) as PhotoManifest
  if (manifest.version > PHOTO_MANIFEST_VERSION) throw new Error(`.exelmjphoto file needs a newer EXELMJ (schema v${manifest.version})`)
  const pixelsByFile = new Map<string, PixelBuffer>()
  for (const layer of manifest.layers) {
    if (layer.kind !== 'raster') continue
    const bytesEntry = await zip.file(layer.file)?.async('uint8array')
    if (!bytesEntry) throw new Error(`corrupt .exelmjphoto: missing ${layer.file}`)
    pixelsByFile.set(layer.file, await decodeRasterToPixels(bytesEntry))
  }
  return documentFromManifest(manifest, pixelsByFile)
}

/** New raster layer from an imported picture, fit at its natural size with
 * its top-left placed at the document origin (the caller repositions/scales). */
export async function layerFromRasterBytes(bytes: Uint8Array, name: string): Promise<Layer> {
  const pixels = await decodeRasterToPixels(bytes)
  return { id: newLayerId('layer'), kind: 'raster', name, opacity: 1, blendMode: 'normal', visible: true, locked: false, x: 0, y: 0, pixels }
}

/** A blank document sized to an imported picture — "open raster as a Photo document". */
export async function documentFromRasterBytes(bytes: Uint8Array): Promise<PhotoDocument> {
  const pixels = await decodeRasterToPixels(bytes)
  const doc = createPhotoDocument(pixels.width, pixels.height)
  // createPhotoDocument always makes layers[0] a raster background layer.
  const background = doc.layers[0] as RasterLayer
  doc.layers[0] = { ...background, pixels }
  return doc
}
