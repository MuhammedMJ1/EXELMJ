// The embedded mini-browser: a WebContentsView owned by the main process,
// with real device emulation.
//
// WHY WebContentsView AND NOT <webview>
// `webviewTag` is off in EXELMJ today and stays off. A <webview> is a
// renderer-owned custom element with an awkward async API, Electron's own docs
// discourage it, and — decisive here — the renderer cannot reach
// `webContents.debugger` on it, which kills every CDP capability the device
// switch depends on. A WebContentsView gives main a real webContents with
// .debugger, .setBounds, .capturePage and its own session partition.
//
// THE COST IS HONEST: we own the layout, and the view paints ABOVE renderer
// DOM. So the renderer sends bounds on every resize, all chrome lives outside
// the view rect, and any modal that must cover it removes the child view
// rather than trying to out-z-index it.
//
// The view is owned PER WINDOW. EXELMJ already supports multiple windows via
// its `windows` Set, and a globally-owned guest would be silently stolen by
// whichever window opened one last.

import { BrowserWindow, WebContentsView, session, type Session } from 'electron'
import { emulationCommands, clearCommands, type Device } from '../../src/studio/devices'
import { isAllowedUrl, isForbiddenUrl } from './mcpProtocol'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Origins the user explicitly approved this session. Not persisted: an
 * approval that outlived the session would be a standing grant nobody
 * remembers giving. */
const approved = new Set<string>()

export function approveOrigin(url: string): void {
  try {
    approved.add(new URL(url).origin)
  } catch {
    /* not a url — nothing to approve */
  }
}

export function isApproved(url: string): boolean {
  try {
    return approved.has(new URL(url).origin)
  } catch {
    return false
  }
}

/** May this URL be loaded without asking the user? */
export function canLoad(url: string): { ok: true } | { ok: false; reason: 'forbidden' | 'needs-consent' } {
  if (isForbiddenUrl(url)) return { ok: false, reason: 'forbidden' }
  if (isAllowedUrl(url) || isApproved(url)) return { ok: true }
  return { ok: false, reason: 'needs-consent' }
}

export class StudioBrowser {
  private view: WebContentsView | null = null
  private attached = false
  private device: Device | null = null

  constructor(
    private readonly win: BrowserWindow,
    private readonly preloadPath: string
  ) {}

  /** Lazily created — a user who never opens the browser never pays for it. */
  private ensure(): WebContentsView {
    if (this.view) return this.view
    const guest = session.fromPartition('persist:studio-guest')
    lockDown(guest)
    const view = new WebContentsView({
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        // A hidden or occluded guest must keep running: a scan or a recording
        // that stalls because the window lost focus looks like a hang.
        backgroundThrottling: false,
        session: guest
      }
    })
    // Deny every popup rather than opening a second, unmanaged window.
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    view.webContents.on('will-navigate', (e, url) => {
      if (canLoad(url).ok) return
      e.preventDefault()
    })
    // A navigation destroys anything injected into the page, so the device
    // override has to be re-applied — CDP overrides survive, but the picker
    // agent does not.
    view.webContents.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) this.onNavigated()
    })
    this.view = view
    return view
  }

  private onNavigated(): void {
    // Re-apply the device: an in-page navigation can reset emulated media even
    // when the metrics override survives.
    if (this.device) void this.setDevice(this.device)
  }

  show(bounds: Bounds): void {
    if (this.win.isDestroyed()) return
    const view = this.ensure()
    if (!this.attached) {
      this.win.contentView.addChildView(view)
      this.attached = true
    }
    view.setBounds(bounds)
  }

  hide(): void {
    if (!this.view || !this.attached) return
    this.attached = false
    // Reading contentView on a destroyed window throws "Object has been
    // destroyed" and takes the whole main process with it. The window can be
    // gone by the time a teardown path reaches here, so this is checked rather
    // than assumed — an uncaught throw in main is a crash dialog, not a log.
    if (this.win.isDestroyed()) return
    // removeChildView, NOT z-index: the view paints above renderer DOM, so a
    // modal cannot cover it any other way.
    this.win.contentView.removeChildView(this.view)
  }

  setBounds(bounds: Bounds): void {
    this.view?.setBounds(bounds)
  }

  async load(url: string): Promise<{ ok: boolean; reason?: string }> {
    const verdict = canLoad(url)
    if (!verdict.ok) {
      return {
        ok: false,
        reason:
          verdict.reason === 'forbidden'
            ? 'That address can never be opened here.'
            : 'That site needs your confirmation before it can be opened.'
      }
    }
    const view = this.ensure()
    await view.webContents.loadURL(url)
    return { ok: true }
  }

  /**
   * Make the page BELIEVE it is on that device.
   *
   * Not setDeviceEmulationParameters: that resizes the viewport but sets
   * neither touch nor the user agent, so the page gets a smaller box while
   * still believing it is a desktop with a mouse — which is the exact bug the
   * device switch exists to catch.
   *
   * Only one debugger client may attach to a webContents, so a user with
   * DevTools open makes this fail. It reports that rather than silently
   * degrading into a resize.
   */
  async setDevice(
    device: Device,
    opts: { colorScheme?: 'light' | 'dark'; reducedMotion?: boolean } = {}
  ): Promise<{ ok: boolean; reason?: string }> {
    const view = this.ensure()
    const dbg = view.webContents.debugger
    try {
      if (!dbg.isAttached()) dbg.attach('1.3')
    } catch (e) {
      return {
        ok: false,
        reason: `Could not attach the inspector${
          view.webContents.isDevToolsOpened() ? ' (close DevTools on the preview first)' : ''
        }: ${e instanceof Error ? e.message : String(e)}`
      }
    }
    try {
      for (const cmd of emulationCommands(device, opts)) {
        await dbg.sendCommand(cmd.method, cmd.params)
      }
      this.device = device
      return { ok: true }
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) }
    }
  }

  async clearDevice(): Promise<void> {
    const dbg = this.view?.webContents.debugger
    if (!dbg?.isAttached()) return
    for (const cmd of clearCommands()) {
      await dbg.sendCommand(cmd.method, cmd.params).catch(() => undefined)
    }
    this.device = null
  }

  /** PNG bytes of the current view. PNG never JPEG: chroma subsampling returns
   * literally wrong hex values, and this feeds colour extraction. */
  async capture(rect?: Bounds): Promise<Buffer | null> {
    const view = this.view
    if (!view) return null
    const image = await view.webContents.capturePage(rect)
    return image.isEmpty() ? null : image.toPNG()
  }

  currentDevice(): Device | null {
    return this.device
  }

  /** The guest's webContents, for sending it the picker messages. null until
   * the view has actually been created — a caller must not force one into
   * existence just to arm a picker on a page that was never opened. */
  webContents(): Electron.WebContents | null {
    return this.view?.webContents ?? null
  }

  destroy(): void {
    if (!this.view) return
    const dbg = this.view.webContents.debugger
    if (dbg.isAttached()) {
      try {
        dbg.detach()
      } catch {
        /* already gone */
      }
    }
    this.hide()
    this.view.webContents.close()
    this.view = null
  }
}

/**
 * Everything the guest session is not allowed to do.
 *
 * Applied to the PARTITION, not the view, so a second view in the same
 * partition cannot be created without it.
 */
function lockDown(guest: Session): void {
  // Deny by default. A preview of our own generated project has no business
  // asking for the camera, and a third-party page certainly does not.
  guest.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
  guest.setPermissionCheckHandler(() => false)
}
