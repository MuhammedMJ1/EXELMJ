// Icon export: SVG, PNG at any size, and a real multi-resolution Windows .ico.
//
// The .ico writer is here rather than a dependency because every ICO generator
// on npm pulls in a native image module (sharp / jimp), and this app has to
// build on Electron 43 for Windows without a native toolchain. The format is
// small and fully specified, and we already have the PNGs.
//
// ICO holds PNG entries directly (Vista+), which is what every modern tool
// emits and what Windows has read for two decades — so the writer is a header,
// a directory, and the PNG bytes we already produced.

import type { IconPreset } from './presets'

export interface IconPath {
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
}

export interface SvgOptions {
  /** Emit `currentColor` instead of literal fills, so the icon inherits the
   * text colour wherever it is used. This is what makes an icon set themeable
   * and it is the single most common thing hand-exported icons get wrong. */
  currentColor?: boolean
  title?: string
}

/** XML text may not carry a raw `<`, `&` or a quote that could close an
 * attribute. Path data is separately guarded by the kernel's SAFE_PATH_D. */
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const SAFE_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/
const HEX = /^#[0-9a-fA-F]{6}$/

export function toSvg(paths: IconPath[], preset: IconPreset, opts: SvgOptions = {}): string {
  const body: string[] = []
  for (const p of paths) {
    if (!SAFE_D.test(p.d)) continue
    const attrs: string[] = [`d="${p.d}"`]
    const fill = opts.currentColor ? 'currentColor' : HEX.test(p.fill ?? '') ? p.fill! : 'none'
    const stroke = opts.currentColor
      ? p.stroke
        ? 'currentColor'
        : 'none'
      : HEX.test(p.stroke ?? '')
        ? p.stroke!
        : 'none'
    attrs.push(`fill="${fill}"`)
    if (stroke !== 'none') {
      attrs.push(`stroke="${stroke}"`)
      attrs.push(`stroke-width="${p.strokeWidth ?? preset.strokeWidth}"`)
      attrs.push(`stroke-linecap="${preset.cap}"`)
      attrs.push(`stroke-linejoin="${preset.join}"`)
    }
    body.push(`  <path ${attrs.join(' ')}/>`)
  }
  const title = opts.title ? `\n  <title>${xml(opts.title)}</title>` : ''
  // No width/height attributes: a viewBox-only icon scales to whatever the
  // consumer's font-size or box says, which is the behaviour every icon set
  // ships and the reason `width="24"` in an exported icon is a bug.
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${preset.grid} ${preset.grid}" fill="none">${title}`,
    ...body,
    '</svg>',
    ''
  ].join('\n')
}

// ─── ICO ─────────────────────────────────────────────────────────────────────

/** The sizes Windows actually asks for, smallest first. */
export const ICO_SIZES = [16, 20, 24, 32, 48, 64, 128, 256]

export interface PngEntry {
  size: number
  bytes: Uint8Array
}

/**
 * Pack PNGs into an .ico.
 *
 * Layout: a 6-byte ICONDIR (reserved 0, type 1 = icon, count), then one
 * 16-byte ICONDIRENTRY per image, then the image bytes. A 256px image records
 * its dimension as 0 — the field is a single byte, and 256 does not fit, which
 * is the one trap in this format.
 */
export function toIco(entries: PngEntry[]): Uint8Array {
  const usable = entries
    .filter((e) => e.bytes.length > 0 && e.size >= 1 && e.size <= 256)
    .sort((a, b) => a.size - b.size)
  const count = usable.length
  const headerLen = 6 + count * 16
  const total = headerLen + usable.reduce((n, e) => n + e.bytes.length, 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)

  dv.setUint16(0, 0, true) // reserved
  dv.setUint16(2, 1, true) // 1 = icon (2 would be a cursor)
  dv.setUint16(4, count, true)

  let offset = headerLen
  for (const [i, e] of usable.entries()) {
    const at = 6 + i * 16
    // 256 is stored as 0 — the field is one byte
    out[at] = e.size >= 256 ? 0 : e.size
    out[at + 1] = e.size >= 256 ? 0 : e.size
    out[at + 2] = 0 // palette size (0 = no palette)
    out[at + 3] = 0 // reserved
    dv.setUint16(at + 4, 1, true) // colour planes
    dv.setUint16(at + 6, 32, true) // bits per pixel
    dv.setUint32(at + 8, e.bytes.length, true)
    dv.setUint32(at + 12, offset, true)
    out.set(e.bytes, offset)
    offset += e.bytes.length
  }
  return out
}

/** Is this actually a PNG? Guards the .ico writer against being handed a JPEG,
 * which Windows will not decode from an icon entry. */
export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
}

/** Width and height from a PNG's IHDR, for verifying an entry before packing. */
export function pngSize(bytes: Uint8Array): { w: number; h: number } | null {
  if (!isPng(bytes) || bytes.length < 24) return null
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { w: dv.getUint32(16), h: dv.getUint32(20) }
}

/**
 * The favicon set a web project expects, as filename -> size.
 * Kept as data so the exporter has no filename logic of its own.
 */
export const FAVICON_SET: Array<{ name: string; size: number }> = [
  { name: 'favicon-16x16.png', size: 16 },
  { name: 'favicon-32x32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192x192.png', size: 192 },
  { name: 'android-chrome-512x512.png', size: 512 }
]
