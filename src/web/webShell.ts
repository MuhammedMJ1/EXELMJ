// The web edition's menu: the desktop app's native menu bar, as a side drawer.
//
// A phone has no menu bar, so this drawer carries the same entries as
// electron/menu.ts and fires the SAME action names through the app's one
// onMenu dispatcher in src/main.ts — nothing is re-implemented, only the way
// in. Sheet-only sections hide while the Documents page is showing (the
// dispatcher ignores them there anyway). Electron-only items (new window,
// exit, dev tools, window zoom) have no place here.
//
// Lives on <body>, outside the mirrored sheet host (house rule for anything
// interactive while RTL sheets are mirrored).
import { t } from '../i18n/i18n'
import { askForm } from '../word/askForm'
import { currentMode } from '../word/modeToggle'
import type { RecentFile, WebLang } from './webStore'

type Dispatch = (action: string, payload?: unknown) => void

export type ShellHooks = {
  dispatch: Dispatch
  recent(): Promise<RecentFile[]>
  openRecent(file: RecentFile): void
  language: WebLang
  setLanguage(lang: WebLang): void
  hindiDigits(): boolean
  setHindiDigits(on: boolean): void
  version: string
}

type Item = {
  label: string
  action?: string
  payload?: unknown
  run?: () => void
  children?: Item[]
  checked?: boolean
}
type Section = { title: string; items: Item[]; sheetOnly?: boolean }

// --- toast -------------------------------------------------------------------

let toastEl: HTMLDivElement | null = null
let toastTimer = 0

/** A short note at the bottom of the screen ("Saved.", "Downloaded."). */
export function toast(message: string) {
  injectCss()
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.id = 'exelmj-web-toast'
    toastEl.setAttribute('role', 'status')
    document.body.append(toastEl)
  }
  toastEl.textContent = message
  toastEl.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastEl?.classList.remove('show'), 3200)
}

// --- install prompt (Chrome's "Add to Home screen") --------------------------

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let installPrompt: InstallPrompt | null = null
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installPrompt = e as InstallPrompt
})
window.addEventListener('appinstalled', () => {
  installPrompt = null
})

// --- the drawer --------------------------------------------------------------

let hooks: ShellHooks | null = null
let button: HTMLButtonElement | null = null
let overlay: HTMLDivElement | null = null

export function initWebShell(h: ShellHooks) {
  hooks = h
  if (button) return
  injectCss()
  mountAppBar()
  button = document.createElement('button')
  button.id = 'exelmj-web-menu-btn'
  button.type = 'button'
  button.setAttribute('aria-label', t('webMenu'))
  button.innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>'
  button.addEventListener('click', () => void openDrawer())
  document.body.append(button)
}

/**
 * Phones only (see phoneLayout): the band across the top behind the mode pill
 * and the menu button, with the open file's name between them — a phone shows
 * no window title, and the name (with its unsaved star) is worth the room.
 */
function mountAppBar() {
  const bar = document.createElement('div')
  bar.id = 'exelmj-web-appbar'
  const name = document.createElement('div')
  name.className = 'name'
  bar.append(name)
  document.body.append(bar)
  // "* report.xlsx — EXELMJ" → "* report.xlsx"
  const sync = () => {
    name.textContent = document.title.replace(/\s+—\s+[^—]*$/, '')
  }
  sync()
  const titleEl = document.querySelector('title')
  if (titleEl) new MutationObserver(sync).observe(titleEl, { childList: true, characterData: true, subtree: true })
}

function sections(h: ShellHooks, recent: RecentFile[]): Section[] {
  const send = (action: string, payload?: unknown) => ({ action, payload })
  const file: Item[] = [
    { label: t('new'), ...send('new') },
    { label: t('open'), ...send('open') },
    {
      label: t('openRecent'),
      children: recent.length
        ? recent.map((f) => ({ label: f.name, run: () => h.openRecent(f) }))
        : [{ label: t('noRecentFiles') }]
    },
    { label: t('save'), ...send('save') },
    { label: t('saveAs'), ...send('save-as') },
    { label: t('print'), ...send('print') },
    { label: t('exportPdf'), ...send('export-pdf') }
  ]
  if (currentMode() === 'sheet') {
    file.splice(1, 0, {
      label: t('newFromTemplate'),
      children: [
        { label: t('tplInvoice'), ...send('new-template', 'invoice') },
        { label: t('tplPayroll'), ...send('new-template', 'payroll') },
        { label: t('tplBudget'), ...send('new-template', 'budget') },
        { label: t('tplProject'), ...send('new-template', 'project') }
      ]
    })
    file.splice(file.length - 2, 0, { label: t('exportCsv'), ...send('export-csv') })
  }
  if (installPrompt) {
    file.push({
      label: t('webInstall'),
      run: () => {
        const p = installPrompt
        installPrompt = null
        void p?.prompt()
      }
    })
  }
  return [
    { title: t('file'), items: file },
    {
      title: t('edit'),
      items: [
        { label: t('undo'), ...send('undo') },
        { label: t('redo'), ...send('redo') },
        ...(currentMode() === 'sheet'
          ? [
              { label: t('deleteRows'), ...send('fmt-delete-rows') },
              { label: t('deleteCols'), ...send('fmt-delete-cols') }
            ]
          : [])
      ]
    },
    {
      title: t('insert'),
      sheetOnly: true,
      items: [
        { label: t('insertRowAbove'), ...send('fmt-insert-rows-above') },
        { label: t('insertRowBelow'), ...send('fmt-insert-rows-below') },
        { label: t('insertColBefore'), ...send('fmt-insert-cols-before') },
        { label: t('insertColAfter'), ...send('fmt-insert-cols-after') },
        { label: t('insertSheet'), ...send('fmt-insert-sheet') },
        { label: t('insertImage'), ...send('fmt-insert-image') },
        { label: t('insertLink'), ...send('fmt-insert-link') },
        { label: t('insertComment'), ...send('fmt-insert-comment') },
        { label: t('insertToday'), ...send('fmt-insert-today') },
        { label: t('insertHijriToday'), ...send('fmt-insert-hijri-today') },
        { label: t('chart'), ...send('insert-chart') },
        { label: t('pivotTable'), ...send('insert-pivot') },
        { label: t('pivotRefresh'), ...send('refresh-pivots') }
      ]
    },
    {
      title: t('format'),
      sheetOnly: true,
      items: [
        {
          label: t('borders'),
          children: [
            { label: t('borderAll'), ...send('fmt-border', 'all') },
            { label: t('borderOutside'), ...send('fmt-border', 'outside') },
            { label: t('borderInside'), ...send('fmt-border', 'inside') },
            { label: t('borderTop'), ...send('fmt-border', 'top') },
            { label: t('borderBottom'), ...send('fmt-border', 'bottom') },
            { label: t('borderLeft'), ...send('fmt-border', 'left') },
            { label: t('borderRight'), ...send('fmt-border', 'right') },
            { label: t('borderNone'), ...send('fmt-border', 'none') }
          ]
        },
        { label: t('mergeCells'), ...send('fmt-merge') },
        { label: t('unmergeCells'), ...send('fmt-unmerge') },
        { label: t('wrapOn'), ...send('fmt-wrap-on') },
        { label: t('wrapOff'), ...send('fmt-wrap-off') },
        { label: t('rowHeight'), ...send('fmt-row-height') },
        { label: t('colWidth'), ...send('fmt-col-width') },
        { label: t('hideRows'), ...send('fmt-hide-rows') },
        { label: t('showAllRows'), ...send('fmt-show-rows') },
        { label: t('hideCols'), ...send('fmt-hide-cols') },
        { label: t('showAllCols'), ...send('fmt-show-cols') },
        { label: t('freezeAtSelection'), ...send('fmt-freeze') },
        { label: t('unfreeze'), ...send('fmt-unfreeze') },
        { label: t('clearFormat'), ...send('fmt-clear-format') },
        { label: t('clearContent'), ...send('fmt-clear-content') },
        { label: t('clearAllCells'), ...send('fmt-clear-all') }
      ]
    },
    {
      title: t('view'),
      items: [
        ...(currentMode() === 'sheet' ? [{ label: t('sheetDirection'), ...send('toggle-sheet-rtl') }] : []),
        {
          label: t('hindiDigits'),
          checked: h.hindiDigits(),
          run: () => h.setHindiDigits(!h.hindiDigits())
        }
      ]
    },
    {
      title: t('language'),
      items: [
        { label: 'English', checked: h.language === 'en', run: () => h.language !== 'en' && h.setLanguage('en') },
        { label: 'العربية', checked: h.language === 'ar', run: () => h.language !== 'ar' && h.setLanguage('ar') }
      ]
    },
    {
      title: t('help'),
      items: [
        {
          label: t('about'),
          run: () =>
            void askForm(t('appName'), [
              { key: 'note', label: `${t('aboutDetail')}\n${t('version')}: ${h.version}`, type: 'note' }
            ])
        }
      ]
    }
  ]
}

function closeDrawer() {
  overlay?.remove()
  overlay = null
}

async function openDrawer() {
  const h = hooks
  if (!h || overlay) return
  const recent = await h.recent().catch(() => [] as RecentFile[])

  overlay = document.createElement('div')
  overlay.id = 'exelmj-web-drawer'
  overlay.dir = document.documentElement.dir || 'rtl'
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeDrawer()
  })

  const panel = document.createElement('nav')
  panel.className = 'panel'
  panel.setAttribute('aria-label', t('webMenu'))

  const head = document.createElement('div')
  head.className = 'head'
  const title = document.createElement('div')
  title.className = 'title'
  // The window title carries the file name and the unsaved star — the phone
  // shows no title bar, so the drawer shows it.
  title.textContent = document.title
  head.append(title)
  panel.append(head)

  const activate = (item: Item) => {
    closeDrawer()
    if (item.run) item.run()
    else if (item.action) h.dispatch(item.action, item.payload)
  }

  const renderItems = (host: HTMLElement, items: Item[]) => {
    for (const item of items) {
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'item'
      const label = document.createElement('span')
      label.textContent = item.label
      row.append(label)
      if (item.checked !== undefined) {
        const mark = document.createElement('span')
        mark.className = 'mark'
        mark.textContent = item.checked ? '✓' : ''
        row.append(mark)
      }
      if (item.children) {
        row.classList.add('parent')
        const sub = document.createElement('div')
        sub.className = 'sub'
        sub.hidden = true
        renderItems(sub, item.children)
        row.addEventListener('click', () => {
          sub.hidden = !sub.hidden
          row.classList.toggle('open', !sub.hidden)
        })
        host.append(row, sub)
      } else {
        row.addEventListener('click', () => activate(item))
        host.append(row)
      }
    }
  }

  const isSheet = currentMode() === 'sheet'
  for (const section of sections(h, recent)) {
    if (section.sheetOnly && !isSheet) continue
    const block = document.createElement('div')
    block.className = 'section'
    const heading = document.createElement('div')
    heading.className = 'heading'
    heading.textContent = section.title
    block.append(heading)
    renderItems(block, section.items)
    panel.append(block)
  }

  overlay.append(panel)
  document.body.append(overlay)
}

function injectCss() {
  if (document.getElementById('exelmj-web-shell-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-web-shell-style'
  style.textContent = `
#exelmj-web-menu-btn {
  position: fixed; top: 5px; inset-inline-end: 8px; z-index: 1100;
  width: 32px; height: 30px; display: grid; place-items: center;
  border: 1px solid #d0d5dd; border-radius: 15px; background: #e4e7ec; color: #344054;
  box-shadow: 0 1px 3px rgba(16, 24, 40, 0.12); cursor: pointer; padding: 0;
}
#exelmj-web-menu-btn:active { background: #d0d5dd; }
#exelmj-web-drawer {
  position: fixed; inset: 0; z-index: 2000; background: rgba(16, 24, 40, 0.35);
  display: flex; justify-content: flex-end;
  font: 15px 'Segoe UI', Tahoma, sans-serif; color: #101828;
}
#exelmj-web-drawer .panel {
  width: min(86vw, 340px); height: 100%; overflow-y: auto; background: #fff;
  box-shadow: 0 0 24px rgba(16, 24, 40, 0.25); padding-bottom: 24px;
  animation: exelmj-drawer-in 0.16s ease-out;
}
@keyframes exelmj-drawer-in { from { opacity: 0.3; } }
#exelmj-web-drawer .head {
  position: sticky; top: 0; background: #1e7145; color: #fff; padding: 14px 16px; z-index: 1;
}
#exelmj-web-drawer .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#exelmj-web-drawer .section { padding: 6px 0; border-bottom: 1px solid #eaecf0; }
#exelmj-web-drawer .heading { padding: 8px 16px 4px; font-size: 12px; font-weight: 600; color: #667085; }
#exelmj-web-drawer .item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  width: 100%; min-height: 46px; padding: 0 16px; border: 0; background: transparent;
  font: inherit; color: inherit; text-align: start; cursor: pointer;
}
#exelmj-web-drawer .item:active { background: #f2f4f7; }
#exelmj-web-drawer .item.parent::after { content: '▾'; color: #667085; font-size: 12px; }
#exelmj-web-drawer .item.parent.open::after { content: '▴'; }
#exelmj-web-drawer .item .mark { color: #1e7145; font-weight: 700; }
#exelmj-web-drawer .sub { background: #f9fafb; }
#exelmj-web-drawer .sub .item { padding-inline-start: 32px; min-height: 44px; }
#exelmj-web-toast {
  position: fixed; left: 50%; bottom: 64px; z-index: 2100; transform: translate(-50%, 20px);
  max-width: min(92vw, 420px); padding: 10px 16px; border-radius: 10px;
  background: #101828; color: #fff; font: 14px 'Segoe UI', Tahoma, sans-serif; text-align: center;
  opacity: 0; pointer-events: none; transition: opacity 0.2s, transform 0.2s;
}
#exelmj-web-toast.show { opacity: 1; transform: translate(-50%, 0); }
#exelmj-web-appbar { display: none; }
@media (max-width: 767px) {
  #exelmj-web-appbar {
    display: block; position: fixed; top: 0; inset-inline: 0; height: 40px; z-index: 1090;
    background: #fff; border-bottom: 1px solid #e4e7ec;
  }
  /* between the two-way mode pill (10 + 168 px) and the menu button (8 + 32 px) */
  #exelmj-web-appbar .name {
    position: absolute; top: 0; bottom: 0; inset-inline-start: 186px; inset-inline-end: 48px;
    line-height: 40px; text-align: center;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    font: 600 13px 'Segoe UI', Tahoma, sans-serif; color: #344054;
  }
}
`
  document.head.append(style)
}
