// EXELMJ RTL Mirror — renderer-level right-to-left sheets (column A on the
// RIGHT), which upstream Univer 0.25.1 does not ship (its renderer ignores
// worksheet.rightToLeft; verified in code, release notes and by pixel probe).
//
// Mechanism, proven piece-by-piece in live experiments:
//   1. CSS scaleX(-1) on the sheet render host: geometry, headers, selections
//      and overlays all mirror. The browser maps pointer coordinates through
//      CSS transforms automatically, so hit-testing keeps working un-remapped.
//   2. Canvas text counter-flip: fillText/strokeText mirror each run around
//      its own CENTER (stays inside its cell box), so after the CSS flip text
//      reads normally. Scoped to canvases INSIDE the host — the formula bar
//      canvas lives outside and must stay untouched.
//   3. drawImage counter-flip for picture sources only (HTMLImageElement /
//      ImageBitmap) so photos aren't mirror-imaged; canvas-to-canvas blits
//      pass through untouched.
//   4. ArrowLeft/ArrowRight swapped for visual navigation (Excel-RTL style),
//      except while editing text.
// Activation follows the ACTIVE sheet's rightToLeft flag (default 1 in the
// Arabic UI), so LTR sheets/files still render normally.
import type { FUniver } from '@univerjs/presets'

let api: FUniver | null = null
let active = false
let hindiDigits = false
let host: HTMLElement | null = null
let patchesInstalled = false

const HINDI_MAP: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩'
}
const toHindi = (s: string) => s.replace(/[0-9]/g, (d) => HINDI_MAP[d])

/** Display-level Arabic-Indic digits (٠١٢٣) on the grid; values stay western. */
export function setHindiDigits(on: boolean) {
  if (hindiDigits === on) return
  hindiDigits = on
  if (!host) host = findHost()
  requestRepaint(0)
}

/** True while the grid is mirrored, i.e. the active sheet is right-to-left. */
export function isRtlMirrorActive(): boolean {
  return active
}

const BODY_CLASS = 'exelmj-rtl-active'

function findHost(): HTMLElement | null {
  // The grid canvas is the only big one; the formula-bar canvas is ~30px tall
  // and may exist before the grid has been sized — require real dimensions.
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>('#app canvas')].filter(
    (c) => c.width > 300 && c.height > 200
  )
  const main = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0]
  return (main?.parentElement as HTMLElement | null) ?? null
}

function inHost(ctx: CanvasRenderingContext2D): boolean {
  const canvas = ctx.canvas as unknown
  return !!host && canvas instanceof HTMLCanvasElement && host.contains(canvas)
}

// Univer paints into DETACHED buffer canvases and blits them onto the visible
// ones. We learn which buffers feed canvases inside the mirrored host by
// watching the blits, then mirror text drawn onto those buffers. The formula
// bar (outside the host) keeps its buffers untagged and its text untouched.
const mirroredBuffers = new WeakSet<HTMLCanvasElement>()
let repaintQueued = false
let editingCell = false
let pendingRepaint = false

// The CELL EDITOR is a doc render UNIT inside the host: it allocates a fresh
// text buffer per frame, so blit-time tagging can never catch its text before
// it is drawn — and each new tag used to queue a window resize, which resets
// the editor's caret mid-typing (Backspace stopped deleting; verified live).
// Editor canvases are excluded from mirroring entirely; the overlay box is
// counter-flipped in CSS instead so its text double-flips back to readable.
const isDocEditorCanvas = (c: HTMLCanvasElement) => c.id.startsWith('univer-doc-')

// Buffers we've SEEN blit onto `univer-doc-main-canvas`. BOTH the formula bar
// (fx) and the in-cell editor composite through that one canvas; the GRID rides
// the sheet engine and composites through the sheet canvas, so tagging here is
// exact and can never catch grid text. Tagging only kicks in AFTER the first
// blit, so isDocTextBuffer keeps fast-paths for the first frame.
const docTextBuffers = new WeakSet<HTMLCanvasElement>()

// The FORMULA BAR (fx) and the IN-CELL EDITOR are both Univer Docs painted to a
// DETACHED single-line buffer that blits onto `univer-doc-main-canvas`. Univer's
// RTL doc engine hands BOTH the Arabic text ALREADY REVERSED, in ONE fillText
// call, drawn without bidi (proven live: cell "المنتج" arrives as "جتنملا"), so
// both read back-to-front. Un-reversing the string is the exact inverse of that
// single-call reversal — and Univer's caret / hit-test math is already
// RTL-correct, so the caret, typing and selection stay aligned (verified live:
// open, type, caret). They ride the DOC engine, so the GRID (sheet engine, tall
// buffers) is never matched. Fast-paths give a flash-free FIRST frame: the fx
// bar is full-width (width>600) and always present; the editor is only cell-wide
// but only paints while a cell-edit session is open (editingCell). The tag then
// covers anything the fast-paths miss (a tall multi-line / zoom-enlarged editor)
// once it has blitted at least once.
const isDocTextBuffer = (c: HTMLCanvasElement) =>
  !c.isConnected && (docTextBuffers.has(c) || (c.height <= 50 && (c.width > 600 || editingCell)))
const ARABIC_RE = /[؀-ۿﭐ-﷿ﹰ-﻿]/

function shouldMirrorText(ctx: CanvasRenderingContext2D): boolean {
  const canvas = ctx.canvas as unknown
  if (!(canvas instanceof HTMLCanvasElement)) return false
  if (isDocEditorCanvas(canvas)) return false
  return inHost(ctx) || mirroredBuffers.has(canvas)
}

// Window-resize is the only reliable "repaint everything through the patch"
// trigger, but firing it while a cell edit session is open resets the doc
// editor's selection (caret jumps to offset 0 and delete-left goes dead), so
// repaints requested mid-edit are held until the session closes.
function requestRepaint(delay = 30) {
  if (repaintQueued) return
  repaintQueued = true
  setTimeout(() => {
    repaintQueued = false
    if (editingCell) {
      pendingRepaint = true
      return
    }
    window.dispatchEvent(new Event('resize'))
  }, delay)
}

function installCanvasPatches() {
  if (patchesInstalled) return
  patchesInstalled = true
  const proto = CanvasRenderingContext2D.prototype
  const origFill = proto.fillText
  const origStroke = proto.strokeText
  const origDrawImage = proto.drawImage

  const wrapText = (orig: typeof origFill): typeof origFill =>
    function (this: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth?: number) {
      const asString = typeof text === 'string' ? text : String(text)
      // Formula-bar (fx) + in-cell editor fix — un-reverse Univer's back-to-front
      // Arabic (see isDocTextBuffer). Gated on `active` because the reversal only
      // appears in the RTL context; a plain string flip is the exact inverse of
      // Univer's single-call reversal, so it restores mixed digits/latin too.
      if (
        active &&
        this.canvas instanceof HTMLCanvasElement &&
        isDocTextBuffer(this.canvas) &&
        ARABIC_RE.test(asString)
      ) {
        const fixed = [...asString].reverse().join('')
        return maxWidth === undefined ? orig.call(this, fixed, x, y) : orig.call(this, fixed, x, y, maxWidth)
      }
      const grid = shouldMirrorText(this)
      const drawn = hindiDigits && grid ? toHindi(asString) : asString
      if (!active || !grid) {
        return maxWidth === undefined ? orig.call(this, drawn, x, y) : orig.call(this, drawn, x, y, maxWidth)
      }
      const w = this.measureText(drawn).width
      const align = this.textAlign
      const cx = align === 'center' ? x : align === 'right' || align === 'end' ? x - w / 2 : x + w / 2
      this.save()
      this.translate(cx, 0)
      this.scale(-1, 1)
      this.translate(-cx, 0)
      const r = maxWidth === undefined ? orig.call(this, drawn, x, y) : orig.call(this, drawn, x, y, maxWidth)
      this.restore()
      return r
    }
  proto.fillText = wrapText(origFill)
  proto.strokeText = wrapText(origStroke as typeof origFill) as typeof proto.strokeText

  proto.drawImage = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
    const src = args[0]
    // Tag buffers that composite onto the fx-bar / cell-editor canvas so their
    // Arabic text gets un-reversed (see isDocTextBuffer). Exact — the grid never
    // composites through univer-doc-main-canvas.
    if (
      active &&
      src instanceof HTMLCanvasElement &&
      !src.isConnected &&
      this.canvas instanceof HTMLCanvasElement &&
      this.canvas.id === 'univer-doc-main-canvas'
    ) {
      docTextBuffers.add(src)
    }
    // Learn the buffer chain TRANSITIVELY: Univer composites text buffers into
    // intermediate buffers before the final blit to the visible canvas. Any
    // canvas blitted into the host — or into an already-tagged buffer — gets
    // tagged, then one repaint re-renders its text mirrored.
    if ((active || hindiDigits) && src instanceof HTMLCanvasElement && !mirroredBuffers.has(src)) {
      const destCanvas = this.canvas as unknown
      const destIsEditor = destCanvas instanceof HTMLCanvasElement && isDocEditorCanvas(destCanvas)
      const destEligible =
        !destIsEditor &&
        (inHost(this) || (destCanvas instanceof HTMLCanvasElement && mirroredBuffers.has(destCanvas)))
      if (destEligible) {
        mirroredBuffers.add(src)
        requestRepaint(30)
      }
    }
    const isPicture =
      src instanceof HTMLImageElement || (typeof ImageBitmap !== 'undefined' && src instanceof ImageBitmap)
    if (!active || !isPicture || !shouldMirrorText(this)) {
      return (origDrawImage as unknown as (...a: unknown[]) => void).apply(this, args)
    }
    let dx: unknown
    let dw: unknown
    if (args.length <= 3) {
      dx = args[1]
      dw = (src as { width?: number }).width ?? 0
    } else if (args.length <= 5) {
      dx = args[1]
      dw = args[3]
    } else {
      dx = args[5]
      dw = args[7]
    }
    if (typeof dx !== 'number' || typeof dw !== 'number' || !dw) {
      return (origDrawImage as unknown as (...a: unknown[]) => void).apply(this, args)
    }
    const cx = dx + dw / 2
    this.save()
    this.translate(cx, 0)
    this.scale(-1, 1)
    this.translate(-cx, 0)
    const r = (origDrawImage as unknown as (...a: unknown[]) => void).apply(this, args)
    this.restore()
    return r
  } as typeof proto.drawImage
}

function installKeySwap() {
  window.addEventListener(
    'keydown',
    (e: KeyboardEvent) => {
      if (!active || (e as unknown as { __exelmjSwapped?: boolean }).__exelmjSwapped) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      e.stopImmediatePropagation()
      e.preventDefault()
      const swappedKey = e.key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft'
      const clone = new KeyboardEvent('keydown', {
        key: swappedKey,
        code: swappedKey,
        bubbles: true,
        cancelable: true,
        composed: true,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
        repeat: e.repeat
      })
      ;(clone as unknown as { __exelmjSwapped?: boolean }).__exelmjSwapped = true
      ;(e.target as EventTarget | null)?.dispatchEvent(clone)
    },
    { capture: true }
  )
}

// Univer positions cell-anchored popups (column filter, data-validation list,
// formula autocomplete, comment/note bubbles, hyperlink cards) with
// `position:fixed; left:<sceneX>px` measured from the UN-mirrored scene
// (SheetCanvasPopManagerService, verified in sheets-ui). Under our scaleX(-1)
// grid mirror the cell is visually on the opposite half, so these popups open
// detached on the wrong side (a filter funnel on right-hand column A opened at
// the far LEFT — verified live in the packaged app via CDP). Toolbar dropdowns
// are Radix poppers transform-anchored to their header button and stay correct,
// so we mirror ONLY the Univer CanvasPopup sections (class `univer-fixed`).
const CELL_POPUP_SEL = 'section.univer-fixed'
const flippedLeft = new WeakMap<HTMLElement, string>()
let popupObserver: MutationObserver | null = null

function mirrorCellPopup(sec: HTMLElement) {
  if (!active) return
  const raw = sec.style.left
  // `raw === our last write` → this mutation is our own echo, skip it
  if (!raw || raw === flippedLeft.get(sec)) return
  const left = Number.parseFloat(raw)
  if (!Number.isFinite(left) || left < -5000) return // off-screen measuring phase
  const vw = document.documentElement.clientWidth
  const w = sec.getBoundingClientRect().width
  if (!w) return
  const flipped = `${Math.min(Math.max(0, vw - left - w), vw - w).toFixed(2)}px`
  flippedLeft.set(sec, flipped)
  sec.style.left = flipped
}

function scanCellPopups() {
  document.querySelectorAll<HTMLElement>(CELL_POPUP_SEL).forEach(mirrorCellPopup)
}

function installPopupMirror() {
  if (popupObserver) return
  popupObserver = new MutationObserver((records) => {
    if (!active) return
    for (const rec of records) {
      const tgt = rec.target as HTMLElement
      if (rec.type === 'attributes' && tgt.matches?.(CELL_POPUP_SEL)) mirrorCellPopup(tgt)
      rec.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return
        if (node.matches(CELL_POPUP_SEL)) mirrorCellPopup(node)
        node.querySelectorAll<HTMLElement>(CELL_POPUP_SEL).forEach(mirrorCellPopup)
      })
    }
  })
  popupObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style']
  })
}

function injectCss() {
  if (document.getElementById('exelmj-rtl-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-rtl-style'
  // float-DOM charts and the cell-editor overlay counter-flip inside the
  // mirrored host so their content double-flips back to readable. The editor
  // overlay is the host child that wraps the doc-render canvas (its canvases
  // are excluded from text mirroring — see isDocEditorCanvas).
  style.textContent = [
    `.${BODY_CLASS} .exelmj-chart-root { transform: scaleX(-1); }`,
    `.exelmj-rtl-host > div:has(canvas[id^="univer-doc-"]) { transform: scaleX(-1); }`
  ].join('\n')
  document.head.append(style)
}

let retries = 0

function apply(on: boolean) {
  if (on) {
    const fresh = findHost()
    if (fresh && fresh !== host) {
      if (host) {
        host.style.transform = ''
        host.classList.remove('exelmj-rtl-host')
      }
      host = fresh
    }
    if (!host) {
      // grid canvas not sized yet (early boot) — retry shortly
      active = false
      document.body.classList.remove(BODY_CLASS)
      if (retries++ < 20) setTimeout(syncRtlMirror, 300)
      return
    }
    retries = 0
  }
  if (!host) {
    active = false
    return
  }
  if (active === on) return
  active = on
  host.style.transform = on ? 'scaleX(-1)' : ''
  host.classList.toggle('exelmj-rtl-host', on)
  document.body.classList.toggle(BODY_CLASS, on)
  if (on) scanCellPopups() // fix any popup already open when the mirror turns on
  requestRepaint(0) // force a repaint through the patch
}

/**
 * Force Univer to fully RE-RENDER the cell text (re-run fillText, where the
 * mirror counter-flips) by nudging the zoom ratio and restoring it. This is the
 * ONLY reliable trigger: Univer caches the rendered text scene and a
 * resize/scroll/caret-repaint merely re-BLITS that cache — fillText never
 * re-runs, so freshly-swapped buffers keep whatever orientation they were first
 * drawn with. Zoom invalidates the cache (verified live: a 100→110% nudge fixed
 * reversed text instantly). The nudge (±0.001) is imperceptible and restored.
 */
function forceReflow() {
  try {
    const ws = api?.getActiveWorkbook()?.getActiveSheet() as unknown as
      | { getZoom?: () => number; zoom?: (r: number) => unknown }
      | undefined
    if (ws?.getZoom && ws.zoom) {
      const z = ws.getZoom() || 1
      const nudge = z >= 4 ? z - 0.001 : z + 0.001
      ws.zoom(nudge)
      setTimeout(() => {
        try {
          ws.zoom?.(z)
        } catch {
          // sheet swapped again mid-nudge — ignore
        }
      }, 50)
      return
    }
  } catch {
    // facade unavailable — fall back to a repaint (better than nothing)
  }
  requestRepaint(0)
}

/**
 * Re-arm the mirror after a WORKBOOK SWAP (new/open/template/autosave-recovery).
 * replaceWorkbook builds FRESH grid canvases, and Univer draws the opened
 * content ONCE into a cached scene — if the mirror isn't active at that instant
 * the text is cached un-flipped and later reads REVERSED (illegible; users
 * report it as "the file opened empty/broken"). Fix: re-discover the new host,
 * re-apply the flip, then forceReflow() (zoom nudge) so the text re-renders
 * WHILE `active` is true. The swap is async, so we retry over a short window.
 */
export function refreshRtlMirror() {
  host = null // force re-discovery of the new grid host on the next apply()
  retries = 0
  const rearm = (delay: number) =>
    setTimeout(() => {
      const fresh = findHost()
      if (fresh && fresh !== host) {
        host = fresh
        if (active) {
          host.style.transform = 'scaleX(-1)'
          host.classList.add('exelmj-rtl-host')
        }
      }
      syncRtlMirror()
      // The zoom nudge is the only reliable "repaint everything" trigger.
      // LTR sheets need it too after being (re)built while hidden — a grid
      // whose first paint happened under display:none comes back BLANK
      // otherwise (seen live returning from word mode).
      forceReflow()
    }, delay)
  ;[150, 550].forEach(rearm)
}

/** Re-evaluate the active sheet's flag and mirror accordingly. */
export function syncRtlMirror() {
  if (!api) return
  try {
    const wb = api.getActiveWorkbook()
    const fws = wb?.getActiveSheet()
    if (!wb || !fws) {
      apply(false)
      return
    }
    const cfg = (
      fws as unknown as { getSheet?: () => { getConfig?: () => { rightToLeft?: number } } }
    ).getSheet?.()?.getConfig?.()
    const flag = cfg
      ? cfg.rightToLeft === 1
      : wb.save().sheets[fws.getSheetId()]?.rightToLeft === 1
    apply(flag)
  } catch {
    // keep current state on transient errors (e.g., mid workbook swap)
  }
}

export function initRtlMirror(univerAPI: FUniver) {
  api = univerAPI
  installCanvasPatches()
  installKeySwap()
  installPopupMirror()
  injectCss()
  setTimeout(syncRtlMirror, 500)
  univerAPI.addEvent(univerAPI.Event.CommandExecuted, (event) => {
    const e = event as unknown as { id?: string; params?: { visible?: boolean } }
    const id = String(e.id ?? '')
    if (id === 'sheet.operation.set-cell-edit-visible') {
      // hold repaints while a cell edit session is open (they reset its caret)
      editingCell = !!e.params?.visible
      if (!editingCell && pendingRepaint) {
        pendingRepaint = false
        requestRepaint(60)
      }
      return
    }
    if (
      id === 'sheet.mutation.set-worksheet-right-to-left' ||
      id.includes('set-worksheet-active') ||
      id === 'sheet.mutation.insert-sheet' ||
      id.includes('remove-sheet')
    ) {
      setTimeout(syncRtlMirror, 60)
    }
  })
}
