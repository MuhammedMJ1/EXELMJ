// Resize / rotate / crop geometry for the design canvas.
//
// Same coordinate contract as the rest of src/design: PDF POINTS from the
// page's TOP-LEFT. Everything here is PURE — no canvas, no DOM — precisely so
// it unit-tests in node like shapes.ts and images.ts do.
//
// The one non-obvious piece is resizing a ROTATED box. Dragging the SE handle
// of a box rotated 30° must keep the NW corner nailed to the page while the
// box grows along its OWN axes. Doing that in page space produces the familiar
// "the shape swims away from the cursor" bug. The fix is to work in the box's
// LOCAL frame (rotate the pointer back by -rotation about the centre), resize
// there, then place the new centre so the anchor corner lands exactly where it
// already was. resizeRotated() below is that, and nothing else.

import svgpath from 'svgpath'
import type { Shape } from './shapes'
import { shapeBBox } from './shapes'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** The eight resize grips plus the rotation grip. */
export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rot'

export const RESIZE_HANDLES: HandleId[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Unit direction of each grip in the box's local frame: -1 / 0 / +1 per axis. */
const DIR: Record<Exclude<HandleId, 'rot'>, [number, number]> = {
  nw: [-1, -1],
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0]
}

/** A degenerate box cannot be resized proportionally — this is the floor. */
export const MIN_SIZE = 1

/** How far above the box's top edge the rotation grip floats, in pt. */
export const ROT_OFFSET = 18

export function boxCenter(b: Box): [number, number] {
  return [b.x + b.w / 2, b.y + b.h / 2]
}

/** Rotate (x,y) about (cx,cy) by `deg` clockwise (screen y grows downward). */
export function rotatePoint(
  x: number,
  y: number,
  cx: number,
  cy: number,
  deg: number
): [number, number] {
  if (!deg) return [x, y]
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
}

/** Page point -> the box's local frame, measured from its CENTRE. */
export function toLocal(x: number, y: number, b: Box, rotation: number): [number, number] {
  const [cx, cy] = boxCenter(b)
  const [rx, ry] = rotatePoint(x, y, cx, cy, -rotation)
  return [rx - cx, ry - cy]
}

/** Where a grip sits on the page, rotation included. */
export function handlePoint(b: Box, rotation: number, h: HandleId): [number, number] {
  const [cx, cy] = boxCenter(b)
  if (h === 'rot') return rotatePoint(cx, b.y - ROT_OFFSET, cx, cy, rotation)
  const [dx, dy] = DIR[h]
  return rotatePoint(cx + (dx * b.w) / 2, cy + (dy * b.h) / 2, cx, cy, rotation)
}

/**
 * Grow a box outwards on every side. The centre is unchanged.
 *
 * The grip ring was briefly drawn on an INFLATED box, to leave a small
 * object's interior free to grab. It is not any more: the interior is now
 * covered by the move plate, so the grips belong exactly on the edge — which
 * is where every vector editor puts them, and where the eye expects to find
 * the corner it is dragging.
 */
export function inflate(b: Box, pad: number): Box {
  return { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 }
}

/**
 * How much a stroke grows when its shape's box grows — Illustrator's
 * "Scale Strokes & Effects".
 *
 * The GEOMETRIC MEAN of the two axis factors: under a uniform scale it is that
 * scale exactly, and under a stretch it splits the difference, because a
 * stroke has one width and the two axes are asking for two. Degenerate boxes
 * scale by 1 — a resize that collapsed an axis must not zero the stroke.
 */
export function strokeScaleFactor(from: Box, to: Box): number {
  if (!(from.w > 0) || !(from.h > 0) || !(to.w > 0) || !(to.h > 0)) return 1
  return Math.sqrt((to.w / from.w) * (to.h / from.h))
}

export function handlePoints(b: Box, rotation: number): Record<HandleId, [number, number]> {
  const out = {} as Record<HandleId, [number, number]>
  for (const h of [...RESIZE_HANDLES, 'rot' as HandleId]) out[h] = handlePoint(b, rotation, h)
  return out
}

/**
 * Which grip is under (x, y), or null. Corners are tested before edges so a
 * corner always wins the overlap — dragging a corner is the common intent.
 */
export function hitHandle(
  b: Box,
  rotation: number,
  x: number,
  y: number,
  tolerance = 5
): HandleId | null {
  const order: HandleId[] = ['rot', 'nw', 'ne', 'se', 'sw', 'n', 'e', 's', 'w']
  for (const h of order) {
    const [hx, hy] = handlePoint(b, rotation, h)
    if (Math.hypot(x - hx, y - hy) <= tolerance) return h
  }
  return null
}

export interface ResizeOpts {
  /** Shift: keep the original aspect ratio. */
  aspect?: boolean
  /** Alt: grow about the centre instead of the opposite corner. */
  fromCenter?: boolean
}

/**
 * The new box after dragging grip `h` to page point (px, py).
 *
 * `rotation` stays the same — a resize never changes the angle. The returned
 * box is the new AXIS-ALIGNED box in the ROTATED frame, i.e. exactly what you
 * store back into the shape alongside the unchanged rotation.
 */
export function resizeRotated(
  b: Box,
  rotation: number,
  h: HandleId,
  px: number,
  py: number,
  opts: ResizeOpts = {}
): Box {
  if (h === 'rot') return b
  const [dx, dy] = DIR[h]
  const [cx, cy] = boxCenter(b)
  const [lx, ly] = toLocal(px, py, b, rotation)

  // The point that must not move: the opposite corner/edge, in local coords.
  // An axis the grip does not touch is anchored at the centre for that axis.
  const ax = opts.fromCenter ? 0 : (-dx * b.w) / 2
  const ay = opts.fromCenter ? 0 : (-dy * b.h) / 2

  let w = b.w
  let h2 = b.h
  if (dx) w = opts.fromCenter ? Math.abs(lx) * 2 : (lx - ax) * dx
  if (dy) h2 = opts.fromCenter ? Math.abs(ly) * 2 : (ly - ay) * dy

  if (opts.aspect && b.w > 0 && b.h > 0) {
    if (dx && dy) {
      // corner: one uniform scale, driven by whichever axis moved more
      const s = Math.max(Math.abs(w) / b.w, Math.abs(h2) / b.h)
      w = Math.sign(w || 1) * b.w * s
      h2 = Math.sign(h2 || 1) * b.h * s
    } else if (dx) {
      h2 = (Math.abs(w) / b.w) * b.h
    } else if (dy) {
      w = (Math.abs(h2) / b.h) * b.w
    }
  }

  // Flipping through zero is not a feature here — clamp the SIGNED value rather
  // than take its magnitude, so a fast drag past the anchor parks the box at
  // 1pt instead of turning inside out (which would silently mirror a traced
  // logo). Math.abs() here would resurrect the flip as a positive width.
  w = Math.max(MIN_SIZE, w)
  h2 = Math.max(MIN_SIZE, h2)

  // Place the new centre so the anchor lands exactly where it already was —
  // except under fromCenter, where the anchor IS the centre and must not move.
  const ncx = opts.fromCenter ? 0 : dx ? ax + (dx * w) / 2 : 0
  const ncy = opts.fromCenter ? 0 : dy ? ay + (dy * h2) / 2 : 0
  const anchorPage = rotatePoint(cx + ax, cy + ay, cx, cy, rotation)
  const [ox, oy] = rotatePoint(ncx - ax, ncy - ay, 0, 0, rotation)
  const newCx = anchorPage[0] + ox
  const newCy = anchorPage[1] + oy

  return { x: newCx - w / 2, y: newCy - h2 / 2, w, h: h2 }
}

/** Degrees clockwise from straight up, which is how the rotation grip reads. */
export function angleFromCenter(b: Box, px: number, py: number): number {
  const [cx, cy] = boxCenter(b)
  const deg = (Math.atan2(px - cx, cy - py) * 180) / Math.PI
  return deg < 0 ? deg + 360 : deg
}

/** Normalise any angle into [0, 360). */
export function normalizeAngle(deg: number): number {
  const a = deg % 360
  return a < 0 ? a + 360 : a
}

/** The axis-aligned page bounds of a rotated box — what the layers panel,
 * marquee selection and the spatial index all need. */
export function rotatedAABB(b: Box, rotation: number): Box {
  if (!rotation) return { ...b }
  const [cx, cy] = boxCenter(b)
  const pts: Array<[number, number]> = [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x + b.w, b.y + b.h],
    [b.x, b.y + b.h]
  ].map(([x, y]) => rotatePoint(x, y, cx, cy, rotation))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY }
}

// ─── snapping ────────────────────────────────────────────────────────────────

export interface SnapResult {
  value: number
  /** The target that won, or null when nothing was near enough. */
  at: number | null
}

/** Pull `v` to the nearest target within `tolerance`. */
export function snap1D(v: number, targets: number[], tolerance: number): SnapResult {
  let best: number | null = null
  let bestD = tolerance
  for (const t of targets) {
    const d = Math.abs(v - t)
    if (d <= bestD) {
      bestD = d
      best = t
    }
  }
  return best === null ? { value: v, at: null } : { value: best, at: best }
}

export interface SnapGuides {
  x: number | null
  y: number | null
}

/**
 * Snap a box being moved. Each axis considers the box's leading edge, centre
 * and trailing edge against the same targets — that is what makes edges line
 * up with edges AND centres line up with centres, which is the whole point of
 * smart guides. The returned guide coordinates are what the canvas draws.
 */
export function snapBox(
  b: Box,
  xTargets: number[],
  yTargets: number[],
  tolerance = 4
): { box: Box; guides: SnapGuides } {
  const guides: SnapGuides = { x: null, y: null }
  let dx = 0
  let dy = 0
  let bestX = tolerance
  let bestY = tolerance
  for (const edge of [b.x, b.x + b.w / 2, b.x + b.w]) {
    for (const t of xTargets) {
      const d = Math.abs(edge - t)
      if (d <= bestX) {
        bestX = d
        dx = t - edge
        guides.x = t
      }
    }
  }
  for (const edge of [b.y, b.y + b.h / 2, b.y + b.h]) {
    for (const t of yTargets) {
      const d = Math.abs(edge - t)
      if (d <= bestY) {
        bestY = d
        dy = t - edge
        guides.y = t
      }
    }
  }
  return { box: { ...b, x: b.x + dx, y: b.y + dy }, guides }
}

// ─── applying a box change back to a shape ───────────────────────────────────

/** Path data may only carry the command letters and numbers (same guard as
 * shapes.ts — a transformed path is written straight into an SVG attribute). */
const SAFE_PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/

/**
 * Scale/translate a path's `d` from `from` to `to`, both in the path's own
 * local pt space. Returns null when the transform is degenerate or the result
 * would fail the safety guard, so the caller can leave the path untouched
 * rather than write something it cannot render.
 */
export function transformPathD(d: string, from: Box, to: Box): string | null {
  if (!SAFE_PATH_D.test(d)) return null
  if (!(from.w > 0) || !(from.h > 0)) return null
  const sx = to.w / from.w
  const sy = to.h / from.h
  if (!Number.isFinite(sx) || !Number.isFinite(sy)) return null
  try {
    // unarc/unshort/abs is the normalisation choke point: everything
    // downstream (the node editor, the PDF writer, the SVG exporter) may then
    // assume absolute M/L/C/Z only. Arcs in particular do NOT survive a
    // non-uniform scale — scaling an `A` command's radii independently is not
    // expressible in the arc grammar, so they must become curves first.
    const out = svgpath(d)
      .unarc()
      .unshort()
      .abs()
      .translate(-from.x, -from.y)
      .scale(sx, sy)
      .translate(to.x, to.y)
      .round(3)
      .toString()
    return out && SAFE_PATH_D.test(out) ? out : null
  } catch {
    return null
  }
}

/**
 * The bounds of a path shape's `d` in its own LOCAL space (0,0 at shape.x/y).
 * Shape.w/h already record that box, so this is just the local restatement —
 * kept as a named function because the local/absolute confusion is the easiest
 * mistake to make here.
 */
/**
 * Below this many pt a "box" is a LINE, not an area: a path drawn flat has an
 * extent of zero there and the pen clamps it to 0.01 only so the bounding box
 * stays hit-testable.
 */
const FLAT = 0.05

function localBox(s: Shape): Box {
  const b = shapeBBox(s)
  return { x: 0, y: 0, w: b.w, h: b.h }
}

/**
 * Rewrite a shape so its bounding box becomes `to`.
 *
 * The three kinds behave differently and none of them can be handled by
 * assigning x/y/w/h blindly:
 *  - line/arrow keep (x,y) as the FIRST endpoint and (w,h) as a SIGNED delta,
 *    so both endpoints are mapped through the box change and the sign survives;
 *  - path carries geometry in `d`, which has to be rewritten (and its gradient
 *    with it, since the gradient lives in the same local space);
 *  - rect/ellipse are just the box.
 */
export function applyBoxToShape(s: Shape, to: Box): Shape {
  const from = shapeBBox(s)
  if (s.kind === 'line' || s.kind === 'arrow') {
    const mapX = (v: number): number =>
      from.w > 0 ? to.x + ((v - from.x) / from.w) * to.w : to.x + to.w / 2
    const mapY = (v: number): number =>
      from.h > 0 ? to.y + ((v - from.y) / from.h) * to.h : to.y + to.h / 2
    const x1 = mapX(s.x)
    const y1 = mapY(s.y)
    const x2 = mapX(s.x + s.w)
    const y2 = mapY(s.y + s.h)
    return { ...s, x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
  }
  if (s.kind === 'path' && s.d) {
    const lFrom = localBox(s)
    // An axis the path has NO extent on cannot be scaled along: the factor is
    // to.h divided by ~0, which is enormous, and it turns a straight pen line
    // into geometry that shoots off the page — the shape "disappears" the
    // first time its selection frame is dragged. Such an axis passes through
    // at 1:1, which is also what a vector editor does with a flat path: a
    // horizontal line has no height to stretch.
    const lTo: Box = {
      x: 0,
      y: 0,
      w: lFrom.w < FLAT ? lFrom.w : to.w,
      h: lFrom.h < FLAT ? lFrom.h : to.h
    }
    const d = transformPathD(s.d, lFrom, lTo)
    if (!d) return { ...s, x: to.x, y: to.y }
    const sx = lFrom.w > 0 ? lTo.w / lFrom.w : 1
    const sy = lFrom.h > 0 ? lTo.h / lFrom.h : 1
    const gradient = s.gradient
      ? {
          ...s.gradient,
          x1: s.gradient.x1 * sx,
          y1: s.gradient.y1 * sy,
          x2: s.gradient.x2 * sx,
          y2: s.gradient.y2 * sy
        }
      : undefined
    // The reported box is what ACTUALLY happened, not what was asked for: a
    // frame that claims a height the geometry never took is a frame that
    // drifts away from its own artwork.
    return {
      ...s,
      x: to.x,
      y: to.y,
      w: lTo.w,
      h: lTo.h,
      d,
      ...(gradient ? { gradient } : {})
    }
  }
  return { ...s, x: to.x, y: to.y, w: to.w, h: to.h }
}
