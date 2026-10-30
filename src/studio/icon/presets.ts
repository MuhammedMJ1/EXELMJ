// Icon-system presets — the published grid rules of the three sets worth
// following, transcribed as DATA rather than reimplemented as behaviour.
//
// These numbers are the actual difference between "a small drawing" and "an
// icon". A 24dp Material icon lives inside a 20dp live area with 2dp of
// padding, its exterior corners are 2dp and its INTERIOR corners are square;
// Lucide strokes 2 at round cap and join with 2 units between elements;
// Octicons ships every glyph at BOTH 16 and 24 rather than scaling one to the
// other, because a 24px glyph shrunk to 16 loses its stroke alignment.
//
// The four Material keyline shapes matter most: they are why a circular icon
// and a square icon in the same set look the same SIZE despite the circle
// being geometrically larger.

export interface IconPreset {
  id: string
  label: string
  /** canvas edge in pt, and the sizes the set ships at */
  grid: number
  sizes: number[]
  /** inset of the live area from the canvas edge, per side, in pt */
  padding: number
  strokeWidth: number
  /** exterior corner radius; interiors stay square in every set here */
  cornerRadius: number
  cap: 'butt' | 'round' | 'square'
  join: 'miter' | 'round' | 'bevel'
  /** gap between separate elements of one glyph */
  spacing: number
  /** decimals kept in exported path data */
  precision: number
  /** the reference shapes drawn as non-printing guides */
  keylines: Keyline[]
}

export type Keyline =
  | { kind: 'square'; w: number; h: number }
  | { kind: 'circle'; d: number }
  | { kind: 'rect'; w: number; h: number; radius: number }

/**
 * Material Design, 24dp. The live area is 20dp, and the four keylines are the
 * published reference shapes: an 18x18 square, a 20 circle, and the two 20x16
 * rectangles. A glyph that fills the circle keyline reads the same size as one
 * that fills the square keyline, which is the entire point.
 */
export const MATERIAL: IconPreset = {
  id: 'material',
  label: 'Material',
  grid: 24,
  sizes: [16, 20, 24, 32, 48],
  padding: 2,
  strokeWidth: 2,
  cornerRadius: 2,
  cap: 'butt',
  join: 'miter',
  spacing: 2,
  precision: 2,
  keylines: [
    { kind: 'square', w: 18, h: 18 },
    { kind: 'circle', d: 20 },
    { kind: 'rect', w: 20, h: 16, radius: 2 },
    { kind: 'rect', w: 16, h: 20, radius: 2 }
  ]
}

/** Lucide: 24 canvas, 2 stroke, round cap AND join, 2 units between elements,
 * 3 decimals, and at least 1 unit of padding. */
export const LUCIDE: IconPreset = {
  id: 'lucide',
  label: 'Lucide',
  grid: 24,
  sizes: [16, 20, 24, 32, 48],
  padding: 1,
  strokeWidth: 2,
  cornerRadius: 2,
  cap: 'round',
  join: 'round',
  spacing: 2,
  precision: 3,
  keylines: [{ kind: 'square', w: 22, h: 22 }]
}

/**
 * Octicons: drawn at BOTH 16 and 24 with a 1.5 stroke at each, never scaled
 * from one to the other. 1 unit of gap for overlap, 1.5 around modifiers.
 */
export const OCTICONS: IconPreset = {
  id: 'octicons',
  label: 'Octicons',
  grid: 16,
  sizes: [16, 24],
  padding: 1,
  strokeWidth: 1.5,
  cornerRadius: 1,
  cap: 'round',
  join: 'round',
  spacing: 1,
  precision: 3,
  keylines: [{ kind: 'square', w: 14, h: 14 }]
}

/**
 * Hugeicons, the set bundled in resources/icons/hugeicons.json.
 *
 * 24 grid at stroke 1.5 with round caps and joins. Recorded as a preset so an
 * inserted library icon is validated against the rules it was actually drawn
 * to, rather than against Material's 2pt stroke — which would flag every
 * inserted icon as off-grid.
 */
export const HUGEICONS: IconPreset = {
  id: 'hugeicons',
  label: 'Hugeicons',
  grid: 24,
  sizes: [16, 20, 24, 32, 48],
  padding: 2,
  strokeWidth: 1.5,
  cornerRadius: 2,
  cap: 'round',
  join: 'round',
  spacing: 2,
  precision: 3,
  keylines: [{ kind: 'square', w: 20, h: 20 }]
}

/** A free canvas with no house rules — for a logo mark that is not part of a set. */
export const CUSTOM: IconPreset = {
  id: 'custom',
  label: 'Custom',
  grid: 24,
  sizes: [16, 24, 32, 48, 64, 128],
  padding: 0,
  strokeWidth: 2,
  cornerRadius: 0,
  cap: 'round',
  join: 'round',
  spacing: 0,
  precision: 3,
  keylines: []
}

export const PRESETS: IconPreset[] = [MATERIAL, LUCIDE, OCTICONS, HUGEICONS, CUSTOM]

export function presetById(id: string): IconPreset {
  return PRESETS.find((p) => p.id === id) ?? MATERIAL
}

/** The live area rectangle, in canvas pt. */
export function liveArea(p: IconPreset): { x: number; y: number; w: number; h: number } {
  return {
    x: p.padding,
    y: p.padding,
    w: p.grid - p.padding * 2,
    h: p.grid - p.padding * 2
  }
}

/** Keyline shapes placed at the canvas centre, as drawable geometry. */
export function keylineShapes(
  p: IconPreset
): Array<{ x: number; y: number; w: number; h: number; radius: number; ellipse: boolean }> {
  const c = p.grid / 2
  return p.keylines.map((k) => {
    if (k.kind === 'circle') {
      return { x: c - k.d / 2, y: c - k.d / 2, w: k.d, h: k.d, radius: 0, ellipse: true }
    }
    const radius = k.kind === 'rect' ? k.radius : 0
    return { x: c - k.w / 2, y: c - k.h / 2, w: k.w, h: k.h, radius, ellipse: false }
  })
}
