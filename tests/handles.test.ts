import { describe, expect, it } from 'vitest'
import { cursorFor, snapResizedEdge } from '../src/design/handles'
import type { Box } from '../src/design/transform'

describe('cursorFor', () => {
  it('gives the conventional cursors on an unrotated box', () => {
    expect(cursorFor('n', 0)).toBe('ns-resize')
    expect(cursorFor('s', 0)).toBe('ns-resize')
    expect(cursorFor('e', 0)).toBe('ew-resize')
    expect(cursorFor('w', 0)).toBe('ew-resize')
    expect(cursorFor('nw', 0)).toBe('nwse-resize')
    expect(cursorFor('se', 0)).toBe('nwse-resize')
    expect(cursorFor('ne', 0)).toBe('nesw-resize')
    expect(cursorFor('sw', 0)).toBe('nesw-resize')
  })

  it('turns the cursor with the object', () => {
    // a 90deg turn makes the top edge face right, so its grip resizes E/W
    expect(cursorFor('n', 90)).toBe('ew-resize')
    expect(cursorFor('e', 90)).toBe('ns-resize')
  })

  it('rounds to the nearest 45deg rather than jittering', () => {
    expect(cursorFor('n', 20)).toBe('ns-resize')
    expect(cursorFor('n', 25)).toBe('nesw-resize')
  })

  it('gives rotation its own glyph, not a hand', () => {
    // There is no CSS cursor for rotation, and `grab` — which stood in here —
    // says "drag me", not "turn me". It is a drawn crescent with an arrowhead
    // at each end, with `grab` left as the fallback if the data URI is refused.
    const c = cursorFor('rot', 0)
    expect(c).toContain('data:image/svg+xml')
    expect(c.endsWith('grab')).toBe(true)
  })

  it('turns that glyph to lie tangential, so it means something all the way round', () => {
    expect(cursorFor('rot', 0)).not.toBe(cursorFor('rot', 90))
  })

  it('quantises the angle rather than minting a data URI per pointermove', () => {
    // 15 degrees is finer than the eye can tell at 24px, and it keeps the
    // cache to two dozen strings instead of one per mouse move.
    expect(cursorFor('rot', 0)).toBe(cursorFor('rot', 7))
    expect(cursorFor('rot', 0)).toBe(cursorFor('rot', 360))
  })

  it('never emits a negative angle into the glyph', () => {
    // A negative rotate() is legal SVG but the cache would then hold two
    // entries for the same picture.
    expect(cursorFor('rot', -90)).toBe(cursorFor('rot', 270))
  })
})

describe('snapResizedEdge — only the moving edge may snap', () => {
  const B: Box = { x: 100, y: 100, w: 200, h: 100 }

  it('snaps the right edge and leaves the left one nailed down', () => {
    const { box, guides } = snapResizedEdge({ ...B, w: 198 }, 'e', [300], [], 4)
    expect(box.x).toBe(100)
    expect(box.x + box.w).toBe(300)
    expect(guides.x).toBe(300)
  })

  it('snaps the left edge and keeps the right one nailed down', () => {
    const right = B.x + B.w
    const { box } = snapResizedEdge({ x: 98, y: 100, w: 202, h: 100 }, 'w', [100], [], 4)
    expect(box.x).toBe(100)
    expect(box.x + box.w).toBe(right)
  })

  it('never snaps the anchored edge', () => {
    // 100 is exactly the left edge; dragging E must not pull the box to it
    const { box } = snapResizedEdge(B, 'e', [100], [], 4)
    expect(box.x).toBe(100)
    expect(box.w).toBe(200)
  })

  it('does not snap the centre — that is a move-time behaviour', () => {
    const { box, guides } = snapResizedEdge(B, 'e', [200], [], 4)
    expect(guides.x).toBe(null)
    expect(box.w).toBe(200)
  })

  it('snaps both axes on a corner grip', () => {
    const { box, guides } = snapResizedEdge({ x: 100, y: 100, w: 198, h: 97 }, 'se', [300], [200], 4)
    expect(box.x + box.w).toBe(300)
    expect(box.y + box.h).toBe(200)
    expect(guides).toEqual({ x: 300, y: 200 })
  })

  it('refuses a snap that would collapse the box', () => {
    const { box, guides } = snapResizedEdge({ x: 100, y: 100, w: 2, h: 100 }, 'e', [100.5], [], 4)
    expect(box.w).toBe(2)
    expect(guides.x).toBe(null)
  })

  it('leaves the box alone when nothing is within tolerance', () => {
    const { box, guides } = snapResizedEdge(B, 'e', [1000], [], 4)
    expect(box).toEqual(B)
    expect(guides).toEqual({ x: null, y: null })
  })
})
