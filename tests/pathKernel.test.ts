// The contract between the tracer and the path kernel.
//
// M2's whole premise is that EVERY path in the app is absolute M/L/C/Z by the
// time anything downstream sees it. That is only true if the tracer's real
// output — not a hand-written sample — actually survives normalize(). These
// tests run the real ringToPath/traceImage output through the kernel.

import { describe, expect, it } from 'vitest'
import { ringToPath, traceImage } from '../src/design/trace'
import {
  normalize,
  parse,
  pathBBox,
  segsToD,
  shiftPathD,
  splitSubPaths
} from '../src/design/path'
import { releaseCompound } from '../src/design/compound'
import { outlineStroke } from '../src/design/outline'
import type { Shape } from '../src/design/shapes'

const W = 40
const H = 40

/** A tiny RGBA buffer: two solid squares of different colours on white. */
function twoSquares(w = W, h = H): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inA = x >= 4 && x < 16 && y >= 4 && y < 16
      const inB = x >= 24 && x < 36 && y >= 24 && y < 36
      const c = inA ? [220, 30, 30] : inB ? [30, 60, 220] : [255, 255, 255]
      data[i] = c[0]
      data[i + 1] = c[1]
      data[i + 2] = c[2]
      data[i + 3] = 255
    }
  }
  return data
}

describe('tracer output survives the kernel', () => {
  it('ringToPath output normalises without loss', () => {
    const ring = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ]
    const d = ringToPath(ring, true, 0)
    expect(d).toBeTruthy()
    const norm = normalize(d)
    expect(norm).toBeTruthy()
    expect(/[mhvsqta]/.test(norm!)).toBe(false)
    expect(/[HVSQTA]/.test(norm!)).toBe(false)
  })

  it('every traced path is absolute M/L/C/Z after normalize', () => {
    const paths = traceImage(twoSquares(), W, H, { colors: 3 })
    expect(paths.length).toBeGreaterThan(0)
    for (const p of paths) {
      const norm = normalize(p.d)
      expect(norm, `path ${p.fill} failed to normalise`).toBeTruthy()
      expect(/[HVSQTAhvsqta]/.test(norm!)).toBe(false)
      // and parsing it back yields the same bytes — the kernel is closed
      expect(segsToD(parse(norm!))).toBe(norm)
    }
  })

  it('a traced path reports a usable bounding box', () => {
    const paths = traceImage(twoSquares(), W, H, { colors: 3 })
    for (const p of paths) {
      const b = pathBBox(normalize(p.d)!)
      expect(b).toBeTruthy()
      expect(b!.w).toBeGreaterThan(0)
      expect(b!.h).toBeGreaterThan(0)
    }
  })

  it('tracing is deterministic through the kernel', () => {
    const a = traceImage(twoSquares(), W, H, { colors: 3 }).map((p) => normalize(p.d))
    const b = traceImage(twoSquares(), W, H, { colors: 3 }).map((p) => normalize(p.d))
    expect(a).toEqual(b)
  })
})

describe('release + outline on real traced geometry', () => {
  const traced = (): Shape[] =>
    traceImage(twoSquares(), W, H, { colors: 3 }).map((p, i) => {
      const d = normalize(p.d)!
      const b = pathBBox(d)!
      return {
        id: `t${i}`,
        kind: 'path' as const,
        x: b.x,
        y: b.y,
        w: b.w,
        h: b.h,
        fill: p.fill,
        stroke: '',
        strokeWidth: 1,
        d: shiftPathD(d, -b.x, -b.y)
      }
    })

  it('releasing a traced layer never produces an empty or NaN shape', () => {
    for (const s of traced()) {
      for (const part of releaseCompound(s)) {
        expect(Number.isFinite(part.x)).toBe(true)
        expect(Number.isFinite(part.y)).toBe(true)
        expect(part.w).toBeGreaterThan(0)
        expect(part.h).toBeGreaterThan(0)
        expect(normalize(part.d ?? '')).toBeTruthy()
      }
    }
  })

  it('a released region keeps the parent colour, which is what gets recoloured', () => {
    for (const s of traced()) {
      for (const part of releaseCompound(s)) expect(part.fill).toBe(s.fill)
    }
  })

  it('outlining a traced path yields safe, re-normalisable data', () => {
    for (const s of traced()) {
      const d = outlineStroke(s.d!, 1.5, { cap: 'round' })
      if (!d) continue
      expect(normalize(d)).toBeTruthy()
    }
  })
})

describe('shiftPathD', () => {
  it('translates every coordinate exactly', () => {
    expect(shiftPathD('M0 0 L10 0', 5, 7)).toBe('M5 7 L15 7')
  })

  it('translates control points too', () => {
    const out = shiftPathD('M0 0 C1 1 2 2 3 3', 10, 0)
    expect(out).toBe('M10 0 C11 1 12 2 13 3')
  })

  it('is a no-op for a zero shift, without re-rounding', () => {
    const d = 'M0.123 0 L1 1'
    expect(shiftPathD(d, 0, 0)).toBe(d)
  })

  it('round-trips: shift there and back is the identity', () => {
    const d = normalize('M1.5 2.25 C3 4 5 6 7 8 Z')!
    expect(shiftPathD(shiftPathD(d, 13, -4), -13, 4)).toBe(d)
  })

  it('moves the bounding box by exactly the shift', () => {
    const d = 'M0 0 L10 0 L10 10 Z'
    const b = pathBBox(shiftPathD(d, 3, 4))!
    expect(b.x).toBe(3)
    expect(b.y).toBe(4)
  })

  it('keeps subpath structure intact', () => {
    const d = 'M0 0 L1 0 Z M5 5 L6 5 Z'
    expect(splitSubPaths(shiftPathD(d, 1, 1))).toHaveLength(2)
  })
})
