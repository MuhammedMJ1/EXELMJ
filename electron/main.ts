import { app, BrowserWindow, dialog, ipcMain, Menu, session } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { buildAppMenu, type Lang } from './menu'
import { registerIpc } from './ipc'
import { startMcpServer } from './studio/mcpServer'
import { registerStudioScheme } from './studio/studioProtocol'
import { registerBrowserIpc } from './studio/browserIpc'
import type { ToolResult } from './studio/mcpProtocol'
import en from '../src/i18n/en.json'
import ar from '../src/i18n/ar.json'

interface Settings {
  language: Lang
  recentFiles: string[]
  systemFonts?: string[]
  hindiDigits?: boolean
}

const DEFAULT_SETTINGS: Settings = { language: 'en', recentFiles: [] }

/**
 * Ask a renderer to run an MCP tool.
 *
 * The renderer answers on a one-shot reply channel keyed by a call id, because
 * several tool calls can be in flight at once and a shared channel would let
 * one answer resolve another's promise. The timeout is what stops a renderer
 * that crashed mid-tool from leaving the MCP client waiting forever.
 */
function callRendererTool(
  target: BrowserWindow,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  return new Promise((resolve) => {
    const callId = `mcp-${++mcpCallSeq}`
    const channel = `studio:tool-result:${callId}`
    const timer = setTimeout(() => {
      ipcMain.removeAllListeners(channel)
      resolve({ ok: false, code: 'INTERNAL', detail: 'The design window did not answer in time.' })
    }, 60_000)
    ipcMain.once(channel, (_e, result: ToolResult) => {
      clearTimeout(timer)
      resolve(result)
    })
    target.webContents.send('studio:tool-call', { callId, name, args })
  })
}

let mcpCallSeq = 0
const MAX_RECENT = 8

let win: BrowserWindow | null = null
let settings: Settings = { ...DEFAULT_SETTINGS }
// One entry per open window: `win` tracks the FOCUSED one (menu actions and
// dialogs go there), the set owns them all.
const windows = new Set<BrowserWindow>()
/** The MCP server, so Claude can drive Studio. Started after the app is ready
 * and torn down on quit — a stale connection file would point a client at a
 * port nothing is listening on. */
let mcp: { close(): Promise<void> } | null = null
const dirtyByWc = new Map<number, boolean>()
const closingForced = new WeakSet<BrowserWindow>()
const anyDirty = () => [...dirtyByWc.values()].some(Boolean)
// A spreadsheet path passed on the command line (Windows "Open with" / double
// click) that the renderer will pull once it has booted (race-free).
let pendingOpenFile: string | null = null

const OPENABLE_EXT = new Set([
  '.xlsx', '.xlsm', '.csv', '.docx', '.ai', '.svg', '.pdf', '.eps',
  // static pictures open in the design page (renderer routes them there)
  '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif'
])

function resolveOpenable(candidate: string, cwd: string): string | null {
  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate)
  try {
    if (OPENABLE_EXT.has(path.extname(resolved).toLowerCase()) && fs.statSync(resolved).isFile()) {
      return resolved
    }
  } catch {
    // not a real file
  }
  return null
}

/** First existing openable file in an argv list (skips flags, resolves cwd).
 * A caller that forgets to QUOTE a path with spaces delivers it as several
 * argv entries ("E:\control", "table", "design-01.jpg") — proven by a main
 * log during 0.2.2 testing — so after the per-entry pass, consecutive
 * non-flag entries are re-joined and tried as one path. */
function fileFromArgv(argv: string[], cwd: string): string | null {
  const args = argv.slice(1).filter((a) => a && !a.startsWith('-'))
  for (const arg of args) {
    const hit = resolveOpenable(arg, cwd)
    if (hit) return hit
  }
  for (let from = 0; from < args.length; from++) {
    for (let to = args.length; to > from + 1; to--) {
      const hit = resolveOpenable(args.slice(from, to).join(' '), cwd)
      if (hit) return hit
    }
  }
  return null
}

const strings: Record<Lang, Record<string, string>> = { en, ar }
const t = (key: string) => strings[settings.language]?.[key] ?? strings.en[key] ?? key

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json')
}

function loadSettings() {
  try {
    settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }
  } catch {
    settings = { ...DEFAULT_SETTINGS }
  }
}

function persistSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf8')
  } catch (err) {
    console.error('[settings] write failed', err)
  }
}

function sendToRenderer(action: string, payload?: unknown) {
  win?.webContents.send('menu', action, payload)
}

function refreshMenu() {
  buildAppMenu(settings.language, {
    getWindow: () => win,
    sendToRenderer,
    setLanguage,
    openRecent: (file) => sendToRenderer('open-path', file),
    newWindow: () => createWindow(),
    getRecentFiles: () => settings.recentFiles,
    getHindiDigits: () => !!settings.hindiDigits,
    toggleHindiDigits: () => {
      settings.hindiDigits = !settings.hindiDigits
      persistSettings()
      refreshMenu()
      sendToRenderer('set-hindi', settings.hindiDigits)
    }
  })
}

function setLanguage(lang: Lang) {
  if (settings.language === lang) return
  // The switch reloads every renderer, dropping unsaved documents — ask first.
  if (anyDirty() && win) {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      title: t('unsavedTitle'),
      message: t('unsavedMessage'),
      buttons: [t('cancelButton'), t('dontSaveButton')],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    })
    if (choice !== 1) {
      refreshMenu() // restore the language checkmarks the click just flipped
      return
    }
    dirtyByWc.clear()
  }
  settings.language = lang
  persistSettings()
  refreshMenu()
  for (const w of windows) w.webContents.reload()
}

function addRecentFile(file: string) {
  settings.recentFiles = [file, ...settings.recentFiles.filter((f) => f !== file)].slice(0, MAX_RECENT)
  persistSettings()
  refreshMenu()
}

async function confirmClose(): Promise<'save' | 'discard' | 'cancel'> {
  if (!win) return 'discard'
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    title: t('unsavedTitle'),
    message: t('unsavedMessage'),
    buttons: [t('saveButton'), t('dontSaveButton'), t('cancelButton')],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  })
  return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
}

function createWindow() {
  const w = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#f5f6f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // The word editor is a real contenteditable, so Chromium's checker works
      // there; the sheet is canvas and never sees a squiggle either way.
      spellcheck: true
    }
  })

  // Prefer the UI language, fall back to English — Chromium ships no Arabic
  // dictionary, so asking for one that is not available would throw.
  try {
    const available = w.webContents.session.availableSpellCheckerLanguages
    const wanted = ['ar', 'ar-SA', 'en-US', 'en-GB'].filter((lang) => available.includes(lang))
    if (wanted.length) w.webContents.session.setSpellCheckerLanguages(wanted.slice(0, 2))
  } catch (err) {
    console.warn('[spellcheck] language setup failed', err)
  }

  // Only the spelling menu: the grid and the design canvas keep their own
  // context menus, and a misspelling is the one case they do not handle.
  w.webContents.on('context-menu', (_event, params) => {
    if (!params.misspelledWord) return
    const menu = Menu.buildFromTemplate([
      ...params.dictionarySuggestions.slice(0, 6).map((suggestion) => ({
        label: suggestion,
        click: () => w.webContents.replaceMisspelling(suggestion)
      })),
      ...(params.dictionarySuggestions.length ? [{ type: 'separator' as const }] : []),
      {
        label: t('wordAddToDictionary'),
        click: () =>
          w.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      }
    ])
    menu.popup({ window: w })
  })

  windows.add(w)
  win = w
  // Captured NOW, while the window is alive. The 'closed' handler below runs
  // AFTER the native window is destroyed, and reading `w.webContents` there
  // throws "Object has been destroyed" — an uncaught exception in the main
  // process, which Electron shows as a crash dialog. This is the whole fix.
  const wcId = w.webContents.id
  w.on('focus', () => {
    win = w
  })
  w.once('ready-to-show', () => w.show())

  w.on('close', (event) => {
    if (!dirtyByWc.get(w.webContents.id) || closingForced.has(w)) return
    event.preventDefault()
    void confirmClose().then((choice) => {
      if (choice === 'discard') {
        closingForced.add(w)
        w.close()
      } else if (choice === 'save') {
        // That window's renderer saves, calls setDirty(false), then asks to
        // close again (wired in M2).
        w.webContents.send('menu', 'save-then-close')
      }
    })
  })

  w.on('closed', () => {
    // NOTHING here may touch `w`'s native side — it is already destroyed.
    // `windows.delete(w)` and the identity check are fine because they only
    // compare the JS object reference; `wcId` was captured at creation.
    dirtyByWc.delete(wcId)
    windows.delete(w)
    if (win === w) win = windows.values().next().value ?? null
  })

  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) void w.loadURL(devUrl)
  else void w.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'))
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv, workingDirectory) => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
      // Opening a file while EXELMJ is already running (double click / "Open
      // with"): the renderer is up, so hand it straight to the open flow.
      const file = fileFromArgv(argv, workingDirectory || process.cwd())
      if (file) sendToRenderer('open-path', file)
    }
  })

  // MUST run before the app is ready: registerSchemesAsPrivileged is refused
  // afterwards, and studio:// would then be an opaque origin with no storage,
  // no modules and no secure context — behaving nothing like the https:// the
  // generated project is eventually deployed to.
  registerStudioScheme()

  void app.whenReady().then(() => {
    loadSettings()
    // Launched via double click / "Open with": remember the file for the
    // renderer to pull once it has booted (boot is async — pushing now races).
    pendingOpenFile = fileFromArgv(process.argv, process.cwd())

    // Univer's toolbar copy/paste uses the async clipboard API — grant it silently.
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(
        ['clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'local-fonts'].includes(permission)
      )
    })
    session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
      ['clipboard-read', 'clipboard-sanitized-write', 'local-fonts'].includes(permission)
    )

    registerIpc({
      getWindow: () => win,
      getSettings: () => settings,
      setLanguage,
      addRecentFile,
      setDirty: (d, wcId) => {
        dirtyByWc.set(wcId, d)
      },
      setFonts: (fonts) => {
        settings.systemFonts = fonts
        persistSettings()
      },
      takePendingOpenFile: () => {
        const f = pendingOpenFile
        pendingOpenFile = null
        return f
      },
      translate: t,
      requestClose: () => {
        if (win) closingForced.add(win)
        win?.close()
      }
    })

    registerBrowserIpc({
      // esbuild emits the guest preload beside main.cjs, mirroring its source
      // path — a bare filename here would resolve against the wrong directory
      // in the packaged app.
      guestPreload: path.join(__dirname, 'studio', 'guestPreload.cjs'),
      translate: t
    })

    // The MCP server hands Studio to Claude. It forwards every tool call to
    // the FOCUSED window's renderer, which is the only place the open document
    // lives — a second copy in main would drift from what the user sees.
    void startMcpServer({
      userDataDir: app.getPath('userData'),
      appVersion: app.getVersion(),
      callTool: async (name, args) => {
        const target = win ?? [...windows][0]
        if (!target || target.isDestroyed()) {
          return { ok: false, code: 'NOT_RUNNING', detail: 'No EXELMJ window is open.' }
        }
        return callRendererTool(target, name, args)
      }
    })
      .then((server) => {
        mcp = server
        console.log(`[mcp] listening on 127.0.0.1:${server.port}`)
      })
      .catch((e) => {
        // A failed MCP server must not stop the app from being a design tool.
        console.warn('[mcp] could not start:', e)
      })

    refreshMenu()
    createWindow()
  })

  app.on('window-all-closed', () => app.quit())

  // Tear the MCP server down on the way out. A stale connection file would
  // point the next client at a port nothing is listening on, and the shim
  // would report a confusing connection refusal instead of "not running".
  app.on('will-quit', () => {
    void mcp?.close()
    mcp = null
  })
}
