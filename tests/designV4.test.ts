import { describe, expect, it } from 'vitest'
import {
  newBox,
  parseProject,
  serializeProject,
  usesV4Features
} from '../src/design/overlayModel'
import { cleanShape, shapeHit, type Shape } from '../src/design/shapes'
import { cleanImage, type PlacedImage } from '../src/design/images'
import { cleanStudioDoc, emptyStudioDoc, isEmptyStudioDoc } from '../src/studio/model'

// A 1x1 transparent PNG — the smallest thing cleanImage will accept.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

const rect = (over: Partial<Shape> = {}): Shape => ({
  id: 's1',
  kind: 'rect',
  x: 10,
  y: 20,
  w: 100,
  h: 50,
  fill: '#ff0000',
  stroke: '',
  strokeWidth: 2,
  ...over
})

const image = (over: Partial<PlacedImage> = {}): PlacedImage => ({
  id: 'img-1',
  x: 5,
  y: 6,
  w: 40,
  h: 30,
  src: PNG,
  naturalW: 1,
  naturalH: 1,
  ...over
})

describe('v3 files stay v3 — the compatibility guarantee', () => {
  const box = { ...newBox('box-1', 40, 60, true), text: 'مرحبا' }

  it('writes version 3 when nothing v4 is used', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect()] }, { '1': [image()] })
    expect(JSON.parse(json).version).toBe(3)
  })

  it('round-trips a v3 sidecar byte-identically', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect()] }, { '1': [image()] })
    const parsed = parseProject(json)!
    const again = serializeProject(parsed.source, parsed.pages, parsed.shapes, parsed.images, parsed.studio)
    expect(again).toBe(json)
  })

  it('emits no v4 keys at all on a v3 document', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect()] }, { '1': [image()] })
    expect(json).not.toContain('rotation')
    expect(json).not.toContain('opacity')
    expect(json).not.toContain('radius')
    expect(json).not.toContain('studio')
  })

  it('treats a zero rotation as absent, not as v4', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect({ rotation: 0 })] })
    expect(JSON.parse(json).version).toBe(3)
    expect(json).not.toContain('rotation')
  })

  it('treats full opacity as absent, not as v4', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect({ opacity: 1 })] })
    expect(JSON.parse(json).version).toBe(3)
  })

  it('treats an all-zero radius as absent, not as v4', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect({ radius: [0, 0, 0, 0] })] })
    expect(JSON.parse(json).version).toBe(3)
  })
})

describe('v4 files declare themselves', () => {
  const box = { ...newBox('box-1', 40, 60, true), text: 'x' }

  it('bumps to 4 for a rotated shape and round-trips it', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect({ rotation: 45 })] })
    expect(JSON.parse(json).version).toBe(4)
    const parsed = parseProject(json)!
    expect(parsed.version).toBe(4)
    expect(parsed.shapes['1'][0].rotation).toBe(45)
    expect(serializeProject(parsed.source, parsed.pages, parsed.shapes, parsed.images, parsed.studio)).toBe(json)
  })

  it('bumps to 4 for a faded shape', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect({ opacity: 0.5 })] })
    expect(JSON.parse(json).version).toBe(4)
  })

  it('bumps to 4 for a rounded rect and keeps all four corners', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [rect({ radius: [4, 0, 8, 2] })] })
    expect(JSON.parse(json).version).toBe(4)
    expect(parseProject(json)!.shapes['1'][0].radius).toEqual([4, 0, 8, 2])
  })

  it('bumps to 4 for a rotated image', () => {
    const json = serializeProject('a.ai', { '1': [box] }, {}, { '1': [image({ rotation: 12 })] })
    expect(JSON.parse(json).version).toBe(4)
    expect(parseProject(json)!.images['1'][0].rotation).toBe(12)
  })

  it('reports v4 usage without serialising', () => {
    expect(usesV4Features({ '1': [rect()] }, {})).toBe(false)
    expect(usesV4Features({ '1': [rect({ rotation: 3 })] }, {})).toBe(true)
    expect(usesV4Features({}, { '1': [image({ opacity: 0.2 })] })).toBe(true)
  })
})

describe('v4 field validation — a sidecar is never trusted', () => {
  it('normalises rotation into [0, 360)', () => {
    expect(cleanShape({ ...rect(), rotation: 450 }, 0)!.rotation).toBe(90)
    expect(cleanShape({ ...rect(), rotation: -90 }, 0)!.rotation).toBe(270)
    expect(cleanShape({ ...rect(), rotation: 360 }, 0)!.rotation).toBe(undefined)
  })

  it('drops an unparseable rotation instead of writing NaN', () => {
    const s = cleanShape({ ...rect(), rotation: 'sideways' }, 0)!
    expect(s.rotation).toBe(undefined)
    expect(JSON.stringify(s)).not.toContain('null')
  })

  it('clamps opacity into 0..1', () => {
    expect(cleanShape({ ...rect(), opacity: -3 }, 0)!.opacity).toBe(0)
    expect(cleanShape({ ...rect(), opacity: 9 }, 0)!.opacity).toBe(undefined)
  })

  it('ignores radius on kinds that cannot round', () => {
    const e = cleanShape({ ...rect(), kind: 'ellipse', radius: [4, 4, 4, 4] }, 0)!
    expect(e.radius).toBe(undefined)
  })

  it('rejects a malformed radius', () => {
    expect(cleanShape({ ...rect(), radius: [4, 4] }, 0)!.radius).toBe(undefined)
    expect(cleanShape({ ...rect(), radius: 'round' }, 0)!.radius).toBe(undefined)
  })

  it('normalises image rotation the same way', () => {
    expect(cleanImage({ ...image(), rotation: -45 }, 0)!.rotation).toBe(315)
    expect(cleanImage({ ...image(), rotation: 0 }, 0)!.rotation).toBe(undefined)
  })
})

describe('rotated hit-testing', () => {
  it('picks a rotated rect where it actually is, not where its box was', () => {
    // a tall thin rect turned 90deg becomes wide and flat
    const s = rect({ x: 100, y: 100, w: 20, h: 200, rotation: 90 })
    // a point far along the ORIGINAL x axis is outside; along the rotated one, inside
    expect(shapeHit(s, 200, 200, 0)).toBe(true)
    expect(shapeHit(s, 110, 120, 0)).toBe(false)
  })

  it('agrees with the unrotated test at rotation 0', () => {
    const s = rect({ x: 0, y: 0, w: 100, h: 100 })
    const r = rect({ x: 0, y: 0, w: 100, h: 100, rotation: 360 })
    for (const [x, y] of [[50, 50], [-10, 50], [99, 1]] as const) {
      expect(shapeHit(r, x, y)).toBe(shapeHit(s, x, y))
    }
  })
})

describe('the studio side-table', () => {
  it('an empty doc is treated as absent', () => {
    expect(isEmptyStudioDoc(emptyStudioDoc())).toBe(true)
    expect(isEmptyStudioDoc(undefined)).toBe(true)
    const json = serializeProject('a.ai', {}, {}, {}, emptyStudioDoc())
    expect(JSON.parse(json).version).toBe(3)
  })

  it('round-trips frames, tokens and page kinds', () => {
    const doc = emptyStudioDoc()
    doc.frames['1'] = [
      {
        id: 'f1',
        x: 0,
        y: 0,
        w: 300,
        h: 200,
        children: ['s1', 'box-1'],
        layout: {
          direction: 'row',
          gap: 8,
          padding: [4, 4, 4, 4],
          align: 'center',
          justify: 'between',
          wrap: false,
          dir: 'rtl'
        }
      }
    ]
    doc.tokens.base = { color: { brand: { $value: '#185abd', $type: 'color' } } }
    doc.pageKind['1'] = { kind: 'icon', grid: 24, preset: 'material' }
    const json = serializeProject('a.ai', {}, {}, {}, doc)
    expect(JSON.parse(json).version).toBe(4)
    const parsed = parseProject(json)!
    expect(parsed.studio!.frames['1'][0].layout!.dir).toBe('rtl')
    expect(parsed.studio!.pageKind['1']).toEqual({ kind: 'icon', grid: 24, preset: 'material' })
    expect(serializeProject(parsed.source, parsed.pages, parsed.shapes, parsed.images, parsed.studio)).toBe(json)
  })

  it('refuses a studio block with the wrong schema tag', () => {
    expect(cleanStudioDoc({ schema: 'something-else', frames: {} })).toBe(undefined)
  })

  it('drops a colour token that is not a hex — it would reach an SVG attribute', () => {
    const doc = cleanStudioDoc({
      schema: 'exelmj-studio/1',
      tokens: { base: { bad: { $value: 'red;url(#x)', $type: 'color' }, ok: { $value: '#00ff00', $type: 'color' } } }
    })
    expect(doc!.tokens.base.bad).toBe(undefined)
    expect(doc!.tokens.base.ok).toEqual({ $value: '#00ff00', $type: 'color' })
  })

  it('drops a frame with no area', () => {
    const doc = cleanStudioDoc({
      schema: 'exelmj-studio/1',
      frames: { '1': [{ id: 'f', x: 0, y: 0, w: 0, h: 0, children: [] }] }
    })
    expect(doc).toBe(undefined)
  })

  it('defaults an unknown layout value rather than trusting it', () => {
    const doc = cleanStudioDoc({
      schema: 'exelmj-studio/1',
      frames: {
        '1': [
          {
            id: 'f',
            x: 0,
            y: 0,
            w: 10,
            h: 10,
            children: [],
            layout: { direction: 'diagonal', align: 'nowhere', justify: 'sideways', dir: 'ttb' }
          }
        ]
      }
    })
    const l = doc!.frames['1'][0].layout!
    expect(l.direction).toBe('row')
    expect(l.align).toBe('start')
    expect(l.justify).toBe('start')
    expect(l.dir).toBe('rtl')
  })
})
