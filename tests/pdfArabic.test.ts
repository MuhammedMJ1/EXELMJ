// Arabic coming out of a real PDF: Chromium writes one glyph per text item,
// in visual order, using presentation forms — so the importer has to stitch the
// letters back into words, put the words back in reading order, and map the
// presentation forms to real Arabic. The fixtures below are the actual
// coordinates pdf.js reports for a printed Arabic statement, to the centimetre.
import { describe, expect, it } from 'vitest'
import { mergeRuns, type ExtractedText } from '../src/design/aiBackground'
import { normalizeArabicText } from '../src/design/bidiRuns'
import { groupLines, type PdfRun } from '../src/word/pdfLayout'

/** One glyph as pdf.js reports it, on a given baseline. */
function glyph(text: string, x: number, width: number, baseline: number, size: number): ExtractedText {
  return {
    text: normalizeArabicText(text),
    dir: 'rtl',
    x,
    y: baseline - size,
    width,
    size,
    baselineTop: baseline,
    font: 'Arial'
  }
}

function toRuns(items: ExtractedText[]): PdfRun[] {
  return items.map((i) => ({
    text: i.text,
    dir: i.dir,
    x: i.x,
    y: i.y,
    width: i.width,
    size: i.size,
    baselineTop: i.baselineTop,
    font: i.font
  }))
}

const TITLE: [string, number, number][] = [["ب", 446.64, 12.99], ["ﺎ", 459.62, 4.69], ["ﺳ", 464.31, 12.16], ["ﺣ", 476.47, 10.47], ["ف", 492.49, 15.15], ["ﺷ", 507.65, 12.16], ["ﻛ", 519.81, 7.21]]

const HEAD: [string, number, number][] = [["ﻎ", 109.66, 5.15], ["ﻠ", 114.82, 2.58], ["ﺑ", 117.39, 2.98], ["ﻣ", 120.38, 4.56], ["ﻟ", 124.94, 2.58], ["ا", 127.52, 2.38], ["ﺦ", 228.22, 6.14], ["ﯾ", 234.36, 2.98], ["ر", 237.35, 4.76], ["ﺎ", 242.11, 2.58], ["ﺗ", 244.68, 2.98], ["ﻟ", 247.67, 2.58], ["ا", 250.24, 2.38], ["ن", 383.26, 5.95], ["ﺎ", 389.21, 2.58], ["ﯾ", 391.79, 2.98], ["ﺑ", 394.77, 2.98], ["ﻟ", 397.76, 2.58], ["ا", 400.33, 2.38], ["م", 499.86, 3.96]]

const ROW: [string, number, number][] = [["137.50", 131.92, 33.63], ["2026-08-2", 252.43, 50.13], ["1", 404.88, 6.11], ["م", 414.05, 3.72], ["ﻗ", 417.77, 2.94], ["واردة ر", 420.71, 27.64], ["ﺔ", 451.41, 4.12], ["ﻟ", 455.53, 2.28], ["وا", 457.81, 7.03], ["ﺣ", 464.84, 5.82], ["1", 514.16, 6.11]]

const build = (rows: [string, number, number][], baseline: number, size: number) =>
  rows.map(([text, x, width]) => glyph(text, x, width, baseline, size))

describe('arabic out of a real pdf', () => {
  it('stitches one-glyph-per-item back into words, right way round', () => {
    const merged = mergeRuns(build(TITLE, 738.4, 20))
    const line = groupLines(toRuns(merged))[0]
    expect(line.rtl).toBe(true)
    expect(line.text).toBe('كشف حساب')
  })

  it('keeps table headings in reading order, not screen order', () => {
    const merged = mergeRuns(build(HEAD, 705.4, 11))
    // four separate headings: the column gaps are far too wide to glue
    expect(merged.length).toBe(4)
    const line = groupLines(toRuns(merged))[0]
    expect(line.text).toBe('م البيان التاريخ المبلغ')
  })

  it('reads a mixed Arabic/Latin row the way it was written', () => {
    const merged = mergeRuns(build(ROW, 681.4, 11))
    const line = groupLines(toRuns(merged))[0]
    // the serial number, then the Arabic description with its trailing number,
    // then the date, then the amount — right to left across the page
    expect(line.text).toBe('1 حوالة واردة رقم 1 2026-08-2 137.50')
  })
})
