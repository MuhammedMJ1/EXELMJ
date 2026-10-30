// "Extract the colours from this image" — with ZERO new dependencies.
//
// EXELMJ already owns a strong quantiser: src/design/trace.ts builds a palette
// by variance-cut splitting (keep splitting while a cluster's per-pixel SSE is
// still > 360), refines it with a deterministic k-means seeded from that cut,
// and runs a rescue pass over the FULL image so a small-but-distinct colour —
// a thin rule, one gold seal — is not lost because it never appeared in the
// sample. That is better than what a general-purpose colour-extraction library
// would give us, and it is already unit-tested.
//
// So this file adds the ONE thing the tracer does not care about: naming. Six
// anonymous hexes are not a palette; Dominant / Vibrant / Muted / Dark / Light
// / Accent is. The role scoring is node-vibrant's taxonomy, reimplemented in
// ~40 lines against our own OKLCH so it agrees with the rest of the system.

import { buildPalette, refinePalette, type RGB } from '../../design/trace'
import { hexToLch, labToLch, linearSrgbToOklab, rgbToHex, srgbToLinear, type LCH } from './oklab'
import { deltaOK } from './scale'

export type Role = 'dominant' | 'vibrant' | 'muted' | 'dark' | 'light' | 'accent'

export interface Swatch {
  hex: string
  role: Role
  /** share of sampled pixels, 0..1 — "how much of the picture is this" */
  weight: number
  lch: LCH
}

export interface ExtractOptions {
  /** palette size handed to the tracer's quantiser. */
  colors?: number
  /** true = let the tracer decide how many colours the image really has. */
  auto?: boolean
  /** cap on returned swatches after role assignment. */
  max?: number
}

/**
 * Sample an RGBA buffer down to the pixel list the quantiser wants.
 *
 * Fully transparent pixels are DROPPED rather than counted as black — a logo
 * on a transparent background otherwise reports "mostly black", which is the
 * single most common wrong answer in image palette extraction.
 */
function samplePixels(data: Uint8ClampedArray, w: number, h: number, target = 20000): RGB[] {
  const total = w * h
  const stride = Math.max(1, Math.floor(total / target))
  const out: RGB[] = []
  for (let i = 0; i < total; i += stride) {
    const o = i * 4
    if (data[o + 3] < 8) continue
    out.push([data[o], data[o + 1], data[o + 2]])
  }
  return out
}

function toLch(c: RGB): LCH {
  const lab = linearSrgbToOklab(
    srgbToLinear(c[0] / 255),
    srgbToLinear(c[1] / 255),
    srgbToLinear(c[2] / 255)
  )
  return labToLch(lab)
}

/** Target (L, C) window per role, and how strictly each is weighted. */
const TARGETS: Record<Exclude<Role, 'dominant'>, { L: number; C: number }> = {
  vibrant: { L: 0.62, C: 0.16 },
  muted: { L: 0.6, C: 0.05 },
  dark: { L: 0.28, C: 0.09 },
  light: { L: 0.88, C: 0.06 },
  accent: { L: 0.55, C: 0.22 }
}

/**
 * Extract named swatches from an RGBA buffer.
 *
 * Returns [] for an empty or fully transparent image rather than inventing a
 * palette — an honest nothing beats six greys the user never chose.
 */
export function extractPalette(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  opts: ExtractOptions = {}
): Swatch[] {
  const pixels = samplePixels(data, w, h)
  if (!pixels.length) return []

  const n = Math.max(2, Math.min(32, opts.colors ?? 8))
  const base = buildPalette(pixels, n, opts.auto ?? false)
  if (!base.length) return []
  const palette = refinePalette(pixels, base, 6)

  // Weight each palette entry by how many sampled pixels land nearest to it.
  const counts = new Array<number>(palette.length).fill(0)
  for (const p of pixels) {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < palette.length; i++) {
      const q = palette[i]
      const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    counts[best]++
  }

  const entries = palette.map((c, i) => ({
    hex: rgbToHex({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 }),
    lch: toLch(c),
    weight: counts[i] / pixels.length
  }))

  const used = new Set<number>()
  const out: Swatch[] = []

  // Dominant is simply the heaviest entry — the colour the picture IS.
  let domIdx = 0
  for (let i = 1; i < entries.length; i++) if (entries[i].weight > entries[domIdx].weight) domIdx = i
  used.add(domIdx)
  out.push({ ...entries[domIdx], role: 'dominant' })

  for (const role of ['vibrant', 'muted', 'dark', 'light', 'accent'] as const) {
    const t = TARGETS[role]
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < entries.length; i++) {
      if (used.has(i)) continue
      const e = entries[i]
      // distance in the (L, C) plane, with a small bonus for a heavier colour
      // so an equally-good-fitting speck loses to a real area of the picture
      const score = Math.hypot(e.lch.L - t.L, (e.lch.C - t.C) * 1.5) - e.weight * 0.15
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best < 0) continue
    used.add(best)
    out.push({ ...entries[best], role })
  }

  // Drop near-duplicates: two roles landing on visually the same colour is a
  // palette that lies about how many colours it found.
  const deduped: Swatch[] = []
  for (const s of out) {
    if (deduped.some((d) => deltaOK(d.lch, s.lch) < 0.02)) continue
    deduped.push(s)
  }
  return deduped.slice(0, opts.max ?? 6)
}

/** Extract from a list of hexes instead of pixels — the path used when the
 * colours are already known (a traced artwork's own layer fills). */
export function rolesForHexes(hexes: string[]): Swatch[] {
  const seen = new Set<string>()
  const entries = hexes
    .filter((h) => {
      const k = h.toLowerCase()
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((hex) => ({ hex, lch: hexToLch(hex), weight: 1 / Math.max(1, hexes.length) }))
    .filter((e): e is { hex: string; lch: LCH; weight: number } => !!e.lch)
  if (!entries.length) return []

  const used = new Set<number>()
  const out: Swatch[] = [{ ...entries[0], role: 'dominant' }]
  used.add(0)
  for (const role of ['vibrant', 'muted', 'dark', 'light', 'accent'] as const) {
    const t = TARGETS[role]
    let best = -1
    let bestScore = Infinity
    for (let i = 0; i < entries.length; i++) {
      if (used.has(i)) continue
      const score = Math.hypot(entries[i].lch.L - t.L, (entries[i].lch.C - t.C) * 1.5)
      if (score < bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best < 0) continue
    used.add(best)
    out.push({ ...entries[best], role })
  }
  return out
}
