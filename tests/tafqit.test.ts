// Amounts written out in Arabic. The grammar is the whole point: the counted
// noun changes shape with the number in front of it, and a quotation that says
// "ثلاثة ريال" instead of "ثلاثة ريالات" looks like it was typed by a machine.
import { describe, expect, it } from 'vitest'
import { amountInWords, currencyByCode, tafqit } from '../src/word/tafqit'

describe('tafqit', () => {
  it('writes the plain numbers', () => {
    expect(tafqit(0)).toBe('صفر')
    expect(tafqit(1)).toBe('واحد')
    expect(tafqit(11)).toBe('أحد عشر')
    expect(tafqit(100)).toBe('مائة')
    expect(tafqit(1000)).toBe('ألف')
    expect(tafqit(1000000)).toBe('مليون')
  })

  it('reads Arabic-Indic digits too', () => {
    expect(tafqit('١٢٣')).toBe(tafqit(123))
    expect(tafqit('٢٠٢٦')).toBe(tafqit(2026))
  })

  it('takes مئة when asked', () => {
    expect(tafqit(100, { miah: true })).toBe('مئة')
    expect(tafqit(100)).toBe('مائة')
  })

  it('agrees with a feminine subject', () => {
    expect(tafqit(3, { feminine: true })).toBe('ثلاث')
    expect(tafqit(3)).toBe('ثلاثة')
  })
})

describe('amountInWords', () => {
  it('inflects the currency with the number', () => {
    // 1 / 2 / 3-10 / 11+ each take a different form of the same word
    expect(amountInWords(1, { currency: 'SAR', legalWrap: false })).toBe('ريال واحد')
    expect(amountInWords(2, { currency: 'SAR', legalWrap: false })).toBe('ريالان اثنان')
    expect(amountInWords(3, { currency: 'SAR', legalWrap: false })).toBe('ثلاثة ريالات')
    expect(amountInWords(15, { currency: 'SAR', legalWrap: false })).toBe('خمسة عشر ريالاً')
  })

  it('writes a cheque line', () => {
    const text = amountInWords(1250, { currency: 'SAR' })
    expect(text.startsWith('فقط ')).toBe(true)
    expect(text.endsWith(' لا غير')).toBe(true)
    expect(text).toContain('ألف')
    expect(text).toContain('ريال')
  })

  it('adds the subunit only when there is one', () => {
    expect(amountInWords(1250.75, { currency: 'SAR', legalWrap: false })).toContain('هللة')
    expect(amountInWords(1250, { currency: 'SAR', legalWrap: false })).not.toContain('هللة')
  })

  it('counts the subunit in the currency’s own base', () => {
    // the fils is a thousandth of a dinar, not a hundredth
    expect(currencyByCode('IQD')!.minorPer).toBe(1000)
    expect(amountInWords(1.5, { currency: 'IQD', legalWrap: false })).toContain('خمسمائة')
    expect(amountInWords(1.5, { currency: 'SAR', legalWrap: false })).toContain('خمسون')
  })

  it('reads a formatted amount however the office typed it', () => {
    const western = amountInWords('1,250.75', { currency: 'SAR', legalWrap: false })
    const arabic = amountInWords('١٬٢٥٠٫٧٥', { currency: 'SAR', legalWrap: false })
    expect(arabic).toBe(western)
  })

  it('rounds on the subunit instead of dropping it', () => {
    expect(amountInWords(0.005, { currency: 'SAR', legalWrap: false })).toBe('هللة واحدة')
    expect(amountInWords(0, { currency: 'SAR', legalWrap: false })).toBe('صفر')
  })

  it('keeps the nun on two hundred when tens follow it', () => {
    // مائتا ريال (the noun follows) but مائتان وخمسون ريالاً (tens follow)
    expect(amountInWords(200, { currency: 'SAR', legalWrap: false })).toContain('مائتا ريال')
    expect(amountInWords(250, { currency: 'SAR', legalWrap: false })).toContain('مائتان وخمسون')
    expect(amountInWords(200000, { currency: 'SAR', legalWrap: false })).toContain('مائتا ألف')
  })

  it('says so when the amount is negative', () => {
    expect(amountInWords(-5, { currency: 'SAR', legalWrap: false })).toContain('سالب')
  })

  it('works with no currency at all', () => {
    expect(amountInWords(25, { legalWrap: false })).toBe('خمسة وعشرون')
  })
})
