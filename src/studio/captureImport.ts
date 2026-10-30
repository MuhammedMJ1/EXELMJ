// Turning a picked web element into canvas objects.
//
// This is the bridge the whole picker exists for, and it is the place where a
// wrong answer is hardest to notice: the result LOOKS like a design either way.
// So two rules govern it.
//
// 1. CSS PIXELS ARE NOT POINTS. The web measures in px (1/96in); the canvas
//    measures in pt (1/72in). Importing px as pt shrinks everything by exactly
//    25%, uniformly — which reads as a deliberately smaller design, not as a
//    bug, and survives review.
//
// 2. NEVER INVENT. A transparent background is not black. An unreadable colour
//    is not a colour. A child with no recorded box is not at (0,0). Anything
//    that cannot be reproduced is REPORTED in `degraded` so the handoff can
//    say so, rather than being filled in with something plausible.
//
// Pure: no DOM, no Electron. Unit-tested in node.

import { newBox, type TextBox } from '../design/overlayModel'
import type { Shape } from '../design/shapes'
import { cssColorToHex, PT_PER_PX } from './handoff'

/** The shape the guest preload sends. Only what the importer actually reads. */
export interface Capture {
  tag?: string
  role?: string | null
  selector?: string
  url?: string
  box?: { xPx?: number; yPx?: number; wPx?: number; hPx?: number }
  styles?: Record<string, string>
  text?: string
  children?: Array<{
    tag?: string
    text?: string
    box?: { xPx?: number; yPx?: number; wPx?: number; hPx?: number }
  }>
}

export interface ImportResult {
  shapes: Shape[]
  boxes: TextBox[]
  /** Everything that could not be reproduced, in the user's words. */
  degraded: string[]
  /** How many children were skipped, and why. */
  skipped: number
}

export interface ImportOptions {
  /** Where on the artboard the element's top-left lands, in pt. */
  x: number
  y: number
  /** Seeds for the ids, so the caller's counters stay authoritative. */
  shapeId: (n: number) => string
  boxId: (n: number) => string
}

/** px -> pt, rounded to the same 2 decimals the sidecar stores. */
export function pxToPt(px: number): number {
  return Math.round(px * PT_PER_PX * 100) / 100
}

/** The first finite number in a CSS length, or the fallback. */
function len(css: string | undefined, fallback: number): number {
  const n = parseFloat(css ?? '')
  return Number.isFinite(n) ? n : fallback
}

/**
 * Convert a capture into shapes and text boxes.
 *
 * The element's own box becomes a rectangle; every CHILD that carries text
 * becomes a text box at its measured position. Children are what make this
 * more than a coloured rectangle, and they are only possible because the guest
 * preload records per-node geometry — the extension this replaces exported
 * only the outer size, which is why its importer had to re-run layout to
 * recover boxes that were never written down.
 */
export function importCapture(cap: Capture, opts: ImportOptions): ImportResult {
  const degraded: string[] = []
  const shapes: Shape[] = []
  const boxes: TextBox[] = []
  const styles = cap.styles ?? {}
  const box = cap.box ?? {}

  const w = pxToPt(box.wPx ?? 0)
  const h = pxToPt(box.hPx ?? 0)
  if (!(w > 0) || !(h > 0)) {
    return {
      shapes,
      boxes,
      skipped: 0,
      degraded: ['The captured element had no measurable size, so nothing was imported.']
    }
  }

  const fill = cssColorToHex(styles['background-color'] ?? '')
  const borderWidth = len(styles['border-top-width'] ?? styles.border, 0)
  const stroke = borderWidth > 0 ? cssColorToHex(styles['border-top-color'] ?? '') : ''
  if (!fill && (styles['background-color'] ?? '').trim() && !stroke) {
    degraded.push('The element background is transparent; a faint outline was drawn so it stays selectable.')
  }
  if (styles['background-image'] && styles['background-image'] !== 'none') {
    degraded.push('A CSS background image was not downloaded — only its declaration is recorded.')
  }
  if (styles['box-shadow'] && styles['box-shadow'] !== 'none') {
    degraded.push('A box shadow was captured but the canvas has no shadow primitive; it was dropped.')
  }

  const radius = len(styles['border-radius'], 0)
  shapes.push({
    id: opts.shapeId(1),
    kind: 'rect',
    x: opts.x,
    y: opts.y,
    w,
    h,
    fill,
    // A shape with neither fill nor stroke is invisible AND unselectable — the
    // user would have imported something they cannot find or delete.
    stroke: fill || stroke ? stroke : '#cccccc',
    strokeWidth: borderWidth > 0 ? pxToPt(borderWidth) : 1,
    ...(radius > 0
      ? { radius: [pxToPt(radius), pxToPt(radius), pxToPt(radius), pxToPt(radius)] as [number, number, number, number] }
      : {})
  })

  // Direction comes from the CAPTURE, never from a guess: an LTR element
  // rebuilt as RTL (or the reverse) is wrong in a way that looks deliberate.
  const rtl = (styles.direction ?? '').trim() === 'rtl'
  const color = cssColorToHex(styles.color ?? '') || '#111111'
  const sizePt = Math.max(6, Math.min(200, pxToPt(len(styles['font-size'], 16))))
  const font = firstFamily(styles['font-family'] ?? '')

  const children = cap.children ?? []
  const withText = children.filter((c) => String(c.text ?? '').trim().length > 0)
  let placed = 0
  let noBox = 0

  for (const c of withText) {
    const cb = c.box ?? {}
    if (!(Number(cb.wPx) > 0)) {
      noBox++
      continue
    }
    boxes.push({
      ...newBox(opts.boxId(placed + 1), 0, 0, rtl),
      // Child positions are ABSOLUTE page coordinates in the capture, so they
      // are rebased onto the element's own origin before being placed.
      x: opts.x + pxToPt((cb.xPx ?? 0) - (box.xPx ?? 0)),
      y: opts.y + pxToPt((cb.yPx ?? 0) - (box.yPx ?? 0)),
      width: pxToPt(cb.wPx ?? 0),
      text: String(c.text ?? '').trim(),
      sizePt,
      color,
      font,
      align: rtl ? 'right' : 'left'
    })
    placed++
  }

  // A leaf element carries its own text with no children to place it in.
  if (!placed && String(cap.text ?? '').trim()) {
    boxes.push({
      ...newBox(opts.boxId(1), 0, 0, rtl),
      x: opts.x,
      y: opts.y,
      width: w,
      text: String(cap.text).trim(),
      sizePt,
      color,
      font,
      align: rtl ? 'right' : 'left'
    })
    placed++
  }

  if (noBox) {
    degraded.push(
      `${noBox} child element(s) had text but no recorded geometry, so they were skipped rather than stacked at the origin.`
    )
  }
  if (!placed && (cap.children?.length ?? 0) > 0) {
    degraded.push('No text was found in this element; only its box was imported.')
  }

  return { shapes, boxes, degraded, skipped: noBox }
}

/**
 * The first family name from a CSS font stack, unquoted.
 *
 * The whole stack is meaningless to the canvas — it renders with one font — and
 * keeping the quotes would produce a family name no renderer matches.
 */
export function firstFamily(stack: string): string {
  const first = stack.split(',')[0]?.trim() ?? ''
  const clean = first.replace(/^["']|["']$/g, '').trim()
  return clean || 'Arial'
}
