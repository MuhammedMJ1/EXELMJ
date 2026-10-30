import { describe, expect, it } from 'vitest'
import {
  controlsOf,
  deleteNode,
  flatten,
  insertNodeAfter,
  joinSubPaths,
  moveControl,
  moveNode,
  nodesOf,
  normalize,
  parse,
  pathBBox,
  segsToD,
  splitSubPaths,
  subPathArea,
  subPathContains,
  toCurve,
  toLine,
  type Seg
} from '../src/design/path'

const nums = (s: string): number[] => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
const close = (a: number, b: number, eps = 1e-3): boolean => Math.abs(a - b) <= eps

describe('normalize — the choke point', () => {
  it('emits only absolute M/L/C/Z', () => {
    const out = normalize('m 10 10 h 20 v 20 l -20 0 z')!
    expect(out).toBeTruthy()
    expect(/[mhvlsqta]/.test(out)).toBe(false)
    expect(/[HVSQTA]/.test(out)).toBe(false)
  })

  it('expands arcs — they cannot survive a non-uniform scale', () => {
    const out = normalize('M 0 0 A 10 10 0 0 1 20 0')!
    expect(/[Aa]/.test(out)).toBe(false)
    expect(out).toContain('C')
  })

  it('expands shorthand curves', () => {
    const out = normalize('M 0 0 C 1 1 2 2 3 3 S 4 4 5 5')!
    expect(/[Ss]/.test(out)).toBe(false)
  })

  it('elevates quadratics to cubics exactly', () => {
    // a quadratic through (0,0)(10,20)(20,0), sampled at t=0.5, is (10,10)
    const out = normalize('M 0 0 Q 10 20 20 0')!
    expect(/[Qq]/.test(out)).toBe(false)
    const pts = flatten(splitSubPaths(out)[0], 2)
    const mid = pts.find((p) => close(p[0], 10, 0.01))
    expect(mid).toBeTruthy()
    expect(close(mid![1], 10, 0.01)).toBe(true)
  })

  it('is idempotent', () => {
    const once = normalize('m 5 5 c 1 1 2 2 3 3 z')!
    expect(normalize(once)).toBe(once)
  })

  it('refuses unsafe data rather than sanitising it', () => {
    expect(normalize('M 0 0 url(#evil)')).toBe(null)
    expect(normalize('')).toBe(null)
    expect(normalize('   ')).toBe(null)
  })

  it('never emits negative zero', () => {
    const out = normalize('M 0 0 L -0.0001 5')!
    expect(out).not.toContain('-0 ')
    expect(out).not.toMatch(/-0$/)
  })
})

describe('parse', () => {
  it('folds H and V into L', () => {
    expect(parse('M 0 0 H 10 V 20')).toEqual([
      { c: 'M', x: 0, y: 0 },
      { c: 'L', x: 10, y: 0 },
      { c: 'L', x: 10, y: 20 }
    ])
  })

  it('treats a repeated pair after M as an implicit L', () => {
    expect(parse('M 0 0 10 0 10 10')).toEqual([
      { c: 'M', x: 0, y: 0 },
      { c: 'L', x: 10, y: 0 },
      { c: 'L', x: 10, y: 10 }
    ])
  })

  it('resolves relative commands against the running point', () => {
    expect(parse('m 5 5 l 5 0 l 0 5')).toEqual([
      { c: 'M', x: 5, y: 5 },
      { c: 'L', x: 10, y: 5 },
      { c: 'L', x: 10, y: 10 }
    ])
  })

  it('returns the pen to the subpath start after Z', () => {
    const segs = parse('M 10 10 L 20 20 Z l 5 0')
    expect(segs[segs.length - 1]).toEqual({ c: 'L', x: 15, y: 10 })
  })

  it('reflects the previous control point for S', () => {
    const segs = parse('M 0 0 C 1 2 3 4 5 6 S 7 8 9 10')
    const s = segs[2] as Extract<Seg, { c: 'C' }>
    expect(s.x1).toBe(2 * 5 - 3)
    expect(s.y1).toBe(2 * 6 - 4)
  })

  it('does not lose its place on an unexpected arc', () => {
    // 7 arc params then a real L — a naive parser reads the L's x as a param
    const segs = parse('M 0 0 A 1 1 0 0 1 10 0 L 20 0')
    expect(segs[segs.length - 1]).toEqual({ c: 'L', x: 20, y: 0 })
  })

  it('returns nothing for unsafe data', () => {
    expect(parse('M 0 0 <script>')).toEqual([])
  })
})

describe('segsToD round-trip', () => {
  it('survives parse -> serialise -> parse unchanged', () => {
    const d = normalize('M 0 0 C 1 1 2 2 3 3 L 10 10 Z M 20 20 L 30 30 Z')!
    expect(segsToD(parse(d))).toBe(d)
  })
})

describe('splitSubPaths — what makes a traced blob addressable', () => {
  it('splits at every M', () => {
    const subs = splitSubPaths('M 0 0 L 10 0 Z M 20 0 L 30 0 Z')
    expect(subs).toHaveLength(2)
    expect(subs[0].closed).toBe(true)
    expect(subs[1].segs[0]).toEqual({ c: 'M', x: 20, y: 0 })
  })

  it('marks an unclosed run as open', () => {
    expect(splitSubPaths('M 0 0 L 10 10')[0].closed).toBe(false)
  })

  it('rejoins to the same geometry', () => {
    const d = normalize('M 0 0 L 10 0 Z M 20 0 L 30 0 Z')!
    expect(nums(joinSubPaths(splitSubPaths(d)))).toEqual(nums(d))
  })

  it('ignores stray segments before the first M', () => {
    expect(splitSubPaths('L 5 5 M 0 0 L 1 1')).toHaveLength(1)
  })
})

describe('nodes', () => {
  it('lists every anchor with its subpath', () => {
    const n = nodesOf('M 0 0 L 10 0 Z M 20 0 L 30 0')
    expect(n).toHaveLength(4)
    expect(n.map((x) => x.sub)).toEqual([0, 0, 1, 1])
  })

  it('skips Z, which has no anchor', () => {
    expect(nodesOf('M 0 0 L 1 1 Z').every((n) => n.x !== undefined)).toBe(true)
    expect(nodesOf('M 0 0 L 1 1 Z')).toHaveLength(2)
  })

  it('reports the control points of a curve only', () => {
    const segs = parse('M 0 0 C 1 2 3 4 5 6 L 7 8')
    expect(controlsOf(segs, 1)).toEqual([[1, 2], [3, 4]])
    expect(controlsOf(segs, 2)).toBe(null)
  })
})

describe('moveNode — handles must follow the anchor', () => {
  it('drags the incoming control point with the anchor', () => {
    const segs = parse('M 0 0 C 1 1 2 2 3 3')
    const out = moveNode(segs, 1, 13, 3)
    const c = out[1] as Extract<Seg, { c: 'C' }>
    expect(c.x).toBe(13)
    // x2 led into the anchor and must have moved by the same delta
    expect(c.x2).toBe(2 + 10)
    // x1 belongs to the segment's START and must NOT move
    expect(c.x1).toBe(1)
  })

  it('drags the outgoing control point of the next segment', () => {
    const segs = parse('M 0 0 L 5 5 C 6 6 7 7 8 8')
    const out = moveNode(segs, 1, 15, 5)
    const c = out[2] as Extract<Seg, { c: 'C' }>
    expect(c.x1).toBe(6 + 10)
    // the far control point and the endpoint stay put
    expect(c.x2).toBe(7)
    expect(c.x).toBe(8)
  })

  it('does not mutate the input', () => {
    const segs = parse('M 0 0 L 5 5')
    const copy = JSON.parse(JSON.stringify(segs))
    moveNode(segs, 1, 99, 99)
    expect(segs).toEqual(copy)
  })

  it('ignores an out-of-range or Z index', () => {
    const segs = parse('M 0 0 L 5 5 Z')
    expect(moveNode(segs, 2, 1, 1)).toBe(segs)
    expect(moveNode(segs, 99, 1, 1)).toBe(segs)
  })
})

describe('moveControl', () => {
  it('moves either handle of a curve', () => {
    const segs = parse('M 0 0 C 1 1 2 2 3 3')
    expect((moveControl(segs, 1, 0, 9, 9)[1] as Extract<Seg, { c: 'C' }>).x1).toBe(9)
    expect((moveControl(segs, 1, 1, 9, 9)[1] as Extract<Seg, { c: 'C' }>).x2).toBe(9)
  })

  it('is a no-op on a line', () => {
    const segs = parse('M 0 0 L 5 5')
    expect(moveControl(segs, 1, 0, 9, 9)).toBe(segs)
  })
})

describe('deleteNode / insertNodeAfter', () => {
  it('removes an anchor and heals the path', () => {
    const segs = parse('M 0 0 L 5 0 L 10 0')
    expect(deleteNode(segs, 1)).toHaveLength(2)
  })

  it('refuses to leave a subpath with fewer than two points', () => {
    const segs = parse('M 0 0 L 5 0')
    expect(deleteNode(segs, 1)).toBe(segs)
  })

  it('promotes the next segment when the start point is deleted', () => {
    const segs = parse('M 0 0 L 5 0 L 10 0')
    const out = deleteNode(segs, 0)
    expect(out[0]).toEqual({ c: 'M', x: 5, y: 0 })
    expect(out).toHaveLength(2)
  })

  it('inserts a node at the midpoint', () => {
    const segs = parse('M 0 0 L 10 0')
    const out = insertNodeAfter(segs, 0)
    expect(out[1]).toEqual({ c: 'L', x: 5, y: 0 })
    expect(out).toHaveLength(3)
  })
})

describe('toCurve / toLine', () => {
  it('converts a line to a curve that is visually identical', () => {
    const segs = parse('M 0 0 L 30 0')
    const out = toCurve(segs, 1)
    const c = out[1] as Extract<Seg, { c: 'C' }>
    expect(c.c).toBe('C')
    // controls at the thirds reproduce the straight line exactly
    expect(c.x1).toBe(10)
    expect(c.x2).toBe(20)
    expect(c.y1).toBe(0)
    const pts = flatten({ segs: out, closed: false }, 4)
    expect(pts.every((p) => close(p[1], 0))).toBe(true)
  })

  it('converts a curve back to a line, keeping the endpoint', () => {
    const segs = parse('M 0 0 C 1 9 2 9 3 0')
    expect(toLine(segs, 1)).toEqual([
      { c: 'M', x: 0, y: 0 },
      { c: 'L', x: 3, y: 0 }
    ])
  })
})

describe('pathBBox — the box the resize grips measure', () => {
  it('bounds a straight path exactly', () => {
    expect(pathBBox('M 0 0 L 10 0 L 10 20 Z')).toEqual({ x: 0, y: 0, w: 10, h: 20 })
  })

  it('includes the curve bulge, not just the anchors', () => {
    // anchors are both on y=0; the curve bulges to y=15
    const b = pathBBox('M 0 0 C 0 20 10 20 10 0')!
    expect(b.h).toBeGreaterThan(10)
  })

  it('returns null for nothing', () => {
    expect(pathBBox('')).toBe(null)
    expect(pathBBox('nonsense')).toBe(null)
  })
})

describe('subpath geometry — telling a hole from a solid', () => {
  const outer = splitSubPaths('M 0 0 L 100 0 L 100 100 L 0 100 Z')[0]
  const inner = splitSubPaths('M 40 40 L 40 60 L 60 60 L 60 40 Z')[0]

  it('signs the area by winding direction', () => {
    expect(subPathArea(outer)).toBeGreaterThan(0)
    expect(subPathArea(inner)).toBeLessThan(0)
  })

  it('hit-tests a point inside a region', () => {
    expect(subPathContains(outer, 50, 50)).toBe(true)
    expect(subPathContains(outer, 150, 50)).toBe(false)
    expect(subPathContains(inner, 50, 50)).toBe(true)
    expect(subPathContains(inner, 10, 10)).toBe(false)
  })

  it('hit-tests through a curve', () => {
    const circleish = splitSubPaths(
      normalize('M 50 0 A 50 50 0 1 1 49.9 0 Z')!
    )[0]
    expect(subPathContains(circleish, 50, 50)).toBe(true)
    expect(subPathContains(circleish, 5, 5)).toBe(false)
  })
})

describe('determinism — the tracer feeds this every time', () => {
  it('normalises the same input to the same bytes twice', () => {
    const d = 'm 1.23456 2.34567 c 1 1 2 2 3 3 s 4 4 5 5 z'
    expect(normalize(d)).toBe(normalize(d))
  })

  it('keeps 3 decimals', () => {
    const out = normalize('M 0.123456 0 L 1 1')!
    expect(out).toContain('0.123')
    expect(out).not.toContain('0.1234')
  })
})
