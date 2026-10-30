// The path kernel: ONE place every SVG path in the app is normalised, split
// into subpaths, read as nodes, and written back.
//
// WHY A CHOKE POINT
// Paths reach us from four unrelated directions — the tracer (trace.ts), the
// Illustrator bridge, a pasted/imported SVG, and eventually the web picker —
// and each speaks a different dialect of the same grammar: relative commands,
// shorthand S/T, arcs, implicit repeats, exponent notation. Every consumer
// downstream (the node editor, the PDF content stream, the SVG exporter, the
// per-subpath recolour) would otherwise need to handle all of it. Instead
// everything funnels through normalize() here and comes out as absolute
// M / L / C / Z only. That is the single assumption that makes a node editor
// tractable at all.
//
// Arcs specifically CANNOT survive a non-uniform scale — scaling an `A`
// command's two radii independently is not expressible in the arc grammar — so
// unarc() is a correctness requirement, not a tidiness one.
//
// Pure: no canvas, no DOM. Unit-tested in node like shapes.ts and transform.ts.

import svgpath from 'svgpath'
import type { Box } from './transform'

/** Path data reaches an SVG attribute and a PDF content stream, so it is
 * restricted to the command letters and numbers — nothing that could carry a
 * url() or an entity. Same guard as shapes.ts, deliberately duplicated so this
 * module can be used without importing the shape model. */
export const SAFE_PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/

/** One drawing command after normalisation. Absolute, and only these four. */
export type Seg =
  | { c: 'M'; x: number; y: number }
  | { c: 'L'; x: number; y: number }
  | { c: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { c: 'Z' }

/** A closed or open run of segments, always starting with an M. */
export interface SubPath {
  segs: Seg[]
  closed: boolean
}

/** Decimal places kept everywhere. 3 is ~0.001pt — well under a printer dot,
 * and enough that a round-trip is visually lossless while the text stays small. */
export const PRECISION = 3

/**
 * Absolute M/L/C/Z, arcs expanded, shorthand expanded, rounded.
 * Returns null rather than throwing: a path that cannot be normalised must be
 * left exactly as it was, not replaced with something the user did not draw.
 */
export function normalize(d: string): string | null {
  if (typeof d !== 'string' || !d.trim() || !SAFE_PATH_D.test(d)) return null
  try {
    const out = svgpath(d).unarc().unshort().abs().round(PRECISION).toString()
    if (!out || !SAFE_PATH_D.test(out)) return null
    // unarc leaves Q/T alone, and abs() does not convert H/V — do that here so
    // the promise in this file's header is actually true.
    return segsToD(parse(out))
  } catch {
    return null
  }
}

/**
 * Parse normalised-ish path data into segments.
 *
 * Accepts more than normalize() emits (H, V, Q, T, and relative forms are all
 * folded) so that parse(normalize(d)) and parse(d) agree — a caller that
 * forgot to normalise still gets correct geometry rather than silent nonsense.
 */
export function parse(d: string): Seg[] {
  const segs: Seg[] = []
  if (!d || !SAFE_PATH_D.test(d)) return segs
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  // last control point, for shorthand S/T continuation
  let lastC: [number, number] | null = null
  let lastQ: [number, number] | null = null

  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:[eE][+-]?\d+)?/g) ?? []
  let i = 0
  let cmd = ''
  const nextNum = (): number => {
    const v = Number(tokens[i++])
    return Number.isFinite(v) ? v : 0
  }

  while (i < tokens.length) {
    const tok = tokens[i]
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(tok)) {
      cmd = tok
      i++
    } else if (!cmd) {
      // numbers before any command: not a path
      break
    }
    const rel = cmd === cmd.toLowerCase()
    const up = cmd.toUpperCase()

    if (up === 'Z') {
      segs.push({ c: 'Z' })
      cx = sx
      cy = sy
      lastC = lastQ = null
      continue
    }
    if (i >= tokens.length) break

    switch (up) {
      case 'M': {
        const x = nextNum() + (rel ? cx : 0)
        const y = nextNum() + (rel ? cy : 0)
        segs.push({ c: 'M', x, y })
        cx = sx = x
        cy = sy = y
        // a repeated coordinate pair after M means implicit L
        cmd = rel ? 'l' : 'L'
        lastC = lastQ = null
        break
      }
      case 'L': {
        const x = nextNum() + (rel ? cx : 0)
        const y = nextNum() + (rel ? cy : 0)
        segs.push({ c: 'L', x, y })
        cx = x
        cy = y
        lastC = lastQ = null
        break
      }
      case 'H': {
        const x = nextNum() + (rel ? cx : 0)
        segs.push({ c: 'L', x, y: cy })
        cx = x
        lastC = lastQ = null
        break
      }
      case 'V': {
        const y = nextNum() + (rel ? cy : 0)
        segs.push({ c: 'L', x: cx, y })
        cy = y
        lastC = lastQ = null
        break
      }
      case 'C': {
        const x1 = nextNum() + (rel ? cx : 0)
        const y1 = nextNum() + (rel ? cy : 0)
        const x2 = nextNum() + (rel ? cx : 0)
        const y2 = nextNum() + (rel ? cy : 0)
        const x = nextNum() + (rel ? cx : 0)
        const y = nextNum() + (rel ? cy : 0)
        segs.push({ c: 'C', x1, y1, x2, y2, x, y })
        lastC = [x2, y2]
        lastQ = null
        cx = x
        cy = y
        break
      }
      case 'S': {
        const x2 = nextNum() + (rel ? cx : 0)
        const y2 = nextNum() + (rel ? cy : 0)
        const x = nextNum() + (rel ? cx : 0)
        const y = nextNum() + (rel ? cy : 0)
        // reflect the previous control point; with no previous curve the
        // reflection is the current point itself (SVG spec)
        const x1 = lastC ? 2 * cx - lastC[0] : cx
        const y1 = lastC ? 2 * cy - lastC[1] : cy
        segs.push({ c: 'C', x1, y1, x2, y2, x, y })
        lastC = [x2, y2]
        lastQ = null
        cx = x
        cy = y
        break
      }
      case 'Q':
      case 'T': {
        let qx: number
        let qy: number
        let x: number
        let y: number
        if (up === 'Q') {
          qx = nextNum() + (rel ? cx : 0)
          qy = nextNum() + (rel ? cy : 0)
          x = nextNum() + (rel ? cx : 0)
          y = nextNum() + (rel ? cy : 0)
        } else {
          qx = lastQ ? 2 * cx - lastQ[0] : cx
          qy = lastQ ? 2 * cy - lastQ[1] : cy
          x = nextNum() + (rel ? cx : 0)
          y = nextNum() + (rel ? cy : 0)
        }
        // exact quadratic -> cubic elevation
        segs.push({
          c: 'C',
          x1: cx + (2 / 3) * (qx - cx),
          y1: cy + (2 / 3) * (qy - cy),
          x2: x + (2 / 3) * (qx - x),
          y2: y + (2 / 3) * (qy - y),
          x,
          y
        })
        lastQ = [qx, qy]
        lastC = null
        cx = x
        cy = y
        break
      }
      case 'A': {
        // Arcs are expanded by normalize(); reaching one here means the caller
        // skipped it. Consume the seven parameters and draw the chord rather
        // than silently mis-reading the next command as a coordinate.
        nextNum()
        nextNum()
        nextNum()
        nextNum()
        nextNum()
        const x = nextNum() + (rel ? cx : 0)
        const y = nextNum() + (rel ? cy : 0)
        segs.push({ c: 'L', x, y })
        cx = x
        cy = y
        lastC = lastQ = null
        break
      }
      default:
        i++
    }
  }
  return segs
}

const r = (n: number): number => {
  const p = 10 ** PRECISION
  const v = Math.round(n * p) / p
  // -0 serialises as "-0" and breaks byte-identical round-trips
  return Object.is(v, -0) ? 0 : v
}

export function segsToD(segs: Seg[]): string {
  const out: string[] = []
  for (const s of segs) {
    if (s.c === 'Z') out.push('Z')
    else if (s.c === 'C') out.push(`C${r(s.x1)} ${r(s.y1)} ${r(s.x2)} ${r(s.y2)} ${r(s.x)} ${r(s.y)}`)
    else out.push(`${s.c}${r(s.x)} ${r(s.y)}`)
  }
  return out.join(' ')
}

/**
 * Translate path data by (dx, dy).
 *
 * Editing a node can push geometry outside the shape's old box, and a path's
 * `d` is LOCAL to its shape — so the shape origin moves and the data has to be
 * rebased by the same amount. Doing it here (rather than through a full
 * transform) keeps the operation exact: it is pure addition, no scaling, so
 * nothing is re-rounded twice.
 */
export function shiftPathD(d: string, dx: number, dy: number): string {
  if (!dx && !dy) return d
  return segsToD(
    parse(d).map((s) =>
      s.c === 'Z'
        ? s
        : s.c === 'C'
          ? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, x: s.x + dx, y: s.y + dy }
          : { ...s, x: s.x + dx, y: s.y + dy }
    )
  )
}

/**
 * Split into subpaths at every M.
 *
 * This is what turns a traced logo from one opaque blob into addressable
 * regions — the prerequisite for recolouring a single region and for node
 * editing without dragging the whole artwork.
 */
export function splitSubPaths(d: string): SubPath[] {
  const segs = parse(d)
  const out: SubPath[] = []
  let cur: Seg[] = []
  let closed = false
  const flush = (): void => {
    if (cur.length) out.push({ segs: cur, closed })
    cur = []
    closed = false
  }
  for (const s of segs) {
    if (s.c === 'M') {
      flush()
      cur = [s]
    } else if (s.c === 'Z') {
      cur.push(s)
      closed = true
    } else if (cur.length) {
      cur.push(s)
    }
  }
  flush()
  return out
}

export function joinSubPaths(subs: SubPath[]): string {
  return subs.map((s) => segsToD(s.segs)).filter(Boolean).join(' ')
}

/** Every ANCHOR point, in order, with the index of the segment that owns it.
 * Control points are addressed separately — see controlsOf. */
export interface Node {
  /** index into the flat Seg[] */
  seg: number
  x: number
  y: number
  /** which subpath this node belongs to, for per-region operations */
  sub: number
}

export function nodesOf(d: string): Node[] {
  const segs = parse(d)
  const out: Node[] = []
  let sub = -1
  for (const [i, s] of segs.entries()) {
    if (s.c === 'M') sub++
    if (s.c === 'Z') continue
    out.push({ seg: i, x: s.x, y: s.y, sub: Math.max(0, sub) })
  }
  return out
}

/** The two control points of a C segment, as {x,y} pairs, or null. */
export function controlsOf(segs: Seg[], i: number): [[number, number], [number, number]] | null {
  const s = segs[i]
  return s && s.c === 'C' ? [[s.x1, s.y1], [s.x2, s.y2]] : null
}

/**
 * Move one anchor to (x, y), dragging its adjacent control points with it so
 * the curve keeps its shape around the moved point. Without this, moving a node
 * on a curve leaves both handles behind and the segment folds inside out —
 * the single most common bug in hand-written node editors.
 */
export function moveNode(segs: Seg[], i: number, x: number, y: number): Seg[] {
  const s = segs[i]
  if (!s || s.c === 'Z') return segs
  const dx = x - s.x
  const dy = y - s.y
  const out = segs.map((seg) => ({ ...seg })) as Seg[]
  const moved = out[i]
  if (moved.c === 'Z') return segs
  moved.x = x
  moved.y = y
  // the second control point of THIS segment leads into the moved anchor
  if (moved.c === 'C') {
    moved.x2 += dx
    moved.y2 += dy
  }
  // the first control point of the NEXT segment leaves the moved anchor
  const next = out[i + 1]
  if (next && next.c === 'C') {
    next.x1 += dx
    next.y1 += dy
  }
  return out
}

/** Move one control point of a C segment. `which` is 0 or 1. */
export function moveControl(segs: Seg[], i: number, which: 0 | 1, x: number, y: number): Seg[] {
  const s = segs[i]
  if (!s || s.c !== 'C') return segs
  const out = segs.map((seg) => ({ ...seg })) as Seg[]
  const c = out[i] as Extract<Seg, { c: 'C' }>
  if (which === 0) {
    c.x1 = x
    c.y1 = y
  } else {
    c.x2 = x
    c.y2 = y
  }
  return out
}

/**
 * Delete an anchor, healing the path by joining its neighbours with a straight
 * line. Refuses to leave a subpath with fewer than two points, which would be
 * an invisible dangling M.
 */
export function deleteNode(segs: Seg[], i: number): Seg[] {
  const s = segs[i]
  if (!s || s.c === 'Z') return segs
  const subs = subPathRanges(segs)
  const range = subs.find((rg) => i >= rg.start && i <= rg.end)
  if (!range) return segs
  const anchors = countAnchors(segs, range)
  if (anchors <= 2) return segs
  const out = segs.map((seg) => ({ ...seg })) as Seg[]
  if (s.c === 'M') {
    // promote the following segment to be the new start point
    const nxt = out[i + 1]
    if (!nxt || nxt.c === 'Z') return segs
    out[i + 1] = { c: 'M', x: nxt.x, y: nxt.y }
  }
  out.splice(i, 1)
  return out
}

/** Insert an anchor at the midpoint of the segment ENDING at index i. */
export function insertNodeAfter(segs: Seg[], i: number): Seg[] {
  const cur = segs[i]
  const nxt = segs[i + 1]
  if (!cur || cur.c === 'Z' || !nxt || nxt.c === 'Z') return segs
  const out = segs.map((seg) => ({ ...seg })) as Seg[]
  const mid: Seg =
    nxt.c === 'C'
      ? { c: 'L', x: (cur.x + nxt.x) / 2, y: (cur.y + nxt.y) / 2 }
      : { c: 'L', x: (cur.x + nxt.x) / 2, y: (cur.y + nxt.y) / 2 }
  out.splice(i + 1, 0, mid)
  return out
}

/** Turn a straight segment into a curve (and back), so a corner can be rounded
 * without redrawing it. */
export function toCurve(segs: Seg[], i: number): Seg[] {
  const s = segs[i]
  const prev = segs[i - 1]
  if (!s || s.c !== 'L' || !prev || prev.c === 'Z') return segs
  const out = segs.map((seg) => ({ ...seg })) as Seg[]
  // control points at the thirds reproduce the straight line exactly, so the
  // conversion is invisible until a handle is actually dragged
  out[i] = {
    c: 'C',
    x1: prev.x + (s.x - prev.x) / 3,
    y1: prev.y + (s.y - prev.y) / 3,
    x2: prev.x + (2 * (s.x - prev.x)) / 3,
    y2: prev.y + (2 * (s.y - prev.y)) / 3,
    x: s.x,
    y: s.y
  }
  return out
}

export function toLine(segs: Seg[], i: number): Seg[] {
  const s = segs[i]
  if (!s || s.c !== 'C') return segs
  const out = segs.map((seg) => ({ ...seg })) as Seg[]
  out[i] = { c: 'L', x: s.x, y: s.y }
  return out
}

interface Range {
  start: number
  end: number
}

function subPathRanges(segs: Seg[]): Range[] {
  const out: Range[] = []
  let start = -1
  for (const [i, s] of segs.entries()) {
    if (s.c === 'M') {
      if (start >= 0) out.push({ start, end: i - 1 })
      start = i
    }
  }
  if (start >= 0) out.push({ start, end: segs.length - 1 })
  return out
}

function countAnchors(segs: Seg[], range: Range): number {
  let n = 0
  for (let i = range.start; i <= range.end; i++) if (segs[i].c !== 'Z') n++
  return n
}

/**
 * Tight bounds of the path, curves included.
 *
 * Using only the anchors would over-report on a bulging curve and under-report
 * on one that overshoots its endpoints — and the bbox is what the resize grips
 * measure, so a wrong one makes the handles float off the artwork. Control
 * points bound the curve (the convex-hull property), which is exact enough for
 * a selection frame and needs no root-finding.
 */
export function pathBBox(d: string): Box | null {
  const segs = parse(d)
  if (!segs.length) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const acc = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const s of segs) {
    if (s.c === 'Z') continue
    acc(s.x, s.y)
    if (s.c === 'C') {
      acc(s.x1, s.y1)
      acc(s.x2, s.y2)
    }
  }
  if (!Number.isFinite(minX)) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Signed area of a closed subpath, via the shoelace formula over anchors and
 * control points. Positive = clockwise in screen space (y down). Used to tell
 * a hole from a solid region when recolouring. */
export function subPathArea(sub: SubPath): number {
  const pts: Array<[number, number]> = []
  for (const s of sub.segs) {
    if (s.c === 'Z') continue
    if (s.c === 'C') {
      pts.push([s.x1, s.y1], [s.x2, s.y2])
    }
    pts.push([s.x, s.y])
  }
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    a += x1 * y2 - x2 * y1
  }
  return a / 2
}

/** Is (x, y) inside this closed subpath? Even-odd ray cast over a flattened
 * polygon — the same rule the canvas fill uses, so a click agrees with what
 * the user sees painted. */
export function subPathContains(sub: SubPath, x: number, y: number, steps = 8): boolean {
  const pts = flatten(sub, steps)
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi) inside = !inside
  }
  return inside
}

/** Polyline approximation of a subpath — curves sampled at `steps` points. */
export function flatten(sub: SubPath, steps = 8): Array<[number, number]> {
  const pts: Array<[number, number]> = []
  let cx = 0
  let cy = 0
  for (const s of sub.segs) {
    if (s.c === 'Z') continue
    if (s.c === 'M' || s.c === 'L') {
      pts.push([s.x, s.y])
      cx = s.x
      cy = s.y
      continue
    }
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const mt = 1 - t
      pts.push([
        mt * mt * mt * cx + 3 * mt * mt * t * s.x1 + 3 * mt * t * t * s.x2 + t * t * t * s.x,
        mt * mt * mt * cy + 3 * mt * mt * t * s.y1 + 3 * mt * t * t * s.y2 + t * t * t * s.y
      ])
    }
    cx = s.x
    cy = s.y
  }
  return pts
}
