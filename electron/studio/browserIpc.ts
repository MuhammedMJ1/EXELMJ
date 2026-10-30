// The IPC surface of the embedded browser.
//
// Kept in its own file rather than added to ipc.ts because the browser is
// owned PER WINDOW: every handler here has to resolve the caller's window from
// the event, not from a module-level "current window". A handler that used the
// focused window would drive the wrong preview the moment a second window is
// open — which EXELMJ supports.

import { app, BrowserWindow, dialog, ipcMain, session, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { StudioBrowser, approveOrigin, canLoad, type Bounds } from './browserView'
import { serveStudioProtocol } from './studioProtocol'
import { CATALOGUE, custom, deviceById, rotate, type Device } from '../../src/studio/devices'

/** One browser per window. A WeakMap so a closed window's view is collectable
 * without a teardown hook having to remember to delete the entry. */
const browsers = new WeakMap<BrowserWindow, StudioBrowser>()

/** projectId -> directory, for studio://. Registered when a project is served. */
const projects = new Map<string, string>()

export interface BrowserIpcHooks {
  /** Absolute path to the GUEST preload bundle. */
  guestPreload: string
  translate(key: string): string
}

function browserFor(e: IpcMainInvokeEvent, hooks: BrowserIpcHooks): StudioBrowser | null {
  const win = BrowserWindow.fromWebContents(e.sender)
  if (!win) return null
  let b = browsers.get(win)
  if (!b) {
    b = new StudioBrowser(win, hooks.guestPreload)
    browsers.set(win, b)
    // The view must die with the window, but 'closed' fires AFTER the native
    // window is gone — and StudioBrowser.destroy() calls hide(), which touches
    // win.contentView. Doing that on a destroyed window throws "Object has
    // been destroyed" and crashes the main process.
    //
    // So the teardown happens on 'close' (singular), while the window is still
    // alive, and 'closed' only drops the JS reference.
    win.on('close', () => {
      browsers.get(win)?.destroy()
    })
    win.once('closed', () => {
      browsers.delete(win)
    })
  }
  return b
}

function cleanBounds(v: unknown): Bounds | null {
  if (!v || typeof v !== 'object') return null
  const b = v as Record<string, unknown>
  const n = (k: string): number => {
    const x = Number(b[k])
    return Number.isFinite(x) ? Math.round(x) : NaN
  }
  const out = { x: n('x'), y: n('y'), width: n('width'), height: n('height') }
  if (Object.values(out).some((x) => !Number.isFinite(x))) return null
  // A zero-size view is how the renderer HIDES it during a modal; negative is
  // never meaningful and would throw inside Electron.
  if (out.width < 0 || out.height < 0) return null
  return out
}

/** Resolve a device name from the renderer or from an MCP call. */
export function resolveDevice(name: unknown, rotated = false): Device | null {
  if (typeof name !== 'string') return null
  const m = /^(\d+)\s*[x*]\s*(\d+)$/i.exec(name.trim())
  const base = m ? custom(Number(m[1]), Number(m[2])) : deviceById(name)
  if (!base) return null
  return rotated ? rotate(base) : base
}

export function registerBrowserIpc(hooks: BrowserIpcHooks): void {
  // The guest session resolves studio:// — the app's own session never should.
  const guest = session.fromPartition('persist:studio-guest')
  serveStudioProtocol(guest, (id) => projects.get(id) ?? null)

  ipcMain.handle('studio:browser-show', (e, bounds: unknown) => {
    const b = browserFor(e, hooks)
    const rect = cleanBounds(bounds)
    if (!b || !rect) return { ok: false, reason: 'bad bounds' }
    b.show(rect)
    return { ok: true }
  })

  ipcMain.handle('studio:browser-bounds', (e, bounds: unknown) => {
    const b = browsers.get(BrowserWindow.fromWebContents(e.sender)!)
    const rect = cleanBounds(bounds)
    if (b && rect) b.setBounds(rect)
    return { ok: true }
  })

  ipcMain.handle('studio:browser-hide', (e) => {
    browsers.get(BrowserWindow.fromWebContents(e.sender)!)?.hide()
    return { ok: true }
  })

  ipcMain.handle('studio:browser-open', async (e, url: unknown) => {
    const b = browserFor(e, hooks)
    if (!b || typeof url !== 'string') return { ok: false, reason: 'bad url' }
    const verdict = canLoad(url)
    if (!verdict.ok && verdict.reason === 'needs-consent') {
      // The consent dialog NAMES the origin. A yes/no with no origin in it is
      // not consent to anything in particular.
      const win = BrowserWindow.fromWebContents(e.sender)
      let origin = url
      try {
        origin = new URL(url).origin
      } catch {
        /* keep the raw string */
      }
      const res = await dialog.showMessageBox(win!, {
        type: 'question',
        buttons: [hooks.translate('cancel'), hooks.translate('open')],
        defaultId: 0,
        cancelId: 0,
        message: hooks.translate('studioOpenExternal'),
        detail: origin
      })
      if (res.response !== 1) return { ok: false, reason: 'declined' }
      approveOrigin(url)
    }
    return b.load(url)
  })

  ipcMain.handle('studio:browser-device', async (e, name: unknown, opts: unknown) => {
    const b = browserFor(e, hooks)
    if (!b) return { ok: false, reason: 'no view' }
    const o = (opts ?? {}) as Record<string, unknown>
    const device = resolveDevice(name, o.rotate === true)
    if (!device) return { ok: false, reason: 'unknown device' }
    const result = await b.setDevice(device, {
      colorScheme: o.colorScheme === 'dark' ? 'dark' : 'light',
      reducedMotion: o.reducedMotion === true
    })
    return { ...result, device }
  })

  ipcMain.handle('studio:browser-shot', async (e, target: unknown) => {
    const b = browsers.get(BrowserWindow.fromWebContents(e.sender)!)
    if (!b) return { ok: false, reason: 'no view' }
    const png = await b.capture()
    if (!png) return { ok: false, reason: 'nothing to capture' }
    const dir = path.join(app.getPath('temp'), 'exelmj-shots')
    await fs.mkdir(dir, { recursive: true })
    const file = path.join(dir, `shot-${Date.now()}.png`)
    await fs.writeFile(file, png)
    // A PATH, never bytes: a base64 PNG of a 1440x900 page is megabytes of
    // context for something the caller can read from disk.
    return { ok: true, path: file, bytes: png.length, target: typeof target === 'string' ? target : null }
  })

  // The picker is armed from the host and answers on the GUEST's channel, so
  // the capture is relayed back to the window that asked for it — with two
  // windows open, a shared channel would deliver the pick to the wrong one.
  ipcMain.handle('studio:picker-arm', (e) => {
    const b = browsers.get(BrowserWindow.fromWebContents(e.sender)!)
    const guestWc = b?.webContents()
    if (!guestWc) return { ok: false, reason: 'no view' }
    const host = e.sender
    const relay = (ev: Electron.IpcMainEvent, capture: unknown): void => {
      if (ev.sender !== guestWc) return
      host.send('studio:picked', capture)
    }
    ipcMain.once('studio:picked', relay)
    guestWc.send('studio:arm-picker')
    return { ok: true }
  })

  ipcMain.handle('studio:picker-disarm', (e) => {
    browsers.get(BrowserWindow.fromWebContents(e.sender)!)?.webContents()?.send('studio:disarm-picker')
    return { ok: true }
  })

  ipcMain.handle('studio:browser-devices', () =>
    CATALOGUE.map((d) => ({ id: d.id, label: d.label, kind: d.kind, w: d.w, h: d.h, dpr: d.dpr }))
  )

  /** Serve a folder as a studio:// project and return the URL to load. */
  ipcMain.handle('studio:serve-project', async (_e, dir: unknown) => {
    if (typeof dir !== 'string' || !dir) return { ok: false, reason: 'bad path' }
    const root = path.resolve(dir)
    try {
      const stat = await fs.stat(root)
      if (!stat.isDirectory()) return { ok: false, reason: 'not a folder' }
    } catch {
      return { ok: false, reason: 'no such folder' }
    }
    // A stable id per directory, so re-serving the same folder does not
    // orphan the previous origin and its storage.
    const id = projectIdFor(root)
    projects.set(id, root)
    return { ok: true, url: `studio://${id}/`, projectId: id }
  })
}

/** A short, stable, URL-safe id for a directory. */
export function projectIdFor(dir: string): string {
  let h = 2166136261
  const s = dir.toLowerCase()
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return `p${(h >>> 0).toString(36)}`
}
