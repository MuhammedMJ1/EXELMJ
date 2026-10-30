import type { FUniver } from '@univerjs/presets'
import type { ChartDef, ChartKind } from './chartTypes'
import type { ChartManager } from './chartManager'
import { t } from '../i18n/i18n'

const KINDS: Array<{ kind: ChartKind; labelKey: string }> = [
  { kind: 'bar', labelKey: 'kindBar' },
  { kind: 'line', labelKey: 'kindLine' },
  { kind: 'area', labelKey: 'kindArea' },
  { kind: 'pie', labelKey: 'kindPie' }
]

const RANGE_RE = /^\$?[A-Za-z]{1,3}\$?\d+(:\$?[A-Za-z]{1,3}\$?\d+)?$/

// Small native dialog (no framework): insert a new chart from the current
// selection, or edit an existing one (opened via the chart's ✎ button).
export class ChartDialog {
  constructor(
    private readonly api: FUniver,
    private readonly manager: ChartManager
  ) {
    manager.onEdit((def) => this.open(def))
  }

  open(existing?: ChartDef) {
    document.getElementById('exelmj-chart-dialog')?.remove()
    const fwb = this.api.getActiveWorkbook()
    if (!fwb) return
    let selection = ''
    try {
      selection =
        (fwb.getActiveRange() as unknown as { getA1Notation?: () => string } | null)?.getA1Notation?.() ?? ''
    } catch {
      selection = ''
    }
    // strip a leading sheet prefix (dialog ranges are for the active sheet)
    selection = selection.includes('!') ? selection.split('!').pop()! : selection

    const overlay = document.createElement('div')
    overlay.id = 'exelmj-chart-dialog'
    overlay.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:1000;display:flex;align-items:center;justify-content:center;'

    const panel = document.createElement('div')
    panel.style.cssText =
      'background:#fff;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:18px;width:340px;max-width:92vw;font-size:13px;'

    const heading = document.createElement('h3')
    heading.textContent = existing ? t('chartEditTitle') : t('chartInsertTitle')
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

    const kindSelect = document.createElement('select')
    kindSelect.style.cssText = 'width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;'
    for (const { kind, labelKey } of KINDS) {
      const opt = document.createElement('option')
      opt.value = kind
      opt.textContent = t(labelKey)
      if ((existing?.kind ?? 'bar') === kind) opt.selected = true
      kindSelect.append(opt)
    }

    const titleInput = document.createElement('input')
    titleInput.type = 'text'
    titleInput.value = existing?.title ?? ''
    titleInput.style.cssText = 'width:100%;padding:6px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;'

    const rangeInput = document.createElement('input')
    rangeInput.type = 'text'
    rangeInput.value = existing?.range ?? selection
    rangeInput.dir = 'ltr'
    rangeInput.style.cssText = titleInput.style.cssText

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
      const kind = kindSelect.value as ChartKind
      const title = titleInput.value.trim()
      const range = rangeInput.value.trim().toUpperCase()
      if (!RANGE_RE.test(range)) {
        rangeInput.style.borderColor = '#d13438'
        rangeInput.focus()
        return
      }
      if (existing) {
        this.manager.updateChart(existing.id, { kind, title, range })
      } else {
        const count = this.manager.list().length
        this.manager.addChart({
          kind,
          title,
          range,
          sheetId: fwb.getActiveSheet().getSheetId(),
          x: 90 + count * 26,
          y: 90 + count * 26,
          w: 480,
          h: 320
        })
      }
      close()
    })

    buttons.append(cancelBtn, okBtn)
    panel.append(
      heading,
      makeField(t('chartKind'), kindSelect),
      makeField(t('chartTitleLabel'), titleInput),
      makeField(t('chartRangeLabel'), rangeInput),
      buttons
    )
    overlay.append(panel)
    document.body.append(overlay)
    rangeInput.focus()
  }
}
