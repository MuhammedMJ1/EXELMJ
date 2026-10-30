import { describe, expect, it } from 'vitest'
import { groupRegions, regionAt, regionToD, releaseCompound } from '../src/design/compound'
import { normalize, splitSubPaths, subPathContains } from '../src/design/path'
import type { Shape } from '../src/design/shapes'

// A square ring, drawn clockwise, as an absolute path.
const square = (x: number, y: number, s: number): string =>
  `M ${x} ${y} L ${x + s} ${y} L ${x + s} ${y + s} L ${x} ${y + s} Z`

const path = (d: string, over: Partial<Shape> = {}): Shape => ({
  id: 'p1',
  kind: 'path',
  x: 0,
  y: 0,
  w: 100,
  h: 100,
  fill: '#ff0000',
  stroke: '',
  strokeWidth: 2,
  d,
  ...over
})

describe('groupRegions — a hole belongs to its ring, not to itself', () => {
  it('keeps two separate shapes separate', () => {
    const r = groupRegions(splitSubPaths(`${square(0, 0, 10)} ${square(50, 50, 10)}`))
    expect(r).toHaveLength(2)
    expect(r.every((x) => x.holes.length === 0)).toBe(true)
  })

  it('attaches an inner ring as a hole — a donut must stay a donut', () => {
    const r = groupRegions(splitSubPaths(`${square(0, 0, 100)} ${square(40, 40, 20)}`))
    expect(r).toHaveLength(1)
    expect(r[0].holes).toHaveLength(1)
  })

  it('makes a ring inside a hole solid again', () => {
    // outer 100 > hole 60 > island 20: three levels, parity 0/1/0
    const d = `${square(0, 0, 100)} ${square(20, 20, 60)} ${square(40, 40, 20)}`
    const r = groupRegions(splitSubPaths(d))
    expect(r).toHaveLength(2)
    const withHole = r.find((x) => x.holes.length === 1)
    expect(withHole).toBeTruthy()
  })

  it('nests a hole into the SMALLEST containing ring', () => {
    // two nested rings, then a small hole inside the inner one
    const d = `${square(0, 0, 200)} ${square(10, 10, 100)} ${square(20, 20, 10)}`
    const r = groupRegions(splitSubPaths(d))
    // 200 is depth 0, 100 is depth 1 (hole of 200), 10 is depth 2 (solid)
    expect(r).toHaveLength(2)
    const outer = r.find((x) => x.holes.length === 1)!
    expect(outer.holes).toHaveLength(1)
  })

  it('treats an open run as its own region', () => {
    const r = groupRegions(splitSubPaths('M 0 0 L 50 50'))
    expect(r).toHaveLength(1)
    expect(r[0].holes).toHaveLength(0)
  })

  it('ignores a degenerate subpath', () => {
    expect(groupRegions(splitSubPaths('M 5 5 Z'))).toHaveLength(0)
  })
})

describe('regionToD', () => {
  it('emits the ring followed by its holes', () => {
    const r = groupRegions(splitSubPaths(`${square(0, 0, 100)} ${square(40, 40, 20)}`))
    const d = regionToD(r[0])
    expect(d.match(/M/g)).toHaveLength(2)
    // the hole is still inside once serialised
    const subs = splitSubPaths(d)
    expect(subPathContains(subs[0], 50, 50)).toBe(true)
    expect(subPathContains(subs[1], 50, 50)).toBe(true)
  })
})

describe('releaseCompound — the recolour prerequisite', () => {
  it('splits two separate regions into two shapes', () => {
    const out = releaseCompound(path(`${square(0, 0, 10)} ${square(50, 50, 10)}`))
    expect(out).toHaveLength(2)
    expect(out[0].id).not.toBe(out[1].id)
  })

  it('does NOT split a donut — the hole would become a disc', () => {
    const out = releaseCompound(path(`${square(0, 0, 100)} ${square(40, 40, 20)}`))
    expect(out).toHaveLength(1)
  })

  it('leaves a single-region path untouched, including its identity', () => {
    const p = path(square(0, 0, 10))
    expect(releaseCompound(p)).toEqual([p])
  })

  it('leaves non-path shapes alone', () => {
    const r: Shape = { ...path(''), kind: 'rect', d: undefined }
    expect(releaseCompound(r)).toEqual([r])
  })

  it('rebases each region onto its own origin', () => {
    const out = releaseCompound(path(`${square(0, 0, 10)} ${square(50, 50, 10)}`, { x: 7, y: 9 }))
    const far = out.find((s) => s.x > 50)!
    expect(far.x).toBe(7 + 50)
    expect(far.y).toBe(9 + 50)
    expect(far.w).toBe(10)
    // geometry is local to the shape, so it must start at 0,0 again
    expect(far.d).toMatch(/^M0 0/)
  })

  it('carries fill and stroke onto every region — that is what gets recoloured', () => {
    const out = releaseCompound(
      path(`${square(0, 0, 10)} ${square(50, 50, 10)}`, { fill: '#00ff00', stroke: '#0000ff' })
    )
    expect(out.every((s) => s.fill === '#00ff00' && s.stroke === '#0000ff')).toBe(true)
  })

  it('drops a gradient rather than shifting it, and removes the key entirely', () => {
    const out = releaseCompound(
      path(`${square(0, 0, 10)} ${square(50, 50, 10)}`, {
        gradient: { x1: 0, y1: 0, x2: 100, y2: 100, from: '#000000', to: '#ffffff' }
      })
    )
    expect(out).toHaveLength(2)
    for (const s of out) {
      expect(s.gradient).toBe(undefined)
      expect('gradient' in s).toBe(false)
    }
  })

  it('handles a curved region without losing it', () => {
    const circle = normalize('M 50 0 A 50 50 0 1 1 49.9 0 Z')!
    const far = normalize('M 250 0 A 20 20 0 1 1 249.9 0 Z')!
    const out = releaseCompound(path(`${circle} ${far}`))
    expect(out).toHaveLength(2)
  })
})

describe('regionAt — clicking a traced logo', () => {
  const regions = groupRegions(splitSubPaths(`${square(0, 0, 100)} ${square(40, 40, 20)}`))

  it('finds the region under the point', () => {
    expect(regionAt(regions, 10, 10)).toBe(0)
  })

  it('reports a miss outside everything', () => {
    expect(regionAt(regions, 500, 500)).toBe(-1)
  })

  it('lets a click fall THROUGH a hole, as the painted result suggests', () => {
    expect(regionAt(regions, 50, 50)).toBe(-1)
  })

  it('prefers the last region when they overlap — topmost wins', () => {
    const two = groupRegions(splitSubPaths(`${square(0, 0, 100)} ${square(200, 0, 10)}`))
    expect(regionAt(two, 205, 5)).toBe(two.length - 1)
  })
})
