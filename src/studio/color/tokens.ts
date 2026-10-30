// Design tokens in and out — DTCG on disk, CSS custom properties for the web,
// and an Adobe Swatch Exchange file for Illustrator and Photoshop.
//
// The on-disk shape is the W3C Design Tokens Community Group format ($value /
// $type / $description, groups by nesting), which is why StudioDoc.tokens is
// already spelled that way in src/studio/model.ts: export is then a pass-through
// with no renaming layer to drift out of sync.
//
// .ase matters more than it looks. EXELMJ already has an Illustrator COM
// bridge, so a palette written as .ase round-trips natively into the two tools
// the user already has open — no copy-pasting hex codes.

import type { Token, TokenGroup, TokenSet } from '../model'
import { STEPS, type Scale } from './scale'

/** A scale as a DTCG group: { '50': {$value,$type}, ... }. */
export function scaleToGroup(scale: Scale, description?: string): TokenGroup {
  const g: TokenGroup = {}
  for (const step of STEPS) {
    g[String(step)] = {
      $value: scale[step],
      $type: 'color',
      ...(description ? { $description: `${description} ${step}` } : {})
    }
  }
  return g
}

/** Walk a token tree, yielding [dotted.path, token] for every leaf. */
export function* walkTokens(group: TokenGroup, prefix: string[] = []): Generator<[string, Token]> {
  for (const [key, v] of Object.entries(group)) {
    if (isToken(v)) yield [[...prefix, key].join('.'), v]
    else yield* walkTokens(v, [...prefix, key])
  }
}

function isToken(v: Token | TokenGroup): v is Token {
  return typeof v === 'object' && v !== null && '$value' in v
}

/** Look one up by dotted path. Returns null rather than throwing so a stale
 * reference in a sidecar degrades to "unbound", not to a crash. */
export function resolveToken(group: TokenGroup, path: string): Token | null {
  let cur: Token | TokenGroup | undefined = group
  for (const part of path.split('.')) {
    if (!cur || isToken(cur)) return null
    cur = (cur as TokenGroup)[part]
  }
  return cur && isToken(cur) ? cur : null
}

// ─── DTCG ────────────────────────────────────────────────────────────────────

/** The .tokens.json text for a token set. Themes become top-level groups so a
 * single file carries both, which is what Style Dictionary and Tokens Studio
 * both expect to consume. */
export function toDtcg(tokens: TokenSet): string {
  const doc: Record<string, unknown> = { ...tokens.base }
  if (tokens.dark && Object.keys(tokens.dark).length) {
    doc.$themes = { dark: tokens.dark }
  }
  return `${JSON.stringify(doc, null, 2)}\n`
}

// ─── CSS custom properties ───────────────────────────────────────────────────

/** `color.brand.600` -> `--color-brand-600`. Dots become dashes; nothing else
 * changes, so the CSS name is always derivable from the token path by hand. */
export function cssVarName(path: string): string {
  return `--${path.replace(/\./g, '-')}`
}

export interface CssOptions {
  /** selector for the light theme. */
  root?: string
  /**
   * How the dark theme is scoped. `media` emits a prefers-color-scheme block;
   * `attribute` emits `[data-theme="dark"]`. Both is the honest default for a
   * product that has a manual toggle AND respects the OS.
   */
  darkMode?: 'media' | 'attribute' | 'both'
}

export function toCssVars(tokens: TokenSet, opts: CssOptions = {}): string {
  const root = opts.root ?? ':root'
  const mode = opts.darkMode ?? 'both'
  const body = (group: TokenGroup, indent: string): string =>
    [...walkTokens(group)].map(([path, t]) => `${indent}${cssVarName(path)}: ${t.$value};`).join('\n')

  const out: string[] = [`${root} {\n${body(tokens.base, '  ')}\n}`]
  if (tokens.dark && Object.keys(tokens.dark).length) {
    const dark = body(tokens.dark, '    ')
    if (mode === 'media' || mode === 'both') {
      out.push(`@media (prefers-color-scheme: dark) {\n  ${root} {\n${dark}\n  }\n}`)
    }
    if (mode === 'attribute' || mode === 'both') {
      out.push(`[data-theme="dark"] {\n${body(tokens.dark, '  ')}\n}`)
    }
  }
  return `${out.join('\n\n')}\n`
}

// ─── Adobe Swatch Exchange ───────────────────────────────────────────────────

/**
 * Write an .ase palette.
 *
 * Format, from Adobe's published structure: 'ASEF' magic, version 1.0, an
 * entry count, then blocks. Colour entry blocks are 0x0001; each carries a
 * UTF-16BE name (NUL-terminated, length in UTF-16 code units INCLUDING the
 * terminator), a 4-char colour model, its components as big-endian float32,
 * and a colour type (0 global, 1 spot, 2 normal).
 */
export function toAse(swatches: Array<{ name: string; hex: string }>): Uint8Array {
  const blocks: Uint8Array[] = []
  for (const s of swatches) {
    const rgb = hexToFloats(s.hex)
    if (!rgb) continue
    const nameUnits = [...s.name].flatMap((ch) => {
      const cp = ch.codePointAt(0) ?? 0
      if (cp <= 0xffff) return [cp]
      // surrogate pair — Arabic swatch names are BMP, but an emoji is not
      const v = cp - 0x10000
      return [0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)]
    })
    // 2 (name length) + name + terminator + 4 (model) + 12 (rgb) + 2 (type)
    const bodyLen = 2 + (nameUnits.length + 1) * 2 + 4 + 12 + 2
    const buf = new Uint8Array(6 + bodyLen)
    const dv = new DataView(buf.buffer)
    let o = 0
    dv.setUint16(o, 0x0001)
    o += 2
    dv.setUint32(o, bodyLen)
    o += 4
    dv.setUint16(o, nameUnits.length + 1)
    o += 2
    for (const u of nameUnits) {
      dv.setUint16(o, u)
      o += 2
    }
    dv.setUint16(o, 0)
    o += 2
    for (const ch of 'RGB ') {
      dv.setUint8(o, ch.charCodeAt(0))
      o += 1
    }
    dv.setFloat32(o, rgb[0])
    o += 4
    dv.setFloat32(o, rgb[1])
    o += 4
    dv.setFloat32(o, rgb[2])
    o += 4
    dv.setUint16(o, 2) // normal
    blocks.push(buf)
  }

  const total = 12 + blocks.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  out.set([0x41, 0x53, 0x45, 0x46], 0) // 'ASEF'
  dv.setUint16(4, 1)
  dv.setUint16(6, 0)
  dv.setUint32(8, blocks.length)
  let at = 12
  for (const b of blocks) {
    out.set(b, at)
    at += b.length
  }
  return out
}

function hexToFloats(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Every colour token in a set, flattened for .ase or a swatch grid. */
export function colorSwatches(tokens: TokenSet): Array<{ name: string; hex: string }> {
  const out: Array<{ name: string; hex: string }> = []
  for (const [path, t] of walkTokens(tokens.base)) {
    if (t.$type === 'color') out.push({ name: path, hex: String(t.$value) })
  }
  return out
}
