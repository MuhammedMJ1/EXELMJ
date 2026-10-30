import { describe, expect, it } from 'vitest'
import { maxOffsetError, outlineStroke } from '../src/design/outline'
import { normalize, pathBBox, splitSubPaths, subPathContains } from '../src/design/path'

describe('outlineStroke — basics', () => {
  it('outlines a straight run into a closed shape', () => {
    const d = outlineStroke('M 0 0 L 100 0', 10)!
    expect(d).toBeTruthy()
    expect(d).toContain('Z')
    const b = pathBBox(d)!
    // 10pt wide stroke centred on y=0 spans y=-5..5
    expect(b.h).toBeCloseTo(10, 1)
    expect(b.w).toBeCloseTo(100, 1)
  })

  it('centres the band on the source line', () => {
    const b = pathBBox(outlineStroke('M 0 50 L 100 50', 10)!)!
    expect(b.y).toBeCloseTo(45, 1)
    expect(b.y + b.h).toBeCloseTo(55, 1)
  })

  it('the outlined band actually contains the source line', () => {
    const sub = splitSubPaths(outlineStroke('M 0 0 L 100 0', 10)!)[0]
    expect(subPathContains(sub, 50, 0)).toBe(true)
    expect(subPathContains(sub, 50, 20)).toBe(false)
  })

  it('scales with the width', () => {
    const thin = pathBBox(outlineStroke('M 0 0 L 100 0', 2)!)!
    const fat = pathBBox(outlineStroke('M 0 0 L 100 0', 20)!)!
    expect(thin.h).toBeCloseTo(2, 1)
    expect(fat.h).toBeCloseTo(20, 1)
  })

  it('refuses a zero or negative width instead of returning a sliver', () => {
    expect(outlineStroke('M 0 0 L 10 0', 0)).toBe(null)
    expect(outlineStroke('M 0 0 L 10 0', -4)).toBe(null)
  })

  it('refuses empty geometry', () => {
    expect(outlineStroke('', 4)).toBe(null)
    expect(outlineStroke('nonsense', 4)).toBe(null)
  })
})

describe('caps', () => {
  it('butt does not extend past the endpoints', () => {
    const b = pathBBox(outlineStroke('M 0 0 L 100 0', 10, { cap: 'butt' })!)!
    expect(b.x).toBeCloseTo(0, 1)
    expect(b.w).toBeCloseTo(100, 1)
  })

  it('square extends by half the width at each end', () => {
    const b = pathBBox(outlineStroke('M 0 0 L 100 0', 10, { cap: 'square' })!)!
    expect(b.w).toBeGreaterThan(100)
    expect(b.w).toBeCloseTo(110, 0)
  })

  it('round extends by half the width and is curved', () => {
    const d = outlineStroke('M 0 0 L 100 0', 10, { cap: 'round' })!
    expect(d).toContain('C')
    const b = pathBBox(d)!
    expect(b.w).toBeCloseTo(110, 0)
  })

  it('a lone point is a dot with a round cap and nothing otherwise', () => {
    expect(outlineStroke('M 5 5', 10, { cap: 'round' })).toBeTruthy()
    expect(outlineStroke('M 5 5', 10, { cap: 'butt' })).toBe(null)
  })
})

describe('closed strokes', () => {
  it('outlines a closed ring as TWO rings, so the middle stays empty', () => {
    const d = outlineStroke('M 0 0 L 100 0 L 100 100 L 0 100 Z', 10)!
    const subs = splitSubPaths(d)
    expect(subs.length).toBeGreaterThanOrEqual(2)
  })

  it('the band covers the ring but not its interior', () => {
    const d = outlineStroke('M 0 0 L 100 0 L 100 100 L 0 100 Z', 10)!
    const subs = splitSubPaths(d)
    // the centre of the square is inside the outer ring AND inside the inner
    // one, so evenodd leaves it unpainted — both must report a hit
    const insideCount = subs.filter((s) => subPathContains(s, 50, 50)).length
    expect(insideCount % 2).toBe(0)
  })
})

describe('accuracy — the milestone criterion', () => {
  it('a 1.5pt stroke outlines within 0.05pt of the analytic offset', () => {
    const src = 'M 0 0 C 30 -40 70 40 100 0'
    const d = outlineStroke(src, 1.5)!
    expect(maxOffsetError(src, d, 0.75)).toBeLessThan(0.05)
  })

  it('holds on a tight bend, which is where naive offsets pinch', () => {
    const src = normalize('M 0 0 C 40 0 40 40 0 40')!
    const d = outlineStroke(src, 2)!
    expect(maxOffsetError(src, d, 1)).toBeLessThan(0.05)
  })

  it('holds on a wide stroke', () => {
    const src = 'M 0 0 C 30 -40 70 40 100 0'
    const d = outlineStroke(src, 12)!
    expect(maxOffsetError(src, d, 6)).toBeLessThan(0.05)
  })

  it('a straight run is exact', () => {
    const src = 'M 0 0 L 100 0'
    expect(maxOffsetError(src, outlineStroke(src, 4)!, 2)).toBeLessThan(1e-6)
  })
})

describe('determinism', () => {
  it('outlines the same input to the same bytes twice', () => {
    const src = 'M 0 0 C 30 -40 70 40 100 0'
    expect(outlineStroke(src, 3)).toBe(outlineStroke(src, 3))
  })

  it('emits only safe path data', () => {
    const d = outlineStroke('M 0 0 C 30 -40 70 40 100 0', 3, { cap: 'round' })!
    expect(normalize(d)).toBeTruthy()
  })
})
