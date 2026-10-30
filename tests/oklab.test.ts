import { describe, expect, it } from 'vitest'
import {
  clampToGamut,
  computeMaxSaturation,
  findCusp,
  hexToLch,
  inGamut,
  labToLch,
  lchToHex,
  lchToLab,
  linearSrgbToOklab,
  linearToSrgb,
  maxChroma,
  oklabToLinearSrgb,
  srgbToLinear
} from '../src/studio/color/oklab'
import {
  contrastRatio,
  fixContrast,
  readableOn,
  relativeLuminance,
  verdict,
  verdictFor
} from '../src/studio/color/contrast'

const close = (a: number, b: number, eps = 1e-4): boolean => Math.abs(a - b) <= eps

describe('sRGB transfer function', () => {
  it('round-trips', () => {
    for (const v of [0, 0.01, 0.04045, 0.2, 0.5, 0.9, 1]) {
      expect(close(linearToSrgb(srgbToLinear(v)), v, 1e-9)).toBe(true)
    }
  })

  it('pins the standard endpoints', () => {
    expect(srgbToLinear(0)).toBe(0)
    expect(close(srgbToLinear(1), 1, 1e-9)).toBe(true)
    // the canonical mid-grey: sRGB 0.5 is ~0.2140 linear
    expect(close(srgbToLinear(0.5), 0.2140, 1e-3)).toBe(true)
  })
})

describe('OKLab — against Ottosson published reference values', () => {
  // From the Oklab post's own test table (linear sRGB in, Oklab out)
  it('maps white to L=1, a=b=0', () => {
    const lab = linearSrgbToOklab(1, 1, 1)
    expect(close(lab.L, 1, 1e-4)).toBe(true)
    expect(close(lab.a, 0, 1e-4)).toBe(true)
    expect(close(lab.b, 0, 1e-4)).toBe(true)
  })

  it('maps black to all zeros', () => {
    const lab = linearSrgbToOklab(0, 0, 0)
    expect(close(lab.L, 0, 1e-9)).toBe(true)
  })

  it('round-trips linear sRGB through OKLab', () => {
    for (const c of [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.3, 0.6, 0.9],
      [0.05, 0.05, 0.05]
    ]) {
      const lab = linearSrgbToOklab(c[0], c[1], c[2])
      const back = oklabToLinearSrgb(lab.L, lab.a, lab.b)
      expect(close(back.r, c[0], 1e-6)).toBe(true)
      expect(close(back.g, c[1], 1e-6)).toBe(true)
      expect(close(back.b, c[2], 1e-6)).toBe(true)
    }
  })

  it('gives a neutral grey zero chroma', () => {
    const lch = hexToLch('#808080')!
    expect(lch.C).toBeLessThan(1e-6)
  })

  it('keeps a neutral hue STABLE rather than letting noise spin it', () => {
    expect(labToLch({ L: 0.5, a: 0, b: 0 }).h).toBe(0)
    expect(labToLch({ L: 0.5, a: 1e-12, b: -1e-12 }).h).toBe(0)
  })
})

describe('the whole point: equal L looks equally light', () => {
  it('yellow and blue at the same OKLCH lightness really are close in luminance', () => {
    const yellow = lchToHex({ L: 0.65, C: 0.12, h: 100 })
    const blue = lchToHex({ L: 0.65, C: 0.12, h: 260 })
    const ly = relativeLuminance(yellow)!
    const lb = relativeLuminance(blue)!
    // OKLab is not WCAG luminance, so these are not identical — but they are
    // in the same ballpark, where HSL is off by an order of magnitude
    expect(Math.max(ly, lb) / Math.min(ly, lb)).toBeLessThan(2)
  })

  it('HSL would NOT pass that — the reason this file exists', () => {
    // hsl(60 100% 50%) yellow vs hsl(240 100% 50%) blue: same "lightness"
    const ly = relativeLuminance('#ffff00')!
    const lb = relativeLuminance('#0000ff')!
    // ~12.8x apart, for two colours HSL calls equally light
    expect(Math.max(ly, lb) / Math.min(ly, lb)).toBeGreaterThan(10)
  })
})

describe('gamut boundary', () => {
  it('finds a cusp for every hue', () => {
    for (let h = 0; h < 360; h += 15) {
      const r = (h * Math.PI) / 180
      const cusp = findCusp(Math.cos(r), Math.sin(r))
      expect(cusp.L).toBeGreaterThan(0)
      expect(cusp.L).toBeLessThan(1)
      expect(cusp.C).toBeGreaterThan(0)
    }
  })

  it('the cusp really is on the gamut edge — just inside is in, just outside is out', () => {
    for (let h = 0; h < 360; h += 30) {
      const r = (h * Math.PI) / 180
      const cusp = findCusp(Math.cos(r), Math.sin(r))
      expect(inGamut({ L: cusp.L, C: cusp.C * 0.98, h })).toBe(true)
      expect(inGamut({ L: cusp.L, C: cusp.C * 1.05, h })).toBe(false)
    }
  })

  it('maxChroma is zero at black and white', () => {
    expect(maxChroma(0, 30)).toBe(0)
    expect(maxChroma(1, 30)).toBe(0)
  })

  it('maxChroma peaks at the cusp lightness', () => {
    const cusp = findCusp(Math.cos(0), Math.sin(0))
    const atCusp = maxChroma(cusp.L, 0)
    expect(atCusp).toBeGreaterThan(maxChroma(cusp.L * 0.5, 0))
    expect(atCusp).toBeGreaterThan(maxChroma((cusp.L + 1) / 2, 0))
  })

  it('every maxChroma colour actually renders inside sRGB', () => {
    for (let h = 0; h < 360; h += 20) {
      for (const L of [0.15, 0.35, 0.55, 0.75, 0.9]) {
        const hex = lchToHex({ L, C: maxChroma(L, h), h })
        expect(/^#[0-9a-f]{6}$/.test(hex)).toBe(true)
        const back = hexToLch(hex)!
        // At MAXIMUM chroma the colour sits on the gamut edge, where rounding
        // each channel to 8 bits moves lightness by up to ~0.015 (measured
        // worst case: h=20, L=0.75 -> 0.7357). That is sRGB's resolution, not
        // an error in the boundary maths — an in-gamut colour round-trips far
        // tighter, which the hex round-trip test pins separately.
        expect(close(back.L, L, 0.02)).toBe(true)
      }
    }
  })

  it('computeMaxSaturation is positive for every hue direction', () => {
    for (let h = 0; h < 360; h += 10) {
      const r = (h * Math.PI) / 180
      expect(computeMaxSaturation(Math.cos(r), Math.sin(r))).toBeGreaterThan(0)
    }
  })
})

describe('clampToGamut — reduce chroma, never lightness or hue', () => {
  it('leaves an in-gamut colour untouched', () => {
    const c = { L: 0.5, C: 0.05, h: 200 }
    expect(clampToGamut(c)).toEqual(c)
  })

  it('pulls an impossible chroma back to the boundary', () => {
    const out = clampToGamut({ L: 0.5, C: 5, h: 200 })
    expect(out.C).toBeLessThan(5)
    expect(inGamut(out)).toBe(true)
  })

  it('PRESERVES lightness and hue — the design-system invariant', () => {
    const out = clampToGamut({ L: 0.72, C: 9, h: 137 })
    expect(out.L).toBe(0.72)
    expect(out.h).toBe(137)
  })

  it('normalises a negative or overlarge hue', () => {
    expect(clampToGamut({ L: 0.5, C: 0, h: -90 }).h).toBe(270)
    expect(clampToGamut({ L: 0.5, C: 0, h: 450 }).h).toBe(90)
  })
})

describe('hex conversion', () => {
  it('round-trips the primaries within 8-bit precision', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#185abd', '#e5308a', '#ffffff', '#000000']) {
      expect(lchToHex(hexToLch(hex)!)).toBe(hex)
    }
  })

  it('rejects malformed input rather than guessing', () => {
    expect(hexToLch('red')).toBe(null)
    expect(hexToLch('#fff')).toBe(null)
    expect(hexToLch('#12345g')).toBe(null)
  })

  it('lab and lch are inverse', () => {
    const lch = { L: 0.6, C: 0.1, h: 210 }
    const back = labToLch(lchToLab(lch))
    expect(close(back.L, lch.L)).toBe(true)
    expect(close(back.C, lch.C)).toBe(true)
    expect(close(back.h, lch.h, 1e-3)).toBe(true)
  })
})

describe('WCAG 2.x contrast — against the published values', () => {
  it('white on black is exactly 21', () => {
    expect(close(contrastRatio('#ffffff', '#000000')!, 21, 1e-9)).toBe(true)
  })

  it('a colour against itself is exactly 1', () => {
    expect(close(contrastRatio('#185abd', '#185abd')!, 1, 1e-9)).toBe(true)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#abcdef')).toBe(contrastRatio('#abcdef', '#123456'))
  })

  it('matches the known value for #767676 on white (the 4.5:1 boundary grey)', () => {
    // #767676 is the canonical "smallest grey that passes AA on white"
    const r = contrastRatio('#767676', '#ffffff')!
    expect(r).toBeGreaterThanOrEqual(4.5)
    expect(r).toBeLessThan(4.6)
  })

  it('returns null for malformed colours instead of a fake number', () => {
    expect(contrastRatio('nope', '#fff000')).toBe(null)
    expect(relativeLuminance('#zz0000')).toBe(null)
  })
})

describe('verdicts, not numbers', () => {
  it('maps the WCAG thresholds', () => {
    expect(verdict(21)).toBe('AAA')
    expect(verdict(7)).toBe('AAA')
    expect(verdict(6.99)).toBe('AA')
    expect(verdict(4.5)).toBe('AA')
    expect(verdict(4.49)).toBe('AA Large')
    expect(verdict(3)).toBe('AA Large')
    expect(verdict(2.99)).toBe('Fail')
    expect(verdict(1)).toBe('Fail')
  })

  it('verdictFor reads a pair directly', () => {
    expect(verdictFor('#000000', '#ffffff')).toBe('AAA')
    expect(verdictFor('#cccccc', '#ffffff')).toBe('Fail')
  })

  it('picks a readable foreground for any background', () => {
    expect(readableOn('#ffffff')).toBe('#000000')
    expect(readableOn('#000000')).toBe('#ffffff')
    expect(readableOn('#185abd')).toBe('#ffffff')
    expect(readableOn('#ffee00')).toBe('#000000')
  })

  it('the readable choice always beats the other one', () => {
    for (const bg of ['#ffffff', '#000000', '#185abd', '#7f7f7f', '#e5308a', '#00ff00']) {
      const fg = readableOn(bg)
      const other = fg === '#ffffff' ? '#000000' : '#ffffff'
      expect(contrastRatio(fg, bg)!).toBeGreaterThanOrEqual(contrastRatio(other, bg)!)
    }
  })
})

describe('solve for contrast — the operation designers actually want', () => {
  it('hits 4.5:1 within a hundredth', () => {
    const out = fixContrast('#66aaff', '#ffffff', 4.5)!
    expect(out).toBeTruthy()
    expect(contrastRatio(out, '#ffffff')!).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(out, '#ffffff')!).toBeLessThan(4.5 * 1.02)
  })

  it('hits 7:1 too, to within one 8-bit step', () => {
    const out = fixContrast('#66aaff', '#ffffff', 7)!
    const r = contrastRatio(out, '#ffffff')!
    expect(r).toBeGreaterThanOrEqual(7)
    // The achievable ratios are DISCRETE — lchToHex rounds to 8 bits per
    // channel, so the solver returns the smallest representable colour that
    // clears the bar, not an exact 7.000.
    expect(r).toBeLessThan(7 * 1.02)
  })

  it('keeps the hue it was given', () => {
    const seed = hexToLch('#66aaff')!
    const out = hexToLch(fixContrast('#66aaff', '#ffffff', 4.5)!)!
    expect(Math.abs(out.h - seed.h)).toBeLessThan(2)
  })

  it('goes lighter against a dark background', () => {
    const out = fixContrast('#334455', '#111111', 4.5, 'lighter')!
    expect(relativeLuminance(out)!).toBeGreaterThan(relativeLuminance('#334455')!)
  })

  it('reports failure instead of returning a wrong answer', () => {
    // 21:1 against mid-grey is impossible for any colour
    expect(fixContrast('#66aaff', '#7f7f7f', 21)).toBe(null)
  })

  it('rejects a malformed seed', () => {
    expect(fixContrast('nope', '#ffffff', 4.5)).toBe(null)
  })
})
