import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { groupMatchesBySheet, sheetCountPhrase } from '../src/univer/findAllSheets'
import { initI18n } from '../src/i18n/i18n'

// A Univer find match as the sheets provider builds it: { range: { subUnitId, range } }.
const match = (subUnitId: string, startRow: number, startColumn: number) => ({
  range: { subUnitId, range: { startRow, startColumn } }
})

const TABS = [
  { id: 's1', name: 'Sheet1' },
  { id: 's2', name: 'Sales' },
  { id: 's3', name: 'Costs' },
  { id: 's4', name: 'Empty' }
]

describe('find in all sheets: grouping matches by sheet', () => {
  it('counts matches per sheet and keeps the workbook tab order, not the match order', () => {
    const hits = groupMatchesBySheet(
      [match('s3', 0, 4), match('s1', 0, 0), match('s3', 3, 3), match('s1', 2, 1), match('s2', 1, 0), match('s3', 5, 3)],
      TABS
    )
    expect(hits.map((h) => [h.name, h.count])).toEqual([
      ['Sheet1', 2],
      ['Sales', 1],
      ['Costs', 3]
    ])
  })

  it('remembers the cell of each sheet\'s first match', () => {
    const hits = groupMatchesBySheet([match('s3', 0, 4), match('s3', 3, 3)], TABS)
    expect(hits).toEqual([{ sheetId: 's3', name: 'Costs', count: 2, row: 0, col: 4 }])
  })

  it('leaves out sheets with no match and matches on sheets that are gone or hidden', () => {
    const hits = groupMatchesBySheet([match('s2', 1, 0), match('hidden', 0, 0)], TABS)
    expect(hits.map((h) => h.sheetId)).toEqual(['s2'])
  })

  it('returns nothing for no matches, or for matches without a sheet id', () => {
    expect(groupMatchesBySheet([], TABS)).toEqual([])
    expect(groupMatchesBySheet([{}, { range: {} }], TABS)).toEqual([])
  })
})

describe('find in all sheets: "found in N sheets" wording', () => {
  beforeAll(() => {
    // initI18n stamps <html lang/dir>; node has no document.
    ;(globalThis as { document?: unknown }).document = { documentElement: {} }
  })
  afterAll(() => {
    initI18n('en')
    delete (globalThis as { document?: unknown }).document
  })

  it('reads naturally in English', () => {
    initI18n('en')
    expect(sheetCountPhrase(1)).toBe('Found in 1 sheet')
    expect(sheetCountPhrase(2)).toBe('Found in 2 sheets')
    expect(sheetCountPhrase(5)).toBe('Found in 5 sheets')
    expect(sheetCountPhrase(12)).toBe('Found in 12 sheets')
  })

  it('uses the Arabic singular, dual, 3-10 and 11+ forms', () => {
    initI18n('ar')
    expect(sheetCountPhrase(1)).toBe('موجود في ورقة واحدة')
    expect(sheetCountPhrase(2)).toBe('موجود في ورقتين')
    expect(sheetCountPhrase(3)).toBe('موجود في 3 أوراق')
    expect(sheetCountPhrase(10)).toBe('موجود في 10 أوراق')
    expect(sheetCountPhrase(11)).toBe('موجود في 11 ورقة')
  })
})
