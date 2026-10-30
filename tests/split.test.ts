// Splitting an object into the pieces it is visibly made of.
//
// The owner's case, exactly: an icon of three bars that never touch. Because
// they are disconnected they ARE three objects, and the app has to be able to
// say so — merging icon runs on insert is what makes the icon usable as one
// thing, and this is the way back out.

import { describe, expect, it } from 'vitest'
import { groupRegions, releaseCompound } from '../src/design/compound'
import { splitSubPaths } from '../src/design/path'
import type { Shape } from '../src/design/shapes'

/** Three horizontal bars, drawn as open strokes — a hamburger icon. */
const HAMBURGER = 'M4 6L20 6M4 12L20 12M4 18L20 18'

const shape = (d: string, over: Partial<Shape> = {}): Shape => ({
  id: 'icon',
  kind: 'path',
  x: 100,
  y: 50,
  w: 16,
  h: 12,
  fill: '',
  stroke: '#111111',
  strokeWidth: 2,
  d,
  ...over
})

describe('the three-bar icon', () => {
  it('is seen as three separate runs', () => {
    expect(splitSubPaths(HAMBURGER)).toHaveLength(3)
  })

  it('groups into three regions — an open run encloses nothing', () => {
    expect(groupRegions(splitSubPaths(HAMBURGER))).toHaveLength(3)
  })

  it('splits into three objects', () => {
    const parts = releaseCompound(shape(HAMBURGER), 'p')
    expect(parts).toHaveLength(3)
  })

  it('each piece keeps the stroke that made it visible', () => {
    // Losing the stroke would leave three invisible, unselectable objects —
    // worse than not splitting at all.
    for (const p of releaseCompound(shape(HAMBURGER), 'p')) {
      expect(p.stroke).toBe('#111111')
      expect(p.strokeWidth).toBe(2)
    }
  })

  it('each piece lands where its bar actually was', () => {
    const parts = releaseCompound(shape(HAMBURGER), 'p')
    const ys = parts.map((p) => p.y).sort((a, b) => a - b)
    // The bars sit 6pt apart in the source, and the shape starts at y=50.
    expect(ys[1] - ys[0]).toBeCloseTo(6, 3)
    expect(ys[2] - ys[1]).toBeCloseTo(6, 3)
  })

  it('every piece gets its own id', () => {
    const ids = releaseCompound(shape(HAMBURGER), 'p').map((p) => p.id)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('what must NOT be split apart', () => {
  it('a donut stays a donut', () => {
    // Outer ring plus the hole inside it are ONE region: splitting them would
    // fill the hole in and the ring would become a disc.
    const donut = 'M0 0L40 0L40 40L0 40ZM10 10L30 10L30 30L10 30Z'
    expect(releaseCompound(shape(donut), 'p')).toHaveLength(1)
  })

  it('two donuts split into two, each keeping its hole', () => {
    const two =
      'M0 0L40 0L40 40L0 40ZM10 10L30 10L30 30L10 30Z' +
      'M60 0L100 0L100 40L60 40ZM70 10L90 10L90 30L70 30Z'
    const parts = releaseCompound(shape(two), 'p')
    expect(parts).toHaveLength(2)
    for (const p of parts) expect(splitSubPaths(p.d as string)).toHaveLength(2)
  })

  it('a single run reports nothing to split rather than pretending', () => {
    expect(releaseCompound(shape('M0 0L20 0'), 'p')).toHaveLength(1)
  })

  it('a shape that is not a path is returned untouched', () => {
    const rect = shape('', { kind: 'rect', d: undefined })
    expect(releaseCompound(rect, 'p')[0]).toBe(rect)
  })
})

describe('the pieces are independent afterwards', () => {
  it('recolouring one does not touch the others', () => {
    const parts = releaseCompound(shape(HAMBURGER), 'p')
    parts[0].stroke = '#ff0000'
    expect(parts[1].stroke).toBe('#111111')
  })

  it('a gradient is DROPPED rather than carried onto a rebased piece', () => {
    // A gradient is expressed in the parent's local space; re-basing a child
    // without re-basing the ramp would shift the colours off the artwork.
    const g = shape(HAMBURGER, {
      fill: '#185abd',
      gradient: { x1: 0, y1: 0, x2: 16, y2: 0, from: '#000000', to: '#ffffff' }
    })
    for (const p of releaseCompound(g, 'p')) expect('gradient' in p).toBe(false)
  })
})
