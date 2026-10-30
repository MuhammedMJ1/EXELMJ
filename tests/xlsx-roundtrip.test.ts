// Round-trip suite for the xlsx converter — the product's core promise:
// what EXELMJ writes, Excel reads correctly, and vice versa.
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import type { ICellData, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/core'
import { importXlsx } from '../src/xlsx/importXlsx'
import { exportXlsx } from '../src/xlsx/exportXlsx'
import { parseNotesFromZip } from '../src/xlsx/notesParser'
import { shiftSharedFormula } from '../src/xlsx/styleMap'

function cellAt(wb: IWorkbookData, sheetIdx: number, row: number, col: number): ICellData | undefined {
  const sheetId = wb.sheetOrder[sheetIdx]
  const sheet = wb.sheets[sheetId] as Partial<IWorksheetData>
  return sheet.cellData?.[row]?.[col]
}

function styleAt(wb: IWorkbookData, sheetIdx: number, row: number, col: number): IStyleData | undefined {
  const cell = cellAt(wb, sheetIdx, row, col)
  if (!cell?.s) return undefined
  return typeof cell.s === 'string' ? (wb.styles[cell.s] ?? undefined) : cell.s
}

/** Build a rich Univer snapshot in code (no binary fixtures). */
function buildSnapshot(): IWorkbookData {
  const styles: Record<string, IStyleData> = {
    header: {
      ff: 'Arial',
      fs: 14,
      bl: 1,
      it: 1,
      ul: { s: 1 },
      cl: { rgb: '#FFFFFF' },
      bg: { rgb: '#4472C4' },
      ht: 2,
      vt: 2,
      tb: 3,
      bd: {
        t: { s: 1, cl: { rgb: '#000000' } },
        b: { s: 8, cl: { rgb: '#FF0000' } },
        l: { s: 1, cl: { rgb: '#000000' } },
        r: { s: 1, cl: { rgb: '#000000' } }
      }
    },
    money: { n: { pattern: '#,##0.00 "SAR"' } },
    date: { n: { pattern: 'yyyy-mm-dd' } }
  }
  const sheet1: Partial<IWorksheetData> = {
    id: 'sheet-1',
    name: 'البيانات',
    tabColor: '#FF0000',
    freeze: { xSplit: 1, ySplit: 2, startRow: 2, startColumn: 1 },
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 }],
    rowData: { 0: { h: 40 }, 3: { hd: 1 } },
    columnData: { 0: { w: 120 }, 2: { hd: 1 } },
    cellData: {
      0: { 0: { v: 'التقرير الشهري', t: 1, s: 'header' } },
      1: {
        0: { v: 'البند', t: 1, s: 'header' },
        1: { v: 'القيمة', t: 1, s: 'header' }
      },
      2: {
        0: { v: 'مبيعات', t: 1 },
        1: { v: 1234.56, t: 2, s: 'money' },
        2: { v: 45658, t: 2, s: 'date' }
      },
      3: { 0: { v: 'مصاريف', t: 1 }, 1: { v: 400, t: 2, s: 'money' } },
      4: { 0: { v: 'الصافي', t: 1 }, 1: { f: '=B3-B4', v: 834.56, t: 2 } },
      5: { 0: { v: true, t: 3 }, 1: { v: 'نص عادي', t: 1 } }
    },
    rowCount: 1000,
    columnCount: 26
  }
  const sheet2: Partial<IWorksheetData> = {
    id: 'sheet-2',
    name: 'ملخص',
    hidden: 0,
    cellData: { 0: { 0: { f: "='البيانات'!B3", v: 1234.56, t: 2 } } },
    rowCount: 1000,
    columnCount: 26
  }
  return {
    id: 'wb-test',
    name: 'fixture',
    appVersion: '0.25.1',
    locale: 'enUS' as IWorkbookData['locale'],
    styles,
    sheetOrder: ['sheet-1', 'sheet-2'],
    sheets: { 'sheet-1': sheet1, 'sheet-2': sheet2 }
  }
}

describe('export → import round-trip (EXELMJ-authored file)', async () => {
  const original = buildSnapshot()
  const bytes = await exportXlsx(original)
  const back = await importXlsx(bytes, 'fixture')

  it('keeps sheet order, names and tab color', () => {
    expect(back.sheetOrder).toHaveLength(2)
    const s1 = back.sheets[back.sheetOrder[0]]
    const s2 = back.sheets[back.sheetOrder[1]]
    expect(s1.name).toBe('البيانات')
    expect(s2.name).toBe('ملخص')
    expect(s1.tabColor).toBe('#FF0000')
  })

  it('keeps values, types and formulas', () => {
    expect(cellAt(back, 0, 2, 1)?.v).toBeCloseTo(1234.56)
    expect(cellAt(back, 0, 5, 0)?.v).toBe(true)
    expect(cellAt(back, 0, 4, 1)?.f).toBe('=B3-B4')
    expect(cellAt(back, 1, 0, 0)?.f).toBe("='البيانات'!B3")
  })

  it('keeps fonts, colors, borders, alignment, wrap', () => {
    const h = styleAt(back, 0, 1, 0)
    expect(h?.ff).toBe('Arial')
    expect(h?.fs).toBe(14)
    expect(h?.bl).toBe(1)
    expect(h?.it).toBe(1)
    expect(h?.ul?.s).toBe(1)
    expect(h?.cl?.rgb).toBe('#FFFFFF')
    expect(h?.bg?.rgb).toBe('#4472C4')
    expect(h?.ht).toBe(2)
    expect(h?.vt).toBe(2)
    expect(h?.tb).toBe(3)
    expect(h?.bd?.b?.s).toBe(8)
    expect(h?.bd?.b?.cl?.rgb).toBe('#FF0000')
  })

  it('keeps number formats (currency + date pattern)', () => {
    expect(styleAt(back, 0, 2, 1)?.n?.pattern).toBe('#,##0.00 "SAR"')
    expect(styleAt(back, 0, 2, 2)?.n?.pattern).toBe('yyyy-mm-dd')
  })

  it('keeps merges, freeze, row/col sizes and hidden flags', () => {
    const s1 = back.sheets[back.sheetOrder[0]]
    expect(s1.mergeData?.[0]).toMatchObject({ startRow: 0, startColumn: 0, endRow: 0, endColumn: 2 })
    expect(s1.freeze).toMatchObject({ xSplit: 1, ySplit: 2 })
    expect(s1.rowData?.[0]?.h).toBe(40)
    expect(s1.rowData?.[3]?.hd).toBe(1)
    expect(Math.abs((s1.columnData?.[0]?.w ?? 0) - 120)).toBeLessThanOrEqual(4)
    expect(s1.columnData?.[2]?.hd).toBe(1)
  })
})

describe('import of an Excel-authored file (exceljs as stand-in)', () => {
  async function buildExcelFile(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] })
    ws.getCell('A1').value = 'Item'
    ws.getCell('B1').value = 'Qty'
    ws.getCell('C1').value = 'Price'
    ws.getCell('D1').value = 'Total'
    for (let r = 2; r <= 5; r++) {
      ws.getCell(r, 1).value = `Item ${r - 1}`
      ws.getCell(r, 2).value = r
      ws.getCell(r, 3).value = r * 10.5
    }
    // shared formula: master D2, slaves D3:D5
    ws.getCell('D2').value = { formula: 'B2*C2', result: 42 } as ExcelJS.CellFormulaValue
    for (let r = 3; r <= 5; r++) {
      ws.getCell(r, 4).value = { sharedFormula: 'D2', result: r * r * 10.5 } as ExcelJS.CellValue
    }
    ws.getCell('E2').value = new Date(Date.UTC(2026, 0, 15))
    ws.getCell('E2').numFmt = 'yyyy-mm-dd'
    ws.getCell('A7').value = {
      richText: [{ text: 'Hello ' }, { font: { bold: true }, text: 'World' }]
    } as ExcelJS.CellValue
    const buf = await wb.xlsx.writeBuffer()
    return new Uint8Array(buf as ArrayBuffer)
  }

  it('translates shared formulas per-cell', async () => {
    const back = await importXlsx(await buildExcelFile(), 'excel-fixture')
    expect(cellAt(back, 0, 1, 3)?.f).toBe('=B2*C2')
    expect(cellAt(back, 0, 2, 3)?.f).toBe('=B3*C3')
    expect(cellAt(back, 0, 4, 3)?.f).toBe('=B5*C5')
  })

  it('converts dates to Excel serials and keeps the pattern', async () => {
    const back = await importXlsx(await buildExcelFile(), 'excel-fixture')
    const e2 = cellAt(back, 0, 1, 4)
    // 2026-01-15 → serial 46037 (days since 1899-12-30)
    expect(e2?.v).toBeCloseTo(46037, 5)
    expect(styleAt(back, 0, 1, 4)?.n?.pattern).toBe('yyyy-mm-dd')
  })

  it('flattens rich text to plain text', async () => {
    const back = await importXlsx(await buildExcelFile(), 'excel-fixture')
    expect(cellAt(back, 0, 6, 0)?.v).toBe('Hello World')
  })

  it('round-trips hyperlinks through the in-cell doc', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Links')
    ws.getCell('A1').value = { text: 'موقعنا', hyperlink: 'https://example.com/ar' } as ExcelJS.CellValue
    const buf = await wb.xlsx.writeBuffer()
    const back = await importXlsx(new Uint8Array(buf as ArrayBuffer), 'links')
    const cell = cellAt(back, 0, 0, 0) as { p?: { body?: { dataStream?: string; customRanges?: Array<{ properties?: { url?: string } }> } } }
    expect(cell?.p?.body?.dataStream).toBe('موقعنا\r\n')
    expect(cell?.p?.body?.customRanges?.[0]?.properties?.url).toBe('https://example.com/ar')
    const bytes = await exportXlsx(back)
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer)
    const v = wb2.worksheets[0].getCell('A1').value as { text?: string; hyperlink?: string }
    expect(v?.text).toBe('موقعنا')
    expect(v?.hyperlink).toBe('https://example.com/ar')
  })

  it('imports freeze panes', async () => {
    const back = await importXlsx(await buildExcelFile(), 'excel-fixture')
    expect(back.sheets[back.sheetOrder[0]].freeze).toMatchObject({ ySplit: 1 })
  })

  it('re-exports to a file Excel (exceljs) can reload', async () => {
    const back = await importXlsx(await buildExcelFile(), 'excel-fixture')
    const bytes = await exportXlsx(back)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer
    )
    const ws = wb.worksheets[0]
    expect(ws.name).toBe('Data')
    const d3 = ws.getCell('D3').value as ExcelJS.CellFormulaValue
    expect(d3.formula).toBe('B3*C3')
  })
})

describe('filter / data validation / conditional formatting round-trip', () => {
  async function buildToolsFile(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Tools')
    ws.getCell('A1').value = 'Name'
    ws.getCell('B1').value = 'Score'
    for (let r = 2; r <= 6; r++) {
      ws.getCell(r, 1).value = `N${r}`
      ws.getCell(r, 2).value = r * 10
    }
    ws.autoFilter = 'A1:B6'
    const dvModel = (ws as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations
      .model
    dvModel['C2:C6'] = { type: 'list', allowBlank: true, formulae: ['"yes,no,maybe"'] }
    dvModel['D2:D6'] = { type: 'decimal', operator: 'between', allowBlank: true, formulae: [1, 100] }
    ws.addConditionalFormatting({
      ref: 'B2:B6',
      rules: [
        {
          type: 'cellIs',
          operator: 'greaterThan',
          formulae: ['30'],
          priority: 1,
          style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF0000' } } }
        }
      ]
    } as ExcelJS.ConditionalFormattingOptions)
    ws.addConditionalFormatting({
      ref: 'A2:A6',
      rules: [
        { type: 'containsText', operator: 'containsText', text: 'N3', priority: 2, style: { font: { italic: true } } }
      ]
    } as unknown as ExcelJS.ConditionalFormattingOptions)
    const buf = await wb.xlsx.writeBuffer()
    return new Uint8Array(buf as ArrayBuffer)
  }

  function resourcesByName(wb: IWorkbookData): Record<string, unknown> {
    return Object.fromEntries((wb.resources ?? []).map((r) => [r.name, JSON.parse(r.data)]))
  }

  it('imports filter/DV/CF into Univer resources', async () => {
    const back = await importXlsx(await buildToolsFile(), 'tools')
    const res = resourcesByName(back) as Record<string, Record<string, unknown>>
    const sid = back.sheetOrder[0]
    expect((res.SHEET_FILTER_PLUGIN?.[sid] as { ref: object })?.ref).toMatchObject({
      startRow: 0,
      endRow: 5,
      startColumn: 0,
      endColumn: 1
    })
    const dv = res.SHEET_DATA_VALIDATION_PLUGIN?.[sid] as Array<Record<string, string>>
    expect(dv).toHaveLength(2)
    const list = dv.find((r) => r.type === 'list')
    expect(JSON.parse(list?.formula1 ?? '[]')).toEqual(['yes', 'no', 'maybe'])
    const dec = dv.find((r) => r.type === 'decimal')
    expect(dec).toMatchObject({ operator: 'between', formula1: '1', formula2: '100' })
    const cf = res.SHEET_CONDITIONAL_FORMATTING_PLUGIN?.[sid] as Array<{
      rule: { type: string; subType: string; operator: string; value: unknown; style: { bg?: { rgb?: string } } }
    }>
    expect(cf).toHaveLength(2)
    expect(cf[0].rule).toMatchObject({
      type: 'highlightCell',
      subType: 'number',
      operator: 'greaterThan',
      value: 30
    })
    expect(cf[0].rule.style?.bg?.rgb).toBe('#FF0000')
    expect(cf[1].rule).toMatchObject({ subType: 'text', operator: 'containsText', value: 'N3' })
  })

  it('exports them back to a file exceljs can read', async () => {
    const back = await importXlsx(await buildToolsFile(), 'tools')
    const bytes = await exportXlsx(back)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer
    )
    const ws = wb.worksheets[0]
    const af =
      (ws as unknown as { autoFilter?: unknown }).autoFilter ??
      (ws.model as unknown as { autoFilter?: unknown })?.autoFilter
    expect(af).toBeTruthy()
    const dvModel = (ws as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations
      .model
    expect(Object.keys(dvModel).length).toBeGreaterThanOrEqual(2)
    const cfs =
      (ws as unknown as { conditionalFormattings?: unknown[] }).conditionalFormattings ??
      (ws.model as unknown as { conditionalFormattings?: unknown[] })?.conditionalFormattings
    expect((cfs?.length ?? 0)).toBeGreaterThanOrEqual(2)
  })
})

describe('package A: full CF, range lists, notes, images', () => {
  const PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  async function buildRichFile(): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Rich')
    for (let r = 1; r <= 6; r++) {
      ws.getCell(r, 1).value = r * 10
      ws.getCell(r, 2).value = r
    }
    ws.addConditionalFormatting({
      ref: 'A1:A6',
      rules: [
        {
          type: 'colorScale',
          priority: 1,
          cfvo: [{ type: 'min' }, { type: 'max' }],
          color: [{ argb: 'FFFF0000' }, { argb: 'FF00FF00' }]
        }
      ]
    } as unknown as ExcelJS.ConditionalFormattingOptions)
    ws.addConditionalFormatting({
      ref: 'B1:B6',
      rules: [
        {
          type: 'dataBar',
          priority: 2,
          cfvo: [{ type: 'min' }, { type: 'max' }],
          color: { argb: 'FF638EC6' },
          gradient: true,
          showValue: true
        }
      ]
    } as unknown as ExcelJS.ConditionalFormattingOptions)
    ws.addConditionalFormatting({
      ref: 'A1:B6',
      rules: [
        {
          type: 'iconSet',
          priority: 3,
          iconSet: '3TrafficLights1',
          showValue: true,
          cfvo: [
            { type: 'percent', value: 0 },
            { type: 'percent', value: 33 },
            { type: 'percent', value: 67 }
          ]
        }
      ]
    } as unknown as ExcelJS.ConditionalFormattingOptions)
    ws.addConditionalFormatting({
      ref: 'B1:B6',
      rules: [
        {
          type: 'cellIs',
          operator: 'between',
          formulae: ['2', '4'],
          priority: 4,
          style: { fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } } }
        }
      ]
    } as unknown as ExcelJS.ConditionalFormattingOptions)
    const dvModel = (ws as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations
      .model
    dvModel['E1:E6'] = { type: 'list', allowBlank: true, formulae: ['$A$1:$A$6'] }
    ws.getCell('C1').note = 'ملاحظة عربية'
    const imgId = wb.addImage({ base64: PNG_B64, extension: 'png' })
    ws.addImage(imgId, { tl: { col: 5, row: 1 }, ext: { width: 90, height: 60 } })
    const buf = await wb.xlsx.writeBuffer()
    return new Uint8Array(buf as ArrayBuffer)
  }

  it('imports colorScale/dataBar/iconSet/between + range lists + notes + images', async () => {
    const back = await importXlsx(await buildRichFile(), 'rich')
    const res = Object.fromEntries((back.resources ?? []).map((r) => [r.name, JSON.parse(r.data)])) as Record<
      string,
      Record<string, unknown>
    >
    const sid = back.sheetOrder[0]
    const cf = (res.SHEET_CONDITIONAL_FORMATTING_PLUGIN?.[sid] ?? []) as Array<{
      rule: { type: string; operator?: string; value?: unknown }
    }>
    const types = cf.map((r) => r.rule.type)
    expect(types).toContain('colorScale')
    expect(types).toContain('dataBar')
    expect(types).toContain('iconSet')
    expect(cf.find((r) => r.rule.operator === 'between')?.rule.value).toEqual([2, 4])
    const dv = (res.SHEET_DATA_VALIDATION_PLUGIN?.[sid] ?? []) as Array<{ type: string; formula1?: string }>
    expect(dv.find((r) => r.type === 'list')?.formula1).toBe('=$A$1:$A$6')
    const notes = res.SHEET_NOTE_PLUGIN?.[sid] as Record<string, Record<string, { note: string }>>
    expect(notes?.[0]?.[2]?.note).toBe('ملاحظة عربية')
    const drawings = res.SHEET_DRAWING_PLUGIN?.[sid] as {
      order: string[]
      data: Record<string, { source: string; row: number; column: number }>
    }
    expect(drawings?.order?.length).toBe(1)
    const img = Object.values(drawings.data)[0]
    expect(img.source.startsWith('data:image/png;base64,')).toBe(true)
    expect(img.row).toBe(1)
    expect(img.column).toBe(5)
  })

  it('exports them back to a file exceljs can read', async () => {
    const back = await importXlsx(await buildRichFile(), 'rich')
    const bytes = await exportXlsx(back)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer
    )
    const ws = wb.worksheets[0]
    const cfs = ((ws as unknown as { conditionalFormattings?: Array<{ rules: Array<{ type: string }> }> })
      .conditionalFormattings ?? []) as Array<{ rules: Array<{ type: string }> }>
    const allRules = cfs.flatMap((c) => c.rules.map((r) => r.type))
    expect(allRules).toContain('colorScale')
    expect(allRules).toContain('dataBar')
    expect(allRules).toContain('iconSet')
    // exceljs's reader never surfaces notes — verify with our own zip parser.
    const exportedNotes = await parseNotesFromZip(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    )
    const firstSheetNotes = exportedNotes.get(0) ?? []
    expect(firstSheetNotes.some((n) => n.text.includes('ملاحظة') && n.row === 0 && n.col === 2)).toBe(true)
    const images = (ws as unknown as { getImages?: () => unknown[] }).getImages?.() ?? []
    expect(images.length).toBe(1)
    const dvModel = (ws as unknown as { dataValidations: { model: Record<string, { type?: string; formulae?: unknown[] }> } })
      .dataValidations.model
    const listDv = Object.values(dvModel).find((d) => d?.type === 'list')
    expect(String(listDv?.formulae?.[0])).toContain('A$1')
  })
})

describe('column/row-level styles', () => {
  it('round-trips Excel column fills and row fonts', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Cols')
    ws.getCell('A1').value = 'x'
    // exceljs only persists row styles when the row has content (empty styled
    // rows are dropped by its writer — documented limitation)
    ws.getCell('B2').value = 'y'
    ws.getColumn(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } }
    ws.getRow(2).font = { bold: true, color: { argb: 'FF1E7145' } }
    const buf = await wb.xlsx.writeBuffer()

    const back = await importXlsx(new Uint8Array(buf as ArrayBuffer), 'cols')
    const sheet = back.sheets[back.sheetOrder[0]] as {
      columnData?: Record<number, { s?: string }>
      rowData?: Record<number, { s?: string }>
    }
    const colStyle = back.styles[sheet.columnData?.[2]?.s ?? ''] as { bg?: { rgb?: string } } | undefined
    expect(colStyle?.bg?.rgb).toBe('#FFE699')
    const rowStyle = back.styles[sheet.rowData?.[1]?.s ?? ''] as
      | { bl?: number; cl?: { rgb?: string } }
      | undefined
    expect(rowStyle?.bl).toBe(1)
    expect(rowStyle?.cl?.rgb).toBe('#1E7145')

    const bytes = await exportXlsx(back)
    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer
    )
    const ws2 = wb2.worksheets[0]
    const fill = ws2.getColumn(3).fill as ExcelJS.FillPattern | undefined
    expect(fill?.fgColor?.argb).toBe('FFFFE699')
    expect(ws2.getRow(2).font?.bold).toBe(true)
  })
})

describe('hijri custom formulas', () => {
  it('exports the VALUE (no #NAME? in Excel) and restores the formula on import', async () => {
    const snapshot = buildSnapshot()
    snapshot.sheets['sheet-1'].cellData![7] = {
      0: { f: '=HIJRI(C3)', v: '1447/01/15', t: 1 }
    }
    const bytes = await exportXlsx(snapshot)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer
    )
    const cell = wb.worksheets[0].getCell('A8')
    expect(cell.value).toBe('1447/01/15') // plain value — Excel never sees HIJRI()
    expect((cell.value as { formula?: string })?.formula).toBeUndefined()

    const back = await importXlsx(bytes, 'hijri')
    expect(back.sheets[back.sheetOrder[0]].cellData?.[7]?.[0]?.f).toBe('=HIJRI(C3)')
  })
})

describe('meta v2: sheet ids + protection passthrough', () => {
  it('keeps original sheet ids and protection resources through a round-trip', async () => {
    const snapshot = buildSnapshot()
    snapshot.resources = [
      { name: 'SHEET_WORKSHEET_PROTECTION_PLUGIN', data: JSON.stringify({ 'sheet-1': { protected: true } }) }
    ]
    const bytes = await exportXlsx(snapshot)
    const back = await importXlsx(bytes, 'meta2')
    expect(back.sheetOrder).toEqual(['sheet-1', 'sheet-2'])
    const prot = (back.resources ?? []).find((r) => r.name === 'SHEET_WORKSHEET_PROTECTION_PLUGIN')
    expect(prot).toBeTruthy()
    expect(JSON.parse(prot!.data)['sheet-1']).toBeTruthy()
  })
})

describe('sheet right-to-left flag', () => {
  it('round-trips through the xlsx view settings', async () => {
    const snapshot = buildSnapshot()
    ;(snapshot.sheets['sheet-1'] as { rightToLeft?: number }).rightToLeft = 1
    const bytes = await exportXlsx(snapshot)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer)
    expect(wb.worksheets[0].views?.[0]?.rightToLeft).toBe(true)
    expect(!!wb.worksheets[1].views?.[0]?.rightToLeft).toBe(false)

    const back = await importXlsx(bytes, 'rtl')
    expect((back.sheets[back.sheetOrder[0]] as { rightToLeft?: number }).rightToLeft).toBe(1)
    expect((back.sheets[back.sheetOrder[1]] as { rightToLeft?: number }).rightToLeft).toBeUndefined()
  })
})

describe('chart metadata (_EXELMJ_META veryHidden sheet)', () => {
  const chart = {
    id: 'chart-1-x',
    kind: 'bar' as const,
    sheetId: 'sheet-1',
    range: 'A1:B5',
    title: 'مبيعات الشهر',
    x: 90,
    y: 90,
    w: 480,
    h: 320
  }

  it('survives export → import and stays invisible to Excel users', async () => {
    const snapshot = buildSnapshot()
    ;(snapshot as { custom?: unknown }).custom = { exelmjCharts: [chart] }
    const bytes = await exportXlsx(snapshot)

    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer)
    const meta = wb.worksheets.find((w) => w.name === '_EXELMJ_META')
    expect(meta?.state).toBe('veryHidden')

    const back = await importXlsx(bytes, 'charts')
    // meta sheet must not appear as a data sheet
    expect(back.sheetOrder).toHaveLength(2)
    expect(Object.values(back.sheets).map((s) => s.name)).not.toContain('_EXELMJ_META')
    const charts = (back.custom as { exelmjCharts?: (typeof chart)[] })?.exelmjCharts
    expect(charts).toHaveLength(1)
    expect(charts?.[0]).toMatchObject({ kind: 'bar', range: 'A1:B5', title: 'مبيعات الشهر', sheetId: 'sheet-1' })
  })

  it('drops the meta sheet when there are no charts', async () => {
    const bytes = await exportXlsx(buildSnapshot())
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ExcelJS.Buffer)
    expect(wb.worksheets.find((w) => w.name === '_EXELMJ_META')).toBeUndefined()
  })
})

describe('shiftSharedFormula', () => {
  it('shifts relative refs and respects anchors', () => {
    expect(shiftSharedFormula('B2*C2', 1, 0)).toBe('B3*C3')
    expect(shiftSharedFormula('$B$2+B2', 2, 1)).toBe('$B$2+C4')
    expect(shiftSharedFormula('SUM(A1:A10)', 0, 2)).toBe('SUM(C1:C10)')
  })
  it('leaves strings, sheet names and functions alone', () => {
    expect(shiftSharedFormula('IF(A1="B2",LOG10(B1),0)', 1, 0)).toBe('IF(A2="B2",LOG10(B2),0)')
    expect(shiftSharedFormula("'Sheet A1'!B2", 1, 1)).toBe("'Sheet A1'!C3")
  })
  it('fails safely when a ref would leave the sheet', () => {
    expect(shiftSharedFormula('A1+B1', -1, 0)).toBeNull()
  })
})
