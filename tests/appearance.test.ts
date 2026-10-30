// Shadow, dash and corner radius — the appearance fields.
//
// Same contract as every other v4 field: absent at its default, so a document
// that never used one still writes version 3 and stays readable by v0.3.0.

import { describe, expect, it } from 'vitest'
import { cleanShape, stripDefaultV4, withAlpha, type Shape } from '../src/design/shapes'
import { newBox, parseProject, serializeProject, usesV4Features } from '../src/design/overlayModel'

const rect = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 's1',
  kind: 'rect',
  x: 0,
  y: 0,
  w: 100,
  h: 50,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 2,
  ...over
})

const box = { ...newBox('b1', 10, 10, true), text: 'x' }

describe('withAlpha', () => {
  it('turns a hex into an rgba the canvas accepts', () => {
    expect(withAlpha('#000000', 0.3)).toBe('rgba(0,0,0,0.3)')
    expect(withAlpha('#185abd', 1)).toBe('rgba(24,90,189,1)')
  })

  it('falls back to black rather than emitting an invalid colour', () => {
    expect(withAlpha('not a colour', 0.5)).toBe('rgba(0,0,0,0.5)')
  })
})

describe('shadow', () => {
  it('round-trips through the sidecar', () => {
    const s = cleanShape(rect({ shadow: { dx: 1, dy: 2, blur: 6, color: '#123456', alpha: 0.4 } }), 0)!
    expect(s.shadow).toEqual({ dx: 1, dy: 2, blur: 6, color: '#123456', alpha: 0.4 })
  })

  it('DROPS a fully transparent shadow — it is not a shadow', () => {
    expect(cleanShape(rect({ shadow: { dx: 1, dy: 2, blur: 6, color: '#000000', alpha: 0 } }), 0)!.shadow)
      .toBe(undefined)
  })

  it('drops a shadow with no offset AND no blur, which would be invisible', () => {
    expect(cleanShape(rect({ shadow: { dx: 0, dy: 0, blur: 0, color: '#000000', alpha: 0.5 } }), 0)!.shadow)
      .toBe(undefined)
  })

  it('defaults a non-hex colour to black rather than writing it through', () => {
    const s = cleanShape(rect({ shadow: { dx: 0, dy: 2, blur: 4, color: 'red;}</style>', alpha: 0.5 } }), 0)!
    expect(s.shadow!.color).toBe('#000000')
  })

  it('clamps the alpha and the distances', () => {
    const s = cleanShape(rect({ shadow: { dx: 9999, dy: -9999, blur: 9999, color: '#000000', alpha: 5 } }), 0)!
    expect(s.shadow!.alpha).toBe(1)
    expect(s.shadow!.dx).toBe(200)
    expect(s.shadow!.dy).toBe(-200)
    expect(s.shadow!.blur).toBe(200)
  })

  it('pushes the document to v4 and round-trips', () => {
    const shapes = { '1': [cleanShape(rect({ shadow: { dx: 0, dy: 2, blur: 6, color: '#000000', alpha: 0.3 } }), 0)!] }
    expect(usesV4Features(shapes, {})).toBe(true)
    const json = serializeProject('a.ai', { '1': [box] }, shapes)
    expect(JSON.parse(json).version).toBe(4)
    const back = parseProject(json)!
    expect(back.shapes['1'][0].shadow!.blur).toBe(6)
    expect(serializeProject(back.source, back.pages, back.shapes, back.images, back.studio)).toBe(json)
  })
})

describe('dash', () => {
  it('round-trips a pattern', () => {
    expect(cleanShape(rect({ dash: [6, 3] }), 0)!.dash).toEqual([6, 3])
  })

  it('drops an ALL-ZERO pattern, which is a solid line', () => {
    expect(cleanShape(rect({ dash: [0, 0] }), 0)!.dash).toBe(undefined)
  })

  it('drops an empty or absurd pattern', () => {
    expect(cleanShape(rect({ dash: [] }), 0)!.dash).toBe(undefined)
    expect(cleanShape(rect({ dash: 'dotted' }), 0)!.dash).toBe(undefined)
    expect(cleanShape(rect({ dash: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }), 0)!.dash).toBe(undefined)
  })

  it('clamps a negative length rather than confusing the renderer', () => {
    expect(cleanShape(rect({ dash: [-4, 3] }), 0)!.dash).toEqual([0, 3])
  })
})

describe('the v3 guarantee still holds', () => {
  it('a shape with no appearance fields stays v3', () => {
    const json = serializeProject('a.ai', { '1': [box] }, { '1': [cleanShape(rect(), 0)!] })
    expect(JSON.parse(json).version).toBe(3)
    expect(json).not.toContain('shadow')
    expect(json).not.toContain('dash')
  })

  it('stripDefaultV4 removes an invisible shadow left behind by the editor', () => {
    const s = { ...rect(), shadow: { dx: 0, dy: 0, blur: 0, color: '#000000', alpha: 0.5 } } as unknown as Shape
    const out = stripDefaultV4(s)
    expect('shadow' in out).toBe(false)
  })

  it('stripDefaultV4 removes a solid "dash"', () => {
    const s = { ...rect(), dash: [0, 0] } as unknown as Shape
    expect('dash' in stripDefaultV4(s)).toBe(false)
  })

  it('stripDefaultV4 KEEPS a real shadow', () => {
    const s = { ...rect(), shadow: { dx: 0, dy: 2, blur: 4, color: '#000000', alpha: 0.3 } } as unknown as Shape
    expect(stripDefaultV4(s).shadow).toBeTruthy()
  })
})

describe('corner radius applies only where it means something', () => {
  it('a rect keeps it', () => {
    expect(cleanShape(rect({ radius: [4, 4, 4, 4] }), 0)!.radius).toEqual([4, 4, 4, 4])
  })

  it('an ellipse does not', () => {
    expect(cleanShape(rect({ kind: 'ellipse', radius: [4, 4, 4, 4] }), 0)!.radius).toBe(undefined)
  })
})
