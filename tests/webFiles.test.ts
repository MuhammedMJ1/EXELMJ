import { describe, expect, it } from 'vitest'
import {
  docFileType,
  extensionForKind,
  makeWebPath,
  OPEN_EXTENSIONS,
  parseWebPath,
  safeFileName,
  upsertRecent
} from '../src/web/webFiles'

describe('web edition: office file types', () => {
  it('knows the files the phone opens and saves', () => {
    expect(docFileType('تقرير.xlsx')).toEqual({
      ext: 'xlsx',
      mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      kind: 'sheet'
    })
    expect(docFileType('LETTER.DOCX').kind).toBe('doc')
    expect(docFileType('data.csv')).toMatchObject({ kind: 'csv', mime: 'text/csv' })
    expect(docFileType('macros.xlsm').kind).toBe('sheet')
  })

  it('falls back to a plain binary type for anything else', () => {
    expect(docFileType('notes')).toEqual({ ext: '', mime: 'application/octet-stream', kind: 'other' })
    expect(docFileType('photo.heic').kind).toBe('other')
  })

  it('opens spreadsheets, CSV and Word files', () => {
    expect(OPEN_EXTENSIONS).toEqual(['.xlsx', '.xlsm', '.csv', '.docx'])
  })

  it('maps the bridge save kinds to extensions like the desktop does (xlsx by default)', () => {
    expect(extensionForKind(undefined)).toBe('xlsx')
    expect(extensionForKind('xlsx')).toBe('xlsx')
    expect(extensionForKind('docx')).toBe('docx')
    expect(extensionForKind('data')).toBe('')
  })
})

describe('web edition: file names', () => {
  it('keeps a good name and adds the missing extension', () => {
    expect(safeFileName('ميزانية 2026', 'xlsx', 'x')).toBe('ميزانية 2026.xlsx')
    expect(safeFileName('Budget.xlsx', 'xlsx', 'x')).toBe('Budget.xlsx')
    expect(safeFileName('Budget.XLSX', 'xlsx', 'x')).toBe('Budget.XLSX')
  })

  it('swaps a different office extension instead of stacking two', () => {
    expect(safeFileName('data.csv', 'xlsx', 'x')).toBe('data.xlsx')
  })

  it('removes folder separators and characters phones refuse, never leaving it empty', () => {
    expect(safeFileName('a/b\\c:d*?"<>|e', 'docx', 'x')).toBe('a b c d e.docx')
    expect(safeFileName('   ', 'xlsx', 'مصنف')).toBe('مصنف.xlsx')
    expect(safeFileName(undefined, 'xlsx', 'Workbook')).toBe('Workbook.xlsx')
  })

  it('leaves the name alone when the save kind carries no extension', () => {
    expect(safeFileName('tokens.json', '', 'x')).toBe('tokens.json')
  })
})

describe('web edition: file paths handed to the app', () => {
  it('round-trips an id and a name, and the app basename() reads the name', () => {
    const path = makeWebPath('abc-123', 'تقرير الشهر.xlsx')
    expect(parseWebPath(path)).toEqual({ id: 'abc-123', name: 'تقرير الشهر.xlsx' })
    expect(path.split(/[\\/]/).pop()).toBe('تقرير الشهر.xlsx')
  })

  it('refuses paths that are not web paths', () => {
    expect(parseWebPath('C:\\Users\\me\\a.xlsx')).toBeNull()
    expect(parseWebPath('web:/a.xlsx')).toBeNull()
  })
})

describe('web edition: recent files', () => {
  const at = (n: number) => 1_000 + n
  it('puts the newest first and caps the list, reporting what fell off', () => {
    const list = [1, 2, 3].map((n) => ({ id: `f${n}`, name: `${n}.xlsx`, at: at(n) }))
    const { list: next, dropped } = upsertRecent(list, { id: 'f4', name: '4.xlsx', at: at(4) }, 3)
    expect(next.map((r) => r.id)).toEqual(['f4', 'f3', 'f2'])
    expect(dropped).toEqual(['f1'])
  })

  it('reopening or re-saving a file moves it up instead of duplicating it', () => {
    const list = [
      { id: 'a', name: 'a.xlsx', at: at(1) },
      { id: 'b', name: 'b.docx', at: at(2) }
    ]
    const same = upsertRecent(list, { id: 'a', name: 'a.xlsx', at: at(9) }, 8)
    expect(same.list.map((r) => r.id)).toEqual(['a', 'b'])
    expect(same.dropped).toEqual([])
    // another copy under the same name replaces the old entry
    const renamed = upsertRecent(list, { id: 'c', name: 'b.docx', at: at(9) }, 8)
    expect(renamed.list.map((r) => r.id)).toEqual(['c', 'a'])
    expect(renamed.dropped).toEqual(['b'])
  })
})
