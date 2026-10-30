// The Photo document model: layer CRUD must never mutate the document it was
// given (history.ts's undo/redo depends on that), and crop must reposition
// every layer so nothing visibly shifts.

import { describe, expect, it } from 'vitest'
import {
  addLayer,
  createEmptyLayer,
  createPhotoDocument,
  cropDocument,
  findLayerIndex,
  removeLayer,
  reorderLayer,
  updateLayer
} from '../src/photo/model'

describe('createPhotoDocument', () => {
  it('starts with one opaque white background layer', () => {
    const doc = createPhotoDocument(4, 3)
    expect(doc.width).toBe(4)
    expect(doc.height).toBe(3)
    expect(doc.layers).toHaveLength(1)
    const bg = doc.layers[0]
    expect(bg.kind).toBe('raster')
    if (bg.kind === 'raster') {
      expect(bg.pixels.data[0]).toBe(255) // R
      expect(bg.pixels.data[3]).toBe(255) // A
    }
    expect(doc.activeLayerId).toBe(bg.id)
  })
})

describe('addLayer / removeLayer / reorderLayer / updateLayer', () => {
  it('never mutates the document it was given', () => {
    const doc = createPhotoDocument(2, 2)
    const layer = createEmptyLayer(doc, 'New')
    const next = addLayer(doc, layer)
    expect(doc.layers).toHaveLength(1) // original untouched
    expect(next.layers).toHaveLength(2)
    expect(next).not.toBe(doc)
  })

  it('addLayer makes the new layer active and appends to the top by default', () => {
    const doc = createPhotoDocument(2, 2)
    const layer = createEmptyLayer(doc, 'New')
    const next = addLayer(doc, layer)
    expect(next.layers[next.layers.length - 1].id).toBe(layer.id)
    expect(next.activeLayerId).toBe(layer.id)
  })

  it('removeLayer drops the layer and re-targets the active id', () => {
    const doc0 = createPhotoDocument(2, 2)
    const layer = createEmptyLayer(doc0, 'New')
    const doc1 = addLayer(doc0, layer)
    const doc2 = removeLayer(doc1, layer.id)
    expect(doc2.layers).toHaveLength(1)
    expect(doc2.activeLayerId).toBe(doc0.layers[0].id)
  })

  it('reorderLayer moves a layer to the requested post-removal index', () => {
    const doc0 = createPhotoDocument(2, 2)
    const a = createEmptyLayer(doc0, 'A')
    const b = createEmptyLayer(doc0, 'B')
    const doc1 = addLayer(addLayer(doc0, a), b)
    // order is now [bg, a, b]; move 'a' to the very top (index 2)
    const doc2 = reorderLayer(doc1, a.id, 2)
    expect(doc2.layers.map((l) => l.id)).toEqual([doc0.layers[0].id, b.id, a.id])
  })

  it('updateLayer patches only the targeted layer', () => {
    const doc0 = createPhotoDocument(2, 2)
    const a = createEmptyLayer(doc0, 'A')
    const doc1 = addLayer(doc0, a)
    const doc2 = updateLayer(doc1, a.id, { opacity: 0.5 })
    expect(findLayerIndex(doc2, a.id)).toBeGreaterThanOrEqual(0)
    const patched = doc2.layers.find((l) => l.id === a.id)
    expect(patched?.opacity).toBe(0.5)
    expect(doc1.layers.find((l) => l.id === a.id)?.opacity).toBe(1) // original untouched
  })
})

describe('cropDocument', () => {
  it('resizes the document and repositions every layer so nothing shifts', () => {
    const doc = createPhotoDocument(10, 10)
    const cropped = cropDocument(doc, { x: 2, y: 3, width: 4, height: 5 })
    expect(cropped.width).toBe(4)
    expect(cropped.height).toBe(5)
    const layer = cropped.layers[0]
    expect(layer.x).toBe(0)
    expect(layer.y).toBe(0)
    if (layer.kind === 'raster') {
      expect(layer.pixels.width).toBe(4)
      expect(layer.pixels.height).toBe(5)
      // background was opaque white everywhere, so the crop must stay opaque white
      expect(layer.pixels.data[0]).toBe(255)
      expect(layer.pixels.data[3]).toBe(255)
    }
  })
})
