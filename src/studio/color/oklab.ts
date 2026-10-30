// OKLab / OKLCH and the sRGB gamut boundary.
//
// Vendored from Björn Ottosson's public reference implementation of Oklab
// (https://bottosson.github.io/posts/oklab/ and .../gamutclipping/), which the
// author released into the public domain / MIT. Roughly 200 lines, one file,
// zero dependencies.
//
// WHY THIS FILE EXISTS AT ALL, given culori is a dependency
// culori converts colours. It does not answer "for THIS hue and THIS lightness,
// what is the most saturated colour sRGB can actually show?" — and that
// question is the whole colour picker. compute_max_saturation() answers it in a
// fitted polynomial plus one Halley step, i.e. a handful of FLOPs, which is
// what lets the picker draw a live gamut boundary at 60fps on a 2D canvas with
// no solver in the loop. A binary search per pixel would not.
//
// WHY OKLCH AND NOT HSL
// HSL's "lightness" is a coordinate, not a perception: hsl(60 100% 50%) is
// yellow and blinding, hsl(240 100% 50%) is blue and nearly black, and they
// claim the same lightness. Every tonal scale built on HSL therefore has a
// bright rung and a dark rung at the same step number. OKLab's L IS perceived
// lightness, so equal L across hues really does look equally light — which is
// the invariant the whole token system rests on.
//
// Pure maths, no DOM. Unit-tested in node against independent references.

export interface RGB {
  r: number
  g: number
  b: number
}
export interface Lab {
  L: number
  a: number
  b: number
}
export interface LCH {
  L: number
  C: number
  /** degrees, 0..360 */
  h: number
}

// ─── sRGB transfer function ──────────────────────────────────────────────────

/**
 * The sRGB spec quotes the two kink thresholds as 0.04045 and 0.0031308, and
 * those are NOT exact reciprocals: 0.04045 / 12.92 = 0.003130882..., which is
 * above 0.0031308. A value landing in that sliver takes the linear branch one
 * way and the power branch the other, so the round trip is off by ~1e-7 — small
 * enough to never show on screen and large enough to make an exactness test
 * fail. Deriving the linear threshold from the sRGB one removes the sliver and
 * makes srgbToLinear/linearToSrgb exact inverses.
 */
const SRGB_KINK = 0.04045
const LINEAR_KINK = SRGB_KINK / 12.92

export function srgbToLinear(c: number): number {
  return c <= SRGB_KINK ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function linearToSrgb(c: number): number {
  return c <= LINEAR_KINK ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
}

// ─── linear sRGB <-> OKLab ───────────────────────────────────────────────────

export function linearSrgbToOklab(r: number, g: number, b: number): Lab {
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_
  }
}

export function oklabToLinearSrgb(L: number, a: number, b: number): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  return {
    r: +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  }
}

// ─── the gamut boundary ──────────────────────────────────────────────────────

/**
 * Maximum saturation S = C/L for a hue direction (a, b) that stays inside sRGB.
 *
 * Ottosson's method: a per-channel polynomial approximation picks the channel
 * that clips first and gives a starting S, then ONE Halley step on that
 * channel's cubic converges to machine precision. This is why the boundary can
 * be evaluated per pixel.
 *
 * (a, b) must be normalised: a² + b² = 1.
 */
export function computeMaxSaturation(a: number, b: number): number {
  let k0: number
  let k1: number
  let k2: number
  let k3: number
  let k4: number
  let wl: number
  let wm: number
  let ws: number

  if (-1.88170328 * a - 0.80936493 * b > 1) {
    // red component clips first
    k0 = 1.19086277
    k1 = 1.76576728
    k2 = 0.59662641
    k3 = 0.75515197
    k4 = 0.56771245
    wl = 4.0767416621
    wm = -3.3077115913
    ws = 0.2309699292
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    // green
    k0 = 0.73956515
    k1 = -0.45954404
    k2 = 0.08285427
    k3 = 0.1254107
    k4 = 0.14503204
    wl = -1.2684380046
    wm = 2.6097574011
    ws = -0.3413193965
  } else {
    // blue
    k0 = 1.35733652
    k1 = -0.00915799
    k2 = -1.1513021
    k3 = -0.50559606
    k4 = 0.00692167
    wl = -0.0041960863
    wm = -0.7034186147
    ws = 1.707614701
  }

  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b

  // one Halley step on the chosen channel
  const kl = +0.3963377774 * a + 0.2158037573 * b
  const km = -0.1055613458 * a - 0.0638541728 * b
  const ks = -0.0894841775 * a - 1.291485548 * b

  const l_ = 1 + S * kl
  const m_ = 1 + S * km
  const s_ = 1 + S * ks
  const l = l_ * l_ * l_
  const m = m_ * m_ * m_
  const s = s_ * s_ * s_
  const ldS = 3 * kl * l_ * l_
  const mdS = 3 * km * m_ * m_
  const sdS = 3 * ks * s_ * s_
  const ldS2 = 6 * kl * kl * l_
  const mdS2 = 6 * km * km * m_
  const sdS2 = 6 * ks * ks * s_

  const f = wl * l + wm * m + ws * s
  const f1 = wl * ldS + wm * mdS + ws * sdS
  const f2 = wl * ldS2 + wm * mdS2 + ws * sdS2

  const denom = f1 * f1 - 0.5 * f * f2
  S = denom === 0 ? S : S - (f * f1) / denom
  return S
}

/**
 * The cusp — the most saturated point of a hue's sRGB slice, as (L, C).
 * Everything above and to the right of it is out of gamut.
 */
export function findCusp(a: number, b: number): { L: number; C: number } {
  const sCusp = computeMaxSaturation(a, b)
  const rgb = oklabToLinearSrgb(1, sCusp * a, sCusp * b)
  const maxComponent = Math.max(rgb.r, rgb.g, rgb.b)
  const lCusp = Math.cbrt(1 / maxComponent)
  return { L: lCusp, C: lCusp * sCusp }
}

/**
 * Largest chroma that stays in sRGB at this lightness and hue.
 *
 * The gamut slice for a hue is a triangle from black (L=0) through the cusp to
 * white (L=1), so the answer is the triangle edge at that L. This is the curve
 * the picker draws, and the clamp that stops a colour ever leaving the gamut.
 */
export function maxChroma(L: number, hueDeg: number): number {
  if (L <= 0 || L >= 1) return 0
  const h = (hueDeg * Math.PI) / 180
  const a = Math.cos(h)
  const b = Math.sin(h)
  const cusp = findCusp(a, b)
  if (L <= cusp.L) {
    // black -> cusp
    return cusp.L > 0 ? (cusp.C * L) / cusp.L : 0
  }
  // cusp -> white
  return cusp.L < 1 ? (cusp.C * (1 - L)) / (1 - cusp.L) : 0
}

export function inGamut(c: LCH): boolean {
  // a hair of slack: the boundary itself must count as inside, and the Halley
  // step lands within ~1e-9 of it
  return c.C <= maxChroma(c.L, c.h) + 1e-9
}

/**
 * Pull a colour into sRGB by reducing CHROMA only.
 *
 * Lightness and hue are preserved because those are the two properties a design
 * system depends on: clamping L would break the "equal step, equal lightness"
 * invariant, and rotating h would change which colour it is. Reducing chroma
 * only makes it duller, which is the one degradation a user reads as "the
 * screen cannot show that", not as a bug.
 */
export function clampToGamut(c: LCH): LCH {
  const L = Math.min(1, Math.max(0, c.L))
  const h = ((c.h % 360) + 360) % 360
  const max = maxChroma(L, h)
  return { L, C: Math.min(Math.max(0, c.C), max), h }
}

// ─── conversions to and from hex ─────────────────────────────────────────────

export function lchToLab({ L, C, h }: LCH): Lab {
  const r = (h * Math.PI) / 180
  return { L, a: C * Math.cos(r), b: C * Math.sin(r) }
}

export function labToLch({ L, a, b }: Lab): LCH {
  const C = Math.hypot(a, b)
  // Hue of a neutral is meaningless; reporting 0 keeps it stable rather than
  // letting float noise spin it, which would make a grey scale drift in hue.
  const h = C < 1e-7 ? 0 : (((Math.atan2(b, a) * 180) / Math.PI) + 360) % 360
  return { L, C, h }
}

const hex2 = (v: number): string =>
  Math.round(Math.min(255, Math.max(0, v * 255)))
    .toString(16)
    .padStart(2, '0')

export function lchToHex(c: LCH): string {
  const { L, a, b } = lchToLab(clampToGamut(c))
  const lin = oklabToLinearSrgb(L, a, b)
  return `#${hex2(linearToSrgb(lin.r))}${hex2(linearToSrgb(lin.g))}${hex2(linearToSrgb(lin.b))}`
}

const HEX = /^#([0-9a-fA-F]{6})$/

export function hexToRgb(hex: string): RGB | null {
  const m = HEX.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

export function hexToLch(hex: string): LCH | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const lin = {
    r: srgbToLinear(rgb.r),
    g: srgbToLinear(rgb.g),
    b: srgbToLinear(rgb.b)
  }
  return labToLch(linearSrgbToOklab(lin.r, lin.g, lin.b))
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${hex2(r)}${hex2(g)}${hex2(b)}`
}
