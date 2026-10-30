import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { Lang } from './menu'
import { detectIllustrator, extractWithIllustrator } from './illustrator'

export interface IpcHooks {
  getWindow(): BrowserWindow | null
  getSettings(): { language: Lang; recentFiles: string[]; systemFonts?: string[]; hindiDigits?: boolean }
  setLanguage(lang: Lang): void
  addRecentFile(file: string): void
  setDirty(dirty: boolean, senderWcId: number): void
  setFonts(fonts: string[]): void
  takePendingOpenFile(): string | null
  translate(key: string): string
  requestClose(): void
}

// Main owns the disk and the dialogs; the renderer owns the xlsx bytes
// (conversion happens there, milestone 2).
export function registerIpc(hooks: IpcHooks) {
  ipcMain.handle('settings:get', () => hooks.getSettings())
  ipcMain.handle('settings:set-language', (_e, lang: Lang) => hooks.setLanguage(lang))
  ipcMain.handle('app:version', () => app.getVersion())
  // Renderer pulls the "Open with" launch file once it has booted (race-free).
  ipcMain.handle('file:pending-open', () => hooks.takePendingOpenFile())

  ipcMain.on('doc:set-dirty', (e, dirty: boolean) => hooks.setDirty(!!dirty, e.sender.id))
  ipcMain.on('doc:request-close', () => hooks.requestClose())
  ipcMain.on('settings:set-fonts', (_e, fonts: unknown) => {
    if (Array.isArray(fonts) && fonts.every((f) => typeof f === 'string')) {
      hooks.setFonts(fonts as string[])
    }
  })

  ipcMain.handle('print:printers', async () => {
    const win = hooks.getWindow()
    if (!win) return []
    const printers = await win.webContents.getPrintersAsync().catch(() => [])
    return printers.map((printer) => ({ name: printer.name, label: printer.displayName || printer.name }))
  })

  // --- print / PDF: render provided HTML in a hidden window ---
  ipcMain.handle(
    'print:html',
    async (
      _e,
      html: string,
      mode: 'print' | 'pdf',
      suggestedName?: string,
      opts?: {
        preferCSSPageSize?: boolean
        landscape?: boolean
        deviceName?: string
        bands?: {
          header?: string
          footer?: string
          pageNumbers?: boolean
          rtl?: boolean
          pageLabel?: string
        }
      }
    ) => {
    const win = hooks.getWindow()
    const tmp = path.join(app.getPath('userData'), 'print-preview.html')
    await fs.promises.writeFile(tmp, String(html), 'utf8')
    const pw = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    try {
      await pw.loadFile(tmp)
      const bands = opts?.bands
      const wantsBands = !!(bands && (bands.header || bands.footer || bands.pageNumbers))
      if (mode === 'pdf') {
        if (!win) return null
        const res = await dialog.showSaveDialog(win, {
          title: hooks.translate('exportPdf'),
          defaultPath: suggestedName ?? 'sheet.pdf',
          filters: [{ name: 'PDF', extensions: ['pdf'] }]
        })
        if (res.canceled || !res.filePath) return null
        const data = await pw.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          ...(opts?.landscape ? { landscape: true } : {}),
          ...(opts?.preferCSSPageSize ? { preferCSSPageSize: true } : {}),
          // Chromium's own band is the only place a live page number exists.
          ...(wantsBands
            ? {
                displayHeaderFooter: true,
                headerTemplate: bandTemplate(bands?.header ?? '', false, !!bands?.rtl),
                footerTemplate: bandTemplate(
                  bands?.footer ?? '',
                  !!bands?.pageNumbers,
                  !!bands?.rtl,
                  bands?.pageLabel
                )
              }
            : {})
        })
        await fs.promises.writeFile(res.filePath, data)
        return res.filePath
      }
      const printOptions: Electron.WebContentsPrintOptions = {
        printBackground: true,
        ...(opts?.landscape ? { landscape: true } : {}),
        ...(bands?.header ? { header: bands.header } : {}),
        ...(bands?.footer ? { footer: bands.footer } : {}),
        ...(opts?.deviceName ? { deviceName: opts.deviceName } : {})
      }
      // A default printer that is offline makes Chromium fail with "Invalid
      // printer settings" BEFORE any dialog appears - which used to look
      // exactly like the button doing nothing. The reason now reaches the
      // renderer, which offers the printer list (never a silent fallback: an
      // unexpected device would quietly eat paper).
      await printWith(pw, printOptions)
      return 'printed'
    } finally {
      pw.destroy()
    }
  }
  )

  ipcMain.handle('file:open', async () => {
    const win = hooks.getWindow()
    if (!win) return null
    const res = await dialog.showOpenDialog(win, {
      title: hooks.translate('open'),
      filters: [
        {
          name: 'Supported',
          extensions: [
            'xlsx', 'xlsm', 'csv', 'docx', 'ai', 'svg', 'pdf',
            'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'
          ]
        },
        { name: 'Spreadsheets', extensions: ['xlsx', 'xlsm', 'csv'] },
        { name: 'Excel', extensions: ['xlsx', 'xlsm'] },
        { name: 'CSV', extensions: ['csv'] },
        { name: 'Word', extensions: ['docx'] },
        { name: 'Designs', extensions: ['ai', 'svg', 'pdf', 'eps'] },
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'avif'] }
      ],
      properties: ['openFile']
    })
    if (res.canceled || !res.filePaths[0]) return null
    return readFileForRenderer(res.filePaths[0], hooks)
  })

  ipcMain.handle('file:export-csv', async (_e, data: Uint8Array, suggestedName?: string) => {
    const win = hooks.getWindow()
    if (!win) return null
    const res = await dialog.showSaveDialog(win, {
      title: hooks.translate('exportCsv'),
      defaultPath: suggestedName ?? 'sheet.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (res.canceled || !res.filePath) return null
    await fs.promises.writeFile(res.filePath, Buffer.from(data))
    return res.filePath
  })

  // --- autosave / crash recovery (userData/autosave/) ---
  const autosaveDir = () => path.join(app.getPath('userData'), 'autosave')
  // 'sheet' keeps the original names so an autosave written by an older build
  // is still found after an update; the word document gets its own slot.
  const autosaveFile = (kind: string) =>
    path.join(autosaveDir(), kind === 'word' ? 'autosave.docx' : 'autosave.xlsx')
  const autosaveMeta = (kind: string) =>
    path.join(autosaveDir(), kind === 'word' ? 'autosave-word.json' : 'autosave.json')

  ipcMain.on('autosave:save', (_e, bytes: Uint8Array, meta: string, kind = 'sheet') => {
    try {
      fs.mkdirSync(autosaveDir(), { recursive: true })
      fs.writeFileSync(autosaveFile(kind), Buffer.from(bytes))
      fs.writeFileSync(autosaveMeta(kind), typeof meta === 'string' ? meta : '{}', 'utf8')
    } catch (err) {
      console.warn('[autosave] write failed', err)
    }
  })

  ipcMain.handle('autosave:get', async (_e, kind = 'sheet') => {
    try {
      const bytes = await fs.promises.readFile(autosaveFile(kind))
      const meta = await fs.promises.readFile(autosaveMeta(kind), 'utf8').catch(() => '{}')
      return { bytes, meta }
    } catch {
      return null
    }
  })

  ipcMain.on('autosave:clear', (_e, kind = 'sheet') => {
    try {
      fs.rmSync(autosaveFile(kind), { force: true })
      fs.rmSync(autosaveMeta(kind), { force: true })
    } catch {
      // ignore
    }
  })

  // --- Adobe Illustrator bridge (its own documented automation) ---
  ipcMain.handle('illustrator:detect', () => detectIllustrator().installed)
  ipcMain.handle('illustrator:extract', (_e, aiPath: string) => extractWithIllustrator(String(aiPath)))

  ipcMain.handle('file:read', (_e, filePath: string) => readFileForRenderer(filePath, hooks))

  ipcMain.handle('file:save', async (_e, filePath: string, data: Uint8Array) => {
    // Keep one backup of the previous version next to the file.
    try {
      if (fs.existsSync(filePath)) fs.copyFileSync(filePath, `${filePath}.bak`)
    } catch (err) {
      console.warn('[file:save] backup failed', err)
    }
    await fs.promises.writeFile(filePath, Buffer.from(data))
    hooks.addRecentFile(filePath)
    return true
  })

  // Silent pair for auxiliary files (design sidecars, font bytes): no dialogs
  // and NO recent-files entry — readFileForRenderer would pollute the menu.
  ipcMain.handle('file:read-silent', async (_e, filePath: string) => {
    try {
      const bytes = await fs.promises.readFile(filePath)
      return { path: filePath, bytes }
    } catch {
      return null
    }
  })
  ipcMain.handle('file:write-silent', async (_e, filePath: string, data: Uint8Array) => {
    try {
      await fs.promises.writeFile(filePath, Buffer.from(data))
      return true
    } catch (err) {
      console.warn('[write-silent] failed', err)
      return false
    }
  })

  ipcMain.handle(
    'file:save-as',
    async (
      _e,
      data: Uint8Array,
      suggestedName?: string,
      kind?: 'xlsx' | 'docx' | 'pdf' | 'png' | 'svg' | 'data'
    ) => {
    const win = hooks.getWindow()
    if (!win) return null
    const filtersByKind: Record<string, Electron.FileFilter[]> = {
      docx: [{ name: 'Word', extensions: ['docx'] }],
      pdf: [{ name: 'PDF', extensions: ['pdf'] }],
      png: [{ name: 'PNG', extensions: ['png'] }],
      svg: [{ name: 'SVG', extensions: ['svg'] }],
      xlsx: [
        { name: 'Excel', extensions: ['xlsx'] },
        { name: 'Excel Macro-Enabled', extensions: ['xlsm'] }
      ],
      // Studio's plain-data exports (tokens.json, tokens.css, palette.ase).
      // They keep whatever extension the caller suggested, so the filter must
      // not force one — without this they fell through to the xlsx default and
      // a token file was offered as a spreadsheet.
      data: [{ name: 'All files', extensions: ['*'] }]
    }
    const defaultByKind: Record<string, string> = {
      docx: 'document.docx',
      pdf: 'design.pdf',
      png: 'design.png',
      svg: 'design.svg',
      xlsx: 'workbook.xlsx',
      data: 'export.json'
    }
    const k = kind && filtersByKind[kind] ? kind : 'xlsx'
    const res = await dialog.showSaveDialog(win, {
      title: hooks.translate('saveAs'),
      defaultPath: suggestedName ?? defaultByKind[k],
      filters: filtersByKind[k]
    })
    if (res.canceled || !res.filePath) return null
    // Same courtesy as file:save — keep a .bak when overwriting an existing file.
    try {
      if (fs.existsSync(res.filePath)) fs.copyFileSync(res.filePath, `${res.filePath}.bak`)
    } catch (err) {
      console.warn('[save-as] backup failed', err)
    }
    await fs.promises.writeFile(res.filePath, Buffer.from(data))
    hooks.addRecentFile(res.filePath)
    return res.filePath
  }
  )
}

function printWith(pw: BrowserWindow, options: Electron.WebContentsPrintOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    pw.webContents.print(options, (ok, reason) =>
      ok ? resolve() : reject(new Error(reason || 'cancelled'))
    )
  })
}

/** "صفحة {0} من {1}" with Chromium's own counters dropped into the slots. */
function pageNumberHtml(pageLabel: string | undefined, esc: (value: string) => string): string {
  const current = '<span class="pageNumber"></span>'
  const total = '<span class="totalPages"></span>'
  if (!pageLabel || !pageLabel.includes('{0}')) return current
  return esc(pageLabel)
    .replace('{0}', current)
    .replace('{1}', total)
}

/** Chromium header/footer template: plain text plus an optional page number. */
function bandTemplate(
  text: string,
  withPageNumber: boolean,
  rtl: boolean,
  pageLabel?: string
): string {
  const esc = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const parts: string[] = []
  if (text) parts.push(esc(text))
  // Chromium fills the .pageNumber / .totalPages spans itself while it
  // paginates - the only place "page 3 of 7" can be counted.
  if (withPageNumber) parts.push(pageNumberHtml(pageLabel, esc))
  const body = parts.join(' &nbsp;-&nbsp; ')
  return (
    '<div style="width:100%;font-size:9px;font-family:Arial,sans-serif;color:#444;' +
    'padding:0 12mm;direction:' +
    (rtl ? 'rtl' : 'ltr') +
    ';text-align:' +
    (rtl ? 'right' : 'left') +
    ';">' +
    (body || '<span></span>') +
    '</div>'
  )
}

async function readFileForRenderer(filePath: string, hooks: IpcHooks) {
  const bytes = await fs.promises.readFile(filePath)
  hooks.addRecentFile(filePath)
  return { path: filePath, bytes }
}
