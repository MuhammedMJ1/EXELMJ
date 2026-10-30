// Built-in Arabic-first business templates (invoice, payroll, budget, project
// tracker). Pure snapshot builders — File > New from Template feeds these to
// DocController. Sheets default to RTL in Arabic mode.
import type { ICellData, IStyleData, IWorkbookData, IWorksheetData } from '@univerjs/core'
import { getLang } from '../i18n/i18n'

export type TemplateId = 'invoice' | 'payroll' | 'budget' | 'project'

const STYLES: Record<string, IStyleData> = {
  title: { fs: 18, bl: 1, cl: { rgb: '#1E7145' }, ht: 2, vt: 2 },
  header: {
    bl: 1,
    cl: { rgb: '#FFFFFF' },
    bg: { rgb: '#1E7145' },
    ht: 2,
    vt: 2,
    bd: {
      t: { s: 1, cl: { rgb: '#145236' } },
      b: { s: 1, cl: { rgb: '#145236' } },
      l: { s: 1, cl: { rgb: '#145236' } },
      r: { s: 1, cl: { rgb: '#145236' } }
    }
  },
  money: { n: { pattern: '#,##0.00' } },
  moneyBold: { bl: 1, n: { pattern: '#,##0.00' }, bg: { rgb: '#E2EFDA' } },
  percent: { n: { pattern: '0%' } },
  label: { bl: 1 }
}

type Row = Record<number, ICellData>

function text(v: string, s?: string): ICellData {
  return { v, t: 1, ...(s ? { s } : {}) }
}
function num(v: number, s?: string): ICellData {
  return { v, t: 2, ...(s ? { s } : {}) }
}
function formula(f: string, s?: string): ICellData {
  return { f, ...(s ? { s } : {}) }
}

function wrap(
  name: string,
  cellData: Record<number, Row>,
  extras: Partial<IWorksheetData> = {},
  resources?: Array<{ name: string; data: string }>
): IWorkbookData {
  const sheet: Partial<IWorksheetData> = {
    id: 'tpl-1',
    name,
    cellData,
    rowCount: 1000,
    columnCount: 26,
    defaultRowHeight: 26,
    ...(getLang() === 'ar' ? { rightToLeft: 1 } : {}),
    ...extras
  }
  return {
    id: `wb-${Math.random().toString(36).slice(2, 10)}`,
    name,
    appVersion: '0.25.1',
    locale: 'enUS' as IWorkbookData['locale'],
    styles: STYLES,
    sheetOrder: ['tpl-1'],
    sheets: { 'tpl-1': sheet },
    ...(resources ? { resources } : {})
  }
}

function invoice(): IWorkbookData {
  const cells: Record<number, Row> = {
    0: { 0: text('فاتورة', 'title') },
    2: { 0: text('العميل:', 'label'), 2: text('التاريخ:', 'label'), 3: formula('=TODAY()', 'label') },
    3: { 0: text('رقم الفاتورة:', 'label') },
    5: {
      0: text('الصنف', 'header'),
      1: text('الكمية', 'header'),
      2: text('سعر الوحدة', 'header'),
      3: text('الإجمالي', 'header')
    },
    6: { 0: text('صنف 1'), 1: num(1), 2: num(100, 'money'), 3: formula('=B7*C7', 'money') },
    7: { 0: text('صنف 2'), 1: num(2), 2: num(50, 'money'), 3: formula('=B8*C8', 'money') },
    8: { 3: formula('', 'money') },
    10: { 2: text('المجموع', 'label'), 3: formula('=SUM(D7:D9)', 'money') },
    11: { 2: text('الضريبة 15%', 'label'), 3: formula('=D11*0.15', 'money') },
    12: { 2: text('الصافي المستحق', 'label'), 3: formula('=D11+D12', 'moneyBold') }
  }
  return wrap('فاتورة', cells, {
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 3 }],
    columnData: { 0: { w: 180 }, 1: { w: 90 }, 2: { w: 110 }, 3: { w: 130 } },
    rowData: { 0: { h: 42 } }
  })
}

function payroll(): IWorkbookData {
  const cells: Record<number, Row> = {
    0: { 0: text('كشف الرواتب', 'title') },
    2: {
      0: text('الموظف', 'header'),
      1: text('الراتب الأساسي', 'header'),
      2: text('البدلات', 'header'),
      3: text('الخصومات', 'header'),
      4: text('الصافي', 'header')
    }
  }
  for (let i = 0; i < 5; i++) {
    const r = 3 + i
    cells[r] = {
      0: text(`موظف ${i + 1}`),
      1: num(5000, 'money'),
      2: num(500, 'money'),
      3: num(0, 'money'),
      4: formula(`=B${r + 1}+C${r + 1}-D${r + 1}`, 'money')
    }
  }
  cells[9] = {
    0: text('الإجمالي', 'label'),
    1: formula('=SUM(B4:B8)', 'moneyBold'),
    2: formula('=SUM(C4:C8)', 'moneyBold'),
    3: formula('=SUM(D4:D8)', 'moneyBold'),
    4: formula('=SUM(E4:E8)', 'moneyBold')
  }
  return wrap('الرواتب', cells, {
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 4 }],
    columnData: { 0: { w: 160 }, 1: { w: 120 }, 2: { w: 100 }, 3: { w: 100 }, 4: { w: 120 } },
    rowData: { 0: { h: 42 } },
    freeze: { xSplit: 0, ySplit: 3, startRow: 3, startColumn: 0 }
  })
}

function budget(): IWorkbookData {
  const items = ['الرواتب', 'الإيجار', 'التسويق', 'المشتريات', 'مصاريف أخرى']
  const cells: Record<number, Row> = {
    0: { 0: text('الميزانية الشهرية', 'title') },
    2: {
      0: text('البند', 'header'),
      1: text('المخطط', 'header'),
      2: text('الفعلي', 'header'),
      3: text('الفرق', 'header')
    }
  }
  items.forEach((item, i) => {
    const r = 3 + i
    cells[r] = {
      0: text(item),
      1: num(1000, 'money'),
      2: num(0, 'money'),
      3: formula(`=B${r + 1}-C${r + 1}`, 'money')
    }
  })
  cells[8] = {
    0: text('الإجمالي', 'label'),
    1: formula('=SUM(B4:B8)', 'moneyBold'),
    2: formula('=SUM(C4:C8)', 'moneyBold'),
    3: formula('=SUM(D4:D8)', 'moneyBold')
  }
  return wrap('الميزانية', cells, {
    mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 3 }],
    columnData: { 0: { w: 170 }, 1: { w: 110 }, 2: { w: 110 }, 3: { w: 110 } },
    rowData: { 0: { h: 42 } }
  })
}

function project(): IWorkbookData {
  const cells: Record<number, Row> = {
    0: { 0: text('متابعة المشروع', 'title') },
    2: {
      0: text('المهمة', 'header'),
      1: text('المسؤول', 'header'),
      2: text('الحالة', 'header'),
      3: text('نسبة الإنجاز', 'header'),
      4: text('ملاحظات', 'header')
    },
    3: { 0: text('مهمة 1'), 1: text(''), 2: text('جاري'), 3: num(0.5, 'percent') },
    4: { 0: text('مهمة 2'), 1: text(''), 2: text('منجز'), 3: num(1, 'percent') },
    5: { 0: text('مهمة 3'), 1: text(''), 2: text('متأخر'), 3: num(0.1, 'percent') }
  }
  // Status dropdown + "متأخر is red" rule — showcases DV + CF out of the box.
  const dv = {
    'tpl-1': [
      {
        uid: 'tpl-dv-1',
        ranges: [{ startRow: 3, startColumn: 2, endRow: 40, endColumn: 2, rangeType: 0 }],
        type: 'list',
        formula1: JSON.stringify(['منجز', 'جاري', 'متأخر']),
        showDropDown: true
      }
    ]
  }
  const cf = {
    'tpl-1': [
      {
        cfId: 'tpl-cf-1',
        stopIfTrue: false,
        ranges: [{ startRow: 3, startColumn: 2, endRow: 40, endColumn: 2, rangeType: 0 }],
        rule: {
          type: 'highlightCell',
          subType: 'text',
          operator: 'containsText',
          value: 'متأخر',
          style: { cl: { rgb: '#FFFFFF' }, bg: { rgb: '#D13438' } }
        }
      }
    ]
  }
  return wrap(
    'المشروع',
    cells,
    {
      mergeData: [{ startRow: 0, startColumn: 0, endRow: 0, endColumn: 4 }],
      columnData: { 0: { w: 200 }, 1: { w: 130 }, 2: { w: 100 }, 3: { w: 110 }, 4: { w: 220 } },
      rowData: { 0: { h: 42 } },
      freeze: { xSplit: 0, ySplit: 3, startRow: 3, startColumn: 0 }
    },
    [
      { name: 'SHEET_DATA_VALIDATION_PLUGIN', data: JSON.stringify(dv) },
      { name: 'SHEET_CONDITIONAL_FORMATTING_PLUGIN', data: JSON.stringify(cf) }
    ]
  )
}

export function buildTemplate(id: TemplateId): IWorkbookData {
  switch (id) {
    case 'invoice':
      return invoice()
    case 'payroll':
      return payroll()
    case 'budget':
      return budget()
    case 'project':
      return project()
  }
}
