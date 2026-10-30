import { describe, expect, it } from 'vitest'
import {
  CUSTOM,
  HUGEICONS,
  LUCIDE,
  MATERIAL,
  OCTICONS,
  keylineShapes,
  liveArea,
  presetById
} from '../src/studio/icon/presets'
import {
  checkSize,
  idealOffset,
  integerScaleSizes,
  snapToPixelGrid,
  validateIcon
} from '../src/studio/icon/validate'
import { ICO_SIZES, isPng, pngSize, toIco, toSvg } from '../src/studio/icon/export'
import { nodesOf } from '../src/design/path'

describe('presets are the published numbers', () => {
  it('Material is 24dp with a 20dp live area', () => {
    expect(MATERIAL.grid).toBe(24)
    expect(MATERIAL.padding).toBe(2)
    expect(liveArea(MATERIAL)).toEqual({ x: 2, y: 2, w: 20, h: 20 })
  })

  it('Material ships all four keyline shapes', () => {
    expect(MATERIAL.keylines).toHaveLength(4)
    expect(MATERIAL.keylines.some((k) => k.kind === 'circle' && k.d === 20)).toBe(true)
    expect(MATERIAL.keylines.some((k) => k.kind === 'square' && k.w === 18)).toBe(true)
  })

  it('centres every keyline on the canvas', () => {
    for (const k of keylineShapes(MATERIAL)) {
      expect(k.x + k.w / 2).toBeCloseTo(MATERIAL.grid / 2, 6)
      expect(k.y + k.h / 2).toBeCloseTo(MATERIAL.grid / 2, 6)
    }
  })

  it('Lucide is round cap AND join at stroke 2', () => {
    expect(LUCIDE.strokeWidth).toBe(2)
    expect(LUCIDE.cap).toBe('round')
    expect(LUCIDE.join).toBe('round')
  })

  it('Octicons ships BOTH 16 and 24 rather than scaling one', () => {
    expect(OCTICONS.sizes).toContain(16)
    expect(OCTICONS.sizes).toContain(24)
    expect(OCTICONS.strokeWidth).toBe(1.5)
  })

  it('falls back to Material for an unknown id', () => {
    expect(presetById('nope').id).toBe('material')
    expect(presetById('lucide').id).toBe('lucide')
  })

  it('Hugeicons is 24 at stroke 1.5, matching the bundled library', () => {
    // The bundled JSON records the same numbers; validating an inserted icon
    // against Material's 2pt stroke would flag every one of them.
    expect(HUGEICONS.grid).toBe(24)
    expect(HUGEICONS.strokeWidth).toBe(1.5)
    expect(HUGEICONS.cap).toBe('round')
  })

  it('Custom imposes no house rules', () => {
    expect(CUSTOM.keylines).toHaveLength(0)
    expect(CUSTOM.padding).toBe(0)
  })
})

describe('idealOffset — the parity rule', () => {
  it('puts an ODD stroke on a half pixel', () => {
    expect(idealOffset(1)).toBe(0.5)
    expect(idealOffset(3)).toBe(0.5)
  })

  it('puts an EVEN stroke on a whole pixel', () => {
    expect(idealOffset(2)).toBe(0)
    expect(idealOffset(4)).toBe(0)
  })

  it('treats a zero-width (fill) edge as whole-pixel', () => {
    expect(idealOffset(0)).toBe(0)
  })

  it('rounds a fractional width to decide', () => {
    // 1.5 rounds to 2 -> whole pixel
    expect(idealOffset(1.5)).toBe(0)
    expect(idealOffset(0.9)).toBe(0.5)
  })
})

describe('checkSize — naming the offending node', () => {
  it('passes a glyph already on the grid', () => {
    // 24pt canvas at 24px: scale 1, stroke 2 -> whole pixels
    const r = checkSize('M4 4 L20 4 L20 20 Z', MATERIAL, 24)
    expect(r.ok).toBe(true)
    expect(r.offenders).toHaveLength(0)
  })

  it('flags a node that lands on a half pixel with an even stroke', () => {
    const r = checkSize('M4.5 4 L20 4', MATERIAL, 24)
    expect(r.ok).toBe(false)
    expect(r.offenders).toHaveLength(1)
    expect(r.offenders[0].x).toBe(4.5)
  })

  it('NAMES the node — a light with no node is not actionable', () => {
    const r = checkSize('M4 4 L20.25 4', MATERIAL, 24)
    expect(r.offenders[0].seg).toBe(1)
    expect(Math.abs(r.offenders[0].offX)).toBeGreaterThan(0)
  })

  it('scales to the target size — clean at 24 can be dirty at 16', () => {
    // At 16px a 24-grid canvas has scale 2/3 and its 2pt stroke lands at
    // 1.33px, which ROUNDS TO 1 — an odd stroke, so nodes are wanted on HALF
    // pixels. 3pt -> 2px is therefore off, and 3.75pt -> 2.5px is on.
    expect(checkSize('M3 3 L6 3', MATERIAL, 16).ok).toBe(false)
    expect(checkSize('M3.75 3.75 L5.25 3.75', MATERIAL, 16).ok).toBe(true)
    // and the same glyph is clean at 24, where the scale is 1
    expect(checkSize('M3 3 L6 3', MATERIAL, 24).ok).toBe(true)
  })

  it('applies the ODD-stroke rule at the target scale', () => {
    // Octicons 16 canvas at 16px with stroke 1.5 -> rounds to 2 -> whole pixels
    expect(checkSize('M2 2 L14 2', OCTICONS, 16).ok).toBe(true)
    // an explicit 1px stroke wants half pixels instead
    expect(checkSize('M2 2 L14 2', OCTICONS, 16, 1).ok).toBe(false)
    expect(checkSize('M2.5 2.5 L13.5 2.5', OCTICONS, 16, 1).ok).toBe(true)
  })

  it('counts the nodes it checked', () => {
    expect(checkSize('M0 0 L1 1 L2 2', MATERIAL, 24).total).toBe(3)
  })
})

describe('validateIcon — the whole report', () => {
  const clean = [{ d: 'M4 4 L20 4 L20 20 L4 20 Z' }]

  it('passes a clean glyph, judging it only where crispness is REACHABLE', () => {
    const r = validateIcon(clean, MATERIAL)
    expect(r.ok).toBe(true)
    expect(r.sizes.map((s) => s.size)).toEqual(MATERIAL.sizes)
    // 24 and 48 have an integer scale from the 24 canvas; 16, 20 and 32 do not
    expect(r.crispSizes).toEqual([24, 48])
  })

  it('still REPORTS the fractional sizes rather than hiding them', () => {
    const r = validateIcon(clean, MATERIAL)
    const at16 = r.sizes.find((s) => s.size === 16)!
    expect(at16.ok).toBe(false)
    expect(at16.offenders.length).toBeGreaterThan(0)
    // ...but they do not fail the icon, because no drawing can fix a 1.33px stroke
    expect(r.ok).toBe(true)
  })

  it('fails when a REACHABLE size fails', () => {
    const r = validateIcon([{ d: 'M4 4 L20 4 L20 19.5 Z' }], MATERIAL)
    expect(r.ok).toBe(false)
    expect(r.sizes.find((s) => s.size === 24)!.ok).toBe(false)
  })

  it('flags geometry outside the live area — it crops at small sizes', () => {
    const r = validateIcon([{ d: 'M0 0 L24 0 L24 24 Z' }], MATERIAL)
    expect(r.outsideLiveArea).toBeGreaterThan(0)
    expect(r.ok).toBe(false)
  })

  it('warns when a glyph is too small to read next to its set', () => {
    const r = validateIcon([{ d: 'M11 11 L13 11 L13 13 Z' }], MATERIAL)
    expect(r.tooSmall).toBe(true)
  })

  it('does NOT call a full-size glyph too small', () => {
    expect(validateIcon(clean, MATERIAL).tooSmall).toBe(false)
  })

  it('merges offenders across several paths', () => {
    const r = validateIcon([{ d: 'M4.3 4 L20 4' }, { d: 'M4 8.7 L20 8' }], MATERIAL)
    const at24 = r.sizes.find((s) => s.size === 24)!
    expect(at24.offenders.length).toBeGreaterThanOrEqual(2)
  })

  it('reports which sizes can be pixel-perfect at all', () => {
    expect(integerScaleSizes(MATERIAL)).toEqual([24, 48])
    // Octicons draws on a 16 grid, so 16 and 24 are NOT both integer scales —
    // which is precisely why the set draws each size separately
    expect(integerScaleSizes(OCTICONS)).toEqual([16])
  })

  it('handles an empty icon without crashing', () => {
    const r = validateIcon([], MATERIAL)
    expect(r.outsideLiveArea).toBe(0)
    expect(r.tooSmall).toBe(false)
  })
})

describe('snapToPixelGrid — offered as a fix, never automatic', () => {
  it('pulls every node onto the grid for the target size', () => {
    const out = snapToPixelGrid('M4.3 4.2 L19.8 4.4', MATERIAL, 24)
    expect(checkSize(out, MATERIAL, 24).ok).toBe(true)
  })

  it('respects the odd-stroke half-pixel rule', () => {
    const out = snapToPixelGrid('M2.3 2.2 L13.8 2.4', OCTICONS, 16, 1)
    expect(checkSize(out, OCTICONS, 16, 1).ok).toBe(true)
    // and the result really is on halves
    for (const n of nodesOf(out)) expect(Math.abs((n.x % 1) - 0.5)).toBeLessThan(1e-6)
  })

  it('snaps control points too, or the curve drifts off its own anchors', () => {
    const out = snapToPixelGrid('M4 4 C6.3 4.2 8.7 4.4 12 4', MATERIAL, 24)
    expect(out).toContain('C6 4 9 4 12 4')
  })

  it('leaves an already-snapped path alone', () => {
    const d = 'M4 4 L20 4'
    expect(snapToPixelGrid(d, MATERIAL, 24)).toBe(d)
  })

  it('refuses a degenerate size rather than dividing by zero', () => {
    const d = 'M4 4 L20 4'
    expect(snapToPixelGrid(d, MATERIAL, 0)).toBe(d)
  })
})

describe('SVG export', () => {
  it('emits a viewBox and NO width/height — the icon must scale', () => {
    const svg = toSvg([{ d: 'M4 4 L20 20', stroke: '#000000' }], MATERIAL)
    expect(svg).toContain('viewBox="0 0 24 24"')
    expect(svg).not.toMatch(/\swidth="/)
    expect(svg).not.toMatch(/\sheight="/)
  })

  it('uses currentColor when asked, so the icon inherits text colour', () => {
    const svg = toSvg([{ d: 'M4 4 L20 20', fill: '#ff0000' }], MATERIAL, { currentColor: true })
    expect(svg).toContain('currentColor')
    expect(svg).not.toContain('#ff0000')
  })

  it('carries the preset cap and join on a stroked path', () => {
    const svg = toSvg([{ d: 'M4 4 L20 20', stroke: '#000000' }], LUCIDE)
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain('stroke-linejoin="round"')
  })

  it('omits stroke attributes entirely on a fill-only path', () => {
    const svg = toSvg([{ d: 'M4 4 L20 20 Z', fill: '#000000' }], MATERIAL)
    expect(svg).not.toContain('stroke-width')
  })

  it('DROPS a path whose data fails the safety guard', () => {
    const svg = toSvg([{ d: 'M0 0 url(#evil)' }, { d: 'M4 4 L8 8', fill: '#000000' }], MATERIAL)
    expect(svg).not.toContain('url')
    expect(svg).toContain('M4 4 L8 8')
  })

  it('rejects a colour that is not a hex rather than writing it', () => {
    const svg = toSvg([{ d: 'M4 4 L8 8', fill: 'red;}</style>' }], MATERIAL)
    expect(svg).not.toContain('</style>')
    expect(svg).toContain('fill="none"')
  })

  it('escapes a title', () => {
    const svg = toSvg([{ d: 'M4 4 L8 8' }], MATERIAL, { title: 'a < b & "c"' })
    expect(svg).toContain('&lt;')
    expect(svg).toContain('&amp;')
    expect(svg).not.toContain('<title>a < b')
  })

  it('is deterministic', () => {
    const a = toSvg([{ d: 'M4 4 L8 8', fill: '#123456' }], MATERIAL)
    const b = toSvg([{ d: 'M4 4 L8 8', fill: '#123456' }], MATERIAL)
    expect(a).toBe(b)
  })
})

describe('ICO packing', () => {
  /** The smallest valid PNG header, enough for the writer's guards. */
  const fakePng = (n: number): Uint8Array => {
    const b = new Uint8Array(24 + n)
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    const dv = new DataView(b.buffer)
    dv.setUint32(16, n)
    dv.setUint32(20, n)
    return b
  }

  it('writes the ICONDIR header', () => {
    const ico = toIco([{ size: 16, bytes: fakePng(16) }])
    const dv = new DataView(ico.buffer)
    expect(dv.getUint16(0, true)).toBe(0)
    expect(dv.getUint16(2, true)).toBe(1)
    expect(dv.getUint16(4, true)).toBe(1)
  })

  it('sorts entries smallest first', () => {
    const ico = toIco([
      { size: 48, bytes: fakePng(48) },
      { size: 16, bytes: fakePng(16) }
    ])
    expect(ico[6]).toBe(16)
    expect(ico[6 + 16]).toBe(48)
  })

  it('stores 256 as ZERO — the field is one byte', () => {
    const ico = toIco([{ size: 256, bytes: fakePng(256) }])
    expect(ico[6]).toBe(0)
    expect(ico[7]).toBe(0)
  })

  it('points each entry at the right offset and length', () => {
    const a = fakePng(16)
    const b = fakePng(32)
    const ico = toIco([
      { size: 16, bytes: a },
      { size: 32, bytes: b }
    ])
    const dv = new DataView(ico.buffer)
    const headerLen = 6 + 2 * 16
    expect(dv.getUint32(6 + 8, true)).toBe(a.length)
    expect(dv.getUint32(6 + 12, true)).toBe(headerLen)
    expect(dv.getUint32(6 + 16 + 12, true)).toBe(headerLen + a.length)
  })

  it('skips an empty or out-of-range entry', () => {
    const ico = toIco([
      { size: 16, bytes: new Uint8Array(0) },
      { size: 999, bytes: fakePng(16) },
      { size: 32, bytes: fakePng(32) }
    ])
    expect(new DataView(ico.buffer).getUint16(4, true)).toBe(1)
  })

  it('recognises a PNG and reads its size', () => {
    expect(isPng(fakePng(32))).toBe(true)
    expect(isPng(new Uint8Array([0xff, 0xd8, 0xff]))).toBe(false)
    expect(pngSize(fakePng(48))).toEqual({ w: 48, h: 48 })
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBe(null)
  })

  it('offers the sizes Windows asks for', () => {
    expect(ICO_SIZES).toContain(16)
    expect(ICO_SIZES).toContain(256)
    expect([...ICO_SIZES].sort((a, b) => a - b)).toEqual(ICO_SIZES)
  })
})
