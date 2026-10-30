// A small in-app modal form for the word mode.
//
// WHY THIS EXISTS: Electron refuses window.prompt() outright ("prompt() is and
// will not be supported") — the link button used it and simply threw, so the
// button did nothing at all. Everything that needs to ask the user for a value
// (link target, header/footer text, page setup) goes through this instead.
//
// Like the mode pill, it is appended to <body> — outside any mirrored host —
// so it is never flipped by the RTL sheet mirror.
import { t } from '../i18n/i18n'

export type FieldType = 'text' | 'number' | 'select' | 'checkbox' | 'color' | 'note'

export interface FormField {
  key: string
  label: string
  type?: FieldType
  value?: string
  options?: Array<[string, string]>
  hint?: string
  min?: number
  max?: number
  step?: number
  /** a value the dialog only REPORTS — document statistics, a computed total */
  readonly?: boolean
  placeholder?: string
}

export interface FormOptions {
  okLabel?: string
  cancelLabel?: string
  /** A third button (e.g. "remove link"); resolves with { __action: key }. */
  extra?: { key: string; label: string }
  note?: string
}

export type FormResult = Record<string, string>

/** Resolves with the field values, or null when cancelled. */
export function askForm(
  title: string,
  fields: FormField[],
  opts: FormOptions = {}
): Promise<FormResult | null> {
  injectCss()
  return new Promise((resolve) => {
    const rtl = (document.documentElement.lang || 'en') === 'ar'
    const overlay = document.createElement('div')
    overlay.className = 'exelmj-modal-overlay'
    overlay.dir = rtl ? 'rtl' : 'ltr'

    const card = document.createElement('div')
    card.className = 'exelmj-modal'
    card.setAttribute('role', 'dialog')
    card.setAttribute('aria-modal', 'true')

    const head = document.createElement('div')
    head.className = 'exelmj-modal-title'
    head.textContent = title
    card.append(head)

    const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>()
    for (const field of fields) {
      const row = document.createElement('label')
      row.className = 'exelmj-modal-row'
      const label = document.createElement('span')
      label.textContent = field.label
      row.append(label)

      if (field.type === 'note') {
        // a question, not a field: the label carries it and OK/Cancel answer it
        row.className = 'exelmj-modal-row exelmj-modal-note'
        card.append(row)
        continue
      }

      let control: HTMLInputElement | HTMLSelectElement
      if (field.type === 'select') {
        const sel = document.createElement('select')
        for (const [value, text] of field.options ?? []) {
          const option = document.createElement('option')
          option.value = value
          option.textContent = text
          sel.append(option)
        }
        sel.value = field.value ?? ''
        control = sel
      } else {
        const input = document.createElement('input')
        input.type = field.type === 'checkbox' ? 'checkbox' : field.type === 'number' ? 'number' : field.type === 'color' ? 'color' : 'text'
        if (field.type === 'checkbox') input.checked = field.value === 'true'
        else input.value = field.value ?? ''
        if (field.placeholder) input.placeholder = field.placeholder
        if (field.min !== undefined) input.min = String(field.min)
        if (field.max !== undefined) input.max = String(field.max)
        if (field.step !== undefined) input.step = String(field.step)
        if (field.readonly) {
          input.readOnly = true
          input.classList.add('exelmj-modal-readonly')
        }
        control = input
      }
      control.className = 'exelmj-modal-input'
      if (field.type === 'checkbox') control.classList.add('is-check')
      row.append(control)
      if (field.hint) {
        const hint = document.createElement('small')
        hint.textContent = field.hint
        row.append(hint)
      }
      inputs.set(field.key, control)
      card.append(row)
    }

    if (opts.note) {
      const note = document.createElement('div')
      note.className = 'exelmj-modal-note'
      note.textContent = opts.note
      card.append(note)
    }

    const footer = document.createElement('div')
    footer.className = 'exelmj-modal-buttons'

    const close = (result: FormResult | null) => {
      document.removeEventListener('keydown', onKey, true)
      overlay.remove()
      resolve(result)
    }
    const collect = (): FormResult => {
      const out: FormResult = {}
      for (const [key, control] of inputs) {
        out[key] =
          control instanceof HTMLInputElement && control.type === 'checkbox'
            ? String(control.checked)
            : control.value
      }
      return out
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close(null)
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault()
        e.stopPropagation()
        close(collect())
      }
    }

    if (opts.extra) {
      const extra = document.createElement('button')
      extra.type = 'button'
      extra.className = 'exelmj-modal-btn extra'
      extra.textContent = opts.extra.label
      extra.addEventListener('click', () => close({ ...collect(), __action: opts.extra!.key }))
      footer.append(extra)
    }

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'exelmj-modal-btn'
    cancel.textContent = opts.cancelLabel ?? t('cancel')
    cancel.addEventListener('click', () => close(null))

    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'exelmj-modal-btn primary'
    ok.textContent = opts.okLabel ?? t('ok')
    ok.addEventListener('click', () => close(collect()))

    footer.append(cancel, ok)
    card.append(footer)
    overlay.append(card)
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay) close(null)
    })
    document.addEventListener('keydown', onKey, true)
    document.body.append(overlay)

    const first = [...inputs.values()][0]
    if (first) {
      first.focus()
      if (first instanceof HTMLInputElement && first.type === 'text') first.select()
    } else {
      ok.focus()
    }
  })
}

/** One-field convenience wrapper. */
export function askText(
  title: string,
  label: string,
  value = '',
  opts: FormOptions = {}
): Promise<string | null> {
  return askForm(title, [{ key: 'value', label, value }], opts).then((res) =>
    res && !res.__action ? res.value : res?.__action ? '' : null
  )
}

function injectCss() {
  if (document.getElementById('exelmj-modal-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-modal-style'
  style.textContent = `
.exelmj-modal-overlay {
  position: fixed; inset: 0; z-index: 2000; display: flex; align-items: center;
  justify-content: center; background: rgba(16, 24, 40, 0.35);
  font: 13px 'Segoe UI', Tahoma, sans-serif;
}
.exelmj-modal {
  min-width: 340px; max-width: 92vw; background: #fff; border-radius: 10px;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.3); padding: 16px 18px 14px;
  display: flex; flex-direction: column; gap: 10px;
}
.exelmj-modal-title { font-size: 15px; font-weight: 600; color: #101828; }
.exelmj-modal-row { display: flex; align-items: center; gap: 10px; }
.exelmj-modal-row > span { min-width: 96px; color: #475467; }
.exelmj-modal-row > small { color: #98a2b3; font-size: 11px; }
.exelmj-modal-input {
  flex: 1; height: 30px; border: 1px solid #d0d5dd; border-radius: 6px;
  padding: 0 8px; font: inherit; background: #fff; color: #101828; min-width: 0;
}
.exelmj-modal-input:focus { outline: 2px solid #b3d3f2; outline-offset: -1px; }
.exelmj-modal-input.is-check { flex: none; width: 18px; height: 18px; }
.exelmj-modal-input[type=color] { padding: 1px; width: 46px; flex: none; }
.exelmj-modal-readonly { background: #f7f8fa; color: #475467; }
.exelmj-modal-note > span { min-width: 0; color: #101828; line-height: 1.5; }
.exelmj-modal-note { color: #667085; font-size: 12px; line-height: 1.5; }
.exelmj-modal-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.exelmj-modal-btn {
  height: 30px; min-width: 78px; padding: 0 14px; border: 1px solid #d0d5dd;
  border-radius: 6px; background: #fff; cursor: pointer; font: inherit; color: #344054;
}
.exelmj-modal-btn:hover { background: #f5f6f7; }
.exelmj-modal-btn.primary { background: #185abd; border-color: #185abd; color: #fff; }
.exelmj-modal-btn.primary:hover { background: #124b99; }
.exelmj-modal-btn.extra { margin-inline-end: auto; color: #b42318; border-color: #f2b8b5; }
`
  document.head.append(style)
}
