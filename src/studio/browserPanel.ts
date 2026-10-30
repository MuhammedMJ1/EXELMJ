// The mini-browser panel: an address bar, the three device pills, and the
// rectangle the native view is told to occupy.
//
// THE ONE STRUCTURAL FACT that shapes this file: the WebContentsView is a
// NATIVE child of the window and paints ABOVE all renderer DOM. Nothing here
// can overlap it, and no CSS can put anything on top of it. So the panel is a
// frame around a HOLE — a placeholder div whose measured rectangle is sent to
// main on every layout change, and everything the user interacts with lives
// outside that rectangle.
//
// A consequence worth stating: when the panel is hidden or scrolled out of
// view the native view must be told, or it goes on painting over whatever is
// now in that part of the window.

import { t } from '../i18n/i18n'
import { PINNED, type Device } from './devices'

/** The icon for each device class. Drawn rather than imported so the pill
 * reads at a glance without a font or an icon set. */
const ICONS: Record<Device['kind'], string> = {
  desktop:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="9" rx="1"/><path d="M5.5 14h5"/></svg>',
  tablet:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3.5" y="1.5" width="9" height="13" rx="1.2"/><path d="M7 12.6h2"/></svg>',
  mobile:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="1.5" width="6" height="13" rx="1.2"/><path d="M7.2 12.8h1.6"/></svg>'
}

export interface BrowserPanelHost {
  /** Report a captured element back to the app. */
  onPicked(capture: Record<string, unknown>): void
  /** Ask the user for a folder to serve as a studio:// project. */
  pickProjectFolder(): Promise<string | null>
  /** Place the last capture on the current artboard. */
  importLast(): { ok: boolean; detail: string }
  setStatus(message: string): void
}

export class BrowserPanel {
  private root: HTMLElement
  private hole: HTMLElement
  private urlInput: HTMLInputElement
  private pills = new Map<string, HTMLElement>()
  private importBtn: HTMLElement | null = null
  private device: Device = PINNED[0]
  private rotated = false
  private visible = false
  private observer: ResizeObserver | null = null
  // void, not the promise: an event listener that returns one leaves a
  // rejection with nowhere to go if the bridge is missing.
  private onScroll = (): void => {
    void this.syncBounds()
  }

  constructor(
    parent: HTMLElement,
    private readonly host: BrowserPanelHost
  ) {
    this.root = document.createElement('section')
    this.root.className = 'dz-browser'

    const bar = document.createElement('div')
    bar.className = 'dz-bw-bar'

    this.urlInput = document.createElement('input')
    this.urlInput.type = 'text'
    this.urlInput.className = 'dz-bw-url'
    this.urlInput.spellcheck = false
    // A URL is machine text and reads left-to-right even in an Arabic panel.
    this.urlInput.dir = 'ltr'
    this.urlInput.placeholder = 'studio://… / http://localhost:5173'
    this.urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.open(this.urlInput.value)
    })
    bar.append(this.urlInput)

    const go = this.button(t('open'), () => void this.open(this.urlInput.value))
    bar.append(go)
    // Serving a folder is the OTHER half of the mini-browser: without it the
    // only thing you can point it at is somebody else's website, and running
    // the projects we generate was the whole point.
    bar.append(this.button(t('studioOpenProject'), () => void this.openProject()))
    this.root.append(bar)

    const pills = document.createElement('div')
    pills.className = 'dz-bw-pills'
    for (const d of PINNED) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-bw-pill'
      b.innerHTML = `${ICONS[d.kind]}<span>${d.label}</span>`
      b.title = `${d.w}x${d.h} @${d.dpr}x${d.touch ? ' · touch' : ''}`
      b.addEventListener('click', () => void this.setDevice(d))
      pills.append(b)
      this.pills.set(d.id, b)
    }
    pills.append(this.button(t('studioRotate'), () => void this.rotate()))
    pills.append(this.button(t('studioPick'), () => void this.arm()))
    pills.append(this.button(t('studioShot'), () => void this.screenshot()))
    this.importBtn = this.button(t('studioImport'), () => this.importLast())
    // Disabled until something is actually picked: a button that reports
    // "nothing to import" on every press is a button that teaches the user to
    // ignore the status line.
    this.importBtn.setAttribute('disabled', '')
    pills.append(this.importBtn)
    this.root.append(pills)

    // THE HOLE. The native view is positioned over this rectangle; nothing may
    // be drawn inside it, because the view would cover it anyway.
    this.hole = document.createElement('div')
    this.hole.className = 'dz-bw-hole'
    this.hole.textContent = t('studioBrowserHint')
    this.root.append(this.hole)

    parent.append(this.root)
    this.markActive()

    const api = window.exelmj
    api?.onStudioPicked?.((capture) => {
      const box = (capture.box ?? {}) as Record<string, number>
      this.host.setStatus(
        t('studioPicked')
          .replace('{tag}', String(capture.tag ?? '?'))
          .replace('{w}', String(box.wPx ?? 0))
          .replace('{h}', String(box.hPx ?? 0))
      )
      this.host.onPicked(capture)
      this.importBtn?.removeAttribute('disabled')
    })
  }

  private button(label: string, run: () => void): HTMLElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dz-btn'
    b.textContent = label
    b.addEventListener('click', run)
    return b
  }

  /** Show the native view over the hole, and keep it there. */
  async show(): Promise<void> {
    this.root.hidden = false
    this.visible = true
    await this.syncBounds(true)
    // The hole moves whenever the window resizes OR the panel scrolls, and a
    // stale rectangle means the view paints over the wrong part of the window.
    this.observer ??= new ResizeObserver(() => void this.syncBounds())
    this.observer.observe(this.hole)
    window.addEventListener('resize', this.onScroll)
    this.root.parentElement?.addEventListener('scroll', this.onScroll, { passive: true })
  }

  async hide(): Promise<void> {
    this.visible = false
    this.root.hidden = true
    this.observer?.disconnect()
    window.removeEventListener('resize', this.onScroll)
    this.root.parentElement?.removeEventListener('scroll', this.onScroll)
    await window.exelmj?.studioBrowserHide?.()
  }

  destroy(): void {
    void this.hide()
    this.root.remove()
  }

  /** Send the hole's rectangle to main, in WINDOW coordinates. */
  private async syncBounds(first = false): Promise<void> {
    if (!this.visible) return
    const r = this.hole.getBoundingClientRect()
    const bounds = {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
    const api = window.exelmj
    if (first) await api?.studioBrowserShow?.(bounds)
    else await api?.studioBrowserBounds?.(bounds)
  }

  async open(url: string): Promise<void> {
    const clean = url.trim()
    if (!clean) return
    // A bare host is almost always a localhost port the user typed quickly.
    const full = /^[a-z]+:/i.test(clean) ? clean : `http://${clean}`
    const res = await window.exelmj?.studioBrowserOpen?.(full)
    if (res && !res.ok) this.host.setStatus(res.reason ?? '')
    else {
      this.urlInput.value = full
      // Re-apply the device: a fresh document starts with no emulation, so a
      // page opened while "mobile" was selected would silently be a desktop.
      await this.setDevice(this.device)
    }
  }

  /** Serve a folder over studio:// and load it — offline, no port, no server. */
  private async openProject(): Promise<void> {
    const dir = await this.host.pickProjectFolder()
    if (!dir) return
    const res = await window.exelmj?.studioServeProject?.(dir)
    if (!res?.ok || !res.url) {
      this.host.setStatus(res?.reason ?? t('studioProjectFailed'))
      return
    }
    await this.open(res.url)
  }

  async setDevice(device: Device): Promise<void> {
    const res = await window.exelmj?.studioBrowserDevice?.(device.id, { rotate: this.rotated })
    if (res && !res.ok) {
      this.host.setStatus(res.reason ? `${t('studioNoDevice')}: ${res.reason}` : t('studioNoDevice'))
      return
    }
    this.device = device
    this.markActive()
  }

  private async rotate(): Promise<void> {
    this.rotated = !this.rotated
    await this.setDevice(this.device)
  }

  private markActive(): void {
    for (const [id, el] of this.pills) el.classList.toggle('active', id === this.device.id)
  }

  private async arm(): Promise<void> {
    const res = await window.exelmj?.studioPickerArm?.()
    if (res?.ok) this.host.setStatus(t('studioPickHint'))
  }

  private importLast(): void {
    const res = this.host.importLast()
    this.host.setStatus(res.detail || (res.ok ? '' : t('studioImportNone')))
  }

  private async screenshot(): Promise<void> {
    const res = await window.exelmj?.studioBrowserShot?.()
    this.host.setStatus(res?.ok ? `${t('studioShotSaved')}: ${res.path}` : (res?.reason ?? ''))
  }
}
