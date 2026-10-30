// The daily-office bundle: templates, the number handling behind "sum the
// column", text↔table conversion, and the watermark's trip through docx.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportDocx, type TipTapNode } from '../src/word/docxExport'
import { defaultPageSetup } from '../src/word/pageSetup'
import { documentTemplates } from '../src/word/templates'
import {
  formatLike,
  guessSeparator,
  parseNumber,
  rowsToText,
  sumColumn,
  textToRows
} from '../src/word/tableOffice'

describe('office numbers', () => {
  it('reads a number however the office wrote it', () => {
    expect(parseNumber('1234')).toBe(1234)
    expect(parseNumber('1,234.50')).toBe(1234.5)
    expect(parseNumber('١٢٣٤')).toBe(1234)
    expect(parseNumber('١٬٢٣٤٫٥٠')).toBe(1234.5)
    expect(parseNumber('12,500 د.ع')).toBe(12500)
    expect(parseNumber('-2,000')).toBe(-2000)
    expect(parseNumber('لا يوجد')).toBeNull()
    expect(parseNumber('')).toBeNull()
  })

  it('writes the total back in the same digits and decimals', () => {
    expect(formatLike(1234.5, '1,000.00')).toBe('1,234.50')
    expect(formatLike(1234, '1,000')).toBe('1,234')
    expect(formatLike(1234.5, '١٬٠٠٠٫٠٠')).toBe('١٬٢٣٤٫٥٠')
  })

  it('totals a column and ignores the words in it', () => {
    const { total, counted, sample } = sumColumn(['1,000.000', 'لا شيء', '2,500.500', ''])
    expect(total).toBe(3500.5)
    expect(counted).toBe(2)
    expect(formatLike(total, sample)).toBe('3,500.500')
  })
})

describe('text ↔ table', () => {
  it('guesses the separator the typist used', () => {
    expect(guessSeparator('a\tb\tc\nd\te\tf')).toBe('tab')
    expect(guessSeparator('الصنف، الكمية، السعر\nقلم، 10، 500')).toBe('comma')
    expect(guessSeparator('one;two\nthree;four')).toBe('semicolon')
  })

  it('pads short rows so the table stays rectangular', () => {
    const rows = textToRows('الصنف,الكمية,السعر\nقلم,10\nورق', 'comma')
    expect(rows).toEqual([
      ['الصنف', 'الكمية', 'السعر'],
      ['قلم', '10', ''],
      ['ورق', '', '']
    ])
  })

  it('turns a table back into tab-separated lines', () => {
    expect(rowsToText([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td')
  })
})

describe('templates', () => {
  it('offers the four documents an office actually writes', () => {
    const keys = documentTemplates().map((tpl) => tpl.key)
    expect(keys).toEqual(['letter', 'quote', 'minutes', 'memo'])
  })

  it('fills in today and leaves the blanks blank', () => {
    const letter = documentTemplates().find((tpl) => tpl.key === 'letter')!
    expect(letter.html).toContain('<h1')
    expect(letter.html).toContain('______')
    expect(letter.html).toMatch(/20\d\d/)
  })

  it('gives the quotation a totals table', () => {
    const quote = documentTemplates().find((tpl) => tpl.key === 'quote')!
    expect(quote.html).toContain('<table>')
    expect(quote.html.match(/<tr>/g)!.length).toBeGreaterThanOrEqual(5)
  })
})

describe('watermark', () => {
  it('rides into the docx header so it repeats on every page', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص' }] }]
    }
    const bytes = await exportDocx(doc, 'ar', {
      page: { ...defaultPageSetup(), watermark: 'مسودة' }
    })
    const zip = await JSZip.loadAsync(bytes)
    const header = await zip.file('word/header1.xml')!.async('string')
    expect(header).toContain('مسودة')
    // pale and large: a stamp, not a heading
    expect(header).toContain('D9D9D9')
  })

  it('writes no header at all when there is no watermark and no header text', async () => {
    const doc: TipTapNode = { type: 'doc', content: [{ type: 'paragraph' }] }
    const bytes = await exportDocx(doc, 'ar', { page: defaultPageSetup() })
    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file('word/header1.xml')).toBeNull()
  })
})
