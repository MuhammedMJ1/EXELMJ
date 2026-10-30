// The mode switch the manager asked for: a rounded sliding pill, fixed at the
// window's top corner, flipping between the app's tools — the sheet app
// (#app / Univer), the word app (#word-app / TipTap), the design app
// (#design-app / artwork overlay) and the photo app (#photo-app / layers).
// The knob slides with an eased transform; the active label is highlighted.
// Lives on <body>, outside the mirrored sheet host (house rule for anything
// interactive while RTL sheets are mirrored).
import { t } from '../i18n/i18n'

export type AppMode = 'sheet' | 'word' | 'design' | 'photo'

// The web edition (vite.web.config.ts) carries Sheets + Documents only.
const ORDER: AppMode[] =
  import.meta.env.VITE_WEB === '1' ? ['sheet', 'word'] : ['sheet', 'word', 'design', 'photo']
const HOST_ID: Record<AppMode, string> = {
  sheet: 'app',
  word: 'word-app',
  design: 'design-app',
  photo: 'photo-app'
}

let mode: AppMode = 'sheet'
let pill: HTMLDivElement | null = null
let knob: HTMLDivElement | null = null
const labels = new Map<AppMode, HTMLButtonElement>()
let hooks: { enterWord?: () => void; enterSheet?: () => void; enterDesign?: () => void; enterPhoto?: () => void } = {}
let sheetTitle = ''

export function currentMode(): AppMode {
  return mode
}

export function initModeToggle(h: typeof hooks) {
  hooks = h
  if (pill) return
  injectCss()

  pill = document.createElement('div')
  pill.id = 'exelmj-mode-pill'
  pill.setAttribute('role', 'tablist')

  knob = document.createElement('div')
  knob.className = 'knob'
  pill.append(knob)

  const names: Record<AppMode, string> = {
    sheet: t('modeSheets'),
    word: t('modeDocs'),
    design: t('modeDesigns'),
    photo: t('modePhoto')
  }
  for (const m of ORDER) {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = names[m]
    b.setAttribute('role', 'tab')
    b.addEventListener('click', () => setMode(m))
    pill.append(b)
    labels.set(m, b)
  }

  document.body.append(pill)
  applyVisual()
}

export function setMode(next: AppMode) {
  if (next === mode) return
  const prev = mode
  mode = next
  const show = document.getElementById(HOST_ID[next])
  if (!show) return
  if (prev === 'sheet') sheetTitle = document.title
  for (const m of ORDER) {
    const host = document.getElementById(HOST_ID[m])
    if (!host) continue
    if (m === 'sheet') host.style.display = m === next ? '' : 'none'
    else host.classList.toggle('visible', m === next)
  }
  if (next === 'sheet') {
    if (sheetTitle) document.title = sheetTitle
    hooks.enterSheet?.()
    // Univer repaints text through the RTL mirror on resize.
    window.dispatchEvent(new Event('resize'))
  } else if (next === 'word') {
    hooks.enterWord?.()
  } else if (next === 'design') {
    hooks.enterDesign?.()
  } else {
    hooks.enterPhoto?.()
  }
  applyVisual()
}

function applyVisual() {
  if (!pill || !knob) return
  const idx = ORDER.indexOf(mode)
  // N equal segments; logical positioning keeps it correct in both UI dirs
  const segment = 100 / ORDER.length
  knob.style.insetInlineStart = `calc(${idx * segment}% + 3px)`
  for (const [m, btn] of labels) btn.classList.toggle('active', m === mode)
}

function injectCss() {
  if (document.getElementById('exelmj-mode-pill-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-mode-pill-style'
  style.textContent = `
#exelmj-mode-pill {
  position: fixed; top: 5px; inset-inline-start: 10px; z-index: 1100;
  display: flex; align-items: stretch; width: ${ORDER.length * 84}px; height: 30px;
  background: #e4e7ec; border: 1px solid #d0d5dd; border-radius: 15px;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.12); overflow: hidden;
  user-select: none;
}
#exelmj-mode-pill .knob {
  position: absolute; top: 3px; bottom: 3px; width: calc(${100 / ORDER.length}% - 6px);
  inset-inline-start: 3px; background: #ffffff; border-radius: 12px;
  box-shadow: 0 1px 4px rgba(16, 24, 40, 0.25);
  transition: inset-inline-start 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
#exelmj-mode-pill button {
  position: relative; z-index: 1; flex: 1; border: 0; background: transparent;
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #475467; cursor: pointer;
  border-radius: 15px; padding: 0;
}
#exelmj-mode-pill button.active { color: #0f6cbd; font-weight: 600; }
`
  document.head.append(style)
}
