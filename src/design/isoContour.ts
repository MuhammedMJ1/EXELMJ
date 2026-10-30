// Sub-pixel contour extraction (marching squares with linear interpolation).
//
// Why this replaced walking the pixel lattice: a lattice walk can only put a
// boundary on an integer pixel edge, so every edge is a staircase and every
// anti-aliased or JPEG-softened pixel is forced to one side. Marching squares
// reads a CONTINUOUS field and places each crossing exactly where the field
// passes the threshold, so the boundary lands mid-way through the soft pixels —
// where the real edge is. That is worth roughly half a pixel everywhere, and it
// is what lets the curve fitter downstream produce a clean line instead of
// averaging a staircase.
//
// Pure maths, no DOM — unit-tested in node.

/** A closed loop of sub-pixel points, in PIXEL coordinates. */
export type Loop = number[][]

/**
 * Crossings live on grid EDGES, and each edge is shared by exactly two cells,
 * so an integer edge id chains segments together with no float comparison.
 * Horizontal edge (i,j)→(i+1,j) and vertical edge (i,j)→(i,j+1) get distinct
 * ids from the same (i,j).
 */
const hKey = (i: number, j: number, gw: number) => (j * gw + i) * 2
const vKey = (i: number, j: number, gw: number) => (j * gw + i) * 2 + 1

/**
 * Iso-contours of a scalar field at `threshold`.
 *
 * `field` is gw×gh samples; sample (i,j) is taken to sit at pixel coordinate
 * (i - 0.5, j - 0.5), which is what puts a 1-px-padded field's contours in the
 * source image's own coordinate space.
 *
 * Loops come back oriented with the ABOVE-threshold side on the left, so an
 * outline and the hole inside it wind opposite ways and evenodd filling cuts
 * the hole out for free.
 */
export function isoContours(
  field: Float32Array,
  gw: number,
  gh: number,
  threshold = 0.5
): Loop[] {
  const at = (i: number, j: number) => field[j * gw + i]
  const pos = (i: number, j: number): [number, number] => [i - 0.5, j - 0.5]

  // where the threshold falls between two samples, linearly
  const lerp = (a: [number, number], av: number, b: [number, number], bv: number): number[] => {
    const denom = bv - av
    const t = Math.abs(denom) < 1e-12 ? 0.5 : (threshold - av) / denom
    const tc = Math.min(1, Math.max(0, t))
    return [a[0] + (b[0] - a[0]) * tc, a[1] + (b[1] - a[1]) * tc]
  }

  const point = new Map<number, number[]>()
  const next = new Map<number, number>()

  const crossH = (i: number, j: number): number => {
    const k = hKey(i, j, gw)
    if (!point.has(k)) point.set(k, lerp(pos(i, j), at(i, j), pos(i + 1, j), at(i + 1, j)))
    return k
  }
  const crossV = (i: number, j: number): number => {
    const k = vKey(i, j, gw)
    if (!point.has(k)) point.set(k, lerp(pos(i, j), at(i, j), pos(i, j + 1), at(i, j + 1)))
    return k
  }

  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const tl = at(i, j) >= threshold
      const tr = at(i + 1, j) >= threshold
      const br = at(i + 1, j + 1) >= threshold
      const bl = at(i, j + 1) >= threshold
      const code = (tl ? 1 : 0) | (tr ? 2 : 0) | (br ? 4 : 0) | (bl ? 8 : 0)
      if (code === 0 || code === 15) continue

      // the four possible crossings of this cell
      const T = () => crossH(i, j)
      const B = () => crossH(i, j + 1)
      const L = () => crossV(i, j)
      const R = () => crossV(i + 1, j)

      const link = (from: number, to: number) => next.set(from, to)

      switch (code) {
        case 1: link(L(), T()); break
        case 2: link(T(), R()); break
        case 3: link(L(), R()); break
        case 4: link(R(), B()); break
        case 6: link(T(), B()); break
        case 7: link(L(), B()); break
        case 8: link(B(), L()); break
        case 9: link(B(), T()); break
        case 11: link(B(), R()); break
        case 12: link(R(), L()); break
        case 13: link(R(), T()); break
        case 14: link(T(), L()); break
        // Saddles: the cell's centre decides whether the two inside corners
        // join. DIRECTION MATTERS: when they join, the cell is locally the
        // COMPLEMENT of the isolated-corner case, so the links must run the
        // opposite way (case 5 joined ≈ case 13/7, NOT case 2/8). Getting
        // this backwards writes a second outgoing link onto an edge another
        // cell already claimed, welding two unrelated loops together — the
        // long straight streaks across the manager's isometric trace.
        case 5: {
          const centre = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (centre > threshold) { // strictly: an exact-threshold centre is a corner touch — separate
            link(R(), T()) // like case 13: only tr is outside
            link(L(), B()) // like case 7: only bl is outside
          } else {
            link(L(), T()) // like case 1: tl alone
            link(R(), B()) // like case 4: br alone
          }
          break
        }
        case 10: {
          const centre = (at(i, j) + at(i + 1, j) + at(i + 1, j + 1) + at(i, j + 1)) / 4
          if (centre > threshold) { // strictly: an exact-threshold centre is a corner touch — separate
            link(T(), L()) // like case 14: only tl is outside
            link(B(), R()) // like case 11: only br is outside
          } else {
            link(T(), R()) // like case 2: tr alone
            link(B(), L()) // like case 8: bl alone
          }
          break
        }
      }
    }
  }

  const loops: Loop[] = []
  const seen = new Set<number>()
  for (const start of next.keys()) {
    if (seen.has(start)) continue
    const loop: Loop = []
    let cur = start
    // follow the links; every crossing has exactly one successor
    for (;;) {
      if (seen.has(cur)) break
      seen.add(cur)
      const p = point.get(cur)
      if (p) loop.push(p)
      const n = next.get(cur)
      if (n === undefined) break
      cur = n
      if (cur === start) break
    }
    if (loop.length >= 3) loops.push(loop)
  }
  return loops
}

/**
 * Soft membership of every pixel in a SET of palette colours: 1 deep inside,
 * 0 far outside, and exactly 0.5 where the pixel sits half-way between the
 * nearest in-set colour and the nearest out-set one. Thresholding THAT at 0.5
 * puts the outline through the middle of an anti-aliased edge rather than on
 * one side of it.
 *
 * Taking a SET (not a single colour) is what stacked layering needs: layer i's
 * region is "this colour and every colour painted above it", so lower layers
 * extend underneath upper ones and no seam between two colours is ever drawn
 * twice.
 */
/**
 * The stacked layers' membership fields, computed once for the whole stack.
 *
 * WHY THIS EXISTS. `membershipFieldSets` is exact and simple, and it costs one
 * distance per palette entry PER PIXEL PER LAYER. Since the number of layers
 * IS the palette size, its total cost grows with the SQUARE of the palette —
 * fine at the 32 colours the tracer used to allow, hopeless at 200.
 *
 * The saving comes from the stack's shape rather than from any approximation.
 * Layer i is "kept[i..] against kept[0..i) plus the dropped colours", so:
 *
 *   - the OUT set only GROWS as i advances, which a running minimum tracks in
 *     one array and O(1) work per pixel per layer;
 *   - the IN set only SHRINKS, which a running minimum cannot track forwards —
 *     so the suffix minima are snapshotted every `blockSize` layers on one
 *     backward pass, and a layer scans at most `blockSize` colours to close
 *     the gap between itself and the next snapshot.
 *
 * Every value produced is bit-identical to the straightforward version; the
 * parity suite compares whole traced SVGs to prove it.
 */
export class StackedFields {
  private readonly px: number
  readonly gw: number
  readonly gh: number
  /** min squared distance to a DROPPED colour; Infinity when none were dropped */
  private readonly dDrop2: Float32Array
  /** snapshots of "min over kept[b*blockSize ..]" at each block boundary */
  private readonly sufAt: Float32Array[] = []
  private readonly blockSize: number
  /** running "min over kept[0..i)", advanced as layers are asked for */
  private readonly pref: Float32Array
  /** the next layer index `field()` expects — the class is single-pass */
  private next = 0
  private readonly kept: Int32Array
  private readonly n: number

  constructor(
    private readonly data: Uint8ClampedArray,
    private readonly w: number,
    private readonly h: number,
    keptColors: [number, number, number][],
    droppedColors: [number, number, number][]
  ) {
    this.px = w * h
    this.gw = w + 2
    this.gh = h + 2
    this.n = keptColors.length
    this.kept = flatten(keptColors)
    this.pref = new Float32Array(this.px).fill(Infinity)

    this.dDrop2 = new Float32Array(this.px).fill(Infinity)
    if (droppedColors.length) {
      const drops = flatten(droppedColors)
      for (let i = 0; i < this.px; i++) {
        const o = i * 4
        if (data[o + 3] < 128) continue
        this.dDrop2[i] = minDist2(data[o], data[o + 1], data[o + 2], drops, 0, drops.length)
      }
    }

    // Enough blocks that a layer scans ~sqrt(n) colours, but never so many
    // that the snapshots dominate memory on a large raster.
    let blocks = Math.max(1, Math.min(16, Math.round(Math.sqrt(this.n))))
    while (blocks > 1 && (blocks + 1) * this.px * 4 > 64_000_000) blocks--
    this.blockSize = Math.max(1, Math.ceil(this.n / blocks))

    // ONE backward pass builds every snapshot: walking layers from the last to
    // the first, the running minimum IS the suffix minimum.
    const run = new Float32Array(this.px).fill(Infinity)
    const boundaries: number[] = []
    for (let b = 0; b * this.blockSize < this.n; b++) boundaries.push(b * this.blockSize)
    const snaps = new Map<number, Float32Array>()
    for (let k = this.n - 1; k >= 0; k--) {
      const r = this.kept[k * 3]
      const g = this.kept[k * 3 + 1]
      const bl = this.kept[k * 3 + 2]
      for (let i = 0; i < this.px; i++) {
        const o = i * 4
        if (data[o + 3] < 128) continue
        const dr = data[o] - r
        const dg = data[o + 1] - g
        const db = data[o + 2] - bl
        const d = dr * dr + dg * dg + db * db
        if (d < run[i]) run[i] = d
      }
      if (boundaries.includes(k)) snaps.set(k, run.slice())
    }
    for (const b of boundaries) this.sufAt.push(snaps.get(b) ?? new Float32Array(this.px).fill(Infinity))
    // A layer past the last snapshot has an empty suffix beyond itself.
    this.sufAt.push(new Float32Array(this.px).fill(Infinity))
  }

  /**
   * The field for layer `i`. Must be called with i = 0, 1, 2, … in order: the
   * OUT-set minimum is carried forward, and asking out of order would report a
   * layer against the wrong stack.
   */
  field(i: number): Float32Array {
    if (i !== this.next) throw new Error(`StackedFields: layer ${i} requested out of order`)
    this.next++
    const { data, w, h, px, gw, kept, blockSize } = this
    const field = new Float32Array(gw * this.gh)
    // The first snapshot at or after i, and how many colours lie in between.
    const b = Math.ceil(i / blockSize)
    const suf = this.sufAt[Math.min(b, this.sufAt.length - 1)]
    const gapEnd = Math.min(b * blockSize, this.n)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x
        const o = idx * 4
        if (data[o + 3] < 128) continue // transparent is outside everything
        const r = data[o]
        const g = data[o + 1]
        const bl = data[o + 2]
        let dIn2 = suf[idx]
        if (gapEnd > i) {
          const d = minDist2(r, g, bl, kept, i * 3, gapEnd * 3)
          if (d < dIn2) dIn2 = d
        }
        const dOut2 = Math.min(this.pref[idx], this.dDrop2[idx])
        // the bottom layer has nothing outside it: fully inside
        if (dOut2 === Infinity) {
          field[(y + 1) * gw + (x + 1)] = 1
          continue
        }
        const dIn = Math.sqrt(dIn2)
        const dOut = Math.sqrt(dOut2)
        const sum = dIn + dOut
        field[(y + 1) * gw + (x + 1)] = sum < 1e-9 ? 0.5 : dOut / sum
      }
    }
    // This layer's colour joins the OUT set for everything above it.
    const r = kept[i * 3]
    const g = kept[i * 3 + 1]
    const bl = kept[i * 3 + 2]
    for (let idx = 0; idx < px; idx++) {
      const o = idx * 4
      if (data[o + 3] < 128) continue
      const dr = data[o] - r
      const dg = data[o + 1] - g
      const db = data[o + 2] - bl
      const d = dr * dr + dg * dg + db * db
      if (d < this.pref[idx]) this.pref[idx] = d
    }
    return field
  }
}

/** Smallest squared RGB distance to any colour in flat[from, to). */
function minDist2(r: number, g: number, b: number, flat: Int32Array, from: number, to: number): number {
  let best = Infinity
  for (let i = from; i < to; i += 3) {
    const dr = r - flat[i]
    const dg = g - flat[i + 1]
    const db = b - flat[i + 2]
    const d = dr * dr + dg * dg + db * db
    if (d < best) best = d
  }
  return best
}

/** [r,g,b, r,g,b, …] — one contiguous walk instead of an array of arrays. */
function flatten(colors: [number, number, number][]): Int32Array {
  const out = new Int32Array(colors.length * 3)
  for (let i = 0; i < colors.length; i++) {
    out[i * 3] = colors[i][0]
    out[i * 3 + 1] = colors[i][1]
    out[i * 3 + 2] = colors[i][2]
  }
  return out
}

export function membershipFieldSets(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  inColors: [number, number, number][],
  outColors: [number, number, number][]
): { field: Float32Array; gw: number; gh: number } {
  // one sample of padding all round so shapes touching the border still close
  const gw = w + 2
  const gh = h + 2
  const field = new Float32Array(gw * gh) // zero-filled = outside
  // This is the hottest loop in the tracer: it runs once per pixel PER LAYER,
  // against every palette entry. Two things keep it affordable as the palette
  // grows towards 200 colours, and NEITHER changes a single output value:
  //
  //  - the colours are flattened into one typed array, so the inner loop is a
  //    stride-3 walk rather than a chase through an array of arrays;
  //  - the minimum is found on the SQUARED distance and the square root is
  //    taken twice at the end. min(d²) and min(d) pick the same entry, and
  //    Math.hypot — which guards against an overflow impossible in 0..255 —
  //    costs several times a multiply.
  const ins = flatten(inColors)
  const outs = flatten(outColors)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4
      if (data[o + 3] < 128) continue // transparent is outside everything
      const r = data[o]
      const g = data[o + 1]
      const b = data[o + 2]
      let dIn2 = Infinity
      for (let i = 0; i < ins.length; i += 3) {
        const dr = r - ins[i]
        const dg = g - ins[i + 1]
        const db = b - ins[i + 2]
        const d = dr * dr + dg * dg + db * db
        if (d < dIn2) dIn2 = d
      }
      let dOut2 = Infinity
      for (let i = 0; i < outs.length; i += 3) {
        const dr = r - outs[i]
        const dg = g - outs[i + 1]
        const db = b - outs[i + 2]
        const d = dr * dr + dg * dg + db * db
        if (d < dOut2) dOut2 = d
      }
      // the bottom layer has nothing outside it: fully inside
      if (dOut2 === Infinity) {
        field[(y + 1) * gw + (x + 1)] = 1
        continue
      }
      const dIn = Math.sqrt(dIn2)
      const dOut = Math.sqrt(dOut2)
      const sum = dIn + dOut
      field[(y + 1) * gw + (x + 1)] = sum < 1e-9 ? 0.5 : dOut / sum
    }
  }
  return { field, gw, gh }
}

/** Single-colour membership — the set form with "everything else" outside. */
export function membershipField(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  palette: [number, number, number][],
  k: number
): { field: Float32Array; gw: number; gh: number } {
  return membershipFieldSets(
    data,
    w,
    h,
    [palette[k]],
    palette.filter((_, m) => m !== k)
  )
}

/**
 * 3×3 median filter on RGB — removes JPEG speckle and lone stray pixels while
 * leaving edges exactly where they are (a blur would move them). Running this
 * before quantisation is what stops noise becoming its own palette colour and
 * peppering the trace with specks.
 */
export function denoiseMedian(data: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length)
  out.set(data)
  const window: number[] = new Array(9)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            window[n++] = data[((y + dy) * w + (x + dx)) * 4 + c]
          }
        }
        window.sort((a, b) => a - b)
        out[(y * w + x) * 4 + c] = window[4]
      }
    }
  }
  return out
}

/**
 * Push a closed loop outward by `delta` pixels along its own normals.
 *
 * Each colour is traced independently, so two neighbouring regions end up with
 * two separately-fitted curves along what was one shared edge. They diverge by
 * a fraction of a pixel and the page shows through as a bright hairline — the
 * white haloing that made a traced ornament look outlined when the original was
 * not. Growing every region slightly makes them OVERLAP instead of abut; the
 * later (smaller) paint covers the seam and the halo is gone.
 *
 * Loops are wound with the filled side on the LEFT, so the outward direction is
 * the right-hand normal — and that one rule is correct for holes too, where
 * "away from the filled material" means the hole shrinks.
 */
export function offsetLoop(loop: Loop, delta: number): Loop {
  const n = loop.length
  if (n < 3 || delta === 0) return loop
  const out: Loop = []
  for (let i = 0; i < n; i++) {
    const prev = loop[(i - 1 + n) % n]
    const next = loop[(i + 1) % n]
    // average the normals of the two edges meeting here so corners stay put
    const normals: [number, number][] = []
    for (const [a, b] of [
      [prev, loop[i]],
      [loop[i], next]
    ]) {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      if (len > 1e-9) normals.push([-dy / len, dx / len])
    }
    if (!normals.length) {
      out.push(loop[i])
      continue
    }
    let nx = 0
    let ny = 0
    for (const n of normals) {
      nx += n[0]
      ny += n[1]
    }
    const len = Math.hypot(nx, ny)
    if (len < 1e-9) {
      out.push(loop[i])
      continue
    }
    const bx = nx / len
    const by = ny / len
    // MITRE the join: moving the corner by `delta` along the bisector would
    // only shift each edge by delta·cos(half-angle), so a right angle would end
    // up 0.71px out instead of 1. Dividing by that cosine puts both edges
    // exactly `delta` away; the clamp stops a near-reversal spiking to infinity.
    const cos = Math.max(0.35, bx * normals[0][0] + by * normals[0][1])
    const scale = delta / cos
    out.push([loop[i][0] + bx * scale, loop[i][1] + by * scale])
  }
  return out
}
