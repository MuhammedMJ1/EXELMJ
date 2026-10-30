// The contract M5 rests on: the worker changes WHO runs the trace, never WHAT
// it produces. These tests exercise the onLayer hook directly (in node, no
// Worker) because that hook is the only behavioural change to the pipeline.

import { describe, expect, it } from 'vitest'
import { traceImage, type TracedPath } from '../src/design/trace'

const W = 60
const H = 60

/** Four colour bands, so a trace produces several layers to report on. */
function bands(w = W, h = H): Uint8ClampedArray {
  const d = new Uint8ClampedArray(w * h * 4)
  const colors = [
    [230, 40, 40],
    [40, 90, 220],
    [40, 190, 90],
    [250, 240, 160]
  ]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const c = colors[Math.min(colors.length - 1, Math.floor((y / h) * colors.length))]
      d[i] = c[0]
      d[i + 1] = c[1]
      d[i + 2] = c[2]
      d[i + 3] = 255
    }
  }
  return d
}

describe('onLayer — the progress hook', () => {
  it('fires once per kept colour layer', () => {
    const seen: Array<{ done: number; total: number }> = []
    const paths = traceImage(bands(), W, H, {
      colors: 4,
      onLayer: (done, total) => {
        seen.push({ done, total })
      }
    })
    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every((s) => s.total === seen[0].total)).toBe(true)
    // done counts up, one at a time, and never exceeds total
    expect(seen.map((s) => s.done)).toEqual(seen.map((_, i) => i + 1))
    expect(seen[seen.length - 1].done).toBeLessThanOrEqual(seen[0].total)
    expect(paths.length).toBeGreaterThan(0)
  })

  it('hands over each layer as it is produced — the live preview', () => {
    const streamed: TracedPath[] = []
    const paths = traceImage(bands(), W, H, {
      colors: 4,
      onLayer: (_d, _t, path) => {
        if (path) streamed.push(path)
      }
    })
    // what was streamed IS what was returned, in the same order
    expect(streamed.map((p) => p.d)).toEqual(paths.map((p) => p.d))
    expect(streamed.map((p) => p.fill)).toEqual(paths.map((p) => p.fill))
  })

  it('reports a layer that produced nothing as null rather than skipping it', () => {
    let nulls = 0
    let total = 0
    traceImage(bands(), W, H, {
      colors: 8,
      minArea: 100000, // nothing survives, so every layer is empty
      onLayer: (_d, t, path) => {
        total = t
        if (!path) nulls++
      }
    })
    expect(total).toBeGreaterThan(0)
    expect(nulls).toBe(total)
  })

  it('STOPS EARLY when the hook returns false, keeping what it has', () => {
    const partial = traceImage(bands(), W, H, {
      colors: 4,
      onLayer: (done) => (done < 2 ? true : false)
    })
    const full = traceImage(bands(), W, H, { colors: 4 })
    expect(partial.length).toBe(2)
    expect(full.length).toBeGreaterThan(2)
    // and the layers it kept are exactly the first ones of the full trace
    expect(partial.map((p) => p.d)).toEqual(full.slice(0, 2).map((p) => p.d))
  })

  it('does not stop on a truthy or undefined return', () => {
    const withVoid = traceImage(bands(), W, H, {
      colors: 4,
      onLayer: () => undefined
    })
    const plain = traceImage(bands(), W, H, { colors: 4 })
    expect(withVoid.length).toBe(plain.length)
  })
})

describe('the hook cannot change the output — the byte-identity guarantee', () => {
  it('a trace WITH the hook equals a trace without it', () => {
    const a = traceImage(bands(), W, H, { colors: 4 })
    const b = traceImage(bands(), W, H, { colors: 4, onLayer: () => true })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('holds for the centreline path too', () => {
    const a = traceImage(bands(), W, H, { colors: 3, strokes: true })
    const b = traceImage(bands(), W, H, { colors: 3, strokes: true, onLayer: () => true })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('holds with gradients enabled', () => {
    const a = traceImage(bands(), W, H, { colors: 3, gradients: true })
    const b = traceImage(bands(), W, H, { colors: 3, gradients: true, onLayer: () => true })
    expect(JSON.stringify(b)).toBe(JSON.stringify(a))
  })

  it('remains deterministic across runs', () => {
    const a = traceImage(bands(), W, H, { colors: 4, onLayer: () => true })
    const b = traceImage(bands(), W, H, { colors: 4, onLayer: () => true })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
