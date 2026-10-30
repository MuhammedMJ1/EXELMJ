// Tonal scales, harmony, dark-mode derivation and colour-vision simulation.
//
// The design goal for the scale generator is the one thing a design system
// actually needs and almost no generator delivers: **equal step index means
// equal lightness across every hue**. Get that and contrast stops being a
// per-pair check and becomes a system invariant — swapping brand-600 for
// red-600 anywhere cannot break a contrast requirement, because the two have
// the same lightness by construction. Miss it and every hue needs its own
// contrast audit forever.
//
// So the ladder is a fixed list of OKLab lightnesses, shared by all hues, and
// only the chroma varies per hue (clamped to what sRGB can show at that
// lightness). That is the whole algorithm, and its simplicity is the point.

import {
  clampToGamut,
  hexToLch,
  lchToHex,
  maxChroma,
  type LCH
} from './oklab'

/** The eleven Tailwind-shaped steps, which is the vocabulary most teams already
 * speak. Values are OKLab lightness, chosen so consecutive steps are visually
 * even and 500 sits where a brand colour naturally wants to be. */
export const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type Step = (typeof STEPS)[number]

const LADDER: Record<Step, number> = {
  50: 0.977,
  100: 0.947,
  200: 0.901,
  300: 0.837,
  400: 0.752,
  500: 0.667,
  600: 0.588,
  700: 0.505,
  800: 0.428,
  900: 0.363,
  950: 0.264
}

/**
 * Chroma envelope: how much of the hue's available chroma each step uses.
 *
 * Full chroma at every step produces a scale whose pale end is a garish tint
 * rather than a tint — 50 and 100 have to stay nearly neutral to be usable as
 * page backgrounds, and the deepest steps run out of gamut anyway. The curve
 * peaks near 500-600, which is where a brand colour lives.
 */
const CHROMA_ENVELOPE: Record<Step, number> = {
  50: 0.13,
  100: 0.22,
  200: 0.38,
  300: 0.55,
  400: 0.75,
  500: 0.92,
  600: 1.0,
  700: 0.95,
  800: 0.82,
  900: 0.7,
  950: 0.55
}

export type Scale = Record<Step, string>

export interface ScaleOptions {
  /**
   * Cap the chroma so a scale can be muted without changing its hue.
   * 1 = as saturated as the gamut allows at each step.
   */
  saturation?: number
}

/**
 * Build an eleven-step scale from one seed colour.
 *
 * The seed's HUE is kept exactly; its lightness and chroma are replaced by the
 * ladder. That is deliberate: a user picking "our brand blue" is naming a hue,
 * and if the generator preserved their exact colour at step 500 the scale would
 * inherit whatever lightness accident that colour happened to have — and the
 * cross-hue invariant would be gone.
 */
export function scaleFrom(seedHex: string, opts: ScaleOptions = {}): Scale | null {
  const seed = hexToLch(seedHex)
  if (!seed) return null
  const sat = Math.max(0, Math.min(1, opts.saturation ?? 1))
  const out = {} as Scale
  for (const step of STEPS) {
    const L = LADDER[step]
    const room = maxChroma(L, seed.h)
    const C = room * CHROMA_ENVELOPE[step] * sat
    out[step] = lchToHex(clampToGamut({ L, C, h: seed.h }))
  }
  return out
}

/** The step whose lightness is closest to a colour's own — "where does my
 * brand colour sit on its own scale". */
export function nearestStep(hex: string): Step | null {
  const c = hexToLch(hex)
  if (!c) return null
  let best: Step = 500
  let bestD = Infinity
  for (const step of STEPS) {
    const d = Math.abs(LADDER[step] - c.L)
    if (d < bestD) {
      bestD = d
      best = step
    }
  }
  return best
}

// ─── harmony ─────────────────────────────────────────────────────────────────

export type Harmony = 'complementary' | 'analogous' | 'triadic' | 'split' | 'tetradic'

const OFFSETS: Record<Harmony, number[]> = {
  complementary: [0, 180],
  analogous: [0, -30, 30],
  triadic: [0, 120, 240],
  split: [0, 150, 210],
  tetradic: [0, 90, 180, 270]
}

/**
 * Rotate the hue in OKLCH, not HSL.
 *
 * An HSL rotation changes perceived lightness as it goes — the "complement" of
 * a mid blue comes out as a searing yellow that cannot sit next to it. Rotating
 * in OKLCH holds L and C, so every result in the set is equally light and
 * equally saturated, which is what makes them look like a set.
 */
export function harmony(seedHex: string, kind: Harmony): string[] {
  const seed = hexToLch(seedHex)
  if (!seed) return []
  return OFFSETS[kind].map((d) =>
    lchToHex(clampToGamut({ L: seed.L, C: seed.C, h: (seed.h + d + 360) % 360 }))
  )
}

// ─── dark mode ───────────────────────────────────────────────────────────────

/**
 * Derive the dark counterpart of a scale.
 *
 * NOT an inversion of the hex values. Three things change:
 *  1. the ladder is walked from the other end (50 <-> 950), so what was the
 *     lightest surface becomes the darkest;
 *  2. chroma is REDUCED, because the same chroma reads as far more saturated
 *     against a dark surface and a dark UI painted at light-mode chroma looks
 *     radioactive;
 *  3. the hue is untouched, so the palette is recognisably the same palette.
 */
export function darkFrom(scale: Scale, chromaFactor = 0.82): Scale {
  const out = {} as Scale
  const n = STEPS.length
  for (const [i, step] of STEPS.entries()) {
    const mirror = STEPS[n - 1 - i]
    const src = hexToLch(scale[mirror])
    if (!src) {
      out[step] = scale[mirror]
      continue
    }
    const C = Math.min(src.C * chromaFactor, maxChroma(src.L, src.h))
    out[step] = lchToHex(clampToGamut({ L: src.L, C, h: src.h }))
  }
  return out
}

// ─── colour-vision deficiency ────────────────────────────────────────────────

export type CVD = 'protan' | 'deutan' | 'tritan' | 'achroma'

/**
 * Simulate colour-vision deficiency, from libDaltonLens (public domain).
 *
 * THE RULE THAT MATTERS: Viénot 1999 is a single 3x3 matrix and is correct for
 * protanopia and deuteranopia. It is NOT correct for tritanopia — that one
 * needs Brettel 1997, which splits the colour space into two half-planes and
 * picks a different projection on each side of the neutral axis. Everyone who
 * ships one matrix for all three gets tritanopia visibly wrong.
 *
 * `severity` 0..1 interpolates toward the simulated colour, which gives the
 * anomalous (partial) forms for free.
 */
export function simulateCVD(hex: string, kind: CVD, severity = 1): string {
  const c = hexToLch(hex)
  if (!c) return hex
  const rgb = hexToLinear(hex)
  if (!rgb) return hex
  const sim = kind === 'tritan' ? brettelTritan(rgb) : kind === 'achroma' ? achroma(rgb) : vienot(rgb, kind)
  const s = Math.max(0, Math.min(1, severity))
  return linearToHex({
    r: rgb.r + (sim.r - rgb.r) * s,
    g: rgb.g + (sim.g - rgb.g) * s,
    b: rgb.b + (sim.b - rgb.b) * s
  })
}

interface Lin {
  r: number
  g: number
  b: number
}

/** Viénot/Brettel/Mollon 1999, as published — one matrix per deficiency. */
function vienot(c: Lin, kind: 'protan' | 'deutan'): Lin {
  if (kind === 'protan') {
    return {
      r: 0.11238 * c.r + 0.88762 * c.g + 0.0 * c.b,
      g: 0.11238 * c.r + 0.88762 * c.g + 0.0 * c.b,
      b: 0.00401 * c.r - 0.00401 * c.g + 1.0 * c.b
    }
  }
  return {
    r: 0.29275 * c.r + 0.70725 * c.g + 0.0 * c.b,
    g: 0.29275 * c.r + 0.70725 * c.g + 0.0 * c.b,
    b: -0.02234 * c.r + 0.02234 * c.g + 1.0 * c.b
  }
}

/**
 * Brettel 1997 for tritanopia: two projection planes, chosen by which side of
 * the neutral axis the colour falls on. The separating plane is spanned by the
 * neutral and one of the two anchor stimuli; the sign of that test is the whole
 * reason a single matrix cannot do this.
 */
function brettelTritan(c: Lin): Lin {
  // plane 1 and plane 2 matrices, libDaltonLens tritan values
  const P1 = [1.01277, 0.13548, -0.14826, -0.01243, 0.86812, 0.14431, 0.07589, 0.80561, 0.1185]
  const P2 = [0.93678, 0.18979, -0.12657, 0.06154, 0.81526, 0.1232, -0.37562, 1.12767, 0.24796]
  // separation plane normal (in linear RGB), from the same source
  const N = [0.34478, -0.65518, 0.7011]
  const dot = N[0] * c.r + N[1] * c.g + N[2] * c.b
  const m = dot >= 0 ? P1 : P2
  return {
    r: m[0] * c.r + m[1] * c.g + m[2] * c.b,
    g: m[3] * c.r + m[4] * c.g + m[5] * c.b,
    b: m[6] * c.r + m[7] * c.g + m[8] * c.b
  }
}

function achroma(c: Lin): Lin {
  const y = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return { r: y, g: y, b: y }
}

function hexToLinear(hex: string): Lin | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  const f = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return { r: f((n >> 16) & 255), g: f((n >> 8) & 255), b: f(n & 255) }
}

function linearToHex(c: Lin): string {
  const f = (v: number): string => {
    const clamped = Math.max(0, Math.min(1, v))
    const s = clamped <= 0.04045 / 12.92 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055
    return Math.round(Math.max(0, Math.min(1, s)) * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(c.r)}${f(c.g)}${f(c.b)}`
}

/** Two colours a person with this deficiency cannot tell apart? A crude but
 * useful palette check: simulate both and measure what is left. */
export function confusable(a: string, b: string, kind: CVD, threshold = 0.02): boolean {
  const sa = hexToLch(simulateCVD(a, kind))
  const sb = hexToLch(simulateCVD(b, kind))
  if (!sa || !sb) return false
  return deltaOK(sa, sb) < threshold
}

/** Euclidean distance in OKLab — close enough to a perceptual delta for a
 * palette warning, and it needs no extra dependency. */
export function deltaOK(a: LCH, b: LCH): number {
  const ar = (a.h * Math.PI) / 180
  const br = (b.h * Math.PI) / 180
  const aa = a.C * Math.cos(ar)
  const ab = a.C * Math.sin(ar)
  const ba = b.C * Math.cos(br)
  const bb = b.C * Math.sin(br)
  return Math.hypot(a.L - b.L, aa - ba, ab - bb)
}
