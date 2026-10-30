// Page setup for the word document: paper size, orientation, margins and the
// header/footer that repeat on every printed page.
//
// One model, four consumers — the on-screen sheet (width + padding), the page
// guides drawn over it, the print/PDF stylesheet, and the docx section
// properties. Keeping the numbers in millimetres here means the docx twips and
// the CSS pixels are both derived, never guessed in two places.

export type PaperSize = 'A4' | 'Letter'
export type Orientation = 'portrait' | 'landscape'

export interface Margins {
  top: number
  bottom: number
  left: number
  right: number
}

export interface PageSetup {
  size: PaperSize
  orientation: Orientation
  margin: Margins
  header: string
  footer: string
  /** Append "— n" (the page number) to the footer on every page. */
  pageNumbers: boolean
  /**
   * The document's own body size in points — Word's "Normal" style. A file
   * converted from a PDF adopts the size that file was set in, so 6pt bank
   * statement stays 6pt instead of being re-typeset at the editor's default.
   */
  baseFontPt: number
  /** Body line spacing, as a multiple of the font size. */
  baseLineHeight: number
  /** Text drawn diagonally behind the page — "مسودة", "سري", a company name. */
  watermark: string
}

export const PAPER_MM: Record<PaperSize, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 215.9, height: 279.4 }
}

export function defaultPageSetup(): PageSetup {
  return {
    size: 'A4',
    orientation: 'portrait',
    margin: { top: 25, bottom: 25, left: 24, right: 24 },
    header: '',
    footer: '',
    pageNumbers: false,
    baseFontPt: 11,
    baseLineHeight: 1.6,
    watermark: ''
  }
}

export function mmToPx(mm: number): number {
  return (mm * 96) / 25.4
}

export function mmToTwip(mm: number): number {
  return Math.round((mm * 1440) / 25.4)
}

/** Paper box in millimetres, already swapped for landscape. */
export function paperBoxMm(setup: PageSetup): { width: number; height: number } {
  const box = PAPER_MM[setup.size] ?? PAPER_MM.A4
  return setup.orientation === 'landscape'
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height }
}

/** Height of ONE page's text column, in CSS pixels. */
export function contentHeightPx(setup: PageSetup): number {
  const box = paperBoxMm(setup)
  return Math.max(100, mmToPx(box.height - setup.margin.top - setup.margin.bottom))
}

/** Width of the text column, in CSS pixels — the widest an image may print. */
export function contentWidthPx(setup: PageSetup): number {
  const box = paperBoxMm(setup)
  return Math.max(100, mmToPx(box.width - setup.margin.left - setup.margin.right))
}

export function clampSetup(setup: PageSetup): PageSetup {
  const base = Number(setup.baseFontPt)
  const line = Number(setup.baseLineHeight)
  const box = PAPER_MM[setup.size] ? setup.size : 'A4'
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, Number.isFinite(v) ? v : 0))
  const paper = PAPER_MM[box]
  return {
    ...setup,
    size: box,
    orientation: setup.orientation === 'landscape' ? 'landscape' : 'portrait',
    margin: {
      top: clamp(setup.margin.top, paper.height / 3),
      bottom: clamp(setup.margin.bottom, paper.height / 3),
      left: clamp(setup.margin.left, paper.width / 3),
      right: clamp(setup.margin.right, paper.width / 3)
    },
    baseFontPt: Number.isFinite(base) && base >= 4 && base <= 72 ? base : 11,
    baseLineHeight: Number.isFinite(line) && line >= 0.8 && line <= 4 ? line : 1.6,
    watermark: typeof setup.watermark === 'string' ? setup.watermark.slice(0, 40) : ''
  }
}

/** Size the on-screen sheet and its text column from the setup. */
export function applyPageSetup(page: HTMLElement, editor: HTMLElement | null, setup: PageSetup) {
  const box = paperBoxMm(setup)
  page.style.width = `${mmToPx(box.width)}px`
  page.style.minHeight = `${mmToPx(box.height)}px`
  page.style.position = 'relative'
  if (editor) {
    editor.style.minHeight = `${mmToPx(box.height)}px`
    editor.style.fontSize = `${setup.baseFontPt || 11}pt`
    editor.style.lineHeight = String(setup.baseLineHeight || 1.6)
    editor.style.paddingTop = `${mmToPx(setup.margin.top)}px`
    editor.style.paddingBottom = `${mmToPx(setup.margin.bottom)}px`
    editor.style.paddingInlineStart = `${mmToPx(setup.margin.left)}px`
    editor.style.paddingInlineEnd = `${mmToPx(setup.margin.right)}px`
  }
}

/** The diagonal watermark, painted on the sheet behind the text. */
export function applyWatermark(page: HTMLElement, setup: PageSetup) {
  let mark = page.querySelector<HTMLElement>('.exelmj-watermark')
  if (!setup.watermark) {
    mark?.remove()
    return
  }
  if (!mark) {
    mark = document.createElement('div')
    mark.className = 'exelmj-watermark'
    // first child: it must sit UNDER the text, and the editor is next in line
    page.prepend(mark)
  }
  mark.textContent = setup.watermark
}

/**
 * Dashed guides showing where each printed page ends. The editor is one long
 * sheet (a real paginated contenteditable would have to re-flow every node on
 * every keystroke), so these lines are the honest middle ground: they mark the
 * height at which Chromium's printer starts a new page.
 */
export function paintPageGuides(
  page: HTMLElement,
  editor: HTMLElement | null,
  setup: PageSetup,
  pageLabel: (n: number) => string
): number {
  injectGuideCss()
  let layer = page.querySelector<HTMLElement>('.exelmj-page-guides')
  if (!layer) {
    layer = document.createElement('div')
    layer.className = 'exelmj-page-guides'
    page.append(layer)
  }
  const step = contentHeightPx(setup)
  const top = mmToPx(setup.margin.top)
  layer.innerHTML = ''
  // Measured from the TEXT, not the sheet: the sheet is always at least one
  // page tall, so measuring it would report two pages for an empty document.
  // offsetTop/offsetHeight are layout values, so the zoom transform is moot.
  const blocks = editor ? (Array.from(editor.children) as HTMLElement[]) : []
  if (!blocks.length) return 1
  const origin = blocks[0].offsetTop
  const starts = pageStarts(blocks, step)
  for (let i = 1; i < starts.length; i++) {
    // a manual break already draws its own dashed line and label
    if (starts[i].manual) continue
    const line = document.createElement('div')
    line.className = 'exelmj-page-guide'
    line.style.top = `${top + starts[i].y - origin}px`
    const tag = document.createElement('span')
    tag.textContent = pageLabel(i + 1)
    line.append(tag)
    layer.append(line)
  }
  return starts.length
}

/**
 * Where each printed page begins, in editor pixels. A manual page break forces
 * the next page whatever the text height is — without this a document made of
 * short letters separated by breaks reported "page 1 of 1".
 */
export function pageStarts(
  blocks: HTMLElement[],
  step: number
): Array<{ y: number; manual: boolean }> {
  if (!blocks.length) return [{ y: 0, manual: false }]
  const origin = blocks[0].offsetTop
  const starts: Array<{ y: number; manual: boolean }> = [{ y: origin, manual: false }]
  let pageTop = origin
  for (const block of blocks) {
    if (block.hasAttribute('data-page-break')) {
      pageTop = block.offsetTop + block.offsetHeight
      starts.push({ y: pageTop, manual: true })
      continue
    }
    const bottom = block.offsetTop + block.offsetHeight
    while (bottom - pageTop > step) {
      pageTop += step
      starts.push({ y: pageTop, manual: false })
    }
  }
  return starts
}

/** 1-based page for a y offset measured from the first block's top. */
export function pageAt(starts: Array<{ y: number; manual: boolean }>, y: number): number {
  if (!starts.length) return 1
  const origin = starts[0].y
  let page = 1
  for (let i = 1; i < starts.length; i++) {
    if (y + origin >= starts[i].y) page = i + 1
  }
  return page
}

function injectGuideCss() {
  if (document.getElementById('exelmj-page-guide-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-page-guide-style'
  style.textContent = `
.exelmj-page-guides { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
.exelmj-page-guide {
  position: absolute; inset-inline: 0; height: 0;
  border-top: 1px dashed #b6c2d2;
}
.exelmj-page-guide span {
  position: absolute; top: 3px; inset-inline-end: 8px;
  font: 10px 'Segoe UI', Tahoma, sans-serif; color: #98a2b3;
  background: #fff; padding: 0 4px;
}
`
  document.head.append(style)
}
