// The compositor's blend-mode math and the incremental cache that makes
// "changing one layer must not re-composite the layers below it" true.

import { describe, expect, it } from 'vitest'
import { blendPixel, compositeLayers, compositeOnto, IncrementalCompositor } from '../src/photo/compositor'
import { addLayer, createEmptyLayer, createPhotoDocument, updateLayer, type PixelBuffer } from '../src/photo/model'

function solid([r, g, b]: [number, number, number], alpha = 255): PixelBuffer {
  return { width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, alpha]) }
}

describe('blendPixel — separable modes (0..1 channel math)', () => {
  it('normal always returns the source', () => {
    expect(blendPixel('normal', [0.2, 0.3, 0.4], [0.9, 0.8, 0.7])).toEqual([0.9, 0.8, 0.7])
  })
  it('multiply: Cb*Cs', () => {
    expect(blendPixel('multiply', [0.5, 1, 0], [0.5, 0.5, 0.9])).toEqual([0.25, 0.5, 0])
  })
  it('screen: Cb+Cs-Cb*Cs', () => {
    const [r] = blendPixel('screen', [0.5, 0, 0], [0.5, 0, 0])
    expect(r).toBeCloseTo(0.75, 6)
  })
  it('darken/lighten pick the min/max channel-wise', () => {
    expect(blendPixel('darken', [0.2, 0.8, 0.5], [0.6, 0.3, 0.5])).toEqual([0.2, 0.3, 0.5])
    expect(blendPixel('lighten', [0.2, 0.8, 0.5], [0.6, 0.3, 0.5])).toEqual([0.6, 0.8, 0.5])
  })
})

describe('blendPixel — non-separable modes preserve the spec\'s invariant', () => {
  // W3C: Color(Cb,Cs) keeps Cs's hue+saturation but Cb's luminosity;
  // Luminosity(Cb,Cs) keeps Cb's hue+saturation but Cs's luminosity.
  const lum = (c: [number, number, number]) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]

  it('color mode result has the SAME luminosity as the backdrop', () => {
    const cb: [number, number, number] = [0.2, 0.4, 0.6]
    const cs: [number, number, number] = [0.9, 0.1, 0.3]
    const out = blendPixel('color', cb, cs)
    expect(lum(out)).toBeCloseTo(lum(cb), 5)
  })

  it('luminosity mode result has the SAME luminosity as the source', () => {
    const cb: [number, number, number] = [0.2, 0.4, 0.6]
    const cs: [number, number, number] = [0.9, 0.1, 0.3]
    const out = blendPixel('luminosity', cb, cs)
    expect(lum(out)).toBeCloseTo(lum(cs), 5)
  })
})

describe('compositeOnto — alpha compositing', () => {
  it('opaque source at opacity 1 fully replaces the backdrop', () => {
    const backdrop = solid([0, 0, 255])
    compositeOnto(backdrop, solid([255, 0, 0]), 0, 0, 1, 'normal')
    expect(Array.from(backdrop.data)).toEqual([255, 0, 0, 255])
  })

  it('opaque source at opacity 0.5 averages with an opaque backdrop', () => {
    const backdrop = solid([0, 0, 255])
    compositeOnto(backdrop, solid([255, 0, 0]), 0, 0, 0.5, 'normal')
    expect(Array.from(backdrop.data)).toEqual([128, 0, 128, 255])
  })

  it('opacity 0 leaves the backdrop untouched', () => {
    const backdrop = solid([10, 20, 30]);
    compositeOnto(backdrop, solid([255, 0, 0]), 0, 0, 0, 'normal')
    expect(Array.from(backdrop.data)).toEqual([10, 20, 30, 255])
  })
})

describe('compositeLayers', () => {
  it('flattens bottom to top and respects visibility', () => {
    const doc0 = createPhotoDocument(1, 1) // white background
    const red = createEmptyLayer(doc0, 'red')
    red.pixels.data.set([255, 0, 0, 255])
    let doc = addLayer(doc0, red)
    let flat = compositeLayers(doc)
    expect(Array.from(flat.data)).toEqual([255, 0, 0, 255])

    doc = updateLayer(doc, red.id, { visible: false })
    flat = compositeLayers(doc)
    expect(Array.from(flat.data)).toEqual([255, 255, 255, 255])
  })
})

describe('IncrementalCompositor', () => {
  function threeLayerDoc() {
    const doc0 = createPhotoDocument(2, 2)
    const a = createEmptyLayer(doc0, 'a')
    const b = createEmptyLayer(doc0, 'b')
    return addLayer(addLayer(doc0, a), b)
  }

  it('recomputes every layer on the first composite', () => {
    const compositor = new IncrementalCompositor()
    const doc = threeLayerDoc()
    compositor.composite(doc)
    expect(compositor.lastRecomputeCount).toBe(3)
  })

  it('changing only the TOP layer recomputes just that one layer', () => {
    const compositor = new IncrementalCompositor()
    const doc0 = threeLayerDoc()
    compositor.composite(doc0)
    const topId = doc0.layers[doc0.layers.length - 1].id
    const doc1 = updateLayer(doc0, topId, { opacity: 0.4 })
    compositor.composite(doc1)
    expect(compositor.lastRecomputeCount).toBe(1)
  })

  it('changing the BOTTOM layer recomputes the whole stack above it', () => {
    const compositor = new IncrementalCompositor()
    const doc0 = threeLayerDoc()
    compositor.composite(doc0)
    const bottomId = doc0.layers[0].id
    const doc1 = updateLayer(doc0, bottomId, { opacity: 0.4 })
    compositor.composite(doc1)
    expect(compositor.lastRecomputeCount).toBe(3)
  })
})
