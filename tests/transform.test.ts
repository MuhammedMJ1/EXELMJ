import { describe, expect, it } from 'vitest'
import {
  MIN_SIZE,
  ROT_OFFSET,
  angleFromCenter,
  applyBoxToShape,
  boxCenter,
  handlePoint,
  hitHandle,
  normalizeAngle,
  resizeRotated,
  rotatePoint,
  rotatedAABB,
  snap1D,
  snapBox,
  toLocal,
  transformPathD,
  type Box
} from '../src/design/transform'
import type { Shape } from '../src/design/shapes'

const close = (a: number, b: number, eps = 1e-6): boolean => Math.abs(a - b) <= eps
const boxClose = (a: Box, b: Box, eps = 1e-6): boolean =>
  close(a.x, b.x, eps) && close(a.y, b.y, eps) && close(a.w, b.w, eps) && close(a.h, b.h, eps)

const B: Box = { x: 100, y: 50, w: 200, h: 100 }

describe('rotatePoint', () => {
  it('is the identity at 0 degrees', () => {
    expect(rotatePoint(5, 7, 1, 2, 0)).toEqual([5, 7])
  })

  it('rotates clockwise in screen space (y down)', () => {
    // (1,0) from the origin, turned 90deg clockwise, points DOWN the screen
    const [x, y] = rotatePoint(1, 0, 0, 0, 90)
    expect(close(x, 0)).toBe(true)
    expect(close(y, 1)).toBe(true)
  })

  it('four 90deg turns return to the start', () => {
    let p: [number, number] = [17, -3]
    for (let i = 0; i < 4; i++) p = rotatePoint(p[0], p[1], 4, 9, 90)
    expect(close(p[0], 17)).toBe(true)
    expect(close(p[1], -3)).toBe(true)
  })
})

describe('toLocal', () => {
  it('reports the centre as the local origin', () => {
    const [lx, ly] = toLocal(200, 100, B, 37)
    expect(close(lx, 0)).toBe(true)
    expect(close(ly, 0)).toBe(true)
  })

  it('undoes the rotation of a handle point', () => {
    const [hx, hy] = handlePoint(B, 42, 'se')
    const [lx, ly] = toLocal(hx, hy, B, 42)
    expect(close(lx, B.w / 2)).toBe(true)
    expect(close(ly, B.h / 2)).toBe(true)
  })
})

describe('handlePoint', () => {
  it('places the eight grips on the unrotated box', () => {
    expect(handlePoint(B, 0, 'nw')).toEqual([100, 50])
    expect(handlePoint(B, 0, 'se')).toEqual([300, 150])
    expect(handlePoint(B, 0, 'n')).toEqual([200, 50])
    expect(handlePoint(B, 0, 'w')).toEqual([100, 100])
  })

  it('floats the rotation grip above the top edge', () => {
    expect(handlePoint(B, 0, 'rot')).toEqual([200, 50 - ROT_OFFSET])
  })

  it('carries the grips around with the rotation', () => {
    const [x, y] = handlePoint(B, 180, 'nw')
    expect(close(x, 300)).toBe(true)
    expect(close(y, 150)).toBe(true)
  })
})

describe('hitHandle', () => {
  it('finds a grip under the pointer', () => {
    expect(hitHandle(B, 0, 300, 150)).toBe('se')
  })

  it('returns null away from every grip', () => {
    expect(hitHandle(B, 0, 200, 100)).toBe(null)
  })

  it('prefers a corner over an edge when they overlap', () => {
    // a 2pt-wide box: nw, n and ne all sit within tolerance of each other
    const tiny: Box = { x: 0, y: 0, w: 2, h: 40 }
    expect(hitHandle(tiny, 0, 0, 0, 5)).toBe('nw')
  })

  it('follows the grips when the box is rotated', () => {
    const [x, y] = handlePoint(B, 33, 'sw')
    expect(hitHandle(B, 33, x, y)).toBe('sw')
    expect(hitHandle(B, 0, x, y)).not.toBe('sw')
  })
})

describe('resizeRotated (unrotated)', () => {
  it('drags SE and keeps NW nailed down', () => {
    const out = resizeRotated(B, 0, 'se', 400, 300)
    expect(boxClose(out, { x: 100, y: 50, w: 300, h: 250 })).toBe(true)
  })

  it('drags NW and keeps SE nailed down', () => {
    const out = resizeRotated(B, 0, 'nw', 50, 25)
    expect(boxClose(out, { x: 50, y: 25, w: 250, h: 125 })).toBe(true)
  })

  it('leaves the untouched axis alone on an edge grip', () => {
    const out = resizeRotated(B, 0, 'e', 500, 9999)
    expect(close(out.h, B.h)).toBe(true)
    expect(close(out.y, B.y)).toBe(true)
    expect(close(out.w, 400)).toBe(true)
  })

  it('clamps instead of flipping when dragged past the anchor', () => {
    const out = resizeRotated(B, 0, 'se', 0, 0)
    expect(out.w).toBe(MIN_SIZE)
    expect(out.h).toBe(MIN_SIZE)
    // the anchor still holds
    expect(close(out.x, 100)).toBe(true)
    expect(close(out.y, 50)).toBe(true)
  })

  it('keeps the aspect ratio with the aspect option', () => {
    const out = resizeRotated(B, 0, 'se', 500, 160, { aspect: true })
    expect(close(out.w / out.h, B.w / B.h, 1e-9)).toBe(true)
  })

  it('grows about the centre with fromCenter', () => {
    const before = boxCenter(B)
    const out = resizeRotated(B, 0, 'se', 400, 300, { fromCenter: true })
    const after = boxCenter(out)
    expect(close(after[0], before[0])).toBe(true)
    expect(close(after[1], before[1])).toBe(true)
    expect(close(out.w, 400)).toBe(true)
    expect(close(out.h, 400)).toBe(true)
  })

  it('is idempotent when the pointer is already on the grip', () => {
    const [hx, hy] = handlePoint(B, 0, 'se')
    expect(boxClose(resizeRotated(B, 0, 'se', hx, hy), B)).toBe(true)
  })
})

describe('resizeRotated (rotated) — the anchor must not move', () => {
  const OPPOSITE = { nw: 'se', ne: 'sw', se: 'nw', sw: 'ne', n: 's', s: 'n', e: 'w', w: 'e' } as const

  for (const rotation of [0, 30, 90, 137, 250, 359]) {
    for (const grip of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const) {
      it(`holds ${OPPOSITE[grip]} while dragging ${grip} at ${rotation}deg`, () => {
        const anchorBefore = handlePoint(B, rotation, OPPOSITE[grip])
        // drag the grip somewhere clearly outside the box
        const out = resizeRotated(B, rotation, grip, 460, 380)
        const anchorAfter = handlePoint(out, rotation, OPPOSITE[grip])
        expect(close(anchorBefore[0], anchorAfter[0], 1e-6)).toBe(true)
        expect(close(anchorBefore[1], anchorAfter[1], 1e-6)).toBe(true)
      })
    }
  }

  it('grows along the box own axes, not the page axes', () => {
    // at 90deg the box local +x points down the page, so dragging E moves the
    // width along the page's Y — a page-space implementation gets this wrong
    const out = resizeRotated(B, 90, 'e', 200, 300)
    expect(close(out.h, B.h)).toBe(true)
    expect(out.w).toBeGreaterThan(B.w)
  })
})

describe('angleFromCenter / normalizeAngle', () => {
  it('reads 0 straight up and 90 to the right', () => {
    expect(close(angleFromCenter(B, 200, 0), 0)).toBe(true)
    expect(close(angleFromCenter(B, 400, 100), 90)).toBe(true)
    expect(close(angleFromCenter(B, 200, 400), 180)).toBe(true)
    expect(close(angleFromCenter(B, 0, 100), 270)).toBe(true)
  })

  it('normalises into [0, 360)', () => {
    expect(normalizeAngle(-90)).toBe(270)
    expect(normalizeAngle(450)).toBe(90)
    expect(normalizeAngle(360)).toBe(0)
  })
})

describe('rotatedAABB', () => {
  it('is the box itself when unrotated', () => {
    expect(rotatedAABB(B, 0)).toEqual(B)
  })

  it('swaps the extents at 90 degrees', () => {
    const out = rotatedAABB(B, 90)
    expect(close(out.w, B.h)).toBe(true)
    expect(close(out.h, B.w)).toBe(true)
    expect(close(boxCenter(out)[0], boxCenter(B)[0])).toBe(true)
  })

  it('never shrinks below the original', () => {
    for (const deg of [15, 45, 77, 200]) {
      const out = rotatedAABB(B, deg)
      expect(out.w).toBeGreaterThanOrEqual(Math.min(B.w, B.h) - 1e-9)
      expect(out.w * out.h).toBeGreaterThanOrEqual(B.w * B.h - 1e-9)
    }
  })
})

describe('snapping', () => {
  it('pulls to the nearest target inside the tolerance', () => {
    expect(snap1D(103, [100, 200], 5)).toEqual({ value: 100, at: 100 })
  })

  it('leaves the value alone outside the tolerance', () => {
    expect(snap1D(140, [100, 200], 5)).toEqual({ value: 140, at: null })
  })

  it('snaps a box edge and reports the guide', () => {
    const { box, guides } = snapBox({ x: 98, y: 50, w: 100, h: 40 }, [100], [], 4)
    expect(box.x).toBe(100)
    expect(guides.x).toBe(100)
    expect(guides.y).toBe(null)
  })

  it('snaps a box CENTRE, not only its edges', () => {
    // centre sits at 151, one pt off the 150 guide; no edge is anywhere near it
    const { box, guides } = snapBox({ x: 101, y: 0, w: 100, h: 10 }, [150], [], 4)
    expect(guides.x).toBe(150)
    expect(close(box.x + box.w / 2, 150)).toBe(true)
  })

  it('never resizes the box', () => {
    const src = { x: 98, y: 47, w: 100, h: 40 }
    const { box } = snapBox(src, [100], [50], 4)
    expect(box.w).toBe(src.w)
    expect(box.h).toBe(src.h)
  })
})

describe('transformPathD', () => {
  const from: Box = { x: 0, y: 0, w: 10, h: 10 }

  it('scales a path to the new box', () => {
    const out = transformPathD('M 0 0 L 10 0 L 10 10 Z', from, { x: 0, y: 0, w: 20, h: 20 })
    expect(out).toBeTruthy()
    expect(out).toContain('20')
  })

  it('is the identity for an identical box', () => {
    const d = 'M 0 0 L 10 0 L 10 10 Z'
    const out = transformPathD(d, from, from)
    expect(out).toBeTruthy()
    // same geometry, possibly re-spaced — parse the numbers back out
    const nums = (s: string): number[] => (s.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
    expect(nums(out!)).toEqual(nums(d))
  })

  it('refuses a degenerate source box', () => {
    expect(transformPathD('M 0 0 L 1 1', { x: 0, y: 0, w: 0, h: 10 }, from)).toBe(null)
  })

  it('refuses path data that fails the safety guard', () => {
    expect(transformPathD('M 0 0 url(#x)', from, from)).toBe(null)
  })

  it('converts arcs so downstream only ever sees curves', () => {
    const out = transformPathD('M 0 0 A 5 5 0 0 1 10 0', from, { x: 0, y: 0, w: 20, h: 20 })
    expect(out).toBeTruthy()
    expect(/[Aa]/.test(out!)).toBe(false)
  })
})

describe('applyBoxToShape', () => {
  const rect: Shape = {
    id: 's1',
    kind: 'rect',
    x: 10,
    y: 20,
    w: 100,
    h: 50,
    fill: '#ff0000',
    stroke: '',
    strokeWidth: 2
  }

  it('assigns the box straight onto a rect', () => {
    const out = applyBoxToShape(rect, { x: 0, y: 0, w: 200, h: 100 })
    expect({ x: out.x, y: out.y, w: out.w, h: out.h }).toEqual({ x: 0, y: 0, w: 200, h: 100 })
  })

  it('keeps a line drawn up-left pointing up-left', () => {
    const line: Shape = { ...rect, kind: 'line', x: 100, y: 100, w: -50, h: -40, fill: '', stroke: '#000000' }
    const out = applyBoxToShape(line, { x: 0, y: 0, w: 100, h: 80 })
    // the delta must stay negative — a bbox assignment would flip it positive
    expect(out.w).toBeLessThan(0)
    expect(out.h).toBeLessThan(0)
    expect(close(Math.abs(out.w), 100)).toBe(true)
    expect(close(Math.abs(out.h), 80)).toBe(true)
  })

  it('doubles a path geometry when the box doubles', () => {
    const path: Shape = {
      ...rect,
      kind: 'path',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      d: 'M 0 0 L 10 0 L 10 10 Z'
    }
    const out = applyBoxToShape(path, { x: 5, y: 5, w: 20, h: 20 })
    expect(out.x).toBe(5)
    expect(out.w).toBe(20)
    expect(out.d).toContain('20')
  })

  it('scales a path gradient with its geometry', () => {
    const path: Shape = {
      ...rect,
      kind: 'path',
      x: 0,
      y: 0,
      w: 10,
      h: 10,
      d: 'M 0 0 L 10 0 L 10 10 Z',
      gradient: { x1: 0, y1: 0, x2: 10, y2: 10, from: '#000000', to: '#ffffff' }
    }
    const out = applyBoxToShape(path, { x: 0, y: 0, w: 20, h: 30 })
    expect(out.gradient!.x2).toBe(20)
    expect(out.gradient!.y2).toBe(30)
  })

  it('leaves a path in place when the transform would be unsafe', () => {
    const path: Shape = { ...rect, kind: 'path', x: 0, y: 0, w: 0, h: 0, d: 'M 0 0' }
    const out = applyBoxToShape(path, { x: 7, y: 8, w: 20, h: 20 })
    expect(out.d).toBe('M 0 0')
    expect(out.x).toBe(7)
  })
})
