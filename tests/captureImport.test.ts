import { describe, expect, it } from 'vitest'
import { firstFamily, importCapture, pxToPt, type Capture } from '../src/studio/captureImport'

const opts = { x: 100, y: 50, shapeId: (n: number) => `s${n}`, boxId: (n: number) => `b${n}` }

const cap = (over: Partial<Capture> = {}): Capture => ({
  tag: 'div',
  url: 'https://x.test/',
  box: { xPx: 200, yPx: 300, wPx: 400, hPx: 200 },
  styles: {
    'background-color': 'rgb(24, 90, 189)',
    color: 'rgb(255, 255, 255)',
    'font-size': '16px',
    'font-family': '"Inter", system-ui, sans-serif',
    direction: 'ltr'
  },
  children: [],
  ...over
})

describe('pxToPt — the 25% error this prevents', () => {
  it('converts CSS pixels to points', () => {
    expect(pxToPt(96)).toBe(72)
    expect(pxToPt(16)).toBe(12)
    expect(pxToPt(0)).toBe(0)
  })

  it('is NOT the identity — importing px as pt shrinks everything by a quarter', () => {
    expect(pxToPt(100)).not.toBe(100)
    expect(pxToPt(100)).toBe(75)
  })

  it('rounds to the two decimals the sidecar stores', () => {
    expect(pxToPt(1)).toBe(0.75)
    expect(pxToPt(13)).toBe(9.75)
  })
})

describe('the element box', () => {
  it('becomes a rectangle at the requested position, in points', () => {
    const r = importCapture(cap(), opts)
    expect(r.shapes).toHaveLength(1)
    expect(r.shapes[0]).toMatchObject({ x: 100, y: 50, w: 300, h: 150, kind: 'rect' })
  })

  it('carries the background colour', () => {
    expect(importCapture(cap(), opts).shapes[0].fill).toBe('#185abd')
  })

  it('refuses an element with no size, and SAYS so', () => {
    const r = importCapture(cap({ box: { xPx: 0, yPx: 0, wPx: 0, hPx: 0 } }), opts)
    expect(r.shapes).toHaveLength(0)
    expect(r.degraded[0]).toContain('no measurable size')
  })

  it('keeps a transparent element SELECTABLE rather than invisible', () => {
    const r = importCapture(
      cap({ styles: { 'background-color': 'rgba(0, 0, 0, 0)', direction: 'ltr' } }),
      opts
    )
    expect(r.shapes[0].fill).toBe('')
    expect(r.shapes[0].stroke).toBe('#cccccc')
    expect(r.degraded.join(' ')).toContain('stays selectable')
  })

  it('does NOT paint a transparent background black', () => {
    const r = importCapture(cap({ styles: { 'background-color': 'rgba(0,0,0,0)' } }), opts)
    expect(r.shapes[0].fill).not.toBe('#000000')
  })

  it('carries a real border as a stroke', () => {
    const r = importCapture(
      cap({
        styles: {
          ...cap().styles,
          'border-top-width': '2px',
          'border-top-color': 'rgb(255, 0, 0)'
        }
      }),
      opts
    )
    expect(r.shapes[0].stroke).toBe('#ff0000')
    expect(r.shapes[0].strokeWidth).toBe(1.5)
  })

  it('ignores a border COLOUR when the width is zero', () => {
    const r = importCapture(
      cap({ styles: { ...cap().styles, 'border-top-width': '0px', 'border-top-color': 'rgb(255,0,0)' } }),
      opts
    )
    expect(r.shapes[0].stroke).toBe('')
  })

  it('converts the corner radius to points on all four corners', () => {
    const r = importCapture(cap({ styles: { ...cap().styles, 'border-radius': '8px' } }), opts)
    expect(r.shapes[0].radius).toEqual([6, 6, 6, 6])
  })

  it('omits the radius entirely when there is none', () => {
    expect(importCapture(cap(), opts).shapes[0].radius).toBe(undefined)
  })

  it('REPORTS a background image rather than silently losing it', () => {
    const r = importCapture(
      cap({ styles: { ...cap().styles, 'background-image': 'url(https://x/y.png)' } }),
      opts
    )
    expect(r.degraded.join(' ')).toContain('background image')
  })

  it('REPORTS a dropped box shadow', () => {
    const r = importCapture(cap({ styles: { ...cap().styles, 'box-shadow': '0 2px 4px #000' } }), opts)
    expect(r.degraded.join(' ')).toContain('shadow')
  })

  it('does not report a shadow that was "none"', () => {
    const r = importCapture(cap({ styles: { ...cap().styles, 'box-shadow': 'none' } }), opts)
    expect(r.degraded.join(' ')).not.toContain('shadow')
  })
})

describe('children — what makes this more than a coloured rectangle', () => {
  const withKids = (): Capture =>
    cap({
      children: [
        { tag: 'span', text: 'Title', box: { xPx: 220, yPx: 320, wPx: 200, hPx: 24 } },
        { tag: 'span', text: 'Body', box: { xPx: 220, yPx: 360, wPx: 300, hPx: 40 } }
      ]
    })

  it('places each text child at its MEASURED position, rebased onto the element origin', () => {
    const r = importCapture(withKids(), opts)
    expect(r.boxes).toHaveLength(2)
    // child at 220,320; element at 200,300 -> offset 20,20 px -> 15,15 pt
    expect(r.boxes[0]).toMatchObject({ x: 115, y: 65, text: 'Title' })
    expect(r.boxes[1]).toMatchObject({ x: 115, y: 95, text: 'Body' })
  })

  it('converts the width to points', () => {
    expect(importCapture(withKids(), opts).boxes[0].width).toBe(150)
  })

  it('carries the font size and colour', () => {
    const r = importCapture(withKids(), opts)
    expect(r.boxes[0].sizePt).toBe(12)
    expect(r.boxes[0].color).toBe('#ffffff')
  })

  it('skips a child with no text', () => {
    const r = importCapture(
      cap({ children: [{ tag: 'div', text: '   ', box: { xPx: 220, yPx: 320, wPx: 10, hPx: 10 } }] }),
      opts
    )
    expect(r.boxes).toHaveLength(0)
  })

  it('SKIPS a child with text but no geometry, rather than stacking it at the origin', () => {
    const r = importCapture(
      cap({ children: [{ tag: 'span', text: 'lost', box: {} }] }),
      opts
    )
    expect(r.boxes).toHaveLength(0)
    expect(r.skipped).toBe(1)
    expect(r.degraded.join(' ')).toContain('no recorded geometry')
  })

  it('falls back to the element own text when it has no children', () => {
    const r = importCapture(cap({ text: 'Click me', children: [] }), opts)
    expect(r.boxes).toHaveLength(1)
    expect(r.boxes[0].text).toBe('Click me')
    expect(r.boxes[0].x).toBe(100)
  })

  it('does not duplicate the element text when children already carried it', () => {
    const r = importCapture(withKids(), opts)
    expect(r.boxes.map((b) => b.text)).toEqual(['Title', 'Body'])
  })

  it('says when an element had children but no text at all', () => {
    const r = importCapture(
      cap({ children: [{ tag: 'img', text: '', box: { xPx: 220, yPx: 320, wPx: 10, hPx: 10 } }] }),
      opts
    )
    expect(r.degraded.join(' ')).toContain('No text was found')
  })
})

describe('direction comes from the capture, never a guess', () => {
  it('an RTL element aligns to the start of an RTL line', () => {
    const r = importCapture(
      cap({
        styles: { ...cap().styles, direction: 'rtl' },
        children: [{ tag: 'span', text: 'مرحبا', box: { xPx: 220, yPx: 320, wPx: 100, hPx: 20 } }]
      }),
      opts
    )
    expect(r.boxes[0].align).toBe('right')
  })

  it('an LTR element does NOT become RTL just because the app is Arabic', () => {
    const r = importCapture(
      cap({ children: [{ tag: 'span', text: 'Hello', box: { xPx: 220, yPx: 320, wPx: 100, hPx: 20 } }] }),
      opts
    )
    expect(r.boxes[0].align).toBe('left')
  })
})

describe('firstFamily', () => {
  it('takes the first family and drops the quotes', () => {
    expect(firstFamily('"Inter", system-ui, sans-serif')).toBe('Inter')
    expect(firstFamily("'Noto Naskh Arabic', serif")).toBe('Noto Naskh Arabic')
  })

  it('handles a single unquoted family', () => {
    expect(firstFamily('Arial')).toBe('Arial')
  })

  it('falls back rather than returning an empty family no renderer matches', () => {
    expect(firstFamily('')).toBe('Arial')
    expect(firstFamily('  ,  ')).toBe('Arial')
  })
})

describe('ids come from the caller, so its counters stay authoritative', () => {
  it('uses the supplied id functions', () => {
    const r = importCapture(
      cap({ children: [{ tag: 'span', text: 'x', box: { xPx: 220, yPx: 320, wPx: 10, hPx: 10 } }] }),
      { ...opts, shapeId: (n) => `shape-${n + 40}`, boxId: (n) => `box-${n + 90}` }
    )
    expect(r.shapes[0].id).toBe('shape-41')
    expect(r.boxes[0].id).toBe('box-91')
  })
})

describe('determinism', () => {
  it('the same capture imports identically twice', () => {
    const a = importCapture(cap(), opts)
    const b = importCapture(cap(), opts)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})
