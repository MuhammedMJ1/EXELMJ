import type { FUniver } from '@univerjs/presets'
import type { PivotAgg } from './pivotTypes'
import type { PivotManager } from './pivotManager'
import { t } from '../i18n/i18n'

const AGGS: Array<{ agg: PivotAgg; labelKey: string }> = [
  { agg: 'sum', labelKey: 'aggSum' },
  { agg: 'count', labelKey: 'aggCount' },
  { agg: 'average', labelKey: 'aggAverage' },
  { agg: 'min', labelKey: 'aggMin' },
  { agg: 'max', labelKey: 'aggMax' }
]

const RANGE_RE = /^\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/

// Native pivot-builder dialog (same pattern as ChartDialog): pick the source
// range (first row = headers), then map headers to rows/columns/values and an
// aggregation. OK computes the pivot into a fresh sheet via PivotManager.
export class PivotDialog {
  constructor(
    private readonly api: FUniver,
    private readonly manager: PivotManager
  ) {}

  open() {
    document.getElementById('exelmj-pivot-dialog')?.remove()
    const fwb = this.api.getActiveWorkbook()
    if (!fwb) return
    const sourceSheetId = fwb.getActiveSheet().getSheetId()
    let selection = ''
    try {
      selection =
        (fwb.getActiveRange() as unknown as { getA1Notation?: () => string } | null)?.getA1Notation?.() ?? ''
    } catch {
      selection = ''
    }
    selection = selection.includes('!') ? selection.split('!').pop()! : selection

    const overlay = document.createElement('div')
    overlay.id = 'exelmj-pivot-dialog'
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1000;display:flex;align-items:center;justify-content:center;'

    const panel = document.createElement('div')
    panel.style.cssText =
      'background:#fff;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:18px;width:360px;max-width:92vw;font-size:13px;'

    const heading = document.createElement('h3')
    heading.textContent = t('pivotInsertTitle')
    heading.style.cssText = 'margin:0 0 12px;font-size:15px;'

    const makeField = (labelText: string, input: HTMLElement) => {
      const wrap = document.createElement('label')
      wrap.style.cssText = 'display:block;margin-bottom:10px;'
      const span = document.createElement('span')
      span.textContent = labelText
      span.style.cssText = 'display:block;margin-bottom:4px;color:#444;'
      wrap.append(span, input)
      return wrap
    }

    const inputCss = 'width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;'

    const rangeInput = document.createElement('input')
    rangeInput.type = 'text'
    rangeInput.value = selection
    rangeInput.dir = 'ltr'
    rangeInput.style.cssText = inputCss

    const rowSelect = document.createElement('select')
    const colSelect = document.createElement('select')
    const valueSelect = document.createElement('select')
    const aggSelect = document.createElement('select')
    for (const el of [rowSelect, colSelect, valueSelect, aggSelect]) el.style.cssText = inputCss

    for (const { agg, labelKey } of AGGS) {
      const opt = document.createElement('option')
      opt.value = agg
      opt.textContent = t(labelKey)
      aggSelect.append(opt)
    }

    const hint = document.createElement('div')
    hint.style.cssText = 'color:#888;font-size:12px;margin:-4px 0 10px;'
    hint.textContent = t('pivotHeaderHint')

    // (Re)fill the three field selects from the range's header row.
    const fillFields = () => {
      const range = rangeInput.value.trim().toUpperCase()
      const headers = RANGE_RE.test(range) ? this.manager.readHeaders(sourceSheetId, range) : null
      for (const sel of [rowSelect, colSelect, valueSelect]) sel.innerHTML = ''
      const noneOpt = document.createElement('option')
      noneOpt.value = ''
      noneOpt.textContent = t('pivotNone')
      colSelect.append(noneOpt)
      if (!headers) return
      headers.forEach((h, i) => {
        for (const sel of [rowSelect, colSelect, valueSelect]) {
          const opt = document.createElement('option')
          opt.value = String(i)
          opt.textContent = h
          sel.append(opt)
        }
      })
      rowSelect.value = '0'
      colSelect.value = ''
      valueSelect.value = String(Math.max(headers.length - 1, 0))
    }
    fillFields()
    rangeInput.addEventListener('change', fillFields)
    rangeInput.addEventListener('blur', fillFields)

    const buttons = document.createElement('div')
    buttons.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:14px;'
    const cancelBtn = document.createElement('button')
    cancelBtn.type = 'button'
    cancelBtn.textContent = t('cancel')
    cancelBtn.style.cssText = 'padding:6px 14px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;'
    const okBtn = document.createElement('button')
    okBtn.type = 'button'
    okBtn.textContent = t('ok')
    okBtn.style.cssText =
      'padding:6px 14px;border:1px solid #0f6cbd;border-radius:4px;background:#0f6cbd;color:#fff;cursor:pointer;'

    const close = () => overlay.remove()
    cancelBtn.addEventListener('click', close)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close()
    })

    okBtn.addEventListener('click', () => {
      const range = rangeInput.value.trim().toUpperCase()
      if (!RANGE_RE.test(range) || !rowSelect.options.length) {
        rangeInput.style.borderColor = '#d13438'
        rangeInput.focus()
        return
      }
      void this.manager
        .addPivot({
          sourceSheetId,
          range,
          rowField: Number(rowSelect.value),
          colField: colSelect.value === '' ? null : Number(colSelect.value),
          valueField: Number(valueSelect.value),
          agg: aggSelect.value as PivotAgg
        })
        .then((def) => {
          if (!def) alert(t('pivotFailed'))
        })
      close()
    })

    buttons.append(cancelBtn, okBtn)
    panel.append(
      heading,
      makeField(t('chartRangeLabel'), rangeInput),
      hint,
      makeField(t('pivotRows'), rowSelect),
      makeField(t('pivotColumns'), colSelect),
      makeField(t('pivotValues'), valueSelect),
      makeField(t('pivotAgg'), aggSelect),
      buttons
    )
    overlay.append(panel)
    document.body.append(overlay)
    rangeInput.focus()
  }
}
