// The design as real HTML and CSS.
//
// WHY THIS EXISTS
// The handoff bundle described the design — a Markdown spec, colour tokens,
// SVG assets, the source file. A description is not a page. Nothing could be
// opened in a browser, and nothing could carry an animation, because a CSS
// animation is a rule attached to an ELEMENT and there were no elements.
//
// WHAT IT GUARANTEES
//  - One element per object, with a STABLE class derived from its id. Motion
//    rules are written against those classes (see motionCss.ts), so the two
//    modules agree without either importing the other's output.
//  - LOGICAL properties only (inset-inline-start, not left). The document is
//    Arabic-first, and a page that hard-codes `left` mirrors wrongly the
//    moment its direction flips — which is the whole reason the handoff
//    manifest declares logicalPropertiesOnly.
//  - No JavaScript, no external file, no font download. What comes out opens
//    from disk with nothing installed.
//
// Pure: no DOM, no canvas. Unit-tested in node.

import type { PageBoxes, TextBox } from '../design/overlayModel'
import type { PageShapes, Shape } from '../design/shapes'
import type { PageImages, PlacedImage } from '../design/images'
import type { Group, StudioDoc } from './model'

/** CSS px per PostScript point. 1px = 0.75pt is the web's fixed 96dpi ratio. */
export const PX_PER_PT = 4 / 3

const HEX = /^#[0-9a-fA-F]{6}$/
const SAFE_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/

export interface HtmlPage {
  html: string
  css: string
}

export interface HtmlInput {
  name: string
  page: string
  widthPt: number
  heightPt: number
  boxes: TextBox[]
  shapes: Shape[]
  images: PlacedImage[]
  groups: Group[]
  dir: 'rtl' | 'ltr'
  lang: string
}

/** pt → px, rounded to hundredths: finer than a device pixel at any zoom. */
export function px(pt: number): number {
  return Math.round(pt * PX_PER_PT * 100) / 100
}

/**
 * The class an object is addressed by.
 *
 * Derived from the id and nothing else, so it survives a re-export and a
 * motion rule written last week still points at the same element. Anything
 * that is not a letter, digit or dash becomes a dash — a CSS class cannot
 * carry arbitrary characters, and an id with a space in it would silently
 * produce a selector that matches two different things.
 */
export function classOf(id: string): string {
  const safe = id.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+/, '')
  return `o-${safe || 'x'}`
}

/** Escape text for HTML. Never trust a document that travelled. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function colour(v: string, fallback = 'transparent'): string {
  return HEX.test(v) ? v : fallback
}

/** A CSS declaration block from pairs, skipping empties. */
function decls(pairs: Array<[string, string | number | null | undefined]>): string {
  return pairs
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')
}

function shadowCss(s: Shape): string | null {
  if (!s.shadow) return null
  const a = Math.max(0, Math.min(1, s.shadow.alpha))
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(s.shadow.color)
  const rgb = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0]
  return `${px(s.shadow.dx)}px ${px(s.shadow.dy)}px ${px(s.shadow.blur)}px rgba(${rgb.join(',')},${a})`
}

/**
 * A shape's own bounding box in px.
 *
 * line and arrow carry a SIGNED delta in w/h, so their box is not their x/y —
 * reading it as one places a leftward line off the wrong edge.
 */
function boxOf(s: Shape): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h)
  }
}

function shapeRules(s: Shape): { html: string; css: string } | null {
  const cls = classOf(s.id)
  const b = boxOf(s)
  const common: Array<[string, string | number | null]> = [
    ['position', 'absolute'],
    ['inset-inline-start', `${px(b.x)}px`],
    ['top', `${px(b.y)}px`],
    ['width', `${px(b.w)}px`],
    ['height', `${px(b.h)}px`],
    ['opacity', s.opacity !== undefined && s.opacity < 1 ? String(s.opacity) : null],
    // The transform ORIGIN is the centre, which is where the app rotates about
    // — the CSS default is also the centre, but stating it means a motion rule
    // that changes the origin has something to restore it to.
    ['transform-origin', '50% 50%'],
    ['transform', s.rotation ? `rotate(${s.rotation}deg)` : null],
    ['box-shadow', shadowCss(s)]
  ]

  if (s.kind === 'rect' || s.kind === 'ellipse') {
    const radius =
      s.kind === 'ellipse'
        ? '50%'
        : s.radius && s.radius.some((r) => r > 0)
          ? s.radius.map((r) => `${px(r)}px`).join(' ')
          : null
    const border = s.stroke
      ? `${px(s.strokeWidth)}px ${s.dash?.length ? 'dashed' : 'solid'} ${colour(s.stroke, '#000000')}`
      : null
    return {
      html: `<div class="${cls}"></div>`,
      css: `.${cls} {\n${decls([
        ...common,
        ['background', s.fill ? colour(s.fill) : null],
        ['border', border],
        ['border-radius', radius],
        // A border grows the box in the default box model, and the design's
        // size is the OUTER size — content-box would make every stroked shape
        // wider than it is on the canvas.
        ['box-sizing', border ? 'border-box' : null]
      ])}\n}`
    }
  }

  // Everything else is real vector geometry, so it travels as inline SVG.
  // Inline rather than a linked file: the page has to open from disk with
  // nothing beside it.
  const stroke = colour(s.stroke, s.kind === 'path' ? 'none' : '#000000')
  const fill = s.kind === 'path' ? (s.fill ? colour(s.fill) : 'none') : 'none'
  let inner = ''
  if (s.kind === 'path' && s.d && SAFE_D.test(s.d)) {
    inner =
      `<path d="${s.d}" fill="${fill}" fill-rule="evenodd"` +
      (s.stroke
        ? ` stroke="${stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
        : '') +
      (s.dash?.length ? ` stroke-dasharray="${s.dash.join(' ')}"` : '') +
      '/>'
  } else if (s.kind === 'line' || s.kind === 'arrow') {
    // Local coordinates: the endpoints depend on which way it was drawn.
    const x1 = s.w < 0 ? Math.abs(s.w) : 0
    const y1 = s.h < 0 ? Math.abs(s.h) : 0
    const x2 = s.w < 0 ? 0 : Math.abs(s.w)
    const y2 = s.h < 0 ? 0 : Math.abs(s.h)
    inner =
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}"` +
      ` stroke-width="${s.strokeWidth}" stroke-linecap="round"` +
      (s.dash?.length ? ` stroke-dasharray="${s.dash.join(' ')}"` : '') +
      '/>'
  }
  if (!inner) return null
  // overflow visible so a stroke that sits half outside the box is not clipped
  return {
    html:
      `<div class="${cls}"><svg viewBox="0 0 ${Math.max(0.01, b.w)} ${Math.max(0.01, b.h)}" ` +
      `preserveAspectRatio="none" overflow="visible">${inner}</svg></div>`,
    css: `.${cls} {\n${decls(common)}\n}\n.${cls} > svg {\n  width: 100%;\n  height: 100%;\n  display: block;\n}`
  }
}

function boxRules(b: TextBox, pageWidthPt: number): { html: string; css: string } {
  const cls = classOf(b.id)
  // The anchor moves with the alignment: a right-aligned box grows LEFTWARD
  // from its x, which is why the offset is measured from the other edge.
  const start =
    b.align === 'right'
      ? null
      : b.align === 'center'
        ? `${px(b.x)}px`
        : `${px(b.x)}px`
  const end = b.align === 'right' ? `${px(pageWidthPt - b.x)}px` : null
  return {
    html: `<div class="${cls}">${esc(b.text).replace(/\n/g, '<br>')}</div>`,
    css: `.${cls} {\n${decls([
      ['position', 'absolute'],
      ['inset-inline-start', b.align === 'right' ? null : start],
      ['inset-inline-end', end],
      ['top', `${px(b.y)}px`],
      ['width', b.width > 0 ? `${px(b.width)}px` : null],
      ['transform', b.align === 'center' ? 'translateX(-50%)' : null],
      ['font-family', `'${b.font.replace(/'/g, '')}', system-ui, sans-serif`],
      ['font-size', `${px(b.sizePt)}px`],
      ['font-weight', b.bold ? '700' : '400'],
      ['color', colour(b.color, '#111111')],
      ['text-align', b.align],
      ['line-height', '1.3'],
      ['white-space', b.width > 0 ? 'normal' : 'pre'],
      ['transform-origin', '50% 50%']
    ])}\n}`
  }
}

function imageRules(i: PlacedImage): { html: string; css: string } {
  const cls = classOf(i.id)
  const crop = i.crop
  return {
    html: `<div class="${cls}"><img src="${esc(i.src)}" alt=""></div>`,
    css:
      `.${cls} {\n${decls([
        ['position', 'absolute'],
        ['inset-inline-start', `${px(i.x)}px`],
        ['top', `${px(i.y)}px`],
        ['width', `${px(i.w)}px`],
        ['height', `${px(i.h)}px`],
        ['overflow', crop ? 'hidden' : null],
        ['opacity', i.opacity !== undefined && i.opacity < 1 ? String(i.opacity) : null],
        ['transform-origin', '50% 50%'],
        ['transform', i.rotation ? `rotate(${i.rotation}deg)` : null]
      ])}\n}\n` +
      `.${cls} > img {\n${decls([
        ['display', 'block'],
        // A crop is expressed as fractions of the natural size, so the picture
        // is grown and shifted rather than resampled.
        ['width', crop ? `${100 / Math.max(0.05, 1 - crop.l - crop.r)}%` : '100%'],
        ['height', crop ? `${100 / Math.max(0.05, 1 - crop.t - crop.b)}%` : '100%'],
        ['margin-inline-start', crop ? `${-(crop.l / Math.max(0.05, 1 - crop.l - crop.r)) * 100}%` : null],
        ['margin-top', crop ? `${-(crop.t / Math.max(0.05, 1 - crop.t - crop.b)) * 100}%` : null],
        ['object-fit', 'fill']
      ])}\n}`
  }
}

/**
 * One artboard as an HTML fragment plus its CSS.
 *
 * Objects are emitted in PAINT ORDER — shapes, then images, then text — which
 * is the order the canvas draws them, so the stack is right without a single
 * z-index. A group becomes a wrapper element so a motion rule can move the
 * whole group with one target.
 */
/**
 * Extra markup one object needs, keyed by its id.
 *
 * The compiler asks for this: a CSS-only toggle is a hidden checkbox plus a
 * label, and the CSS selects on `:checked`. Without the checkbox in the
 * document the rules match nothing and the toggle silently does not work —
 * so the two halves are passed together or not at all.
 */
export interface MarkupInject {
  before?: string
  wrap?: 'label'
  /**
   * Stamp pathLength="1" on this object's <path>/<line> children.
   *
   * The draw motion animates stroke-dashoffset over a NORMALISED length;
   * without the attribute the compiled CSS is measured against the real
   * length and the stroke either never moves or vanishes at once.
   */
  pathLength?: boolean
}

export function pageToHtml(input: HtmlInput, inject: Record<string, MarkupInject> = {}): HtmlPage {
  const html: string[] = []
  const css: string[] = []
  const emitted = new Set<string>()
  const groupOpen = new Set<string>()

  const groupOf = (id: string): Group | undefined =>
    input.groups.find((g) => g.children.includes(id))

  const emit = (id: string, piece: { html: string; css: string } | null) => {
    if (!piece || emitted.has(id)) return
    emitted.add(id)
    const extra = inject[id]
    if (extra?.pathLength) {
      piece = {
        ...piece,
        html: piece.html.replace(/<path /g, '<path pathLength="1" ').replace(/<line /g, '<line pathLength="1" ')
      }
    }
    const g = groupOf(id)
    if (g && !groupOpen.has(g.id)) {
      groupOpen.add(g.id)
      // A group is a positioned wrapper at the page origin rather than at its
      // own bounds: its children keep the absolute coordinates they already
      // have, so nothing has to be recomputed and nothing drifts.
      html.push(`<div class="${classOf(g.id)} exl-group">`)
      css.push(`.${classOf(g.id)} {\n  position: absolute;\n  inset: 0;\n  transform-origin: 50% 50%;\n}`)
    }
    if (extra?.before) html.push(extra.before)
    if (extra?.wrap === 'label') {
      // The label IS the hit target: clicking it flips the checkbox, which is
      // the whole mechanism. `contents` keeps it out of the layout so it does
      // not disturb the absolute positioning it wraps.
      const cls = classOf(id)
      html.push(`<label for="exl-t-${cls}" class="exl-hit">`)
      html.push(piece.html)
      html.push('</label>')
      css.push(`.exl-hit {\n  display: contents;\n  cursor: pointer;\n}`)
    } else {
      html.push(piece.html)
    }
    css.push(piece.css)
  }

  for (const s of input.shapes) emit(s.id, shapeRules(s))
  for (const i of input.images) emit(i.id, imageRules(i))
  for (const b of input.boxes) emit(b.id, boxRules(b, input.widthPt))
  // Wrappers are closed at the end: the flat arrays interleave, so a group's
  // members are not necessarily adjacent, and closing eagerly would nest one
  // group inside another that merely happened to start first.
  for (let i = 0; i < groupOpen.size; i++) html.push('</div>')

  return {
    html: html.join('\n'),
    css: css.join('\n\n')
  }
}

/** The stage the artboard sits in — its own size, and nothing inherited. */
export function stageCss(widthPt: number, heightPt: number): string {
  return [
    `.exl-stage {`,
    `  position: relative;`,
    `  width: ${px(widthPt)}px;`,
    `  height: ${px(heightPt)}px;`,
    `  margin: 0 auto;`,
    `  background: #ffffff;`,
    `  overflow: hidden;`,
    `}`,
    `.exl-stage * { box-sizing: border-box; }`,
    `.exl-group { pointer-events: none; }`,
    `.exl-group > * { pointer-events: auto; }`
  ].join('\n')
}

/**
 * A complete, standalone page.
 *
 * `extraCss` is where the motion sheet lands. It is appended LAST so a motion
 * rule always wins over the layout rule it animates, without either needing
 * !important — specificity ties are broken by order, and this is the order.
 */
export function toStandaloneHtml(
  input: HtmlInput,
  extraCss = '',
  extraHead = '',
  inject: Record<string, MarkupInject> = {}
): string {
  const page = pageToHtml(input, inject)
  return [
    '<!doctype html>',
    `<html lang="${esc(input.lang)}" dir="${input.dir}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(input.name)}</title>`,
    '<style>',
    'html, body { margin: 0; padding: 0; background: #f2f3f5; }',
    stageCss(input.widthPt, input.heightPt),
    page.css,
    extraCss,
    '</style>',
    extraHead,
    '</head>',
    '<body>',
    `<div class="exl-stage">`,
    page.html,
    '</div>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}

/** Every artboard of a document, keyed by page. */
export function documentPages(
  name: string,
  pages: PageBoxes,
  shapes: PageShapes,
  images: PageImages,
  studio: StudioDoc,
  size: (page: string) => { widthPt: number; heightPt: number },
  dir: 'rtl' | 'ltr' = 'rtl',
  lang = 'ar'
): Record<string, HtmlInput> {
  const keys = new Set([...Object.keys(pages), ...Object.keys(shapes), ...Object.keys(images)])
  const out: Record<string, HtmlInput> = {}
  for (const page of [...keys].sort((a, b) => Number(a) - Number(b))) {
    const { widthPt, heightPt } = size(page)
    out[page] = {
      name,
      page,
      widthPt,
      heightPt,
      boxes: pages[page] ?? [],
      shapes: shapes[page] ?? [],
      images: images[page] ?? [],
      groups: studio.groups?.[page] ?? [],
      dir,
      lang
    }
  }
  return out
}
