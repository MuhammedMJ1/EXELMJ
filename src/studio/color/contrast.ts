// Contrast — WCAG 2.x relative luminance, hand-rolled in ten lines.
//
// WHY NOT APCA (the WCAG 3 draft algorithm, which is perceptually better)
// The whole APCA toolchain is legally unusable for a distributed product:
// `apca-w3` is published All Rights Reserved with patent(s) pending and a
// grant limited to "web content", and it depends on `colorparsley`, which is
// AGPL-3.0. That chain silently taints every popular tool built on it —
// Adobe's Leonardo, apcach, Huetone, Harmonizer. WCAG 2.x is the only contrast
// algorithm in this space that is both a published standard and unencumbered,
// and it is also the one accessibility law actually cites.
//
// The formula is small enough that depending on anything for it would be the
// strange choice.
//
// Pure maths. Unit-tested against the published W3C examples.

import { hexToLch, hexToRgb, lchToHex, maxChroma, srgbToLinear, type LCH } from './oklab'

/** WCAG 2.x relative luminance of an sRGB colour. */
export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return (
    0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b)
  )
}

/** Contrast ratio, 1..21. Order does not matter. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la === null || lb === null) return null
  const hi = Math.max(la, lb)
  const lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

export type ContrastVerdict = 'AAA' | 'AA' | 'AA Large' | 'Fail'

/**
 * The VERDICT, not the number.
 *
 * A bare "4.31" means nothing to someone laying out a page; "Fail" does. The
 * thresholds are WCAG 2.1: 7:1 AAA body, 4.5:1 AA body, 3:1 AA large text
 * (>=18pt, or >=14pt bold) and non-text UI components.
 */
export function verdict(ratio: number): ContrastVerdict {
  if (ratio >= 7) return 'AAA'
  if (ratio >= 4.5) return 'AA'
  if (ratio >= 3) return 'AA Large'
  return 'Fail'
}

export function verdictFor(fg: string, bg: string): ContrastVerdict | null {
  const r = contrastRatio(fg, bg)
  return r === null ? null : verdict(r)
}

/** Black or white — whichever is more readable on this background. */
export function readableOn(bg: string): string {
  const white = contrastRatio('#ffffff', bg) ?? 0
  const black = contrastRatio('#000000', bg) ?? 0
  return white >= black ? '#ffffff' : '#000000'
}

/**
 * Find the lightness that hits a target contrast against `bg`, keeping the
 * hue and as much chroma as the gamut allows.
 *
 * This is "solve for 4.5:1" — the operation a designer actually wants, and the
 * inverse of every contrast checker that only ever tells you that you failed.
 * Bisection on L, because contrast is monotonic in lightness on each side of
 * the background and 40 iterations is instant.
 *
 * `prefer` picks which side to search when both a lighter and a darker answer
 * exist; 'auto' takes whichever side the seed is already on.
 */
export function solveForContrast(
  seed: LCH,
  bg: string,
  target: number,
  prefer: 'lighter' | 'darker' | 'auto' = 'auto'
): LCH | null {
  const bgL = relativeLuminance(bg)
  if (bgL === null || !(target >= 1)) return null

  const at = (L: number): number => {
    const hex = lchToHex({ L, C: Math.min(seed.C, maxChroma(L, seed.h)), h: seed.h })
    return contrastRatio(hex, bg) ?? 0
  }

  const seedHex = lchToHex(seed)
  const seedLum = relativeLuminance(seedHex) ?? 0
  const goLighter = prefer === 'lighter' || (prefer === 'auto' && seedLum >= bgL)

  // Is the target even reachable on the chosen side? White and black are the
  // extremes; if neither end clears the bar, say so instead of returning the
  // closest wrong answer.
  const endL = goLighter ? 1 : 0
  if (at(endL) < target) return null

  let lo = goLighter ? seedLumToL(bgL) : 0
  let hi = goLighter ? 1 : seedLumToL(bgL)
  // ensure lo is the failing end and hi the passing end
  if (goLighter) {
    lo = 0
    hi = 1
  } else {
    lo = 1
    hi = 0
  }
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (at(mid) >= target) hi = mid
    else lo = mid
  }
  const L = hi
  return { L, C: Math.min(seed.C, maxChroma(L, seed.h)), h: seed.h }
}

/** A rough L for a given luminance — only used to seed the search bounds. */
function seedLumToL(lum: number): number {
  return Math.cbrt(Math.max(0, Math.min(1, lum)))
}

/**
 * Solve for contrast starting from a hex, returning a hex.
 * Returns null when the target is unreachable for that hue on that side.
 */
export function fixContrast(
  fg: string,
  bg: string,
  target = 4.5,
  prefer: 'lighter' | 'darker' | 'auto' = 'auto'
): string | null {
  const seed = hexToLch(fg)
  if (!seed) return null
  const out = solveForContrast(seed, bg, target, prefer)
  return out ? lchToHex(out) : null
}
