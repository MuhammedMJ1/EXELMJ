// The design as HTML and CSS.
//
// This is what a motion rule attaches to, so the two things that matter most
// are that a class is STABLE (a rule written last week still points at the
// same element) and that positions are LOGICAL (an Arabic page mirrors).

import { describe, expect, it } from 'vitest'
import { classOf, esc, pageToHtml, px, stageCss, toStandaloneHtml, type HtmlInput } from '../src/studio/htmlExport'
import type { Shape } from '../src/design/shapes'
import { newBox } from '../src/design/overlayModel'

const base = (over: Partial<HtmlInput> = {}): HtmlInput => ({
  name: 'test',
  page: '1',
  widthPt: 400,
  heightPt: 300,
  boxes: [],
  shapes: [],
  images: [],
  groups: [],
  dir: 'rtl',
  lang: 'ar',
  ...over
})

const rect = (over: Partial<Shape> = {}): Shape => ({
  id: 'shape-1',
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

describe('units', () => {
  it('converts points to css pixels at the web ratio', () => {
    // 1px = 0.75pt is fixed by the platform, not a preference.
    expect(px(72)).toBe(96)
    expect(px(0.75)).toBe(1)
  })
})

describe('classOf', () => {
  it('is derived from the id and nothing else, so it is stable', () => {
    expect(classOf('shape-7')).toBe('o-shape-7')
    expect(classOf('shape-7')).toBe(classOf('shape-7'))
  })

  it('scrubs anything a css class cannot carry', () => {
    // An id with a space would produce a selector matching two things.
    expect(classOf('a b.c#d')).toBe('o-a-b-c-d')
  })

  it('never produces a bare or leading-dash class', () => {
    expect(classOf('')).toBe('o-x')
    expect(classOf('---')).toBe('o-x')
  })
})

describe('esc', () => {
  it('closes the obvious hole', () => {
    expect(esc('<script>alert(1)</script>')).not.toContain('<script>')
  })

  it('escapes quotes, because text lands in attributes too', () => {
    expect(esc('a"b')).toBe('a&quot;b')
  })
})

describe('shapes become elements', () => {
  it('a rect is a positioned div carrying its own class', () => {
    const out = pageToHtml(base({ shapes: [rect()] }))
    expect(out.html).toContain('class="o-shape-1"')
    expect(out.css).toContain('.o-shape-1 {')
    expect(out.css).toContain('width: 133.33px')
  })

  it('positions LOGICALLY, so an Arabic page mirrors', () => {
    // `left` would pin the object to the wrong edge the moment dir flips —
    // the handoff manifest promises logical properties for exactly this.
    const out = pageToHtml(base({ shapes: [rect()] }))
    expect(out.css).toContain('inset-inline-start')
    expect(out.css).not.toMatch(/^\s*left:/m)
  })

  it('an ellipse is a div rounded to a circle, not an svg', () => {
    const out = pageToHtml(base({ shapes: [rect({ kind: 'ellipse' })] }))
    expect(out.css).toContain('border-radius: 50%')
    expect(out.html).not.toContain('<svg')
  })

  it('a stroked rect uses border-box, or it comes out too wide', () => {
    const out = pageToHtml(base({ shapes: [rect({ stroke: '#000000' })] }))
    expect(out.css).toContain('box-sizing: border-box')
  })

  it('carries a rounded corner, a shadow and a rotation', () => {
    const out = pageToHtml(base({
      shapes: [rect({ radius: [4, 4, 4, 4], rotation: 30, shadow: { dx: 0, dy: 2, blur: 6, color: '#000000', alpha: 0.3 } })]
    }))
    expect(out.css).toContain('border-radius: 5.33px 5.33px 5.33px 5.33px')
    expect(out.css).toContain('rotate(30deg)')
    expect(out.css).toContain('rgba(0,0,0,0.3)')
  })

  it('a path travels as inline svg, so the file opens from disk alone', () => {
    const out = pageToHtml(base({ shapes: [rect({ kind: 'path', d: 'M0 0L10 10', fill: '', stroke: '#000000' })] }))
    expect(out.html).toContain('<svg')
    expect(out.html).toContain('d="M0 0L10 10"')
  })

  it('refuses path data that is not path data', () => {
    const out = pageToHtml(base({ shapes: [rect({ kind: 'path', d: 'url(javascript:1)' })] }))
    expect(out.html).not.toContain('javascript')
  })

  it('a line drawn leftward still starts where it was drawn', () => {
    // (x,y) is the FIRST endpoint and (w,h) a signed delta; reading x/y as the
    // box origin mirrors the line.
    const out = pageToHtml(base({ shapes: [rect({ kind: 'line', w: -40, h: -20, stroke: '#000000' })] }))
    expect(out.html).toContain('x1="40"')
    expect(out.html).toContain('y1="20"')
    expect(out.html).toContain('x2="0"')
  })

  it('places a leftward line by its BOX, not its first point', () => {
    const out = pageToHtml(base({ shapes: [rect({ kind: 'line', x: 100, y: 100, w: -40, h: -20, stroke: '#000000' })] }))
    expect(out.css).toContain(`inset-inline-start: ${px(60)}px`)
  })
})

describe('text', () => {
  it('carries its font, size and colour', () => {
    const b = { ...newBox('box-1', 20, 30, true), text: 'مرحبا', sizePt: 18, color: '#112233' }
    const out = pageToHtml(base({ boxes: [b] }))
    expect(out.html).toContain('مرحبا')
    expect(out.css).toContain('font-size: 24px')
    expect(out.css).toContain('color: #112233')
  })

  it('anchors a right-aligned box from the far edge', () => {
    // A right-aligned box grows LEFTWARD from its x, so pinning its start
    // edge would put it in the wrong place and stretch the wrong way.
    const b = { ...newBox('box-1', 300, 30, true), text: 'x', align: 'right' as const }
    const out = pageToHtml(base({ boxes: [b], widthPt: 400 }))
    expect(out.css).toContain(`inset-inline-end: ${px(100)}px`)
  })

  it('escapes the text it prints', () => {
    const b = { ...newBox('box-1', 10, 10, true), text: '<b>x</b>' }
    expect(pageToHtml(base({ boxes: [b] })).html).toContain('&lt;b&gt;')
  })
})

describe('groups', () => {
  it('become one wrapper the whole group can be moved by', () => {
    const out = pageToHtml(base({
      shapes: [rect({ id: 'a' }), rect({ id: 'b' })],
      groups: [{ id: 'g1', name: 'G', children: ['a', 'b'] }]
    }))
    expect(out.html).toContain('class="o-g1 exl-group"')
    expect((out.html.match(/<\/div>/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('leaves ungrouped objects unwrapped', () => {
    const out = pageToHtml(base({ shapes: [rect({ id: 'a' })] }))
    expect(out.html).not.toContain('exl-group')
  })
})

describe('the standalone page', () => {
  const html = toStandaloneHtml(base({ shapes: [rect()] }), '.o-shape-1:hover { opacity: 0.5; }')

  it('declares its direction as an attribute, not as css', () => {
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('lang="ar"')
  })

  it('needs nothing from the network', () => {
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    expect(html).not.toContain('<link')
  })

  it('puts the motion sheet LAST, so it wins without !important', () => {
    expect(html.indexOf('.o-shape-1:hover')).toBeGreaterThan(html.indexOf('.o-shape-1 {'))
  })

  it('sizes the stage to the artboard', () => {
    expect(stageCss(400, 300)).toContain('width: 533.33px')
    expect(stageCss(400, 300)).toContain('height: 400px')
  })
})

describe('the bundle carries a page that runs', () => {
  it('emits ui/index.html, and the motion sheet beside it', async () => {
    const { bundleFiles } = await import('../src/studio/bundle')
    const { emptyStudioDoc } = await import('../src/studio/model')
    const studio = emptyStudioDoc()
    studio.interactions = {
      '1': [{
        id: 'm1', targetId: 'shape-1', trigger: 'hover',
        changes: [{ prop: 'scale', from: 1, to: 1.1 }],
        duration: 200, delay: 0, easing: 'out', repeat: 0, direction: 'normal'
      }]
    }
    const files = bundleFiles({
      name: 'demo', writer: 'test', generatedAt: '2026-01-01T00:00:00Z',
      pages: {}, shapes: { '1': [rect()] }, images: {}, studio,
      pageSize: { '1': { widthPt: 400, heightPt: 300 } }
    })
    const paths = files.map((f) => f.path)
    expect(paths).toContain('ui/index.html')
    expect(paths).toContain('ui/motion.css')
    const html = files.find((f) => f.path === 'ui/index.html')!.text!
    expect(html).toContain('.o-shape-1:hover')
    expect(html).toContain('exl-stage')
  })

  it('writes no motion sheet when the document records no motion', () => {
    // An empty file that the manifest promises has content is the silent lie
    // this bundle format is built against.
    return import('../src/studio/bundle').then(async ({ bundleFiles }) => {
      const { emptyStudioDoc } = await import('../src/studio/model')
      const files = bundleFiles({
        name: 'demo', writer: 'test', generatedAt: '2026-01-01T00:00:00Z',
        pages: {}, shapes: { '1': [rect()] }, images: {}, studio: emptyStudioDoc(),
        pageSize: { '1': { widthPt: 400, heightPt: 300 } }
      })
      expect(files.map((f) => f.path)).not.toContain('ui/motion.css')
      expect(files.map((f) => f.path)).toContain('ui/index.html')
    })
  })

  it('a toggle brings its checkbox with it, or the css selects nothing', async () => {
    const { bundleFiles } = await import('../src/studio/bundle')
    const { emptyStudioDoc } = await import('../src/studio/model')
    const studio = emptyStudioDoc()
    studio.interactions = {
      '1': [{
        id: 'm1', targetId: 'shape-1', trigger: 'toggle',
        changes: [{ prop: 'rotate', from: 0, to: 90 }],
        duration: 300, delay: 0, easing: 'out', repeat: 0, direction: 'normal'
      }]
    }
    const files = bundleFiles({
      name: 'demo', writer: 'test', generatedAt: '2026-01-01T00:00:00Z',
      pages: {}, shapes: { '1': [rect()] }, images: {}, studio,
      pageSize: { '1': { widthPt: 400, heightPt: 300 } }
    })
    const html = files.find((f) => f.path === 'ui/index.html')!.text!
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('id="exl-t-o-shape-1"')
    expect(html).toContain('<label for="exl-t-o-shape-1"')
    // and the script that carries the state to a screen reader
    expect(files.map((f) => f.path)).toContain('ui/motion.js')
    expect(html).toContain('motion.js')
  })
})
