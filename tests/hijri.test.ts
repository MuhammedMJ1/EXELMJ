import { describe, expect, it } from 'vitest'
import { HIJRI_FN_RE, hijriFromSerial, hijriTextFromSerial } from '../src/univer/hijri'

// serial for a known Gregorian date
const serialOf = (y: number, m: number, d: number) =>
  (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000

describe('hijri (Umm al-Qura)', () => {
  it('converts a known date (2024-07-07 → 1446/01/01)', () => {
    expect(hijriFromSerial(serialOf(2024, 7, 7))).toBe('1446/01/01')
  })

  it('produces Arabic long text with the month name', () => {
    const text = hijriTextFromSerial(serialOf(2024, 7, 7))
    expect(text).toContain('محرم')
    expect(text).toContain('1446')
  })

  it('detects EXELMJ-only functions in formulas', () => {
    expect(HIJRI_FN_RE.test('=HIJRI(A1)')).toBe(true)
    expect(HIJRI_FN_RE.test('=hijritext(B2)')).toBe(true)
    expect(HIJRI_FN_RE.test('=SUM(A1:A9)')).toBe(false)
  })
})
