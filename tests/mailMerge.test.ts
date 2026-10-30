// Mail merge: one letter plus a list becomes a letter per person. The document
// is cloned per record and every field node swapped for its text, so what the
// screen shows, what prints and what lands in the .docx are the same thing.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  fieldLabel,
  fieldValue,
  mergeAll,
  mergeOne,
  missingFields,
  sheetToRecords,
  type TipTapNode
} from '../src/word/mailMerge'
import { exportDocx, type TipTapNode as DocxNode } from '../src/word/docxExport'

const field = (attrs: Record<string, unknown>): TipTapNode => ({
  type: 'mergeField',
  attrs: { name: '', source: 'column', format: 'plain', currency: '', ...attrs }
})

const letter: TipTapNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'السيد ' },
        field({ name: 'الاسم' }),
        { type: 'text', text: ' المحترم' }
      ]
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'المبلغ: ' },
        field({ name: 'المبلغ', format: 'words', currency: 'IQD' })
      ]
    }
  ]
}

const text = (node: TipTapNode): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(text).join('')

describe('reading the list off a sheet', () => {
  it('finds the header row even when the list does not start at the top', () => {
    const { headers, records } = sheetToRecords([
      ['', ''],
      ['كشف المستحقات', ''],
      ['الاسم', 'المبلغ'],
      ['أحمد', '1500'],
      ['', ''],
      ['سارة', '2000']
    ])
    expect(headers).toEqual(['الاسم', 'المبلغ'])
    expect(records).toEqual([
      { الاسم: 'أحمد', المبلغ: '1500' },
      { الاسم: 'سارة', المبلغ: '2000' }
    ])
  })

  it('names an unnamed column instead of losing it', () => {
    const { headers, records } = sheetToRecords([
      ['الاسم', 'الهاتف', ''],
      ['أحمد', '0770', 'زبون قديم']
    ])
    expect(headers).toEqual(['الاسم', 'الهاتف', 'عمود 3'])
    expect(records[0]['عمود 3']).toBe('زبون قديم')
  })

  it('returns nothing for an empty sheet', () => {
    expect(sheetToRecords([[], ['', '']]).records).toEqual([])
  })
})

describe('field values', () => {
  const ctx = { record: { الاسم: 'أحمد', المبلغ: '1500.5' }, index: 3, today: new Date(2026, 7, 19), lang: 'ar' as const }

  it('takes a column straight', () => {
    expect(fieldValue({ name: 'الاسم', source: 'column', format: 'plain', currency: '' }, ctx)).toBe('أحمد')
  })

  it('writes an amount in words when asked', () => {
    const words = fieldValue(
      { name: 'المبلغ', source: 'column', format: 'words', currency: 'IQD' },
      ctx
    )
    expect(words).toContain('ألف')
    expect(words).toContain('دينار')
  })

  it('fills the date and the Hijri date from the merge day', () => {
    const greg = fieldValue({ name: '', source: 'date', format: 'plain', currency: '' }, ctx)
    expect(greg).toContain('2026')
    const hijri = fieldValue({ name: '', source: 'hijri', format: 'plain', currency: '' }, ctx)
    expect(hijri).toMatch(/14\d\d/)
  })

  it('numbers the records', () => {
    expect(fieldValue({ name: '', source: 'count', format: 'plain', currency: '' }, ctx)).toBe('3')
  })

  it('shows a readable chip before the merge runs', () => {
    expect(fieldLabel({ name: 'الاسم', source: 'column', format: 'plain', currency: '' })).toBe('«الاسم»')
    expect(fieldLabel({ name: '', source: 'hijri', format: 'plain', currency: '' })).toBe('«التاريخ الهجري»')
  })
})

describe('merging', () => {
  it('replaces every field for one record', () => {
    const out = mergeOne(letter, {
      record: { الاسم: 'أحمد', المبلغ: '1500' },
      index: 1,
      today: new Date(2026, 7, 19),
      lang: 'ar'
    })
    expect(text(out)).toContain('السيد أحمد المحترم')
    expect(text(out)).toContain('ألف وخمسمائة دينار')
    // no field node survives a merge
    expect(JSON.stringify(out)).not.toContain('mergeField')
  })

  it('puts every record on its own page', () => {
    const out = mergeAll(letter, [{ الاسم: 'أ' }, { الاسم: 'ب' }, { الاسم: 'ج' }], {
      today: new Date(2026, 7, 19)
    })
    const breaks = (out.content ?? []).filter((n) => n.type === 'pageBreak')
    expect(breaks.length).toBe(2)
    expect(text(out)).toContain('السيد أ المحترم')
    expect(text(out)).toContain('السيد ج المحترم')
  })

  it('can run the letters on without page breaks', () => {
    const out = mergeAll(letter, [{ الاسم: 'أ' }, { الاسم: 'ب' }], { pageBreaks: false })
    expect((out.content ?? []).some((n) => n.type === 'pageBreak')).toBe(false)
  })

  it('leaves no empty text node when a value is missing', () => {
    const out = mergeOne(letter, { record: {}, index: 1, today: new Date(), lang: 'ar' })
    const empties: string[] = []
    JSON.stringify(out, (key, value) => {
      if (key === 'text' && value === '') empties.push(key)
      return value
    })
    expect(empties).toEqual([])
  })

  it('names the columns the letter needs but the list does not have', () => {
    expect(missingFields(letter, ['الاسم'])).toEqual(['المبلغ'])
    expect(missingFields(letter, ['الاسم', 'المبلغ'])).toEqual([])
  })
})

describe('docx export', () => {
  it('writes an unmerged field as a real Word merge field', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(letter as DocxNode, 'ar'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('MERGEFIELD')
    expect(xml).toContain('الاسم')
  })
})
