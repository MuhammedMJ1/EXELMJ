// The window.exelmj bridge for the web edition.
//
// On the desktop, window.exelmj is Electron's preload bridge (files, dialogs,
// printing, autosave on disk). The sheet and document code only ever talks to
// that bridge, so the web edition runs the SAME app by giving it this bridge
// instead — built on browser APIs (see webFiles and webStore). Only the
// members the Sheets and Documents pages use are implemented; everything
// Studio/Design/Illustrator-specific is absent, and those pages are not in the
// web build. This module installs itself when imported (src/web/entry.ts
// imports it before the app).
import { askForm } from '../word/askForm'
import { t } from '../i18n/i18n'
import {
  canShareFiles,
  docFileType,
  extensionForKind,
  makeWebPath,
  OPEN_EXTENSIONS,
  parseWebPath,
  pickFile,
  safeFileName,
  saveBytesAs,
  writeToHandle,
  type SavedCopy
} from './webFiles'
import { loadSettings, saveSettings, webStore, type WebLang } from './webStore'
import { initWebShell, toast } from './webShell'

const VERSION = String(import.meta.env.VITE_APP_VERSION ?? 'web')

type MenuHandler = (action: string, payload?: unknown) => void

/**
 * Print through the phone's own print dialog (which also offers "Save as
 * PDF"): the page's print HTML goes into a hidden frame that prints itself.
 */
function printHtml(html: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('aria-hidden', 'true')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      setTimeout(() => frame.remove(), 1000)
      resolve()
    }
    frame.addEventListener(
      'load',
      () => {
        const w = frame.contentWindow
        if (!w) return finish()
        w.addEventListener('afterprint', finish, { once: true })
        // Chart images inside the page must be decoded before the snapshot.
        setTimeout(() => {
          try {
            w.focus()
            w.print()
          } catch (err) {
            console.warn('[web] print failed', err)
            finish()
          }
          setTimeout(finish, 60_000)
        }, 300)
      },
      { once: true }
    )
    frame.srcdoc = html
    document.body.append(frame)
  })
}

export function createWebBridge(): Partial<ExelmjBridge> {
  const settings = loadSettings()
  /** File System Access handles of this session, by file id. */
  const handles = new Map<string, FileSystemFileHandle>()
  let dirty = false
  let menu: MenuHandler | null = null

  // Closing the tab with unsaved work: Chrome asks first (desktop Chrome
  // shows the prompt; on a phone the autosave copy is the real safety net).
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return
    e.preventDefault()
    e.returnValue = ''
  })

  const newId = (): string =>
    crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

  /** Keep the file's copy (and handle) inside the app; returns its id. */
  async function remember(name: string, bytes: Uint8Array, handle?: FileSystemFileHandle, id: string = newId()) {
    if (handle) handles.set(id, handle)
    try {
      await webStore.recentPut({ id, name, at: Date.now(), bytes, handle })
    } catch (err) {
      // A browser that hands out file handles but cannot store them: keep
      // the copy without it (the handle still works for this session).
      try {
        if (!handle) throw err
        await webStore.recentPut({ id, name, at: Date.now(), bytes })
      } catch (err2) {
        console.warn('[web] keeping a copy in the app failed', err2)
      }
    }
    return id
  }

  async function chooseDownloadOrShare(): Promise<'download' | 'share' | null> {
    const res = await askForm(t('webSaveTitle'), [{ key: 'note', label: t('webSaveHow'), type: 'note' }], {
      okLabel: t('webDownload'),
      ...(canShareFiles() ? { extra: { key: 'share', label: t('webShare') } } : {})
    })
    if (!res) return null
    return res.__action === 'share' ? 'share' : 'download'
  }

  const reportSaved = (how: SavedCopy['how']) =>
    toast(how === 'file' ? t('webSavedToFile') : how === 'share' ? t('webShared') : t('webDownloaded'))

  const setLanguage = async (lang: WebLang) => {
    saveSettings({ language: lang })
    location.reload()
  }

  return {
    async getSettings() {
      return { language: settings.language, recentFiles: [], hindiDigits: settings.hindiDigits }
    },
    setLanguage,
    saveFonts() {
      // no installed-font list on a phone
    },
    async getVersion() {
      return VERSION
    },
    setDirty(d: boolean) {
      dirty = d
    },
    requestClose() {
      // a web page cannot close its own tab; unsaved work is already saved
    },

    async openFile() {
      const picked = await pickFile(OPEN_EXTENSIONS)
      if (!picked) return null
      const kind = docFileType(picked.name).kind
      if (kind !== 'sheet' && kind !== 'csv' && kind !== 'doc') {
        toast(t('webUnsupportedFile'))
        return null
      }
      const id = await remember(picked.name, picked.bytes, picked.handle)
      return { path: makeWebPath(id, picked.name), bytes: picked.bytes }
    },

    async readFile(path: string) {
      const ref = parseWebPath(path)
      if (!ref) return null
      const rec = await webStore.recentGet(ref.id).catch(() => undefined)
      if (!rec) return null
      let bytes = rec.bytes
      const handle = handles.get(ref.id) ?? rec.handle
      if (handle) {
        try {
          bytes = new Uint8Array(await (await handle.getFile()).arrayBuffer())
        } catch {
          // the phone withdrew access to the original: the kept copy opens
        }
      }
      void remember(rec.name, bytes, handle, rec.id) // back to the top of the list
      return { path, bytes }
    },

    // A file shared into the app from another app (sw.js keeps it). Opened
    // at boot like a double-clicked file on the desktop — unless unsaved work
    // of the same kind is waiting to be recovered: then it only joins Open
    // Recent, so it can never replace (and so clear) that work. Other-kind
    // work is safe: main.ts recovers a sheet before it opens a docx, and a
    // sheet opening never touches the Documents copy.
    async getPendingOpenFile() {
      if (!new URLSearchParams(location.search).has('shared')) return null
      history.replaceState(null, '', location.pathname) // a reload must not reopen it
      try {
        const cache = await caches.open('exelmj-shared')
        const res = await cache.match('./shared-file')
        if (!res) return null
        await cache.delete('./shared-file')
        const sent = decodeURIComponent(res.headers.get('x-name') ?? '')
        // Some apps share a bare title with no extension: the type the phone
        // sent along then names the kind.
        const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
        const byType =
          docFileType(sent).kind === 'other' ? OPEN_EXTENSIONS.find((e) => docFileType(e).mime === type) : undefined
        const name = safeFileName(sent, byType?.slice(1) ?? '', 'shared')
        const kind = docFileType(name).kind
        if (kind !== 'sheet' && kind !== 'csv' && kind !== 'doc') {
          toast(t('webUnsupportedFile'))
          return null
        }
        const id = await remember(name, new Uint8Array(await res.arrayBuffer()))
        const waiting = await webStore
          .get<{ bytes?: Uint8Array }>(`autosave:${kind === 'doc' ? 'word' : 'sheet'}`)
          .catch(() => undefined)
        if (waiting?.bytes?.length) {
          toast(t('webSharedReceived').replace('{name}', name))
          return null
        }
        return makeWebPath(id, name)
      } catch (err) {
        console.warn('[web] shared file', err)
        return null
      }
    },

    async saveFile(path: string, bytes: Uint8Array) {
      const ref = parseWebPath(path)
      const fallbackName = safeFileName(path.split(/[\\/]/).pop(), docFileType(path).ext, t('newWorkbookName'))
      const name = ref?.name ?? fallbackName
      const id = ref?.id ?? newId()
      const handle = handles.get(id) ?? (ref ? (await webStore.recentGet(id).catch(() => undefined))?.handle : undefined)
      const wrote = handle ? await writeToHandle(handle, bytes) : false
      await remember(name, bytes, handle, id)
      // Saved either way: into the phone's file when it lets us, and always
      // into the app's own copy — the toast says which.
      toast(wrote ? t('webSavedToFile') : t('webSavedInApp'))
      return true
    },

    async saveFileAs(bytes, suggestedName, kind) {
      const ext = extensionForKind(kind) || docFileType(suggestedName ?? '').ext
      const name = safeFileName(suggestedName, ext, kind === 'docx' ? t('wordNewDocName') : t('newWorkbookName'))
      const saved = await saveBytesAs(bytes, name, chooseDownloadOrShare)
      if (!saved) return null
      const id = await remember(saved.name, bytes, saved.handle)
      reportSaved(saved.how)
      return makeWebPath(id, saved.name)
    },

    async exportCsv(bytes, suggestedName) {
      const saved = await saveBytesAs(bytes, safeFileName(suggestedName, 'csv', 'sheet'), chooseDownloadOrShare)
      if (!saved) return null
      reportSaved(saved.how)
      return saved.name
    },

    async printSheet(html, mode) {
      if (mode === 'pdf') toast(t('webPdfHint'))
      await printHtml(html)
      return null
    },

    saveAutosave(bytes, meta, kind = 'sheet') {
      void webStore
        .set(`autosave:${kind}`, { bytes, meta, at: Date.now() })
        .catch((err) => console.warn('[web] autosave failed', err))
    },
    async getAutosave(kind = 'sheet') {
      const saved = await webStore
        .get<{ bytes: Uint8Array; meta: string }>(`autosave:${kind}`)
        .catch(() => undefined)
      return saved?.bytes?.length ? { bytes: saved.bytes, meta: saved.meta } : null
    },
    clearAutosave(kind = 'sheet') {
      void webStore.delete(`autosave:${kind}`).catch(() => undefined)
    },

    // The app registers its menu dispatcher last in boot — i18n is ready by
    // then, so this is where the web menu is built.
    onMenu(cb) {
      menu = cb
      initWebShell({
        dispatch: (action, payload) => menu?.(action, payload),
        recent: () => webStore.recentList(),
        openRecent: (file) => menu?.('open-path', makeWebPath(file.id, file.name)),
        language: settings.language,
        setLanguage: (lang) => void setLanguage(lang),
        hindiDigits: () => loadSettings().hindiDigits,
        setHindiDigits: (on) => {
          saveSettings({ hindiDigits: on })
          menu?.('set-hindi', on)
        },
        version: VERSION
      })
    }
  }
}

window.exelmj = createWebBridge() as ExelmjBridge
