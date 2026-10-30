// How a shape reaches the screen: its paint, its transform, its shadow region.
//
// Every case here is a bug the user actually hit. They are unit tests rather
// than DOM tests because the decisions were extracted OUT of the renderer for
// exactly that reason — the renderer needs a browser, the decisions do not.

import { describe, expect, it } from 'vitest'
import { shadowRegion, shapePaint, shapeTransform, type Shape } from '../src/design/shapes'
import { applyBoxToShape } from '../src/design/transform'

const path = (over: Partial<Shape> = {}): Shape => ({
  id: 'p1',
  kind: 'path',
  x: 100,
  y: 60,
  w: 40,
  h: 20,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 2,
  d: 'M0 0L40 0L40 20Z',
  ...over
})

const rect = (over: Partial<Shape> = {}): Shape => ({
  id: 'r1',
  kind: 'rect',
  x: 10,
  y: 20,
  w: 100,
  h: 50,
  fill: '#185abd',
  stroke: '',
  strokeWidth: 2,
  ...over
})

describe('shapeTransform: a rotated path must not lose its position', () => {
  it('keeps the translate when the path is rotated', () => {
    // THE BUG: rotation was written with its own setAttribute('transform'),
    // which replaced the translate carrying the path's position. The path
    // snapped to the page origin and the user saw it disappear.
    const tf = shapeTransform(path({ rotation: 30 }))
    expect(tf).toContain('translate(100 60)')
    expect(tf).toContain('rotate(30')
  })

  it('rotates about the bbox CENTRE, not the origin', () => {
    expect(shapeTransform(path({ rotation: 90 }))).toContain('rotate(90 120 70)')
  })

  it('puts rotate FIRST, so the local point is placed before it is spun', () => {
    const tf = shapeTransform(path({ rotation: 45 }))
    expect(tf.indexOf('rotate')).toBeLessThan(tf.indexOf('translate'))
  })

  it('an unrotated path still carries its translate', () => {
    expect(shapeTransform(path())).toBe('translate(100 60)')
  })

  it('a rect carries its position in x/y, so it gets rotate ALONE', () => {
    expect(shapeTransform(rect({ rotation: 15 }))).toBe('rotate(15 60 45)')
  })

  it('an unrotated rect needs no transform at all', () => {
    expect(shapeTransform(rect())).toBe('')
  })

  it('a line rotates about the centre of its SIGNED delta', () => {
    const line: Shape = {
      id: 'l1', kind: 'line', x: 100, y: 100, w: -40, h: -20,
      fill: '', stroke: '#000', strokeWidth: 2, rotation: 10
    }
    // bbox is (60,80)-(100,100), so the centre is (80,90) — not (120,110),
    // which is what using the raw x+w/2 on a negative delta would give.
    expect(shapeTransform(line)).toBe('rotate(10 80 90)')
  })
})

describe('shapePaint: fill and stroke are INDEPENDENT', () => {
  it('a path with BOTH paints both', () => {
    // THE BUG: one if/else chain meant a path carrying both painted the fill
    // and dropped the stroke, so recolouring an outline looked like a no-op.
    expect(shapePaint(path({ fill: '#ff0000', stroke: '#00ff00' }))).toEqual({
      fill: '#ff0000',
      stroke: '#00ff00'
    })
  })

  it('a stroke-only path does not get a black fill', () => {
    expect(shapePaint(path({ fill: '', stroke: '#00ff00' }))).toEqual({
      fill: 'none',
      stroke: '#00ff00'
    })
  })

  it('a fill-only path draws no stroke', () => {
    expect(shapePaint(path({ stroke: '' })).stroke).toBe(null)
  })

  it('a path with NEITHER falls back to black rather than vanishing', () => {
    expect(shapePaint(path({ fill: '', stroke: '' }))).toEqual({ fill: '#000000', stroke: null })
  })

  it('a gradient outranks the flat fill', () => {
    const s = path({ gradient: { x1: 0, y1: 0, x2: 40, y2: 0, from: '#000000', to: '#ffffff' } })
    expect(shapePaint(s).fill).toBe('gradient')
  })

  it('...which is why recolouring has to DELETE the gradient', () => {
    // Setting `fill` alone changed the swatch and the saved file while the
    // shape on screen kept its gradient — the user's "colours do nothing".
    const s = path({
      fill: '#ff0000',
      gradient: { x1: 0, y1: 0, x2: 40, y2: 0, from: '#000000', to: '#ffffff' }
    })
    expect(shapePaint(s).fill).toBe('gradient')
    delete s.gradient
    expect(shapePaint(s).fill).toBe('#ff0000')
  })

  it('a gradient still lets its stroke through', () => {
    const s = path({
      stroke: '#00ff00',
      gradient: { x1: 0, y1: 0, x2: 40, y2: 0, from: '#000000', to: '#ffffff' }
    })
    expect(shapePaint(s).stroke).toBe('#00ff00')
  })

  it('an unfilled rect is "none", never black', () => {
    expect(shapePaint(rect({ fill: '', stroke: '#000000' }))).toEqual({
      fill: 'none',
      stroke: '#000000'
    })
  })

  it('a line with no stroke falls back to black — it IS its stroke', () => {
    const line: Shape = {
      id: 'l1', kind: 'line', x: 0, y: 0, w: 10, h: 10,
      fill: '', stroke: '', strokeWidth: 2
    }
    expect(shapePaint(line)).toEqual({ fill: 'none', stroke: '#000000' })
  })
})

describe('shadowRegion', () => {
  const shadow = { dx: 4, dy: 6, blur: 10, color: '#000000', alpha: 0.3 }

  it('is null without a shadow', () => {
    expect(shadowRegion(rect())).toBe(null)
  })

  it('blurs at HALF the stated radius, matching canvas shadowBlur', () => {
    // The exporter paints through canvas, whose shadowBlur is twice the
    // gaussian sigma. Disagreeing here means the PDF does not match the screen.
    expect(shadowRegion(rect({ shadow }))!.stdDeviation).toBe(5)
  })

  it('pads far enough that the blur tail and the offset both fit', () => {
    const r = shadowRegion(rect({ shadow }))!
    const pad = 10 * 2 + 6 + 2 + 4
    expect(r.x).toBe(10 - pad)
    expect(r.y).toBe(20 - pad)
    expect(r.w).toBe(100 + pad * 2)
    expect(r.h).toBe(50 + pad * 2)
  })

  it('a PATH gets a LOCAL region — its own transform is the user space', () => {
    // Using the absolute bbox here would put the filter region 100pt away from
    // the geometry it is meant to cover, and the shadow would be clipped out.
    const r = shadowRegion(path({ shadow }))!
    const pad = 10 * 2 + 6 + 2 + 4
    expect(r.x).toBe(-pad)
    expect(r.y).toBe(-pad)
    expect(r.w).toBe(40 + pad * 2)
  })

  it('a thin shape still gets a region wide enough for the blur', () => {
    // The default filter region is a PERCENTAGE of the bbox, so a 0.01pt-tall
    // line would clip its own shadow away entirely.
    const line: Shape = {
      id: 'l1', kind: 'line', x: 0, y: 0, w: 80, h: 0,
      fill: '', stroke: '#000', strokeWidth: 1, shadow
    }
    expect(shadowRegion(line)!.h).toBeGreaterThan(20)
  })
})

describe('a flat path survives being resized', () => {
  // THE BUG: a pen line drawn perfectly horizontally is stored with h clamped
  // to 0.01 so its bounding box stays hit-testable. Dragging a handle then
  // scaled y by to.h / 0.01 — a factor of thousands — and the line shot off
  // the page. The user reported it as the drawing disappearing.
  const flat = (): Shape => ({
    id: 'p1',
    kind: 'path',
    x: 50,
    y: 50,
    w: 120,
    h: 0.01,
    fill: '',
    stroke: '#0f172a',
    strokeWidth: 2,
    d: 'M0 0L60 0L120 0'
  })

  it('does not explode along the axis it has no extent on', () => {
    const out = applyBoxToShape(flat(), { x: 50, y: 50, w: 120, h: 40 })
    expect(out.h).toBe(0.01)
    expect(out.d).toBe('M0 0L60 0 120 0')
  })

  it('still resizes along the axis it DOES have extent on', () => {
    const out = applyBoxToShape(flat(), { x: 50, y: 50, w: 240, h: 0.01 })
    expect(out.w).toBe(240)
    expect(out.d).toBe('M0 0L120 0 240 0')
  })

  it('still moves', () => {
    const out = applyBoxToShape(flat(), { x: 300, y: 200, w: 120, h: 40 })
    expect([out.x, out.y]).toEqual([300, 200])
  })

  it('a vertical line is protected on the other axis', () => {
    const v: Shape = { ...flat(), w: 0.01, h: 120, d: 'M0 0L0 120' }
    const out = applyBoxToShape(v, { x: 50, y: 50, w: 40, h: 120 })
    expect(out.w).toBe(0.01)
    expect(out.d).toBe('M0 0L0 120')
  })

  it('a path with real extent on both axes is unaffected by the guard', () => {
    const box: Shape = { ...flat(), h: 60, d: 'M0 0L120 0L120 60Z' }
    const out = applyBoxToShape(box, { x: 50, y: 50, w: 240, h: 120 })
    expect([out.w, out.h]).toEqual([240, 120])
    expect(out.d).toBe('M0 0L240 0 240 120Z')
  })
})
