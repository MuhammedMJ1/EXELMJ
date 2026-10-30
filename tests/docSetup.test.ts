// New-document units, resolution and colour mode.
//
// The two conversions worth a test suite of their own: a pixel has no size
// until a resolution is chosen, and a millimetre has one that never depends on
// the resolution. Confusing the two is what makes a 300dpi A4 come out four
// times too big.

import { describe, expect, it } from 'vitest'
import {
  cleanSetup,
  cmykPercent,
  cmykToRgb,
  DOC_PRESETS,
  defaultSetup,
  fromPt,
  hexToCmyk,
  landscape,
  portrait,
  presetIdFor,
  setupToPt,
  toPt,
  type DocSetup
} from '../src/design/docSetup'

describe('units', () => {
  it('an inch is 72 points, whatever the resolution', () => {
    expect(toPt(1, 'in', 72)).toBe(72)
    expect(toPt(1, 'in', 300)).toBe(72)
  })

  it('a millimetre does NOT depend on the resolution', () => {
    // The classic bug: wiring mm through the DPI. A4 at 300dpi would come out
    // four times too big.
    expect(toPt(25.4, 'mm', 72)).toBeCloseTo(72, 9)
    expect(toPt(25.4, 'mm', 300)).toBeCloseTo(72, 9)
  })

  it('a centimetre is ten millimetres', () => {
    expect(toPt(1, 'cm', 300)).toBeCloseTo(toPt(10, 'mm', 300), 9)
  })

  it('a PIXEL does depend on it — that is what DPI means', () => {
    expect(toPt(72, 'px', 72)).toBe(72)
    expect(toPt(300, 'px', 300)).toBe(72)
    expect(toPt(300, 'px', 72)).toBe(300)
  })

  it('round-trips through points', () => {
    for (const unit of ['px', 'mm', 'cm', 'in', 'pt'] as const) {
      expect(fromPt(toPt(123.4, unit, 300), unit, 300)).toBeCloseTo(123.4, 9)
    }
  })

  it('A4 is 595 x 842 points, which is what every PDF says it is', () => {
    const { widthPt, heightPt } = setupToPt({
      width: 210, height: 297, unit: 'mm', dpi: 300, colorMode: 'cmyk'
    })
    expect(Math.round(widthPt)).toBe(595)
    expect(Math.round(heightPt)).toBe(842)
  })

  it('a 1080px square at 72dpi is 1080 points', () => {
    const { widthPt } = setupToPt({
      width: 1080, height: 1080, unit: 'px', dpi: 72, colorMode: 'rgb'
    })
    expect(widthPt).toBe(1080)
  })
})

describe('cleanSetup', () => {
  const base: DocSetup = { width: 100, height: 100, unit: 'mm', dpi: 300, colorMode: 'cmyk' }

  it('refuses a page with no size', () => {
    expect(cleanSetup({ ...base, width: 0 }).width).toBe(1)
    expect(cleanSetup({ ...base, height: -5 }).height).toBe(1)
  })

  it('refuses a page too large to raster', () => {
    // Not a preference: a canvas of a hundred thousand points is a tab that
    // stops responding.
    const out = cleanSetup({ ...base, width: 999999 })
    expect(toPt(out.width, out.unit, out.dpi)).toBeLessThanOrEqual(20000)
  })

  it('keeps the resolution sane', () => {
    expect(cleanSetup({ ...base, dpi: 0 }).dpi).toBe(72)
    expect(cleanSetup({ ...base, dpi: 99999 }).dpi).toBe(1200)
    expect(cleanSetup({ ...base, dpi: 300.4 }).dpi).toBe(300)
  })

  it('falls back to RGB rather than trusting an unknown mode', () => {
    expect(cleanSetup({ ...base, colorMode: 'weird' as never }).colorMode).toBe('rgb')
  })

  it('leaves a good setup alone', () => {
    expect(cleanSetup(base)).toEqual(base)
  })
})

describe('orientation', () => {
  const tall: DocSetup = { width: 210, height: 297, unit: 'mm', dpi: 300, colorMode: 'cmyk' }

  it('turns a portrait page on its side', () => {
    expect(landscape(tall)).toMatchObject({ width: 297, height: 210 })
  })

  it('leaves one that is already landscape alone', () => {
    const wide = landscape(tall)
    expect(landscape(wide)).toEqual(wide)
  })

  it('and back again', () => {
    expect(portrait(landscape(tall))).toEqual(tall)
  })

  it('a square is both, and changes under neither', () => {
    const sq: DocSetup = { width: 500, height: 500, unit: 'px', dpi: 72, colorMode: 'rgb' }
    expect(landscape(sq)).toEqual(sq)
    expect(portrait(sq)).toEqual(sq)
  })
})

describe('presets', () => {
  it('pairs each size with a resolution and colour mode that suit it', () => {
    // A social square at 300dpi CMYK is nobody's intention, and an A4 flyer at
    // 72dpi RGB prints blurry.
    const a4 = DOC_PRESETS.find((p) => p.id === 'a4')!.setup
    expect([a4.dpi, a4.colorMode]).toEqual([300, 'cmyk'])
    const square = DOC_PRESETS.find((p) => p.id === 'square')!.setup
    expect([square.dpi, square.colorMode]).toEqual([72, 'rgb'])
  })

  it('recognises its own presets', () => {
    for (const p of DOC_PRESETS) expect(presetIdFor(p.setup)).toBe(p.id)
  })

  it('recognises one that was merely turned on its side', () => {
    const a4 = DOC_PRESETS.find((p) => p.id === 'a4')!.setup
    expect(presetIdFor(landscape(a4))).toBe('a4')
  })

  it('says custom when it is custom', () => {
    expect(presetIdFor({ width: 137, height: 42, unit: 'mm', dpi: 300, colorMode: 'cmyk' })).toBe('custom')
  })

  it('opens on A4, the page most documents are', () => {
    expect(presetIdFor(defaultSetup())).toBe('a4')
  })
})

describe('cmyk', () => {
  it('white is no ink at all', () => {
    expect(cmykPercent(hexToCmyk('#ffffff'))).toEqual([0, 0, 0, 0])
  })

  it('black is all black and no colour', () => {
    // Without the k===1 guard the three chromatic channels divide by zero.
    expect(cmykPercent(hexToCmyk('#000000'))).toEqual([0, 0, 0, 100])
  })

  it('pure red is magenta plus yellow', () => {
    expect(cmykPercent(hexToCmyk('#ff0000'))).toEqual([0, 100, 100, 0])
  })

  it('pure cyan is cyan alone', () => {
    expect(cmykPercent(hexToCmyk('#00ffff'))).toEqual([100, 0, 0, 0])
  })

  it('a mid grey is black ink only', () => {
    const [c, m, y] = cmykPercent(hexToCmyk('#808080'))
    expect([c, m, y]).toEqual([0, 0, 0])
  })

  it('round-trips back to the colour it came from', () => {
    for (const hex of ['#185abd', '#ff8800', '#123456', '#ffffff', '#000000']) {
      const [c, m, y, k] = hexToCmyk(hex)
      const [r, g, b] = cmykToRgb(c, m, y, k)
      const back = `#${[r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`
      expect(back).toBe(hex)
    }
  })

  it('survives a colour that is not a colour', () => {
    expect(() => hexToCmyk('not a colour')).not.toThrow()
  })
})
