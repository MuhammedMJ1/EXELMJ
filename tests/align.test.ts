import { describe, expect, it } from 'vitest'
import {
  alignDeltas,
  distributeDeltas,
  gapsBetween,
  type Positioned
} from '../src/design/align'

const at = (id: string, x: number, y: number, w = 20, h = 10): Positioned => ({
  id,
  box: { x, y, w, h }
})

/** Apply the deltas, the way the canvas does. */
const applied = (items: Positioned[], deltas: Map<string, [number, number]>): Positioned[] =>
  items.map((i) => {
    const d = deltas.get(i.id) ?? [0, 0]
    return { id: i.id, box: { ...i.box, x: i.box.x + d[0], y: i.box.y + d[1] } }
  })

describe('align — moves, never resizes', () => {
  const items = [at('a', 0, 0, 20, 10), at('b', 50, 30, 40, 20), at('c', 100, 60, 10, 5)]

  it('left puts every left edge on the leftmost', () => {
    const out = applied(items, alignDeltas(items, 'left'))
    expect(out.map((i) => i.box.x)).toEqual([0, 0, 0])
  })

  it('right puts every RIGHT edge on the rightmost', () => {
    const out = applied(items, alignDeltas(items, 'right'))
    expect(out.map((i) => i.box.x + i.box.w)).toEqual([110, 110, 110])
  })

  it('centerX puts every centre on the selection centre', () => {
    const out = applied(items, alignDeltas(items, 'centerX'))
    const centres = out.map((i) => i.box.x + i.box.w / 2)
    expect(new Set(centres).size).toBe(1)
    expect(centres[0]).toBe(55)
  })

  it('top / bottom / centerY do the same on the other axis', () => {
    expect(applied(items, alignDeltas(items, 'top')).map((i) => i.box.y)).toEqual([0, 0, 0])
    expect(applied(items, alignDeltas(items, 'bottom')).map((i) => i.box.y + i.box.h)).toEqual([65, 65, 65])
    const cy = applied(items, alignDeltas(items, 'centerY')).map((i) => i.box.y + i.box.h / 2)
    expect(new Set(cy).size).toBe(1)
  })

  it('NEVER changes a size — the rule this file exists for', () => {
    for (const mode of ['left', 'right', 'centerX', 'top', 'bottom', 'centerY'] as const) {
      const out = applied(items, alignDeltas(items, mode))
      expect(out.map((i) => [i.box.w, i.box.h])).toEqual(items.map((i) => [i.box.w, i.box.h]))
    }
  })

  it('touches only the axis it aligns', () => {
    const out = applied(items, alignDeltas(items, 'left'))
    expect(out.map((i) => i.box.y)).toEqual(items.map((i) => i.box.y))
  })

  it('aligns to the SELECTION, not to the page origin', () => {
    const far = [at('a', 500, 0), at('b', 560, 0)]
    expect(applied(far, alignDeltas(far, 'left')).map((i) => i.box.x)).toEqual([500, 500])
  })

  it('refuses to "align" fewer than two objects', () => {
    expect(alignDeltas([at('a', 5, 5)], 'left').size).toBe(0)
    expect(alignDeltas([], 'left').size).toBe(0)
  })

  it('emits no delta for an object already in place', () => {
    const already = [at('a', 0, 0), at('b', 0, 30)]
    expect(alignDeltas(already, 'left').size).toBe(0)
  })

  it('is idempotent', () => {
    const once = applied(items, alignDeltas(items, 'centerX'))
    const twice = applied(once, alignDeltas(once, 'centerX'))
    expect(twice).toEqual(once)
  })
})

describe('distribute — equal GAPS, not equal centres', () => {
  // deliberately different widths: this is where centre-spacing goes wrong
  const items = [at('a', 0, 0, 10, 10), at('b', 40, 0, 60, 10), at('c', 200, 0, 20, 10)]

  it('leaves equal gaps between neighbours', () => {
    const out = applied(items, distributeDeltas(items, 'horizontal'))
    const gaps = gapsBetween(out, 'horizontal')
    expect(gaps).toHaveLength(2)
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(1e-9)
  })

  it('does NOT merely space the centres — they stay unequal by design', () => {
    const out = applied(items, distributeDeltas(items, 'horizontal'))
    const centres = out.map((i) => i.box.x + i.box.w / 2)
    const d1 = centres[1] - centres[0]
    const d2 = centres[2] - centres[1]
    // equal gaps with unequal widths means UNEQUAL centre spacing
    expect(Math.abs(d1 - d2)).toBeGreaterThan(1)
  })

  it('keeps the two outermost objects exactly where they were', () => {
    const out = applied(items, distributeDeltas(items, 'horizontal'))
    expect(out[0].box.x).toBe(0)
    expect(out[2].box.x + out[2].box.w).toBe(220)
  })

  it('works vertically', () => {
    const col = [at('a', 0, 0, 10, 10), at('b', 0, 40, 10, 50), at('c', 0, 200, 10, 20)]
    const out = applied(col, distributeDeltas(col, 'vertical'))
    const gaps = gapsBetween(out, 'vertical')
    expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(1e-9)
  })

  it('sorts by position, so the input order does not matter', () => {
    const shuffled = [items[2], items[0], items[1]]
    const a = applied(items, distributeDeltas(items, 'horizontal')).map((i) => [i.id, i.box.x])
    const b = applied(shuffled, distributeDeltas(shuffled, 'horizontal'))
      .map((i) => [i.id, i.box.x])
      .sort((x, y) => String(x[0]).localeCompare(String(y[0])))
    expect(b).toEqual(a.sort((x, y) => String(x[0]).localeCompare(String(y[0]))))
  })

  it('needs three objects — two have nothing between them', () => {
    expect(distributeDeltas([at('a', 0, 0), at('b', 90, 0)], 'horizontal').size).toBe(0)
  })

  it('clamps to zero gap when the objects overlap the span', () => {
    const crowded = [at('a', 0, 0, 100, 10), at('b', 10, 0, 100, 10), at('c', 20, 0, 100, 10)]
    const out = applied(crowded, distributeDeltas(crowded, 'horizontal'))
    for (const g of gapsBetween(out, 'horizontal')) expect(g).toBeGreaterThanOrEqual(0)
  })

  it('is idempotent', () => {
    const once = applied(items, distributeDeltas(items, 'horizontal'))
    const twice = applied(once, distributeDeltas(once, 'horizontal'))
    expect(twice.map((i) => i.box.x)).toEqual(once.map((i) => i.box.x))
  })

  it('never resizes anything', () => {
    const out = applied(items, distributeDeltas(items, 'horizontal'))
    expect(out.map((i) => i.box.w)).toEqual(items.map((i) => i.box.w))
  })
})
