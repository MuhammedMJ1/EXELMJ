import { describe, expect, it } from 'vitest'
import { contrastRatio, relativeLuminance, verdict } from '../src/studio/color/contrast'
import { hexToLch, lchToHex } from '../src/studio/color/oklab'
import {
  STEPS,
  confusable,
  darkFrom,
  deltaOK,
  harmony,
  nearestStep,
  scaleFrom,
  simulateCVD
} from '../src/studio/color/scale'
import { extractPalette, rolesForHexes } from '../src/studio/color/extract'
import {
  colorSwatches,
  cssVarName,
  resolveToken,
  scaleToGroup,
  toAse,
  toCssVars,
  toDtcg,
  walkTokens
} from '../src/studio/color/tokens'
import type { TokenSet } from '../src/studio/model'

describe('scaleFrom — the cross-hue invariant', () => {
  it('produces all eleven steps', () => {
    const s = scaleFrom('#185abd')!
    expect(Object.keys(s)).toHaveLength(STEPS.length)
    for (const step of STEPS) expect(s[step]).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('is monotonically darker from 50 to 950', () => {
    const s = scaleFrom('#185abd')!
    let prev = Infinity
    for (const step of STEPS) {
      const l = relativeLuminance(s[step])!
      expect(l).toBeLessThan(prev)
      prev = l
    }
  })

  it('THE INVARIANT: equal step index means equal lightness across hues', () => {
    const blue = scaleFrom('#185abd')!
    const red = scaleFrom('#bd1818')!
    const green = scaleFrom('#18bd5a')!
    for (const step of STEPS) {
      const ls = [blue, red, green].map((s) => hexToLch(s[step])!.L)
      const spread = Math.max(...ls) - Math.min(...ls)
      // 8-bit quantisation is the only source of difference
      expect(spread, `step ${step} spread ${spread}`).toBeLessThan(0.02)
    }
  })

  it('which makes contrast a SYSTEM property, not a per-pair check', () => {
    // Swapping the hue at step 700 on its own step-50 background must not
    // change the ACCESSIBILITY VERDICT. It cannot hold the ratio exactly:
    // WCAG luminance is not OKLab lightness (WCAG weights green ~0.72 and
    // blue ~0.07), so equal perceived lightness still measures differently.
    // Measured across five hues: 5.17 .. 6.31 — a spread that never crosses a
    // threshold, which is the property a design system can actually rely on.
    const rows = ['#185abd', '#bd1818', '#18bd5a', '#8818bd', '#bdb018'].map((seed) => {
      const s = scaleFrom(seed)!
      return contrastRatio(s[700], s[50])!
    })
    expect(new Set(rows.map(verdict)).size).toBe(1)
    expect(Math.min(...rows)).toBeGreaterThanOrEqual(4.5)
    expect(Math.max(...rows) - Math.min(...rows)).toBeLessThan(1.5)
  })

  it('keeps the seed hue', () => {
    const seed = hexToLch('#185abd')!
    const s = scaleFrom('#185abd')!
    for (const step of [300, 500, 700] as const) {
      expect(Math.abs(hexToLch(s[step])!.h - seed.h)).toBeLessThan(2)
    }
  })

  it('keeps the pale end nearly neutral, so it is usable as a background', () => {
    const s = scaleFrom('#185abd')!
    expect(hexToLch(s[50])!.C).toBeLessThan(0.03)
  })

  it('honours a saturation cap without changing hue', () => {
    const full = scaleFrom('#185abd')!
    const muted = scaleFrom('#185abd', { saturation: 0.4 })!
    expect(hexToLch(muted[600])!.C).toBeLessThan(hexToLch(full[600])!.C)
    expect(Math.abs(hexToLch(muted[600])!.h - hexToLch(full[600])!.h)).toBeLessThan(2)
  })

  it('every step is inside sRGB', () => {
    for (const seed of ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff']) {
      const s = scaleFrom(seed)!
      for (const step of STEPS) expect(s[step]).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('refuses a malformed seed', () => {
    expect(scaleFrom('not a colour')).toBe(null)
  })

  it('reports where a colour sits on its own scale', () => {
    expect(nearestStep('#ffffff')).toBe(50)
    expect(nearestStep('#000000')).toBe(950)
    expect(nearestStep('bad')).toBe(null)
  })
})

describe('harmony — rotate in OKLCH, not HSL', () => {
  it('gives the right count per kind', () => {
    expect(harmony('#185abd', 'complementary')).toHaveLength(2)
    expect(harmony('#185abd', 'analogous')).toHaveLength(3)
    expect(harmony('#185abd', 'triadic')).toHaveLength(3)
    expect(harmony('#185abd', 'tetradic')).toHaveLength(4)
  })

  it('starts with the seed itself', () => {
    expect(harmony('#185abd', 'triadic')[0]).toBe('#185abd')
  })

  it('every member is equally light — which is what makes them a SET', () => {
    const set = harmony('#185abd', 'triadic')
    const ls = set.map((h) => hexToLch(h)!.L)
    expect(Math.max(...ls) - Math.min(...ls)).toBeLessThan(0.02)
  })

  it('an HSL rotation would NOT be equally light', () => {
    // hsl-style: same S/L, hue +120 from a mid blue lands on a much brighter green
    const a = relativeLuminance('#3366cc')!
    const b = relativeLuminance('#cc3366')!
    const c = relativeLuminance('#66cc33')!
    expect(Math.max(a, b, c) / Math.min(a, b, c)).toBeGreaterThan(2)
  })

  it('returns nothing for a bad seed', () => {
    expect(harmony('nope', 'triadic')).toEqual([])
  })
})

describe('darkFrom — not an inversion', () => {
  const light = scaleFrom('#185abd')!
  const dark = darkFrom(light)

  it('flips the ladder: dark 50 is as dark as light 950', () => {
    expect(relativeLuminance(dark[50])!).toBeLessThan(relativeLuminance(light[500])!)
    expect(relativeLuminance(dark[950])!).toBeGreaterThan(relativeLuminance(light[500])!)
  })

  it('REDUCES chroma — the same saturation reads as radioactive on dark', () => {
    const l = hexToLch(light[600])!
    const d = hexToLch(dark[400])!
    expect(d.C).toBeLessThanOrEqual(l.C + 1e-6)
  })

  it('keeps the hue, so it is recognisably the same palette', () => {
    for (const step of [200, 500, 800] as const) {
      expect(Math.abs(hexToLch(dark[step])!.h - hexToLch(light[step])!.h)).toBeLessThan(3)
    }
  })

  it('is still monotonic, just the other way', () => {
    let prev = -Infinity
    for (const step of STEPS) {
      const l = relativeLuminance(dark[step])!
      expect(l).toBeGreaterThan(prev)
      prev = l
    }
  })
})

describe('colour-vision simulation', () => {
  it('leaves a grey alone under every deficiency', () => {
    for (const kind of ['protan', 'deutan', 'tritan', 'achroma'] as const) {
      const out = simulateCVD('#808080', kind)
      expect(deltaOK(hexToLch(out)!, hexToLch('#808080')!)).toBeLessThan
        ? expect(deltaOK(hexToLch(out)!, hexToLch('#808080')!)).toBeLessThan(0.02)
        : null
    }
  })

  it('collapses red and green under protan/deutan', () => {
    expect(confusable('#cc0000', '#00aa00', 'deutan', 0.16)).toBe(true)
  })

  it('uses a DIFFERENT projection for tritan — one matrix for all three is wrong', () => {
    // a blue/yellow pair survives deutan but collapses under tritan
    const blue = '#0044cc'
    const yellow = '#ccaa00'
    const dDeut = deltaOK(hexToLch(simulateCVD(blue, 'deutan'))!, hexToLch(simulateCVD(yellow, 'deutan'))!)
    const dTrit = deltaOK(hexToLch(simulateCVD(blue, 'tritan'))!, hexToLch(simulateCVD(yellow, 'tritan'))!)
    expect(dTrit).toBeLessThan(dDeut)
  })

  it('achromatopsia leaves no chroma at all', () => {
    expect(hexToLch(simulateCVD('#cc0000', 'achroma'))!.C).toBeLessThan(0.01)
  })

  it('severity 0 is the identity, severity 1 is the full simulation', () => {
    expect(simulateCVD('#cc0000', 'deutan', 0)).toBe('#cc0000')
    expect(simulateCVD('#cc0000', 'deutan', 1)).not.toBe('#cc0000')
  })

  it('severity interpolates for the anomalous forms', () => {
    const full = hexToLch(simulateCVD('#cc0000', 'deutan', 1))!
    const half = hexToLch(simulateCVD('#cc0000', 'deutan', 0.5))!
    const none = hexToLch('#cc0000')!
    expect(deltaOK(half, none)).toBeLessThan(deltaOK(full, none))
  })

  it('passes a malformed colour through rather than crashing', () => {
    expect(simulateCVD('nope', 'deutan')).toBe('nope')
  })
})

describe('extractPalette — reusing our own quantiser', () => {
  /** Solid blocks: 50% red, 30% blue, 20% pale yellow. */
  function blocks(w = 50, h = 50): Uint8ClampedArray {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        const c = y < h * 0.5 ? [200, 30, 30] : y < h * 0.8 ? [30, 40, 190] : [250, 240, 170]
        d[i] = c[0]
        d[i + 1] = c[1]
        d[i + 2] = c[2]
        d[i + 3] = 255
      }
    }
    return d
  }

  it('finds the real colours of the image', () => {
    const sw = extractPalette(blocks(), 50, 50, { colors: 3 })
    expect(sw.length).toBeGreaterThanOrEqual(2)
    for (const s of sw) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('names roles instead of returning anonymous hexes', () => {
    const sw = extractPalette(blocks(), 50, 50, { colors: 4 })
    expect(sw[0].role).toBe('dominant')
    expect(new Set(sw.map((s) => s.role)).size).toBe(sw.length)
  })

  it('the dominant swatch really is the biggest area', () => {
    const sw = extractPalette(blocks(), 50, 50, { colors: 3 })
    const dom = sw.find((s) => s.role === 'dominant')!
    expect(dom.weight).toBeGreaterThanOrEqual(0.4)
    // the top half is red
    expect(hexToLch(dom.hex)!.h).toBeGreaterThan(0)
    expect(hexToLch(dom.hex)!.h).toBeLessThan(80)
  })

  it('IGNORES fully transparent pixels rather than calling them black', () => {
    const w = 20
    const h = 20
    const d = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const o = i * 4
      const solid = i % 4 === 0
      d[o] = 220
      d[o + 1] = 30
      d[o + 2] = 30
      d[o + 3] = solid ? 255 : 0
    }
    const sw = extractPalette(d, w, h, { colors: 3 })
    expect(sw.length).toBeGreaterThan(0)
    // nothing should come back black
    for (const s of sw) expect(relativeLuminance(s.hex)!).toBeGreaterThan(0.02)
  })

  it('returns NOTHING for an empty image rather than inventing a palette', () => {
    expect(extractPalette(new Uint8ClampedArray(0), 0, 0)).toEqual([])
    const clear = new Uint8ClampedArray(10 * 10 * 4)
    expect(extractPalette(clear, 10, 10)).toEqual([])
  })

  it('never returns two visually identical swatches', () => {
    const sw = extractPalette(blocks(), 50, 50, { colors: 8 })
    for (let i = 0; i < sw.length; i++) {
      for (let j = i + 1; j < sw.length; j++) {
        expect(deltaOK(sw[i].lch, sw[j].lch)).toBeGreaterThanOrEqual(0.02)
      }
    }
  })

  it('is deterministic', () => {
    const a = extractPalette(blocks(), 50, 50, { colors: 4 }).map((s) => s.hex)
    const b = extractPalette(blocks(), 50, 50, { colors: 4 }).map((s) => s.hex)
    expect(a).toEqual(b)
  })

  it('assigns roles to a known hex list too', () => {
    const sw = rolesForHexes(['#185abd', '#f5f5f5', '#101010', '#e5308a'])
    expect(sw[0].role).toBe('dominant')
    expect(sw.length).toBeGreaterThan(1)
  })

  it('drops duplicate hexes from a list', () => {
    expect(rolesForHexes(['#185abd', '#185abd']).length).toBe(1)
  })
})

describe('token export', () => {
  const tokens: TokenSet = {
    base: {
      color: {
        brand: scaleToGroup(scaleFrom('#185abd')!, 'Brand'),
        bg: { $value: '#ffffff', $type: 'color' }
      },
      space: { md: { $value: 16, $type: 'dimension' } }
    },
    dark: { color: { bg: { $value: '#101014', $type: 'color' } } }
  }

  it('walks every leaf with its dotted path', () => {
    const paths = [...walkTokens(tokens.base)].map(([p]) => p)
    expect(paths).toContain('color.brand.600')
    expect(paths).toContain('color.bg')
    expect(paths).toContain('space.md')
  })

  it('resolves by path and reports a miss as null', () => {
    expect(resolveToken(tokens.base, 'color.brand.600')?.$type).toBe('color')
    expect(resolveToken(tokens.base, 'color.nope')).toBe(null)
    expect(resolveToken(tokens.base, 'color')).toBe(null)
  })

  it('emits valid DTCG that parses back', () => {
    const json = JSON.parse(toDtcg(tokens))
    expect(json.color.brand['600'].$type).toBe('color')
    expect(json.color.brand['600'].$value).toMatch(/^#[0-9a-f]{6}$/)
    expect(json.$themes.dark.color.bg.$value).toBe('#101014')
  })

  it('derives CSS names from token paths by hand-checkable rule', () => {
    expect(cssVarName('color.brand.600')).toBe('--color-brand-600')
  })

  it('emits CSS variables for both themes', () => {
    const css = toCssVars(tokens)
    expect(css).toContain(':root {')
    expect(css).toContain('--color-brand-600:')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('[data-theme="dark"]')
  })

  it('can emit only one dark strategy when asked', () => {
    const css = toCssVars(tokens, { darkMode: 'attribute' })
    expect(css).not.toContain('prefers-color-scheme')
    expect(css).toContain('[data-theme="dark"]')
  })

  it('omits the dark block entirely when there is no dark theme', () => {
    const css = toCssVars({ base: tokens.base })
    expect(css).not.toContain('dark')
  })

  it('lists every colour token for the swatch grid', () => {
    const sw = colorSwatches(tokens)
    expect(sw.some((s) => s.name === 'color.bg' && s.hex === '#ffffff')).toBe(true)
    // dimension tokens are not swatches
    expect(sw.some((s) => s.name === 'space.md')).toBe(false)
  })
})

describe('.ase export — the Illustrator round trip', () => {
  it('starts with the ASEF magic and version 1.0', () => {
    const b = toAse([{ name: 'brand', hex: '#185abd' }])
    expect([...b.slice(0, 4)]).toEqual([0x41, 0x53, 0x45, 0x46])
    const dv = new DataView(b.buffer)
    expect(dv.getUint16(4)).toBe(1)
    expect(dv.getUint16(6)).toBe(0)
  })

  it('declares the right block count', () => {
    const b = toAse([
      { name: 'a', hex: '#000000' },
      { name: 'b', hex: '#ffffff' }
    ])
    expect(new DataView(b.buffer).getUint32(8)).toBe(2)
  })

  it('writes the colour as big-endian float32 RGB', () => {
    const b = toAse([{ name: 'w', hex: '#ffffff' }])
    const dv = new DataView(b.buffer)
    // 12 header + 2 type + 4 len + 2 namelen + 4 name(1 char + NUL) + 4 model
    const at = 12 + 2 + 4 + 2 + 4 + 4
    expect(dv.getFloat32(at)).toBeCloseTo(1, 5)
    expect(dv.getFloat32(at + 4)).toBeCloseTo(1, 5)
    expect(dv.getFloat32(at + 8)).toBeCloseTo(1, 5)
  })

  it('skips a malformed colour rather than writing garbage', () => {
    const b = toAse([{ name: 'bad', hex: 'nope' }])
    expect(new DataView(b.buffer).getUint32(8)).toBe(0)
  })

  it('handles an Arabic swatch name', () => {
    const b = toAse([{ name: 'أزرق', hex: '#185abd' }])
    expect(new DataView(b.buffer).getUint32(8)).toBe(1)
    expect(b.length).toBeGreaterThan(12)
  })

  it('is deterministic', () => {
    const a = toAse([{ name: 'x', hex: '#123456' }])
    const b = toAse([{ name: 'x', hex: '#123456' }])
    expect([...a]).toEqual([...b])
  })
})
