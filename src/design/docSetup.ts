// What a NEW document is: how big, in what unit, at what resolution, and for
// screen or for print.
//
// The app's own unit is the PostScript POINT everywhere else, so this module
// exists to be the single place any other unit is converted — and to make the
// two conversions that are easy to get wrong impossible to get wrong here:
//
//  - a PIXEL has no fixed physical size. It only means something once a
//    resolution is chosen, which is exactly why DPI belongs in this dialog
//    rather than buried in the export settings;
//  - a MILLIMETRE does, and it never depends on the resolution. Wiring mm
//    through the DPI is the classic bug that makes a 300dpi A4 come out four
//    times too big.
//
// Pure: no DOM. Unit-tested in node.

export type Unit = 'px' | 'mm' | 'cm' | 'in' | 'pt'
export type ColorMode = 'rgb' | 'cmyk'

export interface DocSetup {
  /** in `unit` */
  width: number
  height: number
  unit: Unit
  /** pixels per inch — what gives a pixel a physical size */
  dpi: number
  colorMode: ColorMode
}

/** PostScript points per inch. Fixed by the format, not a preference. */
export const PT_PER_INCH = 72
export const MM_PER_INCH = 25.4

/** How many points one unit is worth. Only `px` depends on the resolution. */
export function ptPerUnit(unit: Unit, dpi: number): number {
  switch (unit) {
    case 'pt':
      return 1
    case 'in':
      return PT_PER_INCH
    case 'mm':
      return PT_PER_INCH / MM_PER_INCH
    case 'cm':
      return (PT_PER_INCH / MM_PER_INCH) * 10
    case 'px':
      // A pixel is 1/dpi of an inch. With dpi === 72 this is 1:1 with points,
      // which is why screen work at 72 feels like it has no unit at all.
      return PT_PER_INCH / Math.max(1, dpi)
  }
}

export function toPt(value: number, unit: Unit, dpi: number): number {
  return value * ptPerUnit(unit, dpi)
}

export function fromPt(pt: number, unit: Unit, dpi: number): number {
  return pt / ptPerUnit(unit, dpi)
}

/** The document's size in points — what every other module measures in. */
export function setupToPt(s: DocSetup): { widthPt: number; heightPt: number } {
  return {
    widthPt: toPt(s.width, s.unit, s.dpi),
    heightPt: toPt(s.height, s.unit, s.dpi)
  }
}

/**
 * Clamp a setup into something that can actually be made.
 *
 * A zero or negative page is not a page, and a raster of a hundred thousand
 * points is a browser tab that stops responding. Both are refused HERE rather
 * than by whatever downstream code happens to divide by them first.
 */
export function cleanSetup(s: DocSetup): DocSetup {
  const dpi = Math.min(1200, Math.max(1, Math.round(s.dpi) || 72))
  const size = (v: number): number => {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return 1
    return Math.min(fromPt(20000, s.unit, dpi), n)
  }
  return {
    width: size(s.width),
    height: size(s.height),
    unit: s.unit,
    dpi,
    colorMode: s.colorMode === 'cmyk' ? 'cmyk' : 'rgb'
  }
}

export function landscape(s: DocSetup): DocSetup {
  return s.width >= s.height ? s : { ...s, width: s.height, height: s.width }
}

export function portrait(s: DocSetup): DocSetup {
  return s.height >= s.width ? s : { ...s, width: s.height, height: s.width }
}

export interface Preset {
  id: string
  setup: DocSetup
}

/**
 * The starting points, each with the resolution and colour mode that go WITH
 * it — a social square at 300dpi CMYK is nobody's intention, and an A4 flyer
 * at 72dpi RGB prints as a blurry one.
 */
export const DOC_PRESETS: Preset[] = [
  { id: 'a4', setup: { width: 210, height: 297, unit: 'mm', dpi: 300, colorMode: 'cmyk' } },
  { id: 'a3', setup: { width: 297, height: 420, unit: 'mm', dpi: 300, colorMode: 'cmyk' } },
  { id: 'a5', setup: { width: 148, height: 210, unit: 'mm', dpi: 300, colorMode: 'cmyk' } },
  { id: 'letter', setup: { width: 8.5, height: 11, unit: 'in', dpi: 300, colorMode: 'cmyk' } },
  { id: 'card', setup: { width: 90, height: 50, unit: 'mm', dpi: 300, colorMode: 'cmyk' } },
  { id: 'square', setup: { width: 1080, height: 1080, unit: 'px', dpi: 72, colorMode: 'rgb' } },
  { id: 'story', setup: { width: 1080, height: 1920, unit: 'px', dpi: 72, colorMode: 'rgb' } },
  { id: 'hd', setup: { width: 1920, height: 1080, unit: 'px', dpi: 72, colorMode: 'rgb' } },
  { id: 'icon', setup: { width: 512, height: 512, unit: 'px', dpi: 72, colorMode: 'rgb' } }
]

export function defaultSetup(): DocSetup {
  return { ...DOC_PRESETS[0].setup }
}

/**
 * Which preset a setup matches, or 'custom'.
 *
 * The EXACT orientation is tried first and the swapped one only after. Two
 * presets here are each other turned on their side — a 1080x1920 story and a
 * 1920x1080 video frame — so an orientation-blind match would report whichever
 * happened to sit earlier in the list.
 */
export function presetIdFor(s: DocSetup): string {
  const same = (p: Preset, w: number, h: number): boolean =>
    p.setup.unit === s.unit && p.setup.dpi === s.dpi && p.setup.width === w && p.setup.height === h
  const exact = DOC_PRESETS.find((p) => same(p, s.width, s.height))
  if (exact) return exact.id
  return DOC_PRESETS.find((p) => same(p, s.height, s.width))?.id ?? 'custom'
}

// ─── colour ──────────────────────────────────────────────────────────────────
// A DEVICE conversion, not a colour-managed separation. There is no ICC
// profile here, so this is what a screen means by "the CMYK of this colour" —
// good enough to read off and to hand to a printer as a starting point, and
// deliberately not dressed up as more than that.

export type Cmyk = [number, number, number, number]

/** '#rrggbb' → C, M, Y, K, each 0..1. */
export function hexToCmyk(hex: string): Cmyk {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  const v = m ? parseInt(m[1], 16) : 0
  const r = ((v >> 16) & 0xff) / 255
  const g = ((v >> 8) & 0xff) / 255
  const b = (v & 0xff) / 255
  const k = 1 - Math.max(r, g, b)
  // Pure black carries no chromatic ink at all; without this guard the three
  // channels each divide by zero and come out NaN.
  if (k >= 1) return [0, 0, 0, 1]
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k]
}

export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]
}

/** The same four numbers as whole percentages, which is how ink is spoken. */
export function cmykPercent(c: Cmyk): [number, number, number, number] {
  return c.map((v) => Math.round(v * 100)) as [number, number, number, number]
}
