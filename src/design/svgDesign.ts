// SVG artwork support for the design mode: faithful mounting + IN-PLACE text
// editing (the part .ai/PDF cannot offer) + valid re-serialization.
//
// Rules learned from research (see PROJECT_MAP):
// - Parse with DOMParser('image/svg+xml') and mount inside a SHADOW ROOT:
//   Illustrator's internal <style> uses generic class names (.st0/.cls-1)
//   that would collide with the app and other files. innerHTML would mangle
//   xlink:href namespaces — never use it.
// - Editing happens in an OVERLAY contenteditable (Chromium gives Arabic
//   bidi/shaping/caret for free); SVG itself has no text editing.
// - Illustrator splits runs into kerning tspans with per-glyph x arrays —
//   collapse to one tspan before writing the new string.
// - CSS classes beat presentation attributes: inline the computed font/fill
//   into style attributes on first edit so later changes actually apply.
// - Illustrator writes PostScript font names (ArialMT, Cairo-Regular…): keep
//   them first, append a cleaned family + Arabic-capable fallbacks.

export interface SvgTextTarget {
  element: SVGTextElement
  screenRect: DOMRect
  fontSizePx: number
}

export function parseSvg(source: string): SVGSVGElement {
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (parsed.querySelector('parsererror')) throw new Error('invalid svg')
  const root = parsed.documentElement
  if (root.nodeName.toLowerCase() !== 'svg') throw new Error('not an svg root')
  return document.importNode(root, true) as unknown as SVGSVGElement
}

/** Mount inside a shadow root; returns the live svg element. */
export function mountSvg(host: HTMLElement, svg: SVGSVGElement): SVGSVGElement {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
  shadow.innerHTML = ''
  shadow.appendChild(svg)
  return svg
}

/** Page size in CSS px derived from viewBox/width/height (pt≈px at 96dpi ¾). */
const UNIT_TO_PX: Record<string, number> = {
  px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, '': 1
}

/** "210mm" → CSS px; % or unparseable → NaN. */
export function lengthToPx(raw: string | null): number {
  if (!raw) return NaN
  const m = /^\s*([\d.]+)\s*([a-z%]*)\s*$/i.exec(raw)
  if (!m) return NaN
  const factor = UNIT_TO_PX[m[2].toLowerCase()]
  if (factor === undefined) return NaN
  const v = parseFloat(m[1]) * factor
  return Number.isFinite(v) && v > 0 ? v : NaN
}

export function svgSizePx(svg: SVGSVGElement): { width: number; height: number } {
  const vb = svg.viewBox?.baseVal
  if (vb && vb.width > 0 && vb.height > 0) return { width: vb.width, height: vb.height }
  const w = lengthToPx(svg.getAttribute('width'))
  const h = lengthToPx(svg.getAttribute('height'))
  return { width: w > 0 ? w : 794, height: h > 0 ? h : 1123 }
}

const PS_SUFFIX_RE = /-?(Regular|Bold|Light|Medium|Black|Heavy|Thin|Oblique|Italic|BoldItalic|SemiBold|ExtraBold)$|MT$|PS$|LT$/g

/** ArialMT / Cairo-Regular → usable CSS family list + weight/style hints. */
export function normalizeFontFamily(psName: string): { css: string; weight?: string; italic?: boolean } {
  const raw = psName.replace(/^['"]|['"]$/g, '').trim()
  if (!raw) return { css: `'Segoe UI', Tahoma, sans-serif` }
  let weight: string | undefined
  let italic = false
  if (/Bold/i.test(raw)) weight = '700'
  else if (/Black|Heavy/i.test(raw)) weight = '900'
  else if (/Light|Thin/i.test(raw)) weight = '300'
  if (/Italic|Oblique/i.test(raw)) italic = true
  const cleaned = raw
    .replace(PS_SUFFIX_RE, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/-/g, ' ')
    .trim()
  const families = [raw, cleaned].filter((f, i, a) => f && a.indexOf(f) === i).map((f) => `'${f}'`)
  return { css: `${families.join(', ')}, 'Segoe UI', Tahoma, sans-serif`, weight, italic }
}

/** All editable text elements (skip empties and defs). */
export function textElements(svg: SVGSVGElement): SVGTextElement[] {
  return [...svg.querySelectorAll('text')].filter(
    (el) => !el.closest('defs') && (el.textContent ?? '').trim().length > 0
  ) as SVGTextElement[]
}

/**
 * Prepare a <text> for editing: inline its computed font/fill (so class-based
 * styling stops overriding our edits) and normalize the PS font name.
 */
export function inlineTextStyles(el: SVGTextElement) {
  if (el.dataset.exelmjInlined) return
  el.dataset.exelmjInlined = '1'
  const cs = getComputedStyle(el)
  const family = normalizeFontFamily(cs.fontFamily.split(',')[0] ?? '')
  el.style.fontFamily = family.css
  el.style.fontSize = cs.fontSize
  if (family.weight && cs.fontWeight === '400') el.style.fontWeight = family.weight
  else el.style.fontWeight = cs.fontWeight
  if (family.italic) el.style.fontStyle = 'italic'
  const fill = cs.fill
  if (fill && fill !== 'none') el.style.fill = fill
  el.removeAttribute('class')
}

/**
 * Replace the element's content with a single collapsed tspan carrying the new
 * text — Illustrator's per-glyph kerning tspans would misplace edited text.
 */
/** Visual lines of a <text>: tspans grouped by their y (Illustrator splits one
 * line into same-y kerning tspans; a different y starts a real new line). */
export function textLines(el: SVGTextElement): string[] {
  const tspans = [...el.querySelectorAll('tspan')]
  if (!tspans.length) return [(el.textContent ?? '').trim()]
  const lines: string[] = []
  let lastY: string | null = null
  for (const t of tspans) {
    const y = t.getAttribute('y') ?? ''
    if (lastY === null || (y && y !== lastY)) {
      lines.push(t.textContent ?? '')
      if (y) lastY = y
    } else {
      lines[lines.length - 1] += t.textContent ?? ''
    }
  }
  return lines
}

export function commitText(el: SVGTextElement, newText: string) {
  const first = el.querySelector('tspan')
  const x = first?.getAttribute('x')?.split(/[\s,]+/)[0] ?? el.getAttribute('x') ?? '0'
  const y = first?.getAttribute('y')?.split(/[\s,]+/)[0] ?? el.getAttribute('y') ?? '0'
  const sizePx = lengthToPx(getComputedStyle(el).fontSize) || 16
  while (el.firstChild) el.removeChild(el.firstChild)
  el.removeAttribute('x')
  el.removeAttribute('y')
  // one tspan per edited line, stepped by ~1.2em (Illustrator-like leading)
  newText.replace(/\r/g, '').split('\n').forEach((line, i) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
    tspan.setAttribute('x', x)
    tspan.setAttribute('y', String(Number(y) + i * sizePx * 1.2))
    tspan.textContent = line
    el.appendChild(tspan)
  })
}

/** New standalone Arabic-ready text node (from an overlay box, at save time). */
export function appendTextNode(
  svg: SVGSVGElement,
  opts: {
    x: number
    y: number
    text: string
    font: string
    sizePx: number
    color: string
    bold: boolean
    align: 'right' | 'center' | 'left'
    rtl: boolean
  }
) {
  const lines = opts.text.replace(/\r/g, '').split('\n')
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
  // with direction:rtl, text-anchor=start anchors the RIGHT edge — exactly the
  // Arabic-label behavior; center stays center in both directions.
  const anchor = opts.align === 'center' ? 'middle' : 'start'
  if (opts.rtl) el.setAttribute('direction', 'rtl')
  el.setAttribute('text-anchor', anchor)
  el.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:lang', 'ar')
  el.setAttribute(
    'style',
    `font-family: '${opts.font.replace(/'/g, '')}', 'Segoe UI', Tahoma, sans-serif;` +
      ` font-size: ${opts.sizePx}px; fill: ${opts.color};` +
      (opts.bold ? ' font-weight: 700;' : '')
  )
  lines.forEach((line, i) => {
    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan')
    tspan.setAttribute('x', String(opts.x))
    tspan.setAttribute('y', String(opts.y + i * opts.sizePx * 1.35))
    tspan.textContent = line
    el.appendChild(tspan)
  })
  svg.appendChild(el)
}

export interface SvgRootAttrs {
  width: string | null
  height: string | null
  viewBox: string | null
}

export function captureRootAttrs(svg: SVGSVGElement): SvgRootAttrs {
  return {
    width: svg.getAttribute('width'),
    height: svg.getAttribute('height'),
    viewBox: svg.getAttribute('viewBox')
  }
}

export function serializeSvg(svg: SVGSVGElement, original?: SvgRootAttrs): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // the mount forces width/height=100% (+ a synthetic viewBox) on the LIVE
  // root — restore the captured originals so the saved file keeps its
  // intrinsic size (review finding: files were being saved width="100%").
  if (original) {
    for (const [name, value] of Object.entries(original) as Array<[keyof SvgRootAttrs, string | null]>) {
      if (value === null) clone.removeAttribute(name)
      else clone.setAttribute(name, value)
    }
  }
  for (const el of clone.querySelectorAll('[data-exelmj-inlined]')) {
    el.removeAttribute('data-exelmj-inlined')
  }
  const xml = new XMLSerializer().serializeToString(clone)
  return xml.startsWith('<?xml') ? xml : `<?xml version="1.0" encoding="UTF-8"?>\n${xml}`
}
