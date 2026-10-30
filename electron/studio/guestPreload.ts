// The guest preload: the element picker, running inside the previewed page.
//
// WHY A PRELOAD AND NOT AN INJECTED SCRIPT
// A preload runs before ANY page script, in an ISOLATED world that shares the
// DOM but not the page's globals. That means the page cannot patch what we
// read (no monkey-patched getComputedStyle, no redefined getBoundingClientRect)
// and we do not have to fight for injection timing. The Chrome extension this
// replaces spent a whole subsystem on that fight — a version handshake, a
// liveness probe, a PING/inject dance — all of which is unnecessary here.
//
// READ-ONLY BY CONSTRUCTION. This agent hovers, highlights and reads. It never
// clicks, types, submits or navigates. In Electron a synthesised click is
// TRUSTED — the page cannot tell it from the user's — so a picker that could
// click would be a picker that could really submit a form or really buy
// something. The capability is simply absent rather than guarded.

import { contextBridge, ipcRenderer } from 'electron'

const PREFIX = '__exelmj-picker'
/** Just below the maximum, leaving room for the HUD to sit above the outline
 * without either of them fighting the page's own stacking. */
const Z = 2147483640

interface Layers {
  host: HTMLElement
  shadow: ShadowRoot
  margin: HTMLElement
  border: HTMLElement
  padding: HTMLElement
  content: HTMLElement
  hud: HTMLElement
}

let ui: Layers | null = null
let armed = false
let current: Element | null = null

function build(): Layers {
  if (ui) return ui
  const host = document.createElement('div')
  host.id = PREFIX
  // A 0x0 fixed host carries only the stacking context. Sizing it would make
  // it a hit-testing obstacle over the whole page.
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0 auto auto 0',
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: String(Z)
  })
  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = `
    .l { position: fixed; pointer-events: none; box-sizing: border-box;
         transition: top .05s linear, left .05s linear, width .05s linear, height .05s linear; }
    .margin  { background: rgba(246,178,107,.35); }
    .border  { background: rgba(255,229,153,.45); }
    .padding { background: rgba(147,196,125,.45); }
    /* outline, NOT border: a border would change the box we are measuring */
    .content { background: rgba(111,168,220,.45); outline: 1px solid #185abd; outline-offset: -1px; }
    .hud { position: fixed; pointer-events: none; font: 11px/1.5 system-ui, sans-serif;
           background: #185abd; color: #fff; padding: 2px 6px; border-radius: 3px;
           white-space: nowrap; direction: ltr; }
  `
  const mk = (cls: string): HTMLElement => {
    const el = document.createElement('div')
    el.className = `l ${cls}`
    el.style.display = 'none'
    shadow.append(el)
    return el
  }
  shadow.append(style)
  const layers: Layers = {
    host,
    shadow,
    margin: mk('margin'),
    border: mk('border'),
    padding: mk('padding'),
    content: mk('content'),
    hud: (() => {
      const el = document.createElement('div')
      el.className = 'hud'
      el.style.display = 'none'
      shadow.append(el)
      return el
    })()
  }
  document.documentElement.append(host)
  ui = layers
  return layers
}

const px = (v: string): number => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

/** Paint the four box-model layers over an element. */
function highlight(el: Element): void {
  const l = build()
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const m = {
    t: px(cs.marginTop),
    r: px(cs.marginRight),
    b: px(cs.marginBottom),
    left: px(cs.marginLeft)
  }
  const bd = {
    t: px(cs.borderTopWidth),
    r: px(cs.borderRightWidth),
    b: px(cs.borderBottomWidth),
    left: px(cs.borderLeftWidth)
  }
  const p = {
    t: px(cs.paddingTop),
    r: px(cs.paddingRight),
    b: px(cs.paddingBottom),
    left: px(cs.paddingLeft)
  }
  // Rects are VIEWPORT coordinates and the layers are position:fixed, so they
  // are used verbatim — no scroll arithmetic, which is where this kind of
  // overlay usually drifts.
  const set = (el2: HTMLElement, x: number, y: number, w: number, h: number): void => {
    Object.assign(el2.style, {
      display: '',
      left: `${x}px`,
      top: `${y}px`,
      width: `${Math.max(0, w)}px`,
      height: `${Math.max(0, h)}px`
    })
  }
  set(l.margin, r.left - m.left, r.top - m.t, r.width + m.left + m.r, r.height + m.t + m.b)
  set(l.border, r.left, r.top, r.width, r.height)
  set(
    l.padding,
    r.left + bd.left,
    r.top + bd.t,
    r.width - bd.left - bd.r,
    r.height - bd.t - bd.b
  )
  set(
    l.content,
    r.left + bd.left + p.left,
    r.top + bd.t + p.t,
    r.width - bd.left - bd.r - p.left - p.r,
    r.height - bd.t - bd.b - p.t - p.b
  )
  const tag = el.tagName.toLowerCase()
  const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/)[0]}` : ''
  l.hud.textContent = `${tag}${cls}  ${Math.round(r.width)} x ${Math.round(r.height)}`
  l.hud.style.display = ''
  // Above the element when there is room, inside it when there is not — a HUD
  // that goes off-screen at the top of the page is a HUD you cannot read.
  const above = r.top > 20
  l.hud.style.left = `${Math.max(2, r.left)}px`
  l.hud.style.top = `${above ? r.top - 18 : r.top + 2}px`
}

function clear(): void {
  if (!ui) return
  for (const el of [ui.margin, ui.border, ui.padding, ui.content, ui.hud]) el.style.display = 'none'
}

/**
 * A stable-ish CSS selector for an element.
 *
 * Priority: test attributes, then a plausible id, then semantic classes, then
 * an nth-child path capped in depth. A test attribute beats an id deliberately:
 * framework ids (`useId`, `input-1234`) are volatile, while a test attribute is
 * a promise someone made on purpose.
 */
function selectorFor(el: Element): string {
  const doc = el.ownerDocument
  const unique = (sel: string): boolean => {
    try {
      return doc.querySelectorAll(sel).length === 1
    } catch {
      return false
    }
  }
  for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-test-id']) {
    const v = el.getAttribute(attr)
    if (v) {
      const sel = `[${attr}="${CSS.escape(v)}"]`
      if (unique(sel)) return sel
    }
  }
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
    const sel = `#${CSS.escape(el.id)}`
    if (unique(sel)) return sel
  }
  const semantic = semanticClasses(el)
  if (semantic.length) {
    const sel = `${el.tagName.toLowerCase()}.${semantic.map((c) => CSS.escape(c)).join('.')}`
    if (unique(sel)) return sel
  }
  // Structural path, capped: beyond a handful of levels the selector is more
  // fragile than useful, and the early exit at a unique ancestor is what keeps
  // the brittle part short.
  const parts: string[] = []
  let node: Element | null = el
  for (let depth = 0; node && depth < 6; depth++) {
    const parent: Element | null = node.parentElement
    if (!parent) break
    const idx = [...parent.children].filter((c) => c.tagName === node!.tagName).indexOf(node) + 1
    parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${idx})`)
    const candidate = parts.join(' > ')
    if (unique(candidate)) return candidate
    if (parent.id && /^[A-Za-z][\w-]*$/.test(parent.id)) {
      const withId = `#${CSS.escape(parent.id)} > ${candidate}`
      if (unique(withId)) return withId
      break
    }
    node = parent
  }
  return parts.join(' > ') || el.tagName.toLowerCase()
}

/**
 * Classes that describe WHAT something is, not how it looks.
 *
 * Utility CSS (`p-4`, `mt-2`, `w-1/2`) and hashed module classes
 * (`Button_root__x7f2a`) are both worthless in a selector: the first is shared
 * by hundreds of elements, the second changes on every build. The shape rule
 * catches utility classes with no framework dictionary.
 */
function semanticClasses(el: Element): string[] {
  if (typeof el.className !== 'string') return []
  return el.className
    .trim()
    .split(/\s+/)
    .filter((c) => c.length > 2 && c.length < 40)
    .filter((c) => !/^-?[a-z]{1,3}-[\d.\-/]+$/.test(c))
    .filter((c) => !/^[a-z]+-\[.+\]$/.test(c))
    .filter((c) => !/[_-]{2}[a-z0-9]{5,}$/i.test(c))
    .filter((c) => !/^[a-z]+_[a-zA-Z]+__/.test(c))
    .slice(0, 2)
}

/** The 25 properties that describe a component's box and look. */
const KEY_STYLES = [
  'display',
  'position',
  'box-sizing',
  'width',
  'height',
  'margin',
  'padding',
  'border',
  'border-radius',
  'color',
  'background-color',
  'background-image',
  'font-size',
  'font-family',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'direction',
  'flex-direction',
  'justify-content',
  'align-items',
  'gap',
  'grid-template-columns',
  'box-shadow',
  'opacity',
  'overflow'
]

/** Everything the canvas needs to rebuild this element. Read-only. */
function capture(el: Element): Record<string, unknown> {
  const r = el.getBoundingClientRect()
  const cs = getComputedStyle(el)
  const styles: Record<string, string> = {}
  for (const p of KEY_STYLES) styles[p] = cs.getPropertyValue(p)
  return {
    tag: el.tagName.toLowerCase(),
    // The ROLE the page declares, not one we infer — an inferred role is a
    // guess presented as a fact.
    role: el.getAttribute('role') ?? null,
    ariaLabel: el.getAttribute('aria-label') ?? null,
    selector: selectorFor(el),
    // Viewport coordinates in CSS pixels, stated as such so nothing downstream
    // has to guess the unit.
    box: {
      xPx: Math.round(r.left + window.scrollX),
      yPx: Math.round(r.top + window.scrollY),
      wPx: Math.round(r.width),
      hPx: Math.round(r.height)
    },
    dpr: window.devicePixelRatio,
    styles,
    text: (el.textContent ?? '').trim().slice(0, 2000),
    html: el.outerHTML.slice(0, 20000),
    url: location.href,
    // Children with their own boxes: the extension this replaces exported NO
    // per-node geometry, which is what forced its importer to re-run layout.
    children: [...el.children].slice(0, 60).map((c) => {
      const cr = c.getBoundingClientRect()
      return {
        tag: c.tagName.toLowerCase(),
        box: {
          xPx: Math.round(cr.left + window.scrollX),
          yPx: Math.round(cr.top + window.scrollY),
          wPx: Math.round(cr.width),
          hPx: Math.round(cr.height)
        },
        text: (c.textContent ?? '').trim().slice(0, 200)
      }
    })
  }
}

/** elementFromPoint pierces shadow roots via composedPath, which
 * elementFromPoint alone does not. */
function elementAt(x: number, y: number): Element | null {
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  // never pick our own overlay
  if (el.id === PREFIX || el.closest?.(`#${PREFIX}`)) return null
  return el
}

const onMove = (e: MouseEvent): void => {
  if (!armed) return
  const el = elementAt(e.clientX, e.clientY)
  if (!el || el === current) return
  current = el
  highlight(el)
}

const onClick = (e: MouseEvent): void => {
  if (!armed) return
  // The pick must not reach the page: a click on a link would navigate away
  // from the thing being captured.
  e.preventDefault()
  e.stopPropagation()
  const el = current ?? elementAt(e.clientX, e.clientY)
  if (!el) return
  ipcRenderer.send('studio:picked', capture(el))
  disarm()
}

const onKey = (e: KeyboardEvent): void => {
  if (armed && e.key === 'Escape') {
    e.preventDefault()
    disarm()
  }
}

function arm(): void {
  if (armed) return
  armed = true
  build()
  // Capture phase, so a page that stops propagation on its own handlers cannot
  // hide the pointer from us.
  window.addEventListener('mousemove', onMove, true)
  window.addEventListener('click', onClick, true)
  window.addEventListener('keydown', onKey, true)
}

function disarm(): void {
  armed = false
  current = null
  clear()
  window.removeEventListener('mousemove', onMove, true)
  window.removeEventListener('click', onClick, true)
  window.removeEventListener('keydown', onKey, true)
  ipcRenderer.send('studio:picker-disarmed')
}

ipcRenderer.on('studio:arm-picker', () => arm())
ipcRenderer.on('studio:disarm-picker', () => disarm())

// A navigation tears the page down; the host is told so it can drop a stale
// "picking..." state rather than waiting for a pick that will never come.
window.addEventListener('pagehide', () => {
  if (armed) disarm()
})

// Exactly one namespaced object, and nothing that can act on the page.
contextBridge.exposeInMainWorld('__exelmjPicker', {
  version: 1,
  isArmed: () => armed
})
