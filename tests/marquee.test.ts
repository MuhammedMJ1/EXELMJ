import { describe, expect, it } from 'vitest'
import {
  MIN_MARQUEE,
  boxSelectable,
  dragRect,
  imageSelectable,
  intersects,
  marqueeHits,
  moveSelection,
  shapeSelectable,
  unionBox,
  type Selectable
} from '../src/design/marquee'
import type { Shape } from '../src/design/shapes'
import type { PlacedImage } from '../src/design/images'
import { newBox, type TextBox } from '../src/design/overlayModel'

const sel = (id: string, x: number, y: number, w: number, h: number): Selectable => ({
  id,
  kind: 'shape',
  box: { x, y, w, h }
})

const shape = (over: Partial<Shape> = {}): Shape => ({
  id: 's',
  kind: 'rect',
  x: 10,
  y: 10,
  w: 40,
  h: 20,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 1,
  ...over
})

const image = (over: Partial<PlacedImage> = {}): PlacedImage => ({
  id: 'i',
  x: 0,
  y: 0,
  w: 30,
  h: 30,
  src: 'data:image/png;base64,x',
  naturalW: 1,
  naturalH: 1,
  ...over
})

describe('dragRect — a drag works in every direction', () => {
  it('normalises a top-left to bottom-right drag', () => {
    expect(dragRect(10, 20, 50, 60)).toEqual({ x: 10, y: 20, w: 40, h: 40 })
  })

  it('normalises a bottom-right to top-left drag identically', () => {
    expect(dragRect(50, 60, 10, 20)).toEqual({ x: 10, y: 20, w: 40, h: 40 })
  })

  it('handles a drag that crosses only one axis', () => {
    expect(dragRect(50, 20, 10, 60)).toEqual({ x: 10, y: 20, w: 40, h: 40 })
  })
})

describe('intersects', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 }

  it('overlapping boxes intersect', () => {
    expect(intersects(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
  })

  it('separate boxes do not', () => {
    expect(intersects(a, { x: 20, y: 0, w: 5, h: 5 })).toBe(false)
  })

  it('touching edges count as a hit', () => {
    expect(intersects(a, { x: 10, y: 0, w: 5, h: 5 })).toBe(true)
  })

  it('a fully contained box intersects', () => {
    expect(intersects(a, { x: 2, y: 2, w: 3, h: 3 })).toBe(true)
  })
})

describe('marqueeHits — INTERSECTION, not containment', () => {
  const items = [sel('a', 0, 0, 20, 20), sel('b', 50, 0, 20, 20), sel('c', 100, 0, 20, 20)]

  it('picks up everything the band swept over', () => {
    expect(marqueeHits({ x: 0, y: 0, w: 60, h: 10 }, items)).toEqual(['a', 'b'])
  })

  it('picks up an object only PARTLY covered — the whole point', () => {
    // a thin band clipping the top of 'a' only
    expect(marqueeHits({ x: 5, y: 5, w: 5, h: 5 }, items)).toEqual(['a'])
  })

  it('does NOT require containment, which would make big objects unselectable', () => {
    const huge = [sel('big', 0, 0, 1000, 1000)]
    expect(marqueeHits({ x: 10, y: 10, w: 20, h: 20 }, huge)).toEqual(['big'])
  })

  it('picks up nothing when the band misses', () => {
    expect(marqueeHits({ x: 200, y: 200, w: 50, h: 50 }, items)).toEqual([])
  })

  it('IGNORES a tiny drag — that is a click that wobbled, not a marquee', () => {
    expect(marqueeHits({ x: 0, y: 0, w: MIN_MARQUEE - 1, h: MIN_MARQUEE - 1 }, items)).toEqual([])
  })

  it('accepts a thin but long band, which is a deliberate sweep', () => {
    expect(marqueeHits({ x: 0, y: 0, w: 200, h: 1 }, items)).toHaveLength(3)
  })

  it('returns nothing for an empty canvas', () => {
    expect(marqueeHits({ x: 0, y: 0, w: 100, h: 100 }, [])).toEqual([])
  })
})

describe('unionBox — what the move frame measures', () => {
  it('spans every member', () => {
    expect(unionBox([sel('a', 0, 0, 10, 10), sel('b', 90, 40, 10, 10)])).toEqual({
      x: 0,
      y: 0,
      w: 100,
      h: 50
    })
  })

  it('of one member is that member', () => {
    expect(unionBox([sel('a', 5, 6, 10, 20)])).toEqual({ x: 5, y: 6, w: 10, h: 20 })
  })

  it('is null for an empty selection', () => {
    expect(unionBox([])).toBe(null)
  })
})

describe('selectables fold rotation into their bounds', () => {
  it('a rotated shape reports its ROTATED extent, not its upright one', () => {
    const upright = shapeSelectable(shape({ w: 100, h: 10 }))
    const turned = shapeSelectable(shape({ w: 100, h: 10, rotation: 90 }))
    expect(turned.box.h).toBeGreaterThan(upright.box.h)
    expect(turned.box.w).toBeLessThan(upright.box.w)
  })

  it('a rotated shape can be marquee-hit where it actually IS', () => {
    const s = shapeSelectable(shape({ x: 100, y: 100, w: 100, h: 10, rotation: 90 }))
    // turned 90deg about its centre, it now extends vertically
    expect(intersects({ x: 140, y: 140, w: 10, h: 10 }, s.box)).toBe(true)
  })

  it('an image carries its rotation too', () => {
    const turned = imageSelectable(image({ w: 100, h: 10, rotation: 90 }))
    expect(turned.box.h).toBeGreaterThan(turned.box.w)
  })
})

describe('text boxes — the alignment trap', () => {
  const at = (align: TextBox['align'], width = 80): TextBox => ({
    ...newBox('b1', 100, 50, align === 'right'),
    align,
    width,
    text: 'مرحبا',
    sizePt: 14
  })

  it('a LEFT box grows rightward from its anchor', () => {
    expect(boxSelectable(at('left')).box.x).toBe(100)
  })

  it('a RIGHT box grows LEFTWARD — using the anchor as the left edge is wrong', () => {
    expect(boxSelectable(at('right')).box.x).toBe(20)
    expect(boxSelectable(at('right')).box.w).toBe(80)
  })

  it('a CENTRED box grows both ways', () => {
    expect(boxSelectable(at('center')).box.x).toBe(60)
  })

  it('an auto-width box gets a readable estimate, not a zero-width box', () => {
    const b = boxSelectable(at('left', 0))
    expect(b.box.w).toBeGreaterThan(0)
    // and it is therefore actually marquee-selectable
    expect(intersects({ x: 95, y: 45, w: 20, h: 20 }, b.box)).toBe(true)
  })

  it('has a height of one line', () => {
    expect(boxSelectable(at('left')).box.h).toBeCloseTo(14 * 1.4, 6)
  })
})

describe('moveSelection', () => {
  it('moves every selected object by the same delta', () => {
    const shapes = [shape({ id: 'a' }), shape({ id: 'b', x: 100 })]
    const images = [image({ id: 'i', x: 5, y: 5 })]
    const boxes = [{ ...newBox('t', 20, 30, true), text: 'x' }]
    moveSelection(new Set(['a', 'b', 'i', 't']), shapes, images, boxes, 10, -5)
    expect(shapes[0].x).toBe(20)
    expect(shapes[1].x).toBe(110)
    expect(images[0].x).toBe(15)
    expect(images[0].y).toBe(0)
    expect(boxes[0].x).toBe(30)
    expect(boxes[0].y).toBe(25)
  })

  it('leaves UNSELECTED objects exactly where they were', () => {
    const shapes = [shape({ id: 'a' }), shape({ id: 'b', x: 100 })]
    moveSelection(new Set(['a']), shapes, [], [], 10, 10)
    expect(shapes[1].x).toBe(100)
    expect(shapes[1].y).toBe(10)
  })

  it('preserves the RELATIVE arrangement — that is what "move together" means', () => {
    const shapes = [shape({ id: 'a', x: 0, y: 0 }), shape({ id: 'b', x: 50, y: 20 })]
    moveSelection(new Set(['a', 'b']), shapes, [], [], 7, 3)
    expect(shapes[1].x - shapes[0].x).toBe(50)
    expect(shapes[1].y - shapes[0].y).toBe(20)
  })

  it('is a no-op for an empty selection', () => {
    const shapes = [shape({ id: 'a' })]
    moveSelection(new Set(), shapes, [], [], 99, 99)
    expect(shapes[0].x).toBe(10)
  })
})
