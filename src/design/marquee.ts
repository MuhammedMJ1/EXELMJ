// Marquee selection: drag a rectangle over the canvas to select everything
// under it, then move the lot together.
//
// The geometry is pure so the two decisions that matter can be tested without
// a canvas:
//
// 1. WHAT COUNTS AS SELECTED. Every serious editor uses INTERSECTION, not
//    containment: a user who drags a band across a row of objects means the
//    ones they swept over, not only the ones they fully enclosed. Requiring
//    containment makes large objects nearly unselectable and is the single
//    most common complaint about hand-rolled marquees.
//
// 2. WHAT THE HANDLES MEASURE. A multi-selection's box is the union of the
//    ROTATED bounds of its members — using each member's unrotated box would
//    draw a frame that visibly excludes artwork the user can see is selected.

import { rotatedAABB, type Box } from './transform'
import { shapeBBox, type Shape } from './shapes'
import type { PlacedImage } from './images'
import type { TextBox } from './overlayModel'

/** Anything the marquee can pick up, reduced to what selection needs. */
export interface Selectable {
  id: string
  kind: 'shape' | 'image' | 'box'
  box: Box
}

/** Normalise a drag into a rectangle, whichever way it was drawn. */
export function dragRect(x1: number, y1: number, x2: number, y2: number): Box {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1)
  }
}

/** Do two axis-aligned boxes overlap at all? Touching edges count. */
export function intersects(a: Box, b: Box): boolean {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y
}

/** A drag this small is a CLICK that wobbled, not a marquee. */
export const MIN_MARQUEE = 3

/**
 * Everything the marquee touched.
 *
 * Text boxes are included by their measured box; a box with auto width has no
 * recorded width, so a readable minimum stands in — an object that cannot be
 * marquee-selected is an object the user cannot move with the rest.
 */
export function marqueeHits(rect: Box, items: Selectable[]): string[] {
  if (rect.w < MIN_MARQUEE && rect.h < MIN_MARQUEE) return []
  return items.filter((i) => intersects(rect, i.box)).map((i) => i.id)
}

/** The union box of a selection — what the move handles measure. */
export function unionBox(items: Selectable[]): Box | null {
  if (!items.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const i of items) {
    minX = Math.min(minX, i.box.x)
    minY = Math.min(minY, i.box.y)
    maxX = Math.max(maxX, i.box.x + i.box.w)
    maxY = Math.max(maxY, i.box.y + i.box.h)
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

/** A shape as a Selectable, with rotation folded into its bounds. */
export function shapeSelectable(s: Shape): Selectable {
  return { id: s.id, kind: 'shape', box: rotatedAABB(shapeBBox(s), s.rotation ?? 0) }
}

export function imageSelectable(i: PlacedImage): Selectable {
  return {
    id: i.id,
    kind: 'image',
    box: rotatedAABB({ x: i.x, y: i.y, w: i.w, h: i.h }, i.rotation ?? 0)
  }
}

/**
 * A text box as a Selectable.
 *
 * A box with `width: 0` wraps to its content and has no stored width, so a
 * readable estimate stands in rather than a zero-width box that the marquee
 * could never touch. Height is one line at 1.4 leading, which is what the
 * renderer uses.
 */
export function boxSelectable(b: TextBox): Selectable {
  const w = b.width || Math.max(b.sizePt * 2, b.text.length * b.sizePt * 0.55)
  const h = b.sizePt * 1.4
  // A right-aligned box grows LEFTWARD from its anchor, and a centred one
  // grows both ways — using the anchor as the left edge would put the box in
  // the wrong place for two of the three alignments.
  const x = b.align === 'right' ? b.x - w : b.align === 'center' ? b.x - w / 2 : b.x
  return { id: b.id, kind: 'box', box: { x, y: b.y, w, h } }
}

/** Move every member of a selection by the same delta, in place. */
export function moveSelection(
  ids: Set<string>,
  shapes: Shape[],
  images: PlacedImage[],
  boxes: TextBox[],
  dx: number,
  dy: number
): void {
  for (const s of shapes) {
    if (!ids.has(s.id)) continue
    s.x += dx
    s.y += dy
  }
  for (const i of images) {
    if (!ids.has(i.id)) continue
    i.x += dx
    i.y += dy
  }
  for (const b of boxes) {
    if (!ids.has(b.id)) continue
    b.x += dx
    b.y += dy
  }
}
