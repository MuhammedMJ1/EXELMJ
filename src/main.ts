import { initI18n, type Lang } from './i18n/i18n'
import { setupUniver } from './univer/setup'
import { DocController } from './doc/docController'
import { ChartManager } from './charts/chartManager'
import { ChartFloat, bindChartManager } from './charts/ChartFloat'
import { ChartDialog } from './charts/chartDialog'
import { initRtlMirror, refreshRtlMirror, setHindiDigits } from './univer/rtlMirror'
import { initRtlAlign } from './univer/rtlAlign'
import { initFindAllSheets } from './univer/findAllSheets'
import { initRtlDropdown } from './univer/rtlDropdown'
import { initTouchSheet } from './univer/touchSheet'
import { currentMode, initModeToggle, setMode } from './word/modeToggle'
import { isDesignDirty, isPhotoDirty, isSheetDirty } from './word/dirtyMux'
import { runStudioTool, type DocumentView } from './studio/mcpHandlers'
import type { WordApp } from './word/wordApp'
import { usableFonts } from './word/fonts'
import type { DesignApp } from './design/designApp'
import type { PhotoApp } from './photo/photoApp'
import { initFormulaBarFix } from './univer/formulaBarFix'
import { initRtlEditor, refreshRtlOverlay } from './univer/rtlEditor'
import { registerHijriFunctions } from './univer/hijri'
import { PivotManager } from './pivot/pivotManager'
import { PivotDialog } from './pivot/pivotDialog'
import { FormatActions, type BorderChoice } from './format/formatActions'
import { t } from './i18n/i18n'

/**
 * The web edition (vite.web.config.ts) is Sheets + Documents only: this
 * build-time flag drops the Design and Photo pages and the Studio bridge from
 * that bundle. The desktop build never defines it.
 */
const WEB = import.meta.env.VITE_WEB === '1'

async function boot() {
  // Design-mode shortcuts must be registered BEFORE Univer boots: capture
  // listeners run in registration order, and Univer swallows Ctrl+Z / Delete
  // even while its grid is hidden. The design app fills the hook on mount.
  window.addEventListener(
    'keydown',
    (e) => {
      const hook = (window as unknown as { __exelmjDesignKeys?: (ev: KeyboardEvent) => void })
        .__exelmjDesignKeys
      hook?.(e)
    },
    { capture: true }
  )
  // Bridge is absent when previewing in a plain browser — fall back to English
  // (or ?lang=ar for browser-based verification of the Arabic UI).
  const urlLang = new URLSearchParams(location.search).get('lang')
  const settings = (await window.exelmj?.getSettings()) ?? {
    language: (urlLang === 'ar' ? 'ar' : 'en') as Lang,
    recentFiles: []
  }
  initI18n(settings.language)

  // Installed fonts: use the cached list for boot; refresh it via the Local
  // Font Access API when available (cached updates apply next launch too).
  let systemFonts = settings.systemFonts ?? []
  try {
    const qlf = (window as unknown as { queryLocalFonts?: () => Promise<Array<{ family: string }>> })
      .queryLocalFonts
    if (qlf) {
      const found = await qlf.call(window)
      // usableFonts drops the hidden system faces (". Semi", "@Batang") and
      // blanks: they are not valid CSS identifiers, so both pickers offered
      // entries that silently did nothing when chosen.
      const families = usableFonts([...new Set(found.map((f) => f.family))]).sort((a, b) =>
        a.localeCompare(b)
      )
      if (families.length) {
        if (JSON.stringify(families) !== JSON.stringify(systemFonts)) {
          window.exelmj?.saveFonts?.(families)
        }
        systemFonts = families
      }
    }
  } catch {
    // permission denied or user-gesture required — cached list stays in use
  }

  const { univer, univerAPI } = setupUniver('app', settings.language, systemFonts)
  initRtlMirror(univerAPI)
  initRtlAlign(univer, univerAPI)
  initFindAllSheets(univer, univerAPI)
  initFormulaBarFix(univerAPI)
  initRtlEditor(univerAPI)
  initRtlDropdown(univerAPI)
  initTouchSheet(univerAPI)
  setHindiDigits(!!settings.hindiDigits)
  registerHijriFunctions(univerAPI)
  const chartManager = new ChartManager(univerAPI, ChartFloat)
  bindChartManager(chartManager)
  const chartDialog = new ChartDialog(univerAPI, chartManager)
  const pivotManager = new PivotManager(univerAPI)
  const pivotDialog = new PivotDialog(univerAPI, pivotManager)
  const doc = new DocController(univerAPI, chartManager, pivotManager)
  const fmt = new FormatActions(univerAPI)
  chartManager.onChange(() => doc.setDirty(true))
  pivotManager.onChange(() => doc.setDirty(true))
  // Launched by double-clicking a file / "Open with" → open THAT file. Else fall
  // back to crash recovery, else a blank workbook. (open > recover > new)
  // --- Word mode (lazy: TipTap + docx load on first use) ---
  let wordAppPromise: Promise<WordApp> | null = null
  const getWordApp = () => {
    if (!wordAppPromise) {
      wordAppPromise = import('./word/wordApp').then((m) => {
        const app = new m.WordApp(systemFonts)
        m.setOpenInSheetMode((path) => {
          setMode('sheet')
          void doc.openPath(path)
        })
        // the mail merge reads its list of names straight out of the sheet
        // the user already has open next door
        m.setSheetCellReader(() => doc.activeSheetCells())
        app.mount()
        return app
      })
      // A failed chunk load must not stay cached as a dead promise — clear it
      // so the next click retries instead of leaving word mode broken.
      wordAppPromise.catch(() => {
        wordAppPromise = null
        setMode('sheet')
      })
    }
    return wordAppPromise
  }
  let designAppPromise: Promise<DesignApp> | null = null
  const getDesignApp = () => {
    if (!designAppPromise) {
      designAppPromise = (
        WEB
          ? Promise.reject<typeof import('./design/designApp')>(new Error('not in the web edition'))
          : import('./design/designApp')
      ).then((m) => {
        const app = new m.DesignApp()
        app.mount()
        return app
      })
      designAppPromise.catch(() => {
        designAppPromise = null
        setMode('sheet')
      })
    }
    return designAppPromise
  }
  let photoAppPromise: Promise<PhotoApp> | null = null
  const getPhotoApp = () => {
    if (!photoAppPromise) {
      photoAppPromise = (
        WEB
          ? Promise.reject<typeof import('./photo/photoApp')>(new Error('not in the web edition'))
          : import('./photo/photoApp')
      ).then((m) => {
        const app = new m.PhotoApp()
        app.mount()
        return app
      })
      photoAppPromise.catch(() => {
        photoAppPromise = null
        setMode('sheet')
      })
    }
    return photoAppPromise
  }
  /**
   * Answer MCP tool calls, from BOOT — not from the design page.
   *
   * The app starts in sheet mode and designApp is imported lazily, so a
   * listener installed when that page mounts leaves every tool call hanging
   * until the user opens it. Registered here, a call arriving before the
   * design page exists is answered honestly instead of timing out.
   *
   * It deliberately does NOT force the design page to load: mounting a page
   * because Claude asked a question would hijack the user's screen. Tools that
   * need a document say so; the rest (colour maths, device info) answer anyway.
   */
  const api = WEB ? undefined : window.exelmj
  api?.onStudioToolCall?.(({ callId, name, args }) => {
    /** What a tool sees before any design has been opened. */
    const noDocument: DocumentView = {
      handoff: () => null,
      placeComponent: () => null,
      markDirty: () => undefined
    }
    const run = designAppPromise
      ? designAppPromise.then((app) => runStudioTool(app.documentView(), name, args))
      : runStudioTool(noDocument, name, args)
    void run
      .catch((e: unknown) => ({
        ok: false as const,
        code: 'INTERNAL',
        detail: e instanceof Error ? e.message : String(e)
      }))
      .then((result) => api.replyStudioTool?.(callId, result))
  })

  // pictures open in the design page too — they are artwork to draw over
  const DESIGN_EXT_RE = /\.(ai|svg|pdf|eps|png|jpe?g|webp|bmp|gif|avif)$/i
  const openDesignPath = async (path: string) => {
    const design = await getDesignApp().catch(() => null)
    if (!design) return
    setMode('design')
    await design.openPath(path)
  }
  const openDesignBytes = async (path: string, bytes: Uint8Array) => {
    const design = await getDesignApp().catch(() => null)
    if (!design) return
    setMode('design')
    await design.openViaBytes(path, bytes)
  }
  initModeToggle({
    enterWord: () => {
      refreshRtlOverlay()
      void getWordApp()
        .then((word) => {
          word.updateTitle()
          word.focus()
        })
        .catch(() => {})
    },
    enterDesign: () => {
      refreshRtlOverlay()
      void getDesignApp()
        .then((design) => design.updateTitle())
        .catch(() => {})
    },
    enterPhoto: () => {
      refreshRtlOverlay()
      void getPhotoApp()
        .then((photo) => photo.updateTitle())
        .catch(() => {})
    },
    enterSheet: () => {
      // The grid may have been created/repainted while hidden (e.g. the app
      // booted straight into a docx): re-discover the mirror host and force a
      // text repaint, exactly like after a workbook swap.
      refreshRtlMirror()
      refreshRtlOverlay()
    }
  })
  const openDocxPath = async (path: string) => {
    const word = await getWordApp().catch(() => null)
    if (!word) return
    setMode('word')
    await word.openPath(path)
  }
  const openDocxBytes = async (path: string, bytes: Uint8Array) => {
    const word = await getWordApp().catch(() => null)
    if (!word) return
    setMode('word')
    await word.openViaBytes(path, bytes)
  }
  // Unified open: one dialog for both kinds, routed by the picked extension.
  const openUnified = async () => {
    if (!window.exelmj) return
    const res = await window.exelmj.openFile().catch(() => null)
    if (!res) return
    if (/\.docx$/i.test(res.path)) await openDocxBytes(res.path, res.bytes)
    else if (DESIGN_EXT_RE.test(res.path)) await openDesignBytes(res.path, res.bytes)
    else {
      setMode('sheet')
      await doc.openFromBytes(res.path, res.bytes)
    }
  }

  // Univer's own boot can hiccup (a [redi] DI race in the packaged build) —
  // an exception from newWorkbook here used to kill this WHOLE init chain, so
  // a double-clicked design file landed on an empty grid instead of opening.
  const safeNewWorkbook = () => {
    try {
      doc.newWorkbook()
    } catch (err) {
      console.warn('[boot] newWorkbook failed — continuing so file routing survives', err)
    }
  }
  // Autosave recovery can HANG in the packaged build (a Univer [redi] injector
  // failure leaves its promise unsettled), and one hung await here used to eat
  // the double-clicked file: the app stayed on an empty grid forever. The race
  // guarantees boot continues within 4s no matter what recovery does.
  const recoverWithTimeout = () =>
    Promise.race([
      doc.tryRecoverAutosave().catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000))
    ])
  const pendingFile = await window.exelmj?.getPendingOpenFile?.().catch(() => null)
  if (pendingFile && DESIGN_EXT_RE.test(pendingFile)) {
    const recovered = await recoverWithTimeout()
    if (!recovered) safeNewWorkbook()
    await new Promise((resolve) => setTimeout(resolve, 400))
    await openDesignPath(pendingFile).catch(() => undefined)
  } else if (pendingFile && /\.docx$/i.test(pendingFile)) {
    // The sheet side boots exactly like a plain launch (a crash-recovery
    // autosave must survive a double-clicked docx), the docx opens on top.
    const recovered = await recoverWithTimeout()
    if (!recovered) safeNewWorkbook()
    // Let the workbook swap + its async RTL default settle before the grid is
    // hidden — commands raced the hide here and left the flag unset.
    await new Promise((resolve) => setTimeout(resolve, 400))
    await openDocxPath(pendingFile).catch(() => undefined)
  } else if (pendingFile) {
    await doc.openPath(pendingFile).catch(() => safeNewWorkbook())
  } else {
    const recovered = await recoverWithTimeout()
    if (!recovered) safeNewWorkbook()
  }
  if (WEB) {
    // A phone closes background apps without asking: autosave more often, and
    // right away whenever the app is hidden (home button, another app).
    doc.startAutosave(20_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return
      void doc.autosaveNow()
      void wordAppPromise?.then((word) => word.writeAutosave()).catch(() => {})
    })
  } else {
    doc.startAutosave()
  }

  if (import.meta.env.DEV) {
    // Dev-only hooks for scripted verification.
    const w = window as unknown as Record<string, unknown>
    w.univerAPI = univerAPI
    w.__exelmjCharts = { manager: chartManager, dialog: chartDialog }
    w.__exelmjPivots = { manager: pivotManager, dialog: pivotDialog }
    w.__exelmjFmt = fmt
    w.__exelmjSetHindi = setHindiDigits
    w.__exelmjDoc = doc
  }

  window.exelmj?.onMenu((action, payload) => {
    // Open routes by the file's extension whatever mode is visible.
    if (action === 'open') {
      void openUnified()
      return
    }
    if (action === 'open-path') {
      if (typeof payload === 'string') {
        if (/\.docx$/i.test(payload)) void openDocxPath(payload)
        else if (DESIGN_EXT_RE.test(payload)) void openDesignPath(payload)
        else {
          setMode('sheet')
          void doc.openPath(payload)
        }
      }
      return
    }
    // Design mode: save persists the boxes (and SVG edits); save-as/print
    // export the overlay PDF; sheet/word-specific actions are ignored.
    if (currentMode() === 'design') {
      if (action === 'set-hindi') {
        setHindiDigits(!!payload)
        return
      }
      void getDesignApp().then((design) => {
        switch (action) {
          case 'undo':
            void design.undo()
            break
          case 'redo':
            void design.redo()
            break
          case 'save':
            void design.save()
            break
          case 'save-as':
          case 'export-pdf':
          case 'print':
            void design.exportPdf()
            break
          case 'save-then-close':
            void (async () => {
              if (design.dirty && !(await design.save())) return
              if (isSheetDirty() && !(await doc.save())) return
              const word = wordAppPromise ? await wordAppPromise.catch(() => null) : null
              if (word?.dirty && !(await word.save())) return
              if (isPhotoDirty()) {
                const photo = await getPhotoApp().catch(() => null)
                if (photo?.dirty && !(await photo.save())) return
              }
              window.exelmj?.requestClose()
            })()
            break
          default:
            break
        }
      }).catch(() => {})
      return
    }
    // Photo mode: save/save-as persist the .exelmjphoto layer container;
    // export-pdf/print have no photo equivalent yet, so they fall through
    // to a flattened PNG export rather than doing nothing silently.
    if (currentMode() === 'photo') {
      void getPhotoApp().then((photo) => {
        switch (action) {
          case 'undo':
            photo.undo()
            break
          case 'redo':
            photo.redo()
            break
          case 'save':
            void photo.save()
            break
          case 'save-as':
            void photo.saveAs()
            break
          case 'export-pdf':
          case 'print':
            void photo.exportPng()
            break
          case 'save-then-close':
            void (async () => {
              if (photo.dirty && !(await photo.save())) return
              if (isSheetDirty() && !(await doc.save())) return
              const word = wordAppPromise ? await wordAppPromise.catch(() => null) : null
              if (word?.dirty && !(await word.save())) return
              if (isDesignDirty()) {
                const design = await getDesignApp().catch(() => null)
                if (design?.dirty && !(await design.save())) return
              }
              window.exelmj?.requestClose()
            })()
            break
          default:
            break
        }
      }).catch(() => {})
      return
    }
    // While the word editor is visible, file/undo actions go to it and
    // sheet-specific actions are ignored (they would edit the hidden grid).
    if (currentMode() === 'word') {
      if (action === 'set-hindi') {
        setHindiDigits(!!payload)
        return
      }
      void getWordApp().then((word) => {
        switch (action) {
          case 'new':
            word.requestNew()
            break
          case 'save':
            void word.save()
            break
          case 'save-as':
            void word.saveAs()
            break
          case 'save-then-close':
            void (async () => {
              if (word.dirty && !(await word.save())) return
              if (isSheetDirty() && !(await doc.save())) return
              if (isDesignDirty()) {
                const design = await getDesignApp().catch(() => null)
                if (design?.dirty && !(await design.save())) return
              }
              if (isPhotoDirty()) {
                const photo = await getPhotoApp().catch(() => null)
                if (photo?.dirty && !(await photo.save())) return
              }
              window.exelmj?.requestClose()
            })()
            break
          case 'print':
            void word.print('print')
            break
          case 'export-pdf':
            void word.print('pdf')
            break
          case 'undo':
            word.undo()
            break
          case 'redo':
            word.redo()
            break
          default:
            break
        }
      }).catch(() => {})
      return
    }
    switch (action) {
      case 'new':
        doc.newWorkbook()
        break
      case 'save':
        void doc.save()
        break
      case 'save-as':
        void doc.saveAs()
        break
      case 'save-then-close':
        void (async () => {
          if (doc.isDirty && !(await doc.save())) return
          const word = wordAppPromise ? await wordAppPromise.catch(() => null) : null
          if (word?.dirty && !(await word.save())) return
          if (isDesignDirty()) {
            const design = await getDesignApp().catch(() => null)
            if (design?.dirty && !(await design.save())) return
          }
          if (isPhotoDirty()) {
            const photo = await getPhotoApp().catch(() => null)
            if (photo?.dirty && !(await photo.save())) return
          }
          window.exelmj?.requestClose()
        })()
        break
      case 'insert-chart':
        chartDialog.open()
        break
      case 'insert-pivot':
        pivotDialog.open()
        break
      case 'refresh-pivots': {
        const res = pivotManager.refreshAll()
        alert(res.refreshed || res.broken ? `${t('pivotRefreshDone')}: ${res.refreshed}` : t('pivotRefreshNone'))
        break
      }
      case 'fmt-border':
        fmt.setBorder(payload as BorderChoice)
        break
      case 'fmt-merge':
        fmt.mergeAll()
        break
      case 'fmt-unmerge':
        fmt.unmerge()
        break
      case 'fmt-wrap-on':
        fmt.toggleWrap(true)
        break
      case 'fmt-wrap-off':
        fmt.toggleWrap(false)
        break
      case 'fmt-row-height':
        void fmt.setRowHeight()
        break
      case 'fmt-col-width':
        void fmt.setColWidth()
        break
      case 'fmt-hide-rows':
        fmt.hideRows()
        break
      case 'fmt-show-rows':
        fmt.showAllRows()
        break
      case 'fmt-hide-cols':
        fmt.hideCols()
        break
      case 'fmt-show-cols':
        fmt.showAllCols()
        break
      case 'fmt-freeze':
        fmt.freezeAtSelection()
        break
      case 'fmt-unfreeze':
        fmt.cancelFreeze()
        break
      case 'fmt-clear-format':
        fmt.clearFormat()
        break
      case 'fmt-clear-content':
        fmt.clearContent()
        break
      case 'fmt-clear-all':
        fmt.clearAll()
        break
      case 'fmt-insert-rows-above':
        fmt.insertRowsAbove()
        break
      case 'fmt-insert-rows-below':
        fmt.insertRowsBelow()
        break
      case 'fmt-insert-cols-before':
        fmt.insertColsBefore()
        break
      case 'fmt-insert-cols-after':
        fmt.insertColsAfter()
        break
      case 'fmt-delete-rows':
        fmt.deleteRows()
        break
      case 'fmt-delete-cols':
        fmt.deleteCols()
        break
      case 'fmt-insert-sheet':
        fmt.insertSheet()
        break
      case 'fmt-insert-image':
        fmt.insertImage()
        break
      case 'fmt-insert-link':
        fmt.insertHyperlink()
        break
      case 'fmt-insert-comment':
        fmt.insertComment()
        break
      case 'fmt-insert-today':
        fmt.insertToday()
        break
      case 'fmt-insert-hijri-today':
        fmt.insertHijriToday()
        break
      case 'toggle-sheet-rtl':
        void doc.toggleActiveSheetRtl()
        break
      case 'new-template':
        if (payload === 'invoice' || payload === 'payroll' || payload === 'budget' || payload === 'project') {
          doc.newFromTemplate(payload)
        }
        break
      case 'export-csv':
        void doc.exportCsv()
        break
      case 'print':
        void doc.printActiveSheet('print')
        break
      case 'export-pdf':
        void doc.printActiveSheet('pdf')
        break
      case 'set-hindi':
        setHindiDigits(!!payload)
        break
      case 'undo':
        void univerAPI.undo()
        break
      case 'redo':
        void univerAPI.redo()
        break
      default:
        break
    }
  })
}

void boot()
