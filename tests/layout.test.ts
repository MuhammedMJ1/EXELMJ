import { describe, expect, it } from 'vitest'
import {
  dropIndex,
  frameToCss,
  layoutFrame,
  reorder,
  type LayoutChild
} from '../src/studio/layout'
import type { Frame } from '../src/studio/model'

const frame = (over: Partial<Frame> = {}, layout: Partial<NonNullable<Frame['layout']>> = {}): Frame => ({
  id: 'f',
  x: 0,
  y: 0,
  w: 300,
  h: 100,
  children: [],
  layout: {
    direction: 'row',
    gap: 0,
    padding: [0, 0, 0, 0],
    align: 'start',
    justify: 'start',
    wrap: false,
    // tests default to LTR so the arithmetic reads naturally; RTL has its own
    // block below, where mirroring is the thing under test
    dir: 'ltr',
    ...layout
  },
  ...over
})

const kid = (id: string, w: number, h: number, grow?: LayoutChild['grow']): LayoutChild => ({
  id,
  w,
  h,
  ...(grow ? { grow } : {})
})

const byId = (r: ReturnType<typeof layoutFrame>, id: string) => r.children.find((c) => c.id === id)!

describe('row basics', () => {
  it('places children left to right', () => {
    const r = layoutFrame(frame(), [kid('a', 50, 20), kid('b', 60, 20)])
    expect(byId(r, 'a').x).toBe(0)
    expect(byId(r, 'b').x).toBe(50)
  })

  it('inserts the gap between, never before or after', () => {
    const r = layoutFrame(frame({}, { gap: 10 }), [kid('a', 50, 20), kid('b', 60, 20), kid('c', 10, 20)])
    expect(byId(r, 'a').x).toBe(0)
    expect(byId(r, 'b').x).toBe(60)
    expect(byId(r, 'c').x).toBe(130)
  })

  it('offsets by the padding', () => {
    const r = layoutFrame(frame({}, { padding: [5, 0, 0, 8] }), [kid('a', 50, 20)])
    expect(byId(r, 'a').x).toBe(8)
    expect(byId(r, 'a').y).toBe(5)
  })

  it('keeps intrinsic sizes when nothing grows', () => {
    const r = layoutFrame(frame(), [kid('a', 50, 20)])
    expect(byId(r, 'a').w).toBe(50)
    expect(byId(r, 'a').h).toBe(20)
  })

  it('lays an empty frame out without crashing', () => {
    const r = layoutFrame(frame(), [])
    expect(r.children).toEqual([])
    expect(r.lines).toBe(1)
  })
})

describe('column', () => {
  it('stacks top to bottom', () => {
    const r = layoutFrame(frame({ w: 100, h: 300 }, { direction: 'column', gap: 5 }), [
      kid('a', 40, 20),
      kid('b', 40, 30)
    ])
    expect(byId(r, 'a').y).toBe(0)
    expect(byId(r, 'b').y).toBe(25)
    expect(byId(r, 'a').x).toBe(0)
  })
})

describe('justify — distributing the slack', () => {
  const two = [kid('a', 50, 20), kid('b', 50, 20)]

  it('start leaves the slack at the end', () => {
    expect(byId(layoutFrame(frame({}, { justify: 'start' }), two), 'a').x).toBe(0)
  })

  it('center splits it', () => {
    // 300 wide, 100 used -> 200 slack -> 100 each side
    expect(byId(layoutFrame(frame({}, { justify: 'center' }), two), 'a').x).toBe(100)
  })

  it('end pushes everything over', () => {
    expect(byId(layoutFrame(frame({}, { justify: 'end' }), two), 'a').x).toBe(200)
  })

  it('between pins the ends and spaces the middle', () => {
    const r = layoutFrame(frame({}, { justify: 'between' }), two)
    expect(byId(r, 'a').x).toBe(0)
    expect(byId(r, 'b').x).toBe(250)
  })

  it('around gives half a gap at each end', () => {
    const r = layoutFrame(frame({}, { justify: 'around' }), two)
    expect(byId(r, 'a').x).toBe(50)
    expect(byId(r, 'b').x).toBe(200)
  })

  it('between with ONE child does not divide by zero', () => {
    const r = layoutFrame(frame({}, { justify: 'between' }), [kid('a', 50, 20)])
    expect(byId(r, 'a').x).toBe(0)
  })
})

describe('align — the cross axis', () => {
  const kids = [kid('a', 50, 20), kid('b', 50, 40)]

  it('start puts every child at the top', () => {
    const r = layoutFrame(frame({}, { align: 'start' }), kids)
    expect(byId(r, 'a').y).toBe(0)
    expect(byId(r, 'b').y).toBe(0)
  })

  it('center centres each within the LINE height', () => {
    const r = layoutFrame(frame({}, { align: 'center' }), kids)
    expect(byId(r, 'a').y).toBe(10)
    expect(byId(r, 'b').y).toBe(0)
  })

  it('end bottoms them out', () => {
    const r = layoutFrame(frame({}, { align: 'end' }), kids)
    expect(byId(r, 'a').y).toBe(20)
    expect(byId(r, 'b').y).toBe(0)
  })

  it('stretch makes every child the line height', () => {
    const r = layoutFrame(frame({}, { align: 'stretch' }), kids)
    expect(byId(r, 'a').h).toBe(40)
    expect(byId(r, 'b').h).toBe(40)
  })
})

describe('fill and hug', () => {
  it('a fill child takes the remaining space', () => {
    const r = layoutFrame(frame({}, { gap: 10 }), [kid('a', 50, 20), kid('b', 0, 20, 'fill')])
    expect(byId(r, 'b').w).toBe(240)
    expect(byId(r, 'b').x).toBe(60)
  })

  it('two fill children share it', () => {
    const r = layoutFrame(frame(), [kid('a', 0, 20, 'fill'), kid('b', 0, 20, 'fill')])
    expect(byId(r, 'a').w).toBe(150)
    expect(byId(r, 'b').w).toBe(150)
  })

  it('a fill child collapses rather than overflowing when there is no room', () => {
    const r = layoutFrame(frame({ w: 40 }), [kid('a', 50, 20), kid('b', 0, 20, 'fill')])
    expect(byId(r, 'b').w).toBe(0)
  })

  it('a hug frame takes its width FROM the content', () => {
    const r = layoutFrame(frame({ sizing: { w: 'hug', h: 'fixed' } }, { gap: 10, padding: [0, 6, 0, 6] }), [
      kid('a', 50, 20),
      kid('b', 30, 20)
    ])
    expect(r.frame.w).toBe(50 + 10 + 30 + 12)
  })

  it('a hug frame hugs its height too', () => {
    const r = layoutFrame(frame({ sizing: { w: 'fixed', h: 'hug' } }, { padding: [4, 0, 4, 0] }), [
      kid('a', 50, 20),
      kid('b', 30, 35)
    ])
    expect(r.frame.h).toBe(35 + 8)
  })
})

describe('wrap', () => {
  it('breaks onto a new line when the row is full', () => {
    const r = layoutFrame(frame({ w: 120 }, { wrap: true, gap: 10 }), [
      kid('a', 50, 20),
      kid('b', 50, 20),
      kid('c', 50, 20)
    ])
    expect(r.lines).toBe(2)
    expect(byId(r, 'c').y).toBeGreaterThan(byId(r, 'a').y)
  })

  it('stacks lines by the tallest child on each', () => {
    const r = layoutFrame(frame({ w: 100 }, { wrap: true, gap: 0 }), [
      kid('a', 60, 30),
      kid('b', 60, 20)
    ])
    expect(byId(r, 'b').y).toBe(30)
  })

  it('never leaves a line empty, even when one child is wider than the frame', () => {
    const r = layoutFrame(frame({ w: 10 }, { wrap: true }), [kid('a', 50, 20), kid('b', 50, 20)])
    expect(r.lines).toBe(2)
    expect(r.children).toHaveLength(2)
  })

  it('does not wrap a hug frame — it has no width to wrap against', () => {
    const r = layoutFrame(frame({ w: 10, sizing: { w: 'hug', h: 'fixed' } }, { wrap: true }), [
      kid('a', 50, 20),
      kid('b', 50, 20)
    ])
    expect(r.lines).toBe(1)
  })
})

describe('RTL — the mirror', () => {
  it('mirrors a row: the first child sits at the RIGHT edge', () => {
    const r = layoutFrame(frame({}, { dir: 'rtl' }), [kid('a', 50, 20), kid('b', 60, 20)])
    expect(byId(r, 'a').x).toBe(250)
    expect(byId(r, 'b').x).toBe(190)
  })

  it('mirrors padding with it — inline-start is the RIGHT side', () => {
    const r = layoutFrame(frame({}, { dir: 'rtl', padding: [0, 0, 0, 20] }), [kid('a', 50, 20)])
    expect(byId(r, 'a').x).toBe(230)
  })

  it('does NOT mirror a column — the classic RTL bug', () => {
    const ltr = layoutFrame(frame({ w: 100, h: 300 }, { direction: 'column', dir: 'ltr' }), [
      kid('a', 40, 20),
      kid('b', 40, 30)
    ])
    const rtl = layoutFrame(frame({ w: 100, h: 300 }, { direction: 'column', dir: 'rtl' }), [
      kid('a', 40, 20),
      kid('b', 40, 30)
    ])
    expect(rtl.children.map((c) => c.y)).toEqual(ltr.children.map((c) => c.y))
  })

  it('keeps every child the same SIZE — mirroring moves, it does not resize', () => {
    const ltr = layoutFrame(frame(), [kid('a', 50, 20), kid('b', 60, 40)])
    const rtl = layoutFrame(frame({}, { dir: 'rtl' }), [kid('a', 50, 20), kid('b', 60, 40)])
    expect(rtl.children.map((c) => c.w)).toEqual(ltr.children.map((c) => c.w))
    expect(rtl.children.map((c) => c.h)).toEqual(ltr.children.map((c) => c.h))
  })

  it('mirrors justify too — end means the LEFT edge', () => {
    const r = layoutFrame(frame({}, { dir: 'rtl', justify: 'end' }), [kid('a', 50, 20)])
    expect(byId(r, 'a').x).toBe(0)
  })

  it('is its own inverse: mirroring twice is the identity', () => {
    const kids = [kid('a', 50, 20), kid('b', 60, 20), kid('c', 20, 20)]
    const ltr = layoutFrame(frame(), kids)
    const rtl = layoutFrame(frame({}, { dir: 'rtl' }), kids)
    for (const c of ltr.children) {
      const m = byId(rtl, c.id)
      expect(300 - m.x - m.w).toBe(c.x)
    }
  })
})

describe('dropIndex — dragging inside a frame reorders it', () => {
  const boxes = [
    { id: 'a', x: 0, y: 0, w: 50, h: 20 },
    { id: 'b', x: 60, y: 0, w: 50, h: 20 },
    { id: 'c', x: 120, y: 0, w: 50, h: 20 }
  ]

  it('drops before the first child', () => {
    expect(dropIndex(frame(), boxes, 5, 10)).toBe(0)
  })

  it('drops between two children', () => {
    expect(dropIndex(frame(), boxes, 55, 10)).toBe(1)
  })

  it('drops at the end past the last midpoint', () => {
    expect(dropIndex(frame(), boxes, 200, 10)).toBe(3)
  })

  it('reverses the comparison under RTL', () => {
    const f = frame({}, { dir: 'rtl' })
    // far RIGHT is the START in RTL
    expect(dropIndex(f, boxes, 200, 10)).toBe(0)
    expect(dropIndex(f, boxes, 5, 10)).toBe(3)
  })

  it('uses the vertical axis in a column', () => {
    const col = frame({}, { direction: 'column' })
    const stack = [
      { id: 'a', x: 0, y: 0, w: 50, h: 20 },
      { id: 'b', x: 0, y: 30, w: 50, h: 20 }
    ]
    expect(dropIndex(col, stack, 10, 5)).toBe(0)
    expect(dropIndex(col, stack, 10, 100)).toBe(2)
  })

  it('returns 0 for an empty frame', () => {
    expect(dropIndex(frame(), [], 50, 50)).toBe(0)
  })
})

describe('reorder', () => {
  it('moves an item forward without an off-by-one', () => {
    // dragging 'a' to the END must land LAST, not second-to-last
    expect(reorder(['a', 'b', 'c'], 0, 3)).toEqual(['b', 'c', 'a'])
  })

  it('moves an item backward', () => {
    expect(reorder(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
  })

  it('is a no-op for the same position', () => {
    expect(reorder(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('ignores an out-of-range source', () => {
    const list = ['a', 'b']
    expect(reorder(list, 9, 0)).toBe(list)
  })

  it('clamps an out-of-range target', () => {
    expect(reorder(['a', 'b'], 0, 99)).toEqual(['b', 'a'])
  })

  it('does not mutate the input', () => {
    const list = ['a', 'b', 'c']
    reorder(list, 0, 2)
    expect(list).toEqual(['a', 'b', 'c'])
  })
})

describe('frameToCss — logical properties only', () => {
  it('never emits a physical padding side', () => {
    const css = frameToCss(frame({}, { padding: [1, 2, 3, 4] }))
    expect(css['padding-inline-start']).toBe('4px')
    expect(css['padding-inline-end']).toBe('2px')
    expect(css['padding-left']).toBe(undefined)
    expect(css['padding-right']).toBe(undefined)
  })

  it('maps our vocabulary onto flexbox', () => {
    const css = frameToCss(frame({}, { justify: 'between', align: 'center', wrap: true, gap: 8 }))
    expect(css['justify-content']).toBe('space-between')
    expect(css['align-items']).toBe('center')
    expect(css['flex-wrap']).toBe('wrap')
    expect(css.gap).toBe('8px')
    expect(css.display).toBe('flex')
  })

  it('carries the direction', () => {
    expect(frameToCss(frame({}, { direction: 'column' }))['flex-direction']).toBe('column')
  })
})
