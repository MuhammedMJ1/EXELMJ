import { app, BrowserWindow, dialog, Menu, type MenuItemConstructorOptions } from 'electron'
import en from '../src/i18n/en.json'
import ar from '../src/i18n/ar.json'

export type Lang = 'en' | 'ar'

export interface MenuHooks {
  getWindow(): BrowserWindow | null
  sendToRenderer(action: string, payload?: unknown): void
  setLanguage(lang: Lang): void
  openRecent(file: string): void
  getRecentFiles(): string[]
  getHindiDigits(): boolean
  toggleHindiDigits(): void
  newWindow(): void
}

const strings: Record<Lang, Record<string, string>> = { en, ar }

export function buildAppMenu(lang: Lang, hooks: MenuHooks) {
  const t = (key: string) => strings[lang]?.[key] ?? strings.en[key] ?? key
  const send = (action: string, payload?: unknown) => () => hooks.sendToRenderer(action, payload)

  const recent = hooks.getRecentFiles()
  const recentItems: MenuItemConstructorOptions[] = recent.length
    ? recent.map((file) => ({ label: file, click: () => hooks.openRecent(file) }))
    : [{ label: t('noRecentFiles'), enabled: false }]

  // Edit items show the Excel shortcuts but do NOT register them as global
  // accelerators — Univer's own keyboard handlers must receive Ctrl+Z/C/V/….
  const template: MenuItemConstructorOptions[] = [
    {
      label: t('file'),
      submenu: [
        { label: t('new'), accelerator: 'CmdOrCtrl+N', click: send('new') },
        { label: t('newWindow'), accelerator: 'CmdOrCtrl+Shift+N', click: () => hooks.newWindow() },
        {
          label: t('newFromTemplate'),
          submenu: [
            { label: t('tplInvoice'), click: send('new-template', 'invoice') },
            { label: t('tplPayroll'), click: send('new-template', 'payroll') },
            { label: t('tplBudget'), click: send('new-template', 'budget') },
            { label: t('tplProject'), click: send('new-template', 'project') }
          ]
        },
        { type: 'separator' },
        { label: t('open'), accelerator: 'CmdOrCtrl+O', click: send('open') },
        { label: t('openRecent'), submenu: recentItems },
        { type: 'separator' },
        { label: t('save'), accelerator: 'CmdOrCtrl+S', click: send('save') },
        { label: t('saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: send('save-as') },
        { label: t('exportCsv'), click: send('export-csv') },
        { type: 'separator' },
        { label: t('print'), accelerator: 'CmdOrCtrl+P', click: send('print') },
        { label: t('exportPdf'), click: send('export-pdf') },
        { type: 'separator' },
        { label: t('exit'), click: () => hooks.getWindow()?.close() }
      ]
    },
    {
      label: t('edit'),
      submenu: [
        { label: t('undo'), accelerator: 'CmdOrCtrl+Z', registerAccelerator: false, click: send('undo') },
        { label: t('redo'), accelerator: 'CmdOrCtrl+Y', registerAccelerator: false, click: send('redo') },
        { type: 'separator' },
        {
          label: t('cut'),
          accelerator: 'CmdOrCtrl+X',
          registerAccelerator: false,
          click: () => hooks.getWindow()?.webContents.cut()
        },
        {
          label: t('copy'),
          accelerator: 'CmdOrCtrl+C',
          registerAccelerator: false,
          click: () => hooks.getWindow()?.webContents.copy()
        },
        {
          label: t('paste'),
          accelerator: 'CmdOrCtrl+V',
          registerAccelerator: false,
          click: () => hooks.getWindow()?.webContents.paste()
        },
        { type: 'separator' },
        { label: t('selectAll'), accelerator: 'CmdOrCtrl+A', registerAccelerator: false, click: send('select-all') },
        { type: 'separator' },
        { label: t('deleteRows'), click: send('fmt-delete-rows') },
        { label: t('deleteCols'), click: send('fmt-delete-cols') }
      ]
    },
    {
      label: t('insert'),
      submenu: [
        { label: t('insertRowAbove'), click: send('fmt-insert-rows-above') },
        { label: t('insertRowBelow'), click: send('fmt-insert-rows-below') },
        { label: t('insertColBefore'), click: send('fmt-insert-cols-before') },
        { label: t('insertColAfter'), click: send('fmt-insert-cols-after') },
        { label: t('insertSheet'), click: send('fmt-insert-sheet') },
        { type: 'separator' },
        { label: t('insertImage'), click: send('fmt-insert-image') },
        { label: t('insertLink'), click: send('fmt-insert-link') },
        { label: t('insertComment'), click: send('fmt-insert-comment') },
        { type: 'separator' },
        { label: t('insertToday'), click: send('fmt-insert-today') },
        { label: t('insertHijriToday'), click: send('fmt-insert-hijri-today') },
        { type: 'separator' },
        { label: t('chart'), click: send('insert-chart') },
        { label: t('pivotTable'), click: send('insert-pivot') },
        { label: t('pivotRefresh'), click: send('refresh-pivots') }
      ]
    },
    {
      label: t('format'),
      submenu: [
        {
          label: t('borders'),
          submenu: [
            { label: t('borderAll'), click: send('fmt-border', 'all') },
            { label: t('borderOutside'), click: send('fmt-border', 'outside') },
            { label: t('borderInside'), click: send('fmt-border', 'inside') },
            { label: t('borderTop'), click: send('fmt-border', 'top') },
            { label: t('borderBottom'), click: send('fmt-border', 'bottom') },
            { label: t('borderLeft'), click: send('fmt-border', 'left') },
            { label: t('borderRight'), click: send('fmt-border', 'right') },
            { type: 'separator' },
            { label: t('borderNone'), click: send('fmt-border', 'none') }
          ]
        },
        { type: 'separator' },
        { label: t('mergeCells'), click: send('fmt-merge') },
        { label: t('unmergeCells'), click: send('fmt-unmerge') },
        { label: t('wrapOn'), click: send('fmt-wrap-on') },
        { label: t('wrapOff'), click: send('fmt-wrap-off') },
        { type: 'separator' },
        { label: t('rowHeight'), click: send('fmt-row-height') },
        { label: t('colWidth'), click: send('fmt-col-width') },
        { type: 'separator' },
        { label: t('hideRows'), click: send('fmt-hide-rows') },
        { label: t('showAllRows'), click: send('fmt-show-rows') },
        { label: t('hideCols'), click: send('fmt-hide-cols') },
        { label: t('showAllCols'), click: send('fmt-show-cols') },
        { type: 'separator' },
        { label: t('freezeAtSelection'), click: send('fmt-freeze') },
        { label: t('unfreeze'), click: send('fmt-unfreeze') },
        { type: 'separator' },
        { label: t('clearFormat'), click: send('fmt-clear-format') },
        { label: t('clearContent'), click: send('fmt-clear-content') },
        { label: t('clearAllCells'), click: send('fmt-clear-all') }
      ]
    },
    {
      label: t('view'),
      submenu: [
        { role: 'reload', label: t('reload') },
        { role: 'toggleDevTools', label: t('toggleDevTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('resetZoom') },
        { role: 'zoomIn', label: t('zoomIn') },
        { role: 'zoomOut', label: t('zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('fullScreen') },
        { type: 'separator' },
        { label: t('sheetDirection'), click: send('toggle-sheet-rtl') },
        {
          label: t('hindiDigits'),
          type: 'checkbox',
          checked: hooks.getHindiDigits(),
          click: () => hooks.toggleHindiDigits()
        }
      ]
    },
    {
      label: t('language'),
      submenu: [
        { label: 'English', type: 'radio', checked: lang === 'en', click: () => hooks.setLanguage('en') },
        { label: 'العربية', type: 'radio', checked: lang === 'ar', click: () => hooks.setLanguage('ar') }
      ]
    },
    {
      label: t('help'),
      submenu: [
        {
          label: t('about'),
          click: () => {
            const win = hooks.getWindow()
            if (!win) return
            void dialog.showMessageBox(win, {
              type: 'info',
              title: t('appName'),
              message: t('appName'),
              detail: `${t('aboutDetail')}\n${t('version')}: ${app.getVersion()}`,
              noLink: true
            })
          }
        }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
