// Transforming a SELECTION rather than a single object.
//
// The overlay draws eight grips and a rotation grip around a multi-selection,
// but nothing was listening: applyOverlayResize only knew how to move one
// object, so the grips were decoration and dragging them did nothing. A
// library icon arrives as several separate runs, which is precisely why "the
// icon cannot be enlarged" — there was no single object to resize.
//
// The two operations are here, pure, because the mistakes they invite are
// arithmetic ones: mapping a member from the wrong reference box, or rotating
// each member in place so the arrangement never actually turns.

import { boxCenter, rotatePoint, type Box } from './transform'

/**
 * Where a member's box lands when the group's box changes from `from` to `to`.
 *
 * Both the POSITION and the SIZE scale. Scaling only the size leaves every
 * member pinned to its old corner and the group tears itself apart; scaling
 * only the position leaves a cluster of original-sized objects spread over a
 * larger area.
 *
 * A degenerate group box scales by 1 rather than by infinity — a selection
 * with no width is still draggable, and it must not be annihilated by one.
 */
export function scaleInGroup(b: Box, from: Box, to: Box): Box {
  const sx = from.w > 0 ? to.w / from.w : 1
  const sy = from.h > 0 ? to.h / from.h : 1
  return {
    x: to.x + (b.x - from.x) * sx,
    y: to.y + (b.y - from.y) * sy,
    w: b.w * sx,
    h: b.h * sy
  }
}

/**
 * Where a member's box lands when the group turns by `deg` about `center`.
 *
 * The member ORBITS: its centre swings around the group's centre while the box
 * keeps its own size. Its own rotation has to advance by the same angle
 * separately — see spinInGroup — because this returns an axis-aligned box and
 * cannot express the member facing a new direction.
 */
export function orbitInGroup(b: Box, center: [number, number], deg: number): Box {
  const [cx, cy] = boxCenter(b)
  const [nx, ny] = rotatePoint(cx, cy, center[0], center[1], deg)
  return { x: nx - b.w / 2, y: ny - b.h / 2, w: b.w, h: b.h }
}

/**
 * A member's new own-rotation. Kept beside orbitInGroup because doing one
 * without the other is the classic half-implemented group rotate: the objects
 * either slide around a circle without turning, or turn on the spot while the
 * arrangement stays put.
 */
export function spinInGroup(base: number | undefined, deg: number): number {
  const r = ((base ?? 0) + deg) % 360
  return r < 0 ? r + 360 : r
}
