// Adjustment-layer pixel math: identity at neutral params, and a directional
// check for each control (exact photographic curves are hand-tuned, so these
// assert direction/shape rather than a single "correct" magic number).

import { describe, expect, it } from 'vitest'
import { applyBrightnessContrast, applyHueSaturation, applyLevels } from '../src/photo/adjustments'
import type { PixelBuffer } from '../src/photo/model'

function grey(v: number): PixelBuffer {
  return { width: 1, height: 1, data: new Uint8ClampedArray([v, v, v, 255]) }
}

function rgb(r: number, g: number, b: number): PixelBuffer {
  return { width: 1, height: 1, data: new Uint8ClampedArray([r, g, b, 255]) }
}

describe('applyBrightnessContrast', () => {
  it('is a no-op at brightness=0, contrast=0', () => {
    const buf = grey(120)
    applyBrightnessContrast(buf, { brightness: 0, contrast: 0 })
    expect(Array.from(buf.data)).toEqual([120, 120, 120, 255])
  })

  it('positive brightness raises every channel', () => {
    const buf = grey(120)
    applyBrightnessContrast(buf, { brightness: 40, contrast: 0 })
    expect(buf.data[0]).toBeGreaterThan(120)
  })

  it('negative brightness lowers every channel', () => {
    const buf = grey(120)
    applyBrightnessContrast(buf, { brightness: -40, contrast: 0 })
    expect(buf.data[0]).toBeLessThan(120)
  })

  it('positive contrast pushes a value above mid-grey further up', () => {
    const buf = grey(180)
    applyBrightnessContrast(buf, { brightness: 0, contrast: 50 })
    expect(buf.data[0]).toBeGreaterThan(180)
  })

  it('never touches alpha', () => {
    const buf: PixelBuffer = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 128]) }
    applyBrightnessContrast(buf, { brightness: 30, contrast: 30 })
    expect(buf.data[3]).toBe(128)
  })

  it('skips fully transparent pixels', () => {
    const buf: PixelBuffer = { width: 1, height: 1, data: new Uint8ClampedArray([10, 20, 30, 0]) }
    applyBrightnessContrast(buf, { brightness: 100, contrast: 100 })
    expect(Array.from(buf.data)).toEqual([10, 20, 30, 0])
  })
})

describe('applyHueSaturation', () => {
  it('is a no-op at hue=0, saturation=0, lightness=0', () => {
    const buf = rgb(200, 80, 40)
    applyHueSaturation(buf, { hue: 0, saturation: 0, lightness: 0 })
    expect(Array.from(buf.data)).toEqual([200, 80, 40, 255])
  })

  it('saturation=-100 desaturates fully (R=G=B)', () => {
    const buf = rgb(200, 80, 40)
    applyHueSaturation(buf, { hue: 0, saturation: -100, lightness: 0 })
    expect(buf.data[0]).toBe(buf.data[1])
    expect(buf.data[1]).toBe(buf.data[2])
  })

  it('lightness=+100 pushes the pixel to white', () => {
    const buf = rgb(200, 80, 40)
    applyHueSaturation(buf, { hue: 0, saturation: 0, lightness: 100 })
    expect(Array.from(buf.data)).toEqual([255, 255, 255, 255])
  })

  it('lightness=-100 pushes the pixel to black', () => {
    const buf = rgb(200, 80, 40)
    applyHueSaturation(buf, { hue: 0, saturation: 0, lightness: -100 })
    expect(Array.from(buf.data)).toEqual([0, 0, 0, 255])
  })
})

describe('applyLevels', () => {
  it('identity mapping (0..255 in, 0..255 out, gamma 1) leaves pixels unchanged', () => {
    const buf = grey(77)
    applyLevels(buf, { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 })
    expect(buf.data[0]).toBe(77)
  })

  it('clamps input black/white to expand contrast', () => {
    const buf = grey(128)
    applyLevels(buf, { inBlack: 64, inWhite: 192, gamma: 1, outBlack: 0, outWhite: 255 })
    // 128 is exactly mid-way between 64 and 192 -> maps to 127/128 mid output
    expect(buf.data[0]).toBeGreaterThanOrEqual(126)
    expect(buf.data[0]).toBeLessThanOrEqual(129)
  })

  it('compresses output range when outBlack/outWhite narrow', () => {
    const buf = grey(0)
    applyLevels(buf, { inBlack: 0, inWhite: 255, gamma: 1, outBlack: 50, outWhite: 200 })
    expect(buf.data[0]).toBe(50)
  })
})
