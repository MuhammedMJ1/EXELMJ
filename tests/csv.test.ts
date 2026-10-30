import { describe, expect, it } from 'vitest'
import { csvToWorkbook, detectDelimiter, parseCsv, sheetToCsv } from '../src/xlsx/csv'

describe('csv', () => {
  it('parses quoted fields, embedded commas and escaped quotes', () => {
    const rows = parseCsv('a,"b,1","c""x"\r\n1,2,3\n')
    expect(rows).toEqual([
      ['a', 'b,1', 'c"x'],
      ['1', '2', '3']
    ])
  })

  it('detects the semicolon delimiter used by Arabic Excel locales', () => {
    expect(detectDelimiter('الاسم;العمر;المدينة')).toBe(';')
    const rows = parseCsv('الاسم;العمر\nأحمد;30')
    expect(rows[1]).toEqual(['أحمد', '30'])
  })

  it('builds a workbook with numeric detection and the RTL flag', () => {
    const wb = csvToWorkbook('name,qty\nقهوة,25.5', 'ملف.csv', true)
    const sheet = wb.sheets['sheet-1']
    expect(sheet.cellData?.[1]?.[0]?.v).toBe('قهوة')
    expect(sheet.cellData?.[1]?.[1]?.v).toBe(25.5)
    expect((sheet as { rightToLeft?: number }).rightToLeft).toBe(1)
  })

  it('serializes with a BOM, quoting and computed formula values', () => {
    const csv = sheetToCsv({
      cellData: {
        0: { 0: { v: 'قيمة, بفاصلة', t: 1 }, 1: { v: 12, t: 2 } },
        1: { 0: { f: '=SUM(1,2)', v: 3, t: 2 } }
      }
    })
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv).toContain('"قيمة, بفاصلة",12')
    expect(csv.split('\r\n')[1]).toBe('3,')
  })

  it('round-trips its own output', () => {
    const csv = sheetToCsv({
      cellData: {
        0: { 0: { v: 'اسم', t: 1 }, 1: { v: 'قيمة', t: 1 } },
        1: { 0: { v: 'نص "مقتبس"', t: 1 }, 1: { v: 42, t: 2 } }
      }
    })
    const parsed = parseCsv(csv)
    expect(parsed[0]).toEqual(['اسم', 'قيمة'])
    expect(parsed[1]).toEqual(['نص "مقتبس"', '42'])
  })
})
