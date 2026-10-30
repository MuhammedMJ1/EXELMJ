import { describe, expect, it } from 'vitest'
import {
  TEMPLATE_EXT,
  defFromSelection,
  defSize,
  expandInstance,
  expandPage,
  parseTemplate,
  selectionOrigin,
  serializeTemplate,
  templateFileName,
  wouldCycle,
  type Selection
} from '../src/studio/template'
import { emptyStudioDoc, type ComponentDef, type StudioDoc } from '../src/studio/model'
import type { Shape } from '../src/design/shapes'
import type { PlacedImage } from '../src/design/images'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const shape = (over: Partial<Shape> = {}): Shape => ({
  id: 's1',
  kind: 'rect',
  x: 100,
  y: 50,
  w: 60,
  h: 40,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 2,
  ...over
})

const image = (over: Partial<PlacedImage> = {}): PlacedImage => ({
  id: 'i1',
  x: 120,
  y: 70,
  w: 20,
  h: 20,
  src: PNG,
  naturalW: 1,
  naturalH: 1,
  ...over
})

const sel = (over: Partial<Selection> = {}): Selection => ({
  boxes: [{ id: 'b1', x: 110, y: 60, width: 80, sizePt: 14, text: 'مرحبا' }],
  shapes: [shape()],
  images: [image()],
  ...over
})

describe('selectionOrigin', () => {
  it('finds the top-left across every object type', () => {
    expect(selectionOrigin(sel())).toEqual({ x: 100, y: 50 })
  })

  it('accounts for a shape drawn with negative extents', () => {
    const s = sel({ boxes: [], images: [], shapes: [shape({ x: 100, y: 100, w: -40, h: -30 })] })
    expect(selectionOrigin(s)).toEqual({ x: 60, y: 70 })
  })

  it('returns the origin for an empty selection rather than Infinity', () => {
    expect(selectionOrigin({ boxes: [], shapes: [], images: [] })).toEqual({ x: 0, y: 0 })
  })
})

describe('defFromSelection — rebasing is the whole point', () => {
  it('moves the selection so its top-left is 0,0', () => {
    const def = defFromSelection('d1', 'Card', 'card', sel())
    expect((def.content.shapes as Shape[])[0].x).toBe(0)
    expect((def.content.shapes as Shape[])[0].y).toBe(0)
  })

  it('keeps the RELATIVE positions of everything else', () => {
    const def = defFromSelection('d1', 'Card', 'card', sel())
    const img = (def.content.images as PlacedImage[])[0]
    expect(img.x).toBe(20)
    expect(img.y).toBe(20)
    const box = (def.content.boxes as Array<Record<string, unknown>>)[0]
    expect(box.x).toBe(10)
    expect(box.y).toBe(10)
  })

  it('keeps everything else about each object untouched', () => {
    const def = defFromSelection('d1', 'Card', 'card', sel())
    expect((def.content.shapes as Shape[])[0].fill).toBe('#185abd')
    expect((def.content.boxes as Array<Record<string, unknown>>)[0].text).toBe('مرحبا')
  })

  it('rebases frames too', () => {
    const def = defFromSelection('d1', 'C', 'card', {
      ...sel(),
      frames: [{ id: 'f', x: 100, y: 50, w: 200, h: 100, children: ['s1'] }]
    })
    expect(def.content.frames![0].x).toBe(0)
  })

  it('omits the frames key entirely when there are none', () => {
    expect('frames' in defFromSelection('d1', 'C', 'card', sel()).content).toBe(false)
  })
})

describe('defSize', () => {
  it('measures the content box', () => {
    const def = defFromSelection('d1', 'Card', 'card', sel())
    expect(defSize(def).w).toBeGreaterThanOrEqual(60)
    expect(defSize(def).h).toBeGreaterThanOrEqual(40)
  })

  it('is zero for an empty definition', () => {
    expect(defSize({ id: 'x', name: 'x', type: 'x', content: { boxes: [], shapes: [], images: [] } })).toEqual(
      { w: 0, h: 0 }
    )
  })
})

describe('expandInstance', () => {
  const def = defFromSelection('d1', 'Card', 'card', sel())

  it('places the content at the instance position', () => {
    const e = expandInstance({ id: 'inst1', defId: 'd1', x: 300, y: 200 }, def)
    expect(e.shapes[0].x).toBe(300)
    expect(e.shapes[0].y).toBe(200)
    expect(e.images[0].x).toBe(320)
  })

  it('NAMESPACES every id, so two instances cannot collide', () => {
    const a = expandInstance({ id: 'i1', defId: 'd1', x: 0, y: 0 }, def)
    const b = expandInstance({ id: 'i2', defId: 'd1', x: 50, y: 0 }, def)
    expect(a.shapes[0].id).not.toBe(b.shapes[0].id)
    expect(a.shapes[0].id).toBe('i1:s1')
  })

  it('applies a TEXT override and nothing else', () => {
    const e = expandInstance(
      { id: 'i1', defId: 'd1', x: 10, y: 10, overrides: { b1: 'Hello' } },
      def
    )
    expect(e.boxes[0].text).toBe('Hello')
    // position still comes from the definition, not the override
    expect(e.boxes[0].x).toBe(20)
  })

  it('applies a COLOUR override to the fill', () => {
    const e = expandInstance({ id: 'i1', defId: 'd1', x: 0, y: 0, overrides: { s1: '#ff0000' } }, def)
    expect(e.shapes[0].fill).toBe('#ff0000')
  })

  it('IGNORES a colour override that is not a hex', () => {
    const e = expandInstance(
      { id: 'i1', defId: 'd1', x: 0, y: 0, overrides: { s1: 'red;}</style>' } },
      def
    )
    expect(e.shapes[0].fill).toBe('#185abd')
  })

  it('applies an IMAGE override only when it is a data URL', () => {
    const other = `${PNG}AA`
    expect(expandInstance({ id: 'i', defId: 'd1', x: 0, y: 0, overrides: { i1: other } }, def).images[0].src)
      .toBe(other)
    expect(
      expandInstance({ id: 'i', defId: 'd1', x: 0, y: 0, overrides: { i1: 'https://evil/x.png' } }, def)
        .images[0].src
    ).toBe(PNG)
  })

  it('namespaces a frame CHILD list, or the frame would point at the definition', () => {
    const withFrame = defFromSelection('d2', 'F', 'card', {
      ...sel(),
      frames: [{ id: 'f', x: 100, y: 50, w: 200, h: 100, children: ['s1'] }]
    })
    const e = expandInstance({ id: 'inst', defId: 'd2', x: 0, y: 0 }, withFrame)
    expect(e.frames[0].children).toEqual(['inst:s1'])
    expect(e.shapes[0].id).toBe('inst:s1')
  })
})

describe('expandPage', () => {
  const doc = (): StudioDoc => {
    const d = emptyStudioDoc()
    d.components = [defFromSelection('d1', 'Card', 'card', sel())]
    d.instances['1'] = [
      { id: 'a', defId: 'd1', x: 0, y: 0 },
      { id: 'b', defId: 'd1', x: 200, y: 0 }
    ]
    return d
  }

  it('expands every instance on the page', () => {
    const e = expandPage(doc(), '1')
    expect(e.shapes).toHaveLength(2)
    expect(e.shapes[0].x).toBe(0)
    expect(e.shapes[1].x).toBe(200)
  })

  it('REPORTS a missing definition instead of substituting a placeholder', () => {
    const d = doc()
    d.instances['1'].push({ id: 'c', defId: 'gone', x: 0, y: 0 })
    const e = expandPage(d, '1')
    expect(e.missing).toEqual(['gone'])
    expect(e.shapes).toHaveLength(2)
  })

  it('is empty for a page with no instances', () => {
    const e = expandPage(doc(), '9')
    expect(e.shapes).toEqual([])
    expect(e.missing).toEqual([])
  })
})

describe('wouldCycle — an infinite expansion hangs the renderer', () => {
  it('catches the direct case', () => {
    expect(wouldCycle(emptyStudioDoc(), 'a', 'a')).toBe(true)
  })

  it('allows an unrelated definition', () => {
    const d = emptyStudioDoc()
    d.components = [defFromSelection('b', 'B', 'x', sel())]
    expect(wouldCycle(d, 'a', 'b')).toBe(false)
  })

  it('catches an indirect cycle through a frame', () => {
    const d = emptyStudioDoc()
    const inner: ComponentDef = {
      id: 'b',
      name: 'B',
      type: 'x',
      content: { boxes: [], shapes: [shape()], images: [], frames: [{ id: 'f', x: 0, y: 0, w: 10, h: 10, children: ['a'] }] }
    }
    d.components = [inner]
    expect(wouldCycle(d, 'a', 'b')).toBe(true)
  })

  it('terminates on a definition that references itself', () => {
    const d = emptyStudioDoc()
    d.components = [
      {
        id: 'b',
        name: 'B',
        type: 'x',
        content: { boxes: [], shapes: [], images: [], frames: [{ id: 'f', x: 0, y: 0, w: 1, h: 1, children: ['b'] }] }
      }
    ]
    expect(wouldCycle(d, 'a', 'b')).toBe(false)
  })
})

describe('the template file', () => {
  const def = defFromSelection('d1', 'بطاقة', 'card', sel())

  it('round-trips', () => {
    const back = parseTemplate(serializeTemplate(def, '0.2.2'))!
    expect(back).toBeTruthy()
    expect(back.name).toBe('بطاقة')
    expect((back.content.shapes as Shape[])[0].fill).toBe('#185abd')
  })

  it('refuses a file with the wrong format tag', () => {
    expect(parseTemplate(JSON.stringify({ format: 'other', def }))).toBe(null)
  })

  it('refuses malformed JSON rather than throwing', () => {
    expect(parseTemplate('{{{')).toBe(null)
    expect(parseTemplate('null')).toBe(null)
  })

  it('refuses a template with no drawable content', () => {
    const empty = { ...def, content: { boxes: [], shapes: [], images: [] } }
    expect(parseTemplate(serializeTemplate(empty, '0.2.2'))).toBe(null)
  })

  it('VALIDATES the content with the same cleaners the sidecar uses', () => {
    const hostile = JSON.stringify({
      format: 'exelmj-template/1',
      writer: 'x',
      def: {
        id: 'd',
        name: 'n',
        type: 't',
        content: {
          boxes: [],
          images: [],
          shapes: [
            { kind: 'path', d: 'M0 0 url(#evil)', w: 10, h: 10, fill: '#000000' },
            { kind: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#00ff00', stroke: '' }
          ]
        }
      }
    })
    const back = parseTemplate(hostile)!
    expect(back.content.shapes).toHaveLength(1)
    expect((back.content.shapes as Shape[])[0].kind).toBe('rect')
  })

  it('keeps slots and drops a slot with no id', () => {
    const withSlots: ComponentDef = {
      ...def,
      slots: [
        { id: 'b1', label: 'Title', kind: 'text' },
        { id: '', label: 'broken', kind: 'text' }
      ]
    }
    const back = parseTemplate(serializeTemplate(withSlots, '0.2.2'))!
    expect(back.slots).toHaveLength(1)
    expect(back.slots![0].id).toBe('b1')
  })
})

describe('templateFileName — Windows is unforgiving', () => {
  it('uses the extension', () => {
    expect(templateFileName('Card')).toBe(`Card${TEMPLATE_EXT}`)
  })

  it('strips characters Windows forbids', () => {
    expect(templateFileName('a/b\\c:d*e?f"g<h>i|j')).toBe(`a-b-c-d-e-f-g-h-i-j${TEMPLATE_EXT}`)
  })

  it('refuses a RESERVED device name — CON cannot be a filename at all', () => {
    expect(templateFileName('CON')).toBe(`template${TEMPLATE_EXT}`)
    expect(templateFileName('com1')).toBe(`template${TEMPLATE_EXT}`)
  })

  it('strips a leading dot and a trailing dot or space', () => {
    expect(templateFileName('..hidden')).toBe(`hidden${TEMPLATE_EXT}`)
    expect(templateFileName('name. ')).toBe(`name${TEMPLATE_EXT}`)
  })

  it('falls back for an empty name', () => {
    expect(templateFileName('   ')).toBe(`template${TEMPLATE_EXT}`)
  })

  it('keeps an Arabic name, which is legal on NTFS', () => {
    expect(templateFileName('بطاقة')).toBe(`بطاقة${TEMPLATE_EXT}`)
  })

  it('caps the length', () => {
    expect(templateFileName('x'.repeat(200)).length).toBeLessThan(80)
  })
})
