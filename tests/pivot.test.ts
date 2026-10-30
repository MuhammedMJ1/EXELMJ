import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { IWorkbookData } from '@univerjs/core'
import { buildPivot, type PivotLabels } from '../src/pivot/pivotEngine'
import { readMeta, writeMeta } from '../src/xlsx/chartMeta'
import { exportXlsx } from '../src/xlsx/exportXlsx'
import { importXlsx } from '../src/xlsx/importXlsx'
import type { PivotDef } from '../src/pivot/pivotTypes'

const L: PivotLabels = { total: 'الإجمالي', empty: '(فارغ)', valueTitle: 'مجموع المبلغ' }

// sample sales rows: [البائع, المدينة, المبلغ]
const SALES: unknown[][] = [
  ['أحمد', 'جدة', 100],
  ['سالم', 'الرياض', 50],
  ['أحمد', 'الرياض', 30],
  ['سالم', 'جدة', 20],
  ['أحمد', 'جدة', 70]
]

describe('pivot engine — flat (rows only)', () => {
  it('groups, sums and totals with sorted keys', () => {
    const grid = buildPivot(SALES, { rowField: 0, colField: null, valueField: 2, agg: 'sum' }, L)
    expect(grid).toEqual([
      ['', 'مجموع المبلغ'],
      ['أحمد', 200],
      ['سالم', 70],
      ['الإجمالي', 270]
    ])
  })

  it('count counts non-empty raw values including text', () => {
    const rows = [
      ['أ', 'x'],
      ['أ', ''],
      ['أ', 7],
      ['ب', null]
    ]
    const grid = buildPivot(rows, { rowField: 0, colField: null, valueField: 1, agg: 'count' }, L)
    expect(grid[1]).toEqual(['أ', 2]) // 'x' + 7 (empty string skipped)
    expect(grid[2]).toEqual(['ب', null]) // nothing countable → blank
    expect(grid[3]).toEqual(['الإجمالي', 2])
  })

  it('average is over all values, not average of group averages', () => {
    const rows = [
      ['أ', 10],
      ['أ', 20],
      ['ب', 60]
    ]
    const grid = buildPivot(rows, { rowField: 0, colField: null, valueField: 1, agg: 'average' }, L)
    expect(grid[1]).toEqual(['أ', 15])
    expect(grid[2]).toEqual(['ب', 60])
    expect(grid[3]).toEqual(['الإجمالي', 30]) // (10+20+60)/3
  })

  it('min/max, non-numeric values ignored, numeric strings coerced', () => {
    const rows = [
      ['أ', '5'],
      ['أ', 'نص'],
      ['أ', 2]
    ]
    const min = buildPivot(rows, { rowField: 0, colField: null, valueField: 1, agg: 'min' }, L)
    const max = buildPivot(rows, { rowField: 0, colField: null, valueField: 1, agg: 'max' }, L)
    expect(min[1]).toEqual(['أ', 2])
    expect(max[1]).toEqual(['أ', 5])
  })

  it('blank group keys collapse under the empty label; blank rows skipped', () => {
    const rows = [
      ['', 5],
      [null, 3],
      ['أ', 1],
      [null, null] // fully blank → skipped entirely
    ]
    const grid = buildPivot(rows, { rowField: 0, colField: null, valueField: 1, agg: 'sum' }, L)
    expect(grid).toContainEqual(['(فارغ)', 8])
    expect(grid[grid.length - 1]).toEqual(['الإجمالي', 9])
  })

  it('sorts purely numeric keys numerically (2 before 10)', () => {
    const rows = [
      [10, 1],
      [2, 1],
      [1, 1]
    ]
    const grid = buildPivot(rows, { rowField: 0, colField: null, valueField: 1, agg: 'sum' }, L)
    expect(grid.slice(1, 4).map((r) => r[0])).toEqual(['1', '2', '10'])
  })
})

describe('pivot engine — matrix (rows × columns)', () => {
  it('builds the matrix with row totals, column totals and grand total', () => {
    const grid = buildPivot(SALES, { rowField: 0, colField: 1, valueField: 2, agg: 'sum' }, L)
    expect(grid[0]).toEqual(['', 'الرياض', 'جدة', 'الإجمالي'])
    expect(grid[1]).toEqual(['أحمد', 30, 170, 200])
    expect(grid[2]).toEqual(['سالم', 50, 20, 70])
    expect(grid[3]).toEqual(['الإجمالي', 80, 190, 270])
  })

  it('leaves missing (row, column) combos blank', () => {
    const rows = [
      ['أ', 'س', 1],
      ['ب', 'ص', 2]
    ]
    const grid = buildPivot(rows, { rowField: 0, colField: 1, valueField: 2, agg: 'sum' }, L)
    expect(grid[1]).toEqual(['أ', 1, null, 1])
    expect(grid[2]).toEqual(['ب', null, 2, 2])
  })

  it('spaced keys cannot collide across different row/column splits', () => {
    const rows = [
      ['أ ب', 'ج', 1],
      ['أ', 'ب ج', 10]
    ]
    const grid = buildPivot(rows, { rowField: 0, colField: 1, valueField: 2, agg: 'sum' }, L)
    // two distinct row keys and two distinct column keys — no shared bucket
    expect(grid[0]).toHaveLength(4) // '', two column keys, total
    expect(grid).toHaveLength(4) // header, two row lines, totals
    expect(grid[3][3]).toBe(11)
  })
})

describe('meta v3 — pivot definitions ride the hidden sheet', () => {
  it('writeMeta/readMeta round-trips pivots with sheet-index mapping', async () => {
    const def: PivotDef = {
      id: 'pv1',
      name: 'محوري 1',
      sourceSheetId: 'sheet-a',
      range: 'A1:C6',
      rowField: 0,
      colField: 1,
      valueField: 2,
      agg: 'sum',
      targetSheetId: 'sheet-b'
    }
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('المصدر')
    wb.addWorksheet('محوري 1')
    writeMeta(wb, { charts: [], sheetIds: ['sheet-a', 'sheet-b'], pivots: [def] })

    const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buf)
    const meta = readMeta(wb2)
    expect(meta.pivots).toHaveLength(1)
    expect(meta.pivots[0]).toEqual(def)
  })

  it('survives the FULL save→reopen pipeline (exportXlsx → importXlsx)', async () => {
    const def: PivotDef = {
      id: 'pv-full',
      name: 'جدول محوري 1',
      sourceSheetId: 'sheet-1',
      range: 'A1:C6',
      rowField: 0,
      colField: 1,
      valueField: 2,
      agg: 'sum',
      targetSheetId: 'sheet-2'
    }
    const snapshot: IWorkbookData = {
      id: 'wb',
      name: 'مصنف',
      appVersion: '0.25.1',
      locale: 'enUS' as IWorkbookData['locale'],
      styles: {},
      sheetOrder: ['sheet-1', 'sheet-2'],
      sheets: {
        'sheet-1': { id: 'sheet-1', name: 'البيانات', cellData: { 0: { 0: { v: 'س' } } } },
        'sheet-2': { id: 'sheet-2', name: 'جدول محوري 1', cellData: {} }
      },
      custom: { exelmjCharts: [], exelmjPivots: [def] }
    }
    const bytes = await exportXlsx(snapshot)
    const reopened = await importXlsx(bytes, 'roundtrip.xlsx')
    const restored = (reopened.custom as Record<string, unknown> | undefined)?.exelmjPivots as PivotDef[]
    expect(restored).toHaveLength(1)
    expect(restored[0]).toEqual(def)
  })

  it('drops pivots whose source or target sheet no longer exists', () => {
    const wb = new ExcelJS.Workbook()
    wb.addWorksheet('x')
    writeMeta(wb, {
      charts: [],
      sheetIds: ['only-sheet'],
      pivots: [
        {
          id: 'pv2',
          name: 'م',
          sourceSheetId: 'ghost',
          range: 'A1:B2',
          rowField: 0,
          colField: null,
          valueField: 1,
          agg: 'count',
          targetSheetId: 'only-sheet'
        }
      ]
    })
    const meta = readMeta(wb)
    expect(meta.pivots).toHaveLength(0)
  })
})
