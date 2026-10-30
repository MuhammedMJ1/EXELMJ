// Bidirectional style/geometry mapping between exceljs and Univer models.
// Numeric enum values mirror @univerjs/core@0.25.1 (exact-pinned), verified
// against the installed .d.ts files. They are mirrored locally so the
// converter (and the node test runner) never runtime-imports the engine.
import type ExcelJS from 'exceljs'
import type { IBorderData, IStyleData } from '@univerjs/core'

// --- Univer enum mirrors (@univerjs/core 0.25.1) ---
export const BOOL = { FALSE: 0, TRUE: 1 } as const
export const CELL_TYPE = { STRING: 1, NUMBER: 2, BOOLEAN: 3, FORCE_STRING: 4 } as const
const H_ALIGN = { LEFT: 1, CENTER: 2, RIGHT: 3, JUSTIFIED: 4, DISTRIBUTED: 6 } as const
const V_ALIGN = { TOP: 1, MIDDLE: 2, BOTTOM: 3 } as const
const WRAP = { OVERFLOW: 1, CLIP: 2, WRAP: 3 } as const
const UNDERLINE_DOUBLE = 10 // TextDecoration.DOUBLE

// --- colors ---

// Default Office theme palette, indices as written by Excel (0..9).
const THEME_PALETTE = [
  'FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4',
  'ED7C31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'
]

function applyTint(hex: string, tint: number): string {
  const channel = (i: number) => {
    let c = parseInt(hex.slice(i, i + 2), 16)
    c = tint < 0 ? c * (1 + tint) : c * (1 - tint) + 255 * tint
    return Math.max(0, Math.min(255, Math.round(c)))
      .toString(16)
      .padStart(2, '0')
      .toUpperCase()
  }
  return channel(0) + channel(2) + channel(4)
}

/** exceljs color ({argb} or {theme, tint}) → '#RRGGBB' (theme colors flattened). */
export function excelColorToRgb(color?: Partial<ExcelJS.Color> & { theme?: number; tint?: number }): string | undefined {
  if (!color) return undefined
  if (color.argb && color.argb.length >= 6) return `#${color.argb.slice(-6).toUpperCase()}`
  if (typeof color.theme === 'number') {
    const base = THEME_PALETTE[color.theme]
    if (!base) return undefined
    return `#${color.tint ? applyTint(base, color.tint) : base}`
  }
  return undefined
}

/** Univer color string ('#RRGGBB' | 'rgb(r,g,b)') → exceljs ARGB 'FFRRGGBB'. */
export function rgbToArgb(rgb?: unknown): string | undefined {
  if (!rgb || typeof rgb !== 'string') return undefined
  const hex = rgb.trim()
  if (hex.startsWith('#')) {
    const h = hex.slice(1)
    if (h.length === 6) return `FF${h.toUpperCase()}`
    if (h.length === 3) return `FF${h.split('').map((c) => c + c).join('').toUpperCase()}`
    if (h.length === 8) return h.toUpperCase()
    return undefined
  }
  const m = hex.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (m) {
    const c = (s: string) => Math.min(255, parseInt(s, 10)).toString(16).padStart(2, '0').toUpperCase()
    return `FF${c(m[1])}${c(m[2])}${c(m[3])}`
  }
  return undefined
}

// --- geometry ---
// Excel column width is in characters (Calibri 11): px ≈ chars*7+5.
// Excel row height is in points; Univer uses px (96dpi): px = pt*4/3.
export const colWidthToPx = (chars?: number) => (chars == null ? undefined : Math.round(chars * 7 + 5))
export const pxToColWidth = (px?: number) => (px == null ? undefined : Math.round(((px - 5) / 7) * 100) / 100)
export const ptToPx = (pt?: number) => (pt == null ? undefined : Math.round((pt * 4) / 3))
export const pxToPt = (px?: number) => (px == null ? undefined : Math.round(px * 3) / 4)

// --- addresses ---
export function colIndexToLetters(index0: number): string {
  let n = index0 + 1
  let s = ''
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function lettersToColIndex(letters: string): number {
  let n = 0
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** 'B3' → {row: 2, col: 1} (0-based). Returns null for invalid input. */
export function parseAddress(addr: string): { row: number; col: number } | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(addr.trim())
  if (!m) return null
  return { row: parseInt(m[2], 10) - 1, col: lettersToColIndex(m[1]) }
}

/**
 * Translate a shared-formula master to a slave cell offset by (dr, dc).
 * Anchored refs ($A$1) stay; quoted strings and sheet names are untouched;
 * function names like LOG10( are skipped. Returns null when a shifted ref
 * would leave the sheet — caller should fall back to the cached value.
 */
export function shiftSharedFormula(masterFormula: string, dr: number, dc: number): string | null {
  let failed = false
  const shifted = masterFormula.replace(
    /("(?:[^"]|"")*")|('(?:[^']|'')*')|(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g,
    (match, dq, sq, colAbs, colLetters, rowAbs, rowDigits, offset: number, whole: string) => {
      if (dq || sq) return match
      const next = whole[offset + match.length]
      if (next === '(') return match
      const prev = offset > 0 ? whole[offset - 1] : ''
      if (/[A-Za-z0-9_.]/.test(prev)) return match
      let row = parseInt(rowDigits, 10)
      let col = lettersToColIndex(colLetters)
      if (!rowAbs) row += dr
      if (!colAbs) col += dc
      if (row < 1 || row > 1048576 || col < 0 || col > 16383) {
        failed = true
        return match
      }
      return `${colAbs}${colIndexToLetters(col)}${rowAbs}${row}`
    }
  )
  return failed ? null : shifted
}

// --- borders ---
const BORDER_TO_UNIVER: Record<string, number> = {
  thin: 1, hair: 2, dotted: 3, dashed: 4, dashDot: 5, dashDotDot: 6, double: 7,
  medium: 8, mediumDashed: 9, mediumDashDot: 10, mediumDashDotDot: 11, slantDashDot: 12, thick: 13
}
const BORDER_TO_EXCEL: Record<number, ExcelJS.BorderStyle> = Object.fromEntries(
  Object.entries(BORDER_TO_UNIVER).map(([k, v]) => [v, k])
) as Record<number, ExcelJS.BorderStyle>

type UniverBorderSide = { s: number; cl: { rgb?: string | null } }

function excelBorderSide(side?: Partial<ExcelJS.Border>): UniverBorderSide | undefined {
  if (!side?.style) return undefined
  const s = BORDER_TO_UNIVER[side.style]
  if (!s) return undefined
  return { s, cl: { rgb: excelColorToRgb(side.color as ExcelJS.Color) ?? '#000000' } }
}

function univerBorderSide(side?: UniverBorderSide | null): Partial<ExcelJS.Border> | undefined {
  if (!side || !side.s) return undefined
  const style = BORDER_TO_EXCEL[side.s] ?? 'thin'
  const argb = rgbToArgb(side.cl?.rgb) ?? 'FF000000'
  return { style, color: { argb } }
}

// --- full style conversion ---

/** Anything carrying exceljs style parts — a Cell or a plain Style object. */
export interface ExcelStyleSource {
  font?: Partial<ExcelJS.Font>
  fill?: ExcelJS.Fill
  border?: Partial<ExcelJS.Borders>
  alignment?: Partial<ExcelJS.Alignment>
  numFmt?: string
}

/** Compose a Univer IStyleData from an exceljs cell/style. Undefined when empty. */
export function excelStyleToUniver(cell: ExcelStyleSource): IStyleData | undefined {
  const style: Record<string, unknown> = {}
  const font = cell.font
  if (font) {
    if (font.name) style.ff = font.name
    if (font.size) style.fs = font.size
    if (font.bold) style.bl = BOOL.TRUE
    if (font.italic) style.it = BOOL.TRUE
    if (font.strike) style.st = { s: BOOL.TRUE }
    if (font.underline) {
      style.ul = font.underline === 'double' ? { s: BOOL.TRUE, t: UNDERLINE_DOUBLE } : { s: BOOL.TRUE }
    }
    const cl = excelColorToRgb(font.color as ExcelJS.Color)
    if (cl) style.cl = { rgb: cl }
  }
  const fill = cell.fill
  if (fill && fill.type === 'pattern' && fill.pattern !== 'none') {
    const bg = excelColorToRgb((fill as ExcelJS.FillPattern).fgColor)
    if (bg) style.bg = { rgb: bg }
  }
  const border = cell.border
  if (border) {
    const bd: Record<string, UniverBorderSide> = {}
    const t = excelBorderSide(border.top)
    const r = excelBorderSide(border.right)
    const b = excelBorderSide(border.bottom)
    const l = excelBorderSide(border.left)
    if (t) bd.t = t
    if (r) bd.r = r
    if (b) bd.b = b
    if (l) bd.l = l
    if (Object.keys(bd).length) style.bd = bd
  }
  const align = cell.alignment
  if (align) {
    const hMap: Record<string, number> = {
      left: H_ALIGN.LEFT, center: H_ALIGN.CENTER, right: H_ALIGN.RIGHT,
      justify: H_ALIGN.JUSTIFIED, distributed: H_ALIGN.DISTRIBUTED,
      fill: H_ALIGN.LEFT, centerContinuous: H_ALIGN.CENTER
    }
    const vMap: Record<string, number> = {
      top: V_ALIGN.TOP, middle: V_ALIGN.MIDDLE, bottom: V_ALIGN.BOTTOM,
      justify: V_ALIGN.MIDDLE, distributed: V_ALIGN.MIDDLE
    }
    if (align.horizontal && hMap[align.horizontal]) style.ht = hMap[align.horizontal]
    if (align.vertical && vMap[align.vertical]) style.vt = vMap[align.vertical]
    if (align.wrapText) style.tb = WRAP.WRAP
    if (align.textRotation != null) {
      style.tr = align.textRotation === 'vertical' ? { a: 0, v: BOOL.TRUE } : { a: align.textRotation }
    }
  }
  const numFmt = cell.numFmt
  if (numFmt && numFmt !== 'General') style.n = { pattern: numFmt }
  return Object.keys(style).length ? (style as IStyleData) : undefined
}

/** Univer IStyleData → plain exceljs style parts (for cells and CF rules). */
export function univerStyleToExcelStyle(style: IStyleData): ExcelStyleSource {
  const out: ExcelStyleSource = {}
  const font: Partial<ExcelJS.Font> = {}
  if (style.ff) font.name = style.ff
  if (style.fs) font.size = style.fs
  if (style.bl === BOOL.TRUE) font.bold = true
  if (style.it === BOOL.TRUE) font.italic = true
  if (style.st?.s === BOOL.TRUE) font.strike = true
  if (style.ul?.s === BOOL.TRUE) font.underline = style.ul.t === UNDERLINE_DOUBLE ? 'double' : true
  const clArgb = rgbToArgb(style.cl?.rgb)
  if (clArgb) font.color = { argb: clArgb }
  if (Object.keys(font).length) out.font = font

  const bgArgb = rgbToArgb(style.bg?.rgb)
  if (bgArgb) out.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } }

  const bd = style.bd as IBorderData | undefined
  if (bd) {
    const border: Partial<ExcelJS.Borders> = {}
    const top = univerBorderSide(bd.t as UniverBorderSide)
    const right = univerBorderSide(bd.r as UniverBorderSide)
    const bottom = univerBorderSide(bd.b as UniverBorderSide)
    const left = univerBorderSide(bd.l as UniverBorderSide)
    if (top) border.top = top
    if (right) border.right = right
    if (bottom) border.bottom = bottom
    if (left) border.left = left
    if (Object.keys(border).length) out.border = border
  }

  const alignment: Partial<ExcelJS.Alignment> = {}
  const hMap: Record<number, ExcelJS.Alignment['horizontal']> = {
    [H_ALIGN.LEFT]: 'left', [H_ALIGN.CENTER]: 'center', [H_ALIGN.RIGHT]: 'right',
    [H_ALIGN.JUSTIFIED]: 'justify', 5: 'justify', [H_ALIGN.DISTRIBUTED]: 'distributed'
  }
  const vMap: Record<number, ExcelJS.Alignment['vertical']> = {
    [V_ALIGN.TOP]: 'top', [V_ALIGN.MIDDLE]: 'middle', [V_ALIGN.BOTTOM]: 'bottom'
  }
  if (style.ht && hMap[style.ht]) alignment.horizontal = hMap[style.ht]
  if (style.vt && vMap[style.vt]) alignment.vertical = vMap[style.vt]
  if (style.tb === WRAP.WRAP) alignment.wrapText = true
  if (style.tr) alignment.textRotation = style.tr.v === BOOL.TRUE ? 'vertical' : style.tr.a
  if (Object.keys(alignment).length) out.alignment = alignment

  if (style.n?.pattern) out.numFmt = style.n.pattern
  return out
}

/** Apply a Univer IStyleData onto an exceljs cell. */
export function applyUniverStyleToExcelCell(style: IStyleData, cell: ExcelJS.Cell) {
  const s = univerStyleToExcelStyle(style)
  if (s.font) cell.font = s.font as ExcelJS.Font
  if (s.fill) cell.fill = s.fill
  if (s.border) cell.border = s.border
  if (s.alignment) cell.alignment = s.alignment
  if (s.numFmt) cell.numFmt = s.numFmt
}
