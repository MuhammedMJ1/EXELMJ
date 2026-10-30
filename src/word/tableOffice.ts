// The table jobs an office actually does: turn a pasted list into a table, turn
// a table back into text, and total a column.
//
// The number parsing is the fiddly part: an Arabic office writes ١٢٣٤ as often
// as 1234, uses both , and ٬ for thousands, and both . and ٫ for the decimal
// mark — and a total that silently ignores half the rows is worse than no
// total at all.

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩'
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹'

/** Any digit shape → a plain JS number, or null when the cell is not a number. */
export function parseNumber(text: string): number | null {
  let cleaned = ''
  for (const ch of text.trim()) {
    const ai = ARABIC_INDIC.indexOf(ch)
    const ei = EXTENDED_ARABIC_INDIC.indexOf(ch)
    if (ai >= 0) cleaned += String(ai)
    else if (ei >= 0) cleaned += String(ei)
    else if (ch === '٫') cleaned += '.'
    else if (ch === '٬' || ch === ',' || ch === ' ' || ch === ' ') continue
    else cleaned += ch
  }
  // a currency symbol or a trailing unit must not sink the whole sum
  const match = /-?\d+(?:\.\d+)?/.exec(cleaned)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

/** Format a total the way the column it came from is written. */
export function formatLike(value: number, sample: string): string {
  const decimals = decimalsOf(sample)
  const fixed = value.toFixed(decimals)
  const grouped = fixed.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const usesArabicIndic = [...sample].some((ch) => ARABIC_INDIC.includes(ch))
  if (!usesArabicIndic) return grouped
  return [...grouped]
    .map((ch) => (/\d/.test(ch) ? ARABIC_INDIC[Number(ch)] : ch === '.' ? '٫' : ch === ',' ? '٬' : ch))
    .join('')
}

function decimalsOf(sample: string): number {
  // the sample is as likely to be ١٬٠٠٠٫٠٠ as 1,000.00, and \d does not match
  // Arabic-Indic digits — measuring the decimals on the raw text loses them
  const normalised = [...sample.replace(/٫/g, '.')]
    .map((ch) => {
      const ai = ARABIC_INDIC.indexOf(ch)
      const ei = EXTENDED_ARABIC_INDIC.indexOf(ch)
      return ai >= 0 ? String(ai) : ei >= 0 ? String(ei) : ch
    })
    .join('')
  const match = /\.(\d+)\s*$/.exec(normalised.trim())
  return match ? Math.min(4, match[1].length) : 0
}

export type Separator = 'tab' | 'comma' | 'semicolon' | 'space'

const SEPARATORS: Record<Separator, RegExp> = {
  tab: /\t+/,
  comma: /\s*[,،]\s*/,
  semicolon: /\s*[;؛]\s*/,
  space: /\s{2,}/
}

/** Pasted lines → table rows, padded so every row has the same cell count. */
export function textToRows(text: string, separator: Separator): string[][] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return []
  const rows = lines.map((line) => line.split(SEPARATORS[separator]).map((cell) => cell.trim()))
  const width = Math.max(...rows.map((row) => row.length))
  return rows.map((row) => [...row, ...Array(width - row.length).fill('')])
}

/** The separator that splits the text most evenly — what the user meant. */
export function guessSeparator(text: string): Separator {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (!lines.length) return 'tab'
  let best: Separator = 'tab'
  let bestScore = 0
  for (const key of Object.keys(SEPARATORS) as Separator[]) {
    const counts = lines.map((line) => line.split(SEPARATORS[key]).length)
    const width = Math.max(...counts)
    if (width < 2) continue
    // every line splitting into the same number of cells is the good sign
    const even = counts.filter((n) => n === width).length / counts.length
    const score = width * even
    if (score > bestScore) {
      bestScore = score
      best = key
    }
  }
  return best
}

/** Rows → the tab-separated text a table turns back into. */
export function rowsToText(rows: string[][]): string {
  return rows.map((row) => row.join('\t')).join('\n')
}

/** Total of a column, plus the sample used to format it back. */
export function sumColumn(values: string[]): { total: number; counted: number; sample: string } {
  let total = 0
  let counted = 0
  let sample = ''
  for (const value of values) {
    const parsed = parseNumber(value)
    if (parsed === null) continue
    total += parsed
    counted += 1
    if (!sample) sample = value
  }
  return { total, counted, sample: sample || '0' }
}
