// The pixel-fit validator — "will this icon still be crisp at 16px?"
//
// WHY THIS IS THE FEATURE, not a nicety
// An icon is the one drawing whose final size is decided by someone else, and
// at 16px a half-pixel offset is a visible blur across the whole glyph. The
// rule is unintuitive: whether a coordinate should land on a whole pixel or on
// a half depends on the STROKE WIDTH's parity. A 1px stroke is centred on its
// path, so it covers a whole pixel only when its centreline sits at x.5; a 2px
// stroke covers two whole pixels only when its centreline sits at a whole
// number. Getting that backwards is why hand-drawn icons look soft while the
// same shape from a real icon set looks sharp.
//
// The validator therefore reports, per target size, exactly which nodes are
// off and by how much — a light that says "amber" without naming the node is
// not actionable.

import { nodesOf, parse, type Seg } from '../../design/path'
import type { IconPreset } from './presets'

export interface Offender {
  /** index into the flat Seg[] */
  seg: number
  x: number
  y: number
  /** how far off the ideal grid, in TARGET pixels */
  offX: number
  offY: number
}

export interface SizeReport {
  size: number
  /** scale from canvas pt to target px */
  scale: number
  ok: boolean
  offenders: Offender[]
  /** nodes checked */
  total: number
}

export interface IconReport {
  /**
   * true when the glyph is clean at every size where crispness is REACHABLE
   * (see integerScaleSizes) and nothing leaves the live area.
   *
   * Judging it against every size would be a red light nobody can ever fix: a
   * 24-grid glyph rendered at 16px has a scale of 2/3, so a 2pt stroke lands
   * at 1.33px and NO arrangement of nodes makes that a whole number of pixels.
   * That is not a defect in the drawing, it is why Octicons draws separately
   * at 16 and 24 instead of scaling one to the other.
   */
  ok: boolean
  sizes: SizeReport[]
  /** geometry outside the live area, which crops at small sizes */
  outsideLiveArea: number
  /** true when the glyph does not fill enough of the live area to read */
  tooSmall: boolean
  /** the target sizes at which pixel-perfection is achievable at all */
  crispSizes: number[]
}

/**
 * Target sizes whose scale from the canvas is a whole number.
 *
 * At an integer scale, an integer canvas coordinate lands on an integer pixel
 * and the stroke width stays an integer, so the grid rules apply cleanly. At
 * any other scale the lattice is fractional and the best a glyph can do is
 * land on the coarser sub-grid — worth knowing before chasing an amber light.
 */
export function integerScaleSizes(preset: IconPreset): number[] {
  return preset.sizes.filter((s) => Number.isInteger(s / preset.grid))
}

/** Anything within this fraction of a pixel counts as ON the grid — below it
 * the renderer's own rounding dominates and the offset is not visible. */
const EPS = 0.02

/**
 * Where a coordinate SHOULD sit at this stroke width.
 *
 * Odd stroke -> half-pixel centreline. Even (or zero, i.e. a fill edge) ->
 * whole pixel. Non-integer widths (Octicons' 1.5) have no crisp alignment at
 * all, so they are reported as whole-pixel and the caller is told the width is
 * the reason.
 */
export function idealOffset(strokeWidthPx: number): number {
  const rounded = Math.round(strokeWidthPx)
  return Math.abs(rounded % 2) === 1 ? 0.5 : 0
}

function offBy(v: number, ideal: number): number {
  const shifted = v - ideal
  const d = shifted - Math.round(shifted)
  return Math.abs(d) < EPS ? 0 : d
}

/**
 * Check one path against one target size.
 *
 * `d` is in canvas pt; the canvas is `preset.grid` pt across and renders at
 * `size` px, so the scale is size/grid.
 */
export function checkSize(d: string, preset: IconPreset, size: number, strokeWidth?: number): SizeReport {
  const scale = size / preset.grid
  const sw = (strokeWidth ?? preset.strokeWidth) * scale
  const ideal = idealOffset(sw)
  const nodes = nodesOf(d)
  const offenders: Offender[] = []
  for (const n of nodes) {
    const px = n.x * scale
    const py = n.y * scale
    const ox = offBy(px, ideal)
    const oy = offBy(py, ideal)
    if (ox || oy) offenders.push({ seg: n.seg, x: n.x, y: n.y, offX: ox, offY: oy })
  }
  return { size, scale, ok: offenders.length === 0, offenders, total: nodes.length }
}

/** Bounds of the path in canvas pt — curves included, via the control hull. */
function bounds(segs: Seg[]): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const acc = (x: number, y: number): void => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const s of segs) {
    if (s.c === 'Z') continue
    acc(s.x, s.y)
    if (s.c === 'C') {
      acc(s.x1, s.y1)
      acc(s.x2, s.y2)
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null
}

/**
 * Full report for an icon: pixel fit at every target size the preset ships,
 * plus the two composition checks that a grid cannot catch — geometry outside
 * the live area (which crops), and a glyph too small inside it (which reads as
 * a speck next to its neighbours in a set).
 */
export function validateIcon(
  paths: Array<{ d: string; strokeWidth?: number }>,
  preset: IconPreset
): IconReport {
  const sizes = preset.sizes.map((size) => {
    const merged: SizeReport = { size, scale: size / preset.grid, ok: true, offenders: [], total: 0 }
    for (const p of paths) {
      const r = checkSize(p.d, preset, size, p.strokeWidth)
      merged.offenders.push(...r.offenders)
      merged.total += r.total
    }
    merged.ok = merged.offenders.length === 0
    return merged
  })

  const live = {
    x: preset.padding,
    y: preset.padding,
    w: preset.grid - preset.padding * 2,
    h: preset.grid - preset.padding * 2
  }
  let outside = 0
  let unionMinX = Infinity
  let unionMinY = Infinity
  let unionMaxX = -Infinity
  let unionMaxY = -Infinity
  for (const p of paths) {
    const b = bounds(parse(p.d))
    if (!b) continue
    unionMinX = Math.min(unionMinX, b.x)
    unionMinY = Math.min(unionMinY, b.y)
    unionMaxX = Math.max(unionMaxX, b.x + b.w)
    unionMaxY = Math.max(unionMaxY, b.y + b.h)
    if (b.x < live.x - EPS || b.y < live.y - EPS) outside++
    else if (b.x + b.w > live.x + live.w + EPS || b.y + b.h > live.y + live.h + EPS) outside++
  }
  const filled =
    Number.isFinite(unionMinX) && live.w > 0 && live.h > 0
      ? Math.max((unionMaxX - unionMinX) / live.w, (unionMaxY - unionMinY) / live.h)
      : 0

  const crispSizes = integerScaleSizes(preset)
  return {
    ok: sizes.filter((s) => crispSizes.includes(s.size)).every((s) => s.ok) && outside === 0,
    crispSizes,
    sizes,
    outsideLiveArea: outside,
    // Below ~60% of the live area a glyph reads noticeably smaller than the
    // rest of a set. It is a warning, not a failure — a full stop really is
    // a small mark.
    tooSmall: filled > 0 && filled < 0.6
  }
}

/**
 * Snap every node to the ideal grid for one target size.
 *
 * Offered as a FIX, not applied automatically: snapping is a real change to
 * the artwork, and snapping for 16px can nudge a curve that was drawn to look
 * right at 48. The user decides which size wins.
 */
export function snapToPixelGrid(
  d: string,
  preset: IconPreset,
  size: number,
  strokeWidth?: number
): string {
  const scale = size / preset.grid
  if (!(scale > 0)) return d
  const ideal = idealOffset((strokeWidth ?? preset.strokeWidth) * scale)
  const fix = (v: number): number => {
    const px = v * scale
    const snapped = Math.round(px - ideal) + ideal
    return snapped / scale
  }
  const segs = parse(d).map((s) =>
    s.c === 'Z'
      ? s
      : s.c === 'C'
        ? {
            ...s,
            x1: fix(s.x1),
            y1: fix(s.y1),
            x2: fix(s.x2),
            y2: fix(s.y2),
            x: fix(s.x),
            y: fix(s.y)
          }
        : { ...s, x: fix(s.x), y: fix(s.y) }
  )
  return segsToDLocal(segs)
}

/** Local serialiser at the preset's precision, so a snap does not silently
 * re-round to the kernel's 3 decimals and undo itself. */
function segsToDLocal(segs: Seg[]): string {
  const r = (n: number): number => {
    const v = Math.round(n * 1000) / 1000
    return Object.is(v, -0) ? 0 : v
  }
  return segs
    .map((s) =>
      s.c === 'Z'
        ? 'Z'
        : s.c === 'C'
          ? `C${r(s.x1)} ${r(s.y1)} ${r(s.x2)} ${r(s.y2)} ${r(s.x)} ${r(s.y)}`
          : `${s.c}${r(s.x)} ${r(s.y)}`
    )
    .join(' ')
}
