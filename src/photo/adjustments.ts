// EXELMJ Photo — pixel math for adjustment layers. Every function here
// mutates a PixelBuffer IN PLACE (the compositor calls these on its running
// composite, never on a layer's own stored pixels — that is what keeps
// adjustment layers non-destructive: params are the only state that
// persists, the pixel effect is recomputed on every composite).

import type { AdjustmentKind, AdjustmentParamsMap, PixelBuffer } from './model'

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v
}

/** classic brightness/contrast: brightness is additive (-100..100 -> -255..255),
 * contrast pivots around mid-grey using the standard "259/255" factor curve. */
export function applyBrightnessContrast(buf: PixelBuffer, params: AdjustmentParamsMap['brightness-contrast'], opacity = 1): void {
  const brightness = (clampParam(params.brightness, -100, 100) * 255) / 100
  const c = clampParam(params.contrast, -100, 100)
  const factor = (259 * (c + 255)) / (255 * (259 - c))
  transformRGB(buf, opacity, (r, g, b) => [
    factor * (r + brightness - 128) + 128,
    factor * (g + brightness - 128) + 128,
    factor * (b + brightness - 128) + 128
  ])
}

export function applyHueSaturation(buf: PixelBuffer, params: AdjustmentParamsMap['hue-saturation'], opacity = 1): void {
  const hueShift = clampParam(params.hue, -180, 180)
  const satShift = clampParam(params.saturation, -100, 100) / 100
  const lightShift = clampParam(params.lightness, -100, 100) / 100
  transformRGB(buf, opacity, (r, g, b) => {
    let [h, s, l] = rgbToHsl(r, g, b)
    h = (((h + hueShift) % 360) + 360) % 360
    s = clamp01(s + s * satShift <= 0 ? 0 : s * (1 + satShift))
    l = clamp01(lightShift >= 0 ? l + (1 - l) * lightShift : l + l * lightShift)
    return hslToRgb(h, s, l)
  })
}

export function applyLevels(buf: PixelBuffer, params: AdjustmentParamsMap['levels'], opacity = 1): void {
  const inBlack = clampParam(params.inBlack, 0, 255)
  const inWhite = clampParam(params.inWhite, inBlack + 1, 255)
  const gamma = Math.max(0.01, params.gamma)
  const outBlack = clampParam(params.outBlack, 0, 255)
  const outWhite = clampParam(params.outWhite, outBlack, 255)
  const map = (v: number) => {
    const t = clamp01((v - inBlack) / (inWhite - inBlack))
    const g = Math.pow(t, 1 / gamma)
    return outBlack + g * (outWhite - outBlack)
  }
  transformRGB(buf, opacity, (r, g, b) => [map(r), map(g), map(b)])
}

export function applyBlackWhite(buf: PixelBuffer, params: AdjustmentParamsMap['black-white'], opacity = 1): void {
  const strength = clamp01(params.strength)
  transformRGB(buf, opacity * strength, (r, g, b) => {
    const y = 0.3 * r + 0.59 * g + 0.11 * b
    return [y, y, y]
  })
}

export function applyAdjustment<K extends AdjustmentKind>(buf: PixelBuffer, kind: K, params: AdjustmentParamsMap[K], opacity = 1): void {
  switch (kind) {
    case 'brightness-contrast':
      applyBrightnessContrast(buf, params as AdjustmentParamsMap['brightness-contrast'], opacity)
      return
    case 'hue-saturation':
      applyHueSaturation(buf, params as AdjustmentParamsMap['hue-saturation'], opacity)
      return
    case 'levels':
      applyLevels(buf, params as AdjustmentParamsMap['levels'], opacity)
      return
    case 'black-white':
      applyBlackWhite(buf, params as AdjustmentParamsMap['black-white'], opacity)
      return
    default:
      return
  }
}

function clampParam(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Applies `fn` to every OPAQUE-or-partial pixel's RGB, mixed back toward the
 * original by (1-opacity) — alpha is untouched, matching how an adjustment
 * layer's own opacity slider behaves in Photoshop. */
function transformRGB(buf: PixelBuffer, opacity: number, fn: (r: number, g: number, b: number) => [number, number, number]): void {
  const op = clamp01(opacity)
  if (op <= 0) return
  for (let i = 0; i < buf.data.length; i += 4) {
    if (buf.data[i + 3] === 0) continue
    const r0 = buf.data[i]
    const g0 = buf.data[i + 1]
    const b0 = buf.data[i + 2]
    const [r1, g1, b1] = fn(r0, g0, b0)
    buf.data[i] = clamp255(op >= 1 ? r1 : r0 + (r1 - r0) * op)
    buf.data[i + 1] = clamp255(op >= 1 ? g1 : g0 + (g1 - g0) * op)
    buf.data[i + 2] = clamp255(op >= 1 ? b1 : b0 + (b1 - b0) * op)
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, s, l]
}

function hueToRgb(p: number, q: number, t0: number): number {
  let t = t0
  if (t < 0) t += 1
  if (t > 1) t -= 1
  if (t < 1 / 6) return p + (q - p) * 6 * t
  if (t < 1 / 2) return q
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
  return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const hk = h / 360
  const r = hueToRgb(p, q, hk + 1 / 3)
  const g = hueToRgb(p, q, hk)
  const b = hueToRgb(p, q, hk - 1 / 3)
  return [r * 255, g * 255, b * 255]
}
