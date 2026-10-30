// Centreline tracing — Illustrator's "strokes" mode (tracing/strokes +
// maxstrokeweight), our own implementation.
//
// The difference matters for line art: OUTLINE tracing of a 3px pen stroke
// gives a long closed loop wrapping both sides of the line, so the "line" is
// really a very thin filled sliver. Editing it, re-colouring it or changing its
// weight is then hopeless. CENTRELINE tracing gives one open path down the
// middle of the stroke plus a width — a real line, exactly what a technical
// drawing or a signature should become.
//
// Method:
//   1. THINNING (Zhang–Suen): erode the shape symmetrically until it is one
//      pixel wide, without breaking it apart. Two sub-iterations per pass with
//      complementary rules — that symmetry is what keeps the skeleton centred.
//   2. GRAPH: skeleton pixels become nodes; ends (1 neighbour) and junctions
//      (3+) are anchors, and the runs between them become polylines.
//   3. WIDTH: the stroke weight is measured from area / skeleton length, which
//      is robust to the ragged edges a scan leaves behind.
//
// Pure maths, no DOM — unit-tested in node.

export interface Centerline {
  /** polyline through the middle of the stroke, in pixel coordinates */
  points: number[][]
  /** true when the run closes on itself (a ring, an O) */
  closed: boolean
}

export interface CenterlineResult {
  lines: Centerline[]
  /** measured stroke weight in pixels */
  width: number
}

const idx = (x: number, y: number, w: number) => y * w + x

/**
 * Zhang–Suen thinning. Returns a new mask that is the 1px skeleton of the
 * input; the input is not modified.
 */
export function thin(mask: Uint8Array, w: number, h: number): Uint8Array {
  const img = new Uint8Array(mask)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[idx(x, y, w)])
  const doomed: number[] = []

  // neighbours clockwise from north: p2 p3 p4 p5 p6 p7 p8 p9
  const ring = (x: number, y: number) => [
    at(x, y - 1),
    at(x + 1, y - 1),
    at(x + 1, y),
    at(x + 1, y + 1),
    at(x, y + 1),
    at(x - 1, y + 1),
    at(x - 1, y),
    at(x - 1, y - 1)
  ]

  for (let guard = 0; guard < 400; guard++) {
    let removedAny = false
    for (const step of [0, 1]) {
      doomed.length = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!img[idx(x, y, w)]) continue
          const p = ring(x, y)
          let live = 0
          for (const v of p) live += v
          if (live < 2 || live > 6) continue
          // number of 0→1 transitions walking the ring once
          let transitions = 0
          for (let i = 0; i < 8; i++) if (!p[i] && p[(i + 1) % 8]) transitions++
          if (transitions !== 1) continue
          // the two complementary corner conditions
          const [n, ne, e, se, ss, sw, ww, nw] = p
          void ne
          void se
          void sw
          void nw
          if (step === 0) {
            if (n * e * ss) continue
            if (e * ss * ww) continue
          } else {
            if (n * e * ww) continue
            if (n * ss * ww) continue
          }
          doomed.push(idx(x, y, w))
        }
      }
      if (doomed.length) {
        removedAny = true
        for (const i of doomed) img[i] = 0
      }
    }
    if (!removedAny) break
  }
  return img
}

/** 8-neighbour offsets in RING order — branchDegree relies on them being
 * circular so a run of set neighbours is one group. */
const NEIGHBOURS: [number, number][] = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1]
]

/**
 * How many DISTINCT directions the skeleton leaves this pixel in — the
 * crossing number, counting connected GROUPS of neighbours rather than
 * neighbours.
 *
 * This is the whole difference between a working skeleton walker and a broken
 * one. An 8-connected line that steps diagonally gives its pixels THREE
 * neighbours while still being one pixel wide (the step's two pixels are
 * neighbours of each other as well as of it), so a raw count reads a plain
 * curve as a junction. Measured on a traced ring: 32 of 84 skeleton pixels
 * looked like junctions and the ring shattered into 89 two-point stubs.
 * Grouping adjacent neighbours collapses each staircase step back to one
 * direction: 1 = an end, 2 = a plain curve, 3+ = a real junction.
 */
/**
 * The order the walker tries neighbours in: ORTHOGONAL first, diagonals after.
 *
 * Ring order would let the walk cut a staircase corner diagonally and leave the
 * skipped pixel stranded — it then surfaced as a second, bogus run. Stepping
 * straight whenever a straight step exists keeps every skeleton pixel on the
 * one path it belongs to.
 */
const STEP_ORDER: [number, number][] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
  [1, -1]
]

function branchDegree(sk: Uint8Array, w: number, h: number, x: number, y: number): number {
  const ring: number[] = []
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = x + dx
    const ny = y + dy
    ring.push(nx >= 0 && ny >= 0 && nx < w && ny < h && sk[idx(nx, ny, w)] ? 1 : 0)
  }
  let live = 0
  for (const v of ring) live += v
  if (live === 0) return 0
  if (live === 8) return 8
  // NEIGHBOURS is in ring order, so a group is a run of 1s around the circle
  let groups = 0
  for (let i = 0; i < 8; i++) if (ring[i] && !ring[(i + 7) % 8]) groups++
  return groups
}

/**
 * Walk a 1px skeleton into polylines: one per run between two anchors (an end
 * or a junction). A skeleton with no anchors at all is a closed ring, which is
 * walked from an arbitrary pixel and marked `closed`.
 */
export function skeletonToPolylines(sk: Uint8Array, w: number, h: number): Centerline[] {
  const used = new Uint8Array(w * h) // edges consumed, tracked per pixel-pair
  const lines: Centerline[] = []
  const isSet = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && !!sk[idx(x, y, w)]

  const anchors: [number, number][] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!sk[idx(x, y, w)]) continue
      const n = branchDegree(sk, w, h, x, y)
      if (n !== 2) anchors.push([x, y])
    }
  }

  const walkFrom = (sx: number, sy: number) => {
    for (const [dx0, dy0] of STEP_ORDER) {
      let cx = sx + dx0
      let cy = sy + dy0
      if (!isSet(cx, cy)) continue
      const first = idx(cx, cy, w)
      if (used[first] && branchDegree(sk, w, h, cx, cy) === 2) continue
      const pts: number[][] = [[sx, sy]]
      let px = sx
      let py = sy
      for (;;) {
        pts.push([cx, cy])
        if (branchDegree(sk, w, h, cx, cy) === 2) used[idx(cx, cy, w)] = 1
        else break // reached another anchor
        let nextX = -1
        let nextY = -1
        for (const [dx, dy] of STEP_ORDER) {
          const nx = cx + dx
          const ny = cy + dy
          if (!isSet(nx, ny)) continue
          if (nx === px && ny === py) continue
          if (used[idx(nx, ny, w)] && branchDegree(sk, w, h, nx, ny) === 2) continue
          nextX = nx
          nextY = ny
          break
        }
        if (nextX < 0) break
        px = cx
        py = cy
        cx = nextX
        cy = nextY
      }
      // A digital circle's skeleton usually carries a few 3-neighbour pixels,
      // so a ring is often entered as an "anchor" rather than being left to
      // the anchor-free pass below. Coming back to the pixel we started from
      // is the honest test for closure.
      const last = pts[pts.length - 1]
      const closed = pts.length >= 4 && last[0] === sx && last[1] === sy
      if (pts.length >= 2) lines.push({ points: pts, closed })
    }
  }

  for (const [x, y] of anchors) walkFrom(x, y)

  // anything left over is a closed ring with no anchor at all
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w)
      // Only a genuine ring is left here, and a ring is made ENTIRELY of
      // 2-neighbour pixels. Ends and junctions are deliberately never marked
      // used (walkFrom stops on them), so without this guard one of them would
      // be re-walked and emitted as a bogus closed run.
      if (!sk[i] || used[i] || branchDegree(sk, w, h, x, y) !== 2) continue
      const pts: number[][] = []
      let cx = x
      let cy = y
      let px = -1
      let py = -1
      for (let guard = 0; guard < w * h; guard++) {
        pts.push([cx, cy])
        used[idx(cx, cy, w)] = 1
        let nextX = -1
        let nextY = -1
        for (const [dx, dy] of STEP_ORDER) {
          const nx = cx + dx
          const ny = cy + dy
          if (!isSet(nx, ny) || (nx === px && ny === py)) continue
          if (used[idx(nx, ny, w)]) continue
          nextX = nx
          nextY = ny
          break
        }
        if (nextX < 0) break
        px = cx
        py = cy
        cx = nextX
        cy = nextY
      }
      if (pts.length >= 3) lines.push({ points: pts, closed: true })
    }
  }
  return lines
}

/**
 * Does the region survive `steps` erosions — i.e. does it contain a disc of
 * radius `steps`?
 *
 * This is the gate that decides stroke vs. fill, and an AVERAGE width cannot
 * do the job: a desk top with a long branching medial axis divides out to a
 * small mean width and sails through, which is exactly what turned every
 * filled surface of the manager's isometric drawing into a fat stray line.
 * "Is there a big circle anywhere inside it" has no such blind spot — a pen
 * stroke of width W vanishes after W/2 erosions no matter how long or bent it
 * is, while any solid area keeps a core.
 */
function survivesErosion(mask: Uint8Array, w: number, h: number, steps: number): boolean {
  let cur = new Uint8Array(mask)
  let next = new Uint8Array(w * h)
  for (let s = 0; s < steps; s++) {
    let alive = 0
    next.fill(0)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (!cur[i]) continue
        // 4-connected erosion: a pixel survives only with all edge neighbours
        if (cur[i - 1] && cur[i + 1] && cur[i - w] && cur[i + w]) {
          next[i] = 1
          alive++
        }
      }
    }
    if (!alive) return false
    const swap = cur
    cur = next
    next = swap
  }
  return true
}

/**
 * Is this region a STROKE rather than a filled shape?
 *
 * Two independent conditions, both required: nothing thick hides inside it
 * (survivesErosion), and its skeleton is genuinely long compared with its
 * width — a short stub is a speck, not a line.
 */
export function centerlineOf(
  mask: Uint8Array,
  w: number,
  h: number,
  maxWidth = 12
): CenterlineResult | null {
  let area = 0
  for (let i = 0; i < w * h; i++) if (mask[i]) area++
  if (area < 12) return null

  // Reject anything with a thick core BEFORE the expensive thinning.
  const halfWidth = Math.max(1, Math.round(maxWidth / 2))
  if (survivesErosion(mask, w, h, halfWidth)) return null

  const sk = thin(mask, w, h)
  let skeletonLength = 0
  for (let i = 0; i < w * h; i++) if (sk[i]) skeletonLength++
  if (skeletonLength < 3) return null

  const width = area / skeletonLength
  if (width > maxWidth) return null
  // a line is much longer than it is wide; a blob is not
  if (skeletonLength < 4 * width) return null

  const lines = skeletonToPolylines(sk, w, h).filter((l) => l.points.length >= 2)
  if (!lines.length) return null
  return { lines, width }
}
