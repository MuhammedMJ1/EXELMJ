// Vector shapes the user draws over the artwork (design mode's "شكل" tools).
//
// Same coordinate contract as the text boxes: PDF POINTS from the page's
// TOP-LEFT, so a shape is zoom-independent and survives re-opens. For rect and
// ellipse (x, y) is the top-left corner and (w, h) the size; for line and arrow
// (x, y) is the FIRST endpoint and (w, h) the SIGNED delta to the second, which
// is what lets a line be drawn in any of the four directions.
//
// Geometry here is pure (no canvas, no DOM) precisely so it is unit-testable in
// node; the painting helpers take a context and only translate.

/** 'path' is not drawn by hand — it is what the image tracer produces. */
export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'arrow' | 'path'

export interface Shape {
  id: string
  kind: ShapeKind
  x: number
  y: number
  w: number
  h: number
  /** '' = no fill (outline only). Ignored by line/arrow. */
  fill: string
  /** '' = no stroke */
  stroke: string
  strokeWidth: number
  /** kind==='path' only: SVG path data in LOCAL pt (0,0 at x,y), so moving the
   * shape never has to rewrite the geometry. */
  d?: string
  /** kind==='path' only: linear gradient in the SAME local pt space as `d`. */
  gradient?: {
    x1: number
    y1: number
    x2: number
    y2: number
    from: string
    to: string
  }
  /**
   * v4, all optional and ABSENT when at their default, so a v3 sidecar that
   * never used them re-serialises byte-identically.
   */
  /** degrees clockwise about the bbox centre. Absent === 0. */
  rotation?: number
  /** 0..1. Absent === 1 (fully opaque). */
  opacity?: number
  /** rect only: corner radii in pt, [tl, tr, br, bl]. Absent === square. */
  radius?: [number, number, number, number]
  /**
   * Drop shadow. Absent === none.
   *
   * Offset and blur are in pt like everything else, and the colour carries its
   * own alpha separately — a hex cannot express one, and a shadow at full
   * opacity is a black smear rather than a shadow.
   */
  shadow?: {
    dx: number
    dy: number
    blur: number
    color: string
    /** 0..1 */
    alpha: number
  }
  /** Dash pattern in pt, e.g. [6, 3]. Absent === solid. */
  dash?: number[]
}

export type PageShapes = Record<string, Shape[]>

/** The kinds the palette can DRAW; 'path' arrives from the tracer instead. */
export const SHAPE_KINDS: ShapeKind[] = ['rect', 'ellipse', 'line', 'arrow']
const ALL_KINDS: ShapeKind[] = [...SHAPE_KINDS, 'path']

/** A sidecar travels with the file: a gradient is four numbers and two
 * colours, and anything else is dropped rather than trusted. */
function cleanGradient(v: unknown): NonNullable<Shape['gradient']> | null {
  if (!v || typeof v !== 'object') return null
  const g = v as Record<string, unknown>
  const n = (k: string): number | null => {
    const x = Number(g[k])
    return Number.isFinite(x) ? x : null
  }
  const x1 = n('x1')
  const y1 = n('y1')
  const x2 = n('x2')
  const y2 = n('y2')
  if (x1 === null || y1 === null || x2 === null || y2 === null) return null
  const hexRe = /^#[0-9a-fA-F]{6}$/
  const from = String(g.from)
  const to = String(g.to)
  if (!hexRe.test(from) || !hexRe.test(to)) return null
  return { x1, y1, x2, y2, from, to }
}

/** Path data is written into an SVG attribute and a PDF content stream, so it
 * is restricted to the command letters and numbers — nothing that could carry
 * a url() or an entity. */
const SAFE_PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/

export function newShape(id: string, kind: ShapeKind, x: number, y: number): Shape {
  return {
    id,
    kind,
    x,
    y,
    w: 0,
    h: 0,
    fill: kind === 'line' || kind === 'arrow' ? '' : '#185abd',
    stroke: kind === 'line' || kind === 'arrow' ? '#185abd' : '',
    strokeWidth: 2
  }
}

/** Axis-aligned bounds in pt — line/arrow deltas may be negative. */
export function shapeBBox(s: Shape): { x: number; y: number; w: number; h: number } {
  return {
    x: Math.min(s.x, s.x + s.w),
    y: Math.min(s.y, s.y + s.h),
    w: Math.abs(s.w),
    h: Math.abs(s.h)
  }
}

export function isStroked(s: Shape): boolean {
  return s.kind === 'line' || s.kind === 'arrow'
}

/** What the renderer paints a shape with. */
export interface ShapePaint {
  /** a css colour, 'none', or 'gradient' meaning "paint with s.gradient" */
  fill: string
  /** null = draw no stroke at all */
  stroke: string | null
}

/**
 * Decide a shape's fill and stroke — SEPARATELY.
 *
 * Pulled out of the renderer because the two used to be one if/else chain, so
 * a path carrying both painted its fill and silently dropped its stroke. From
 * outside that looked like "changing the colour does nothing": the swatch
 * moved, the file changed, the artwork did not.
 *
 * A gradient OUTRANKS the flat fill, which is why choosing a colour for a
 * traced shape has to delete the gradient rather than just set `fill`.
 */
export function shapePaint(s: Shape): ShapePaint {
  const stroke = s.stroke || null
  if (s.kind === 'line' || s.kind === 'arrow') {
    // A line IS its stroke; without one there is nothing to draw, so it falls
    // back to black rather than disappearing.
    return { fill: 'none', stroke: stroke ?? '#000000' }
  }
  if (s.kind === 'rect' || s.kind === 'ellipse') return { fill: s.fill || 'none', stroke }
  if (s.gradient) return { fill: 'gradient', stroke }
  if (s.fill) return { fill: s.fill, stroke }
  if (stroke) return { fill: 'none', stroke }
  // Neither colour. The tracer always supplies a fill, so this is a hand-drawn
  // path whose colours were cleared: black beats invisible.
  return { fill: '#000000', stroke: null }
}

/**
 * The single `transform` attribute a shape's node carries.
 *
 * ONE attribute doing BOTH jobs, which is the entire point. A path holds its
 * POSITION in `translate` — its `d` is local to the shape — so writing
 * `rotate` on its own, which the renderer used to do, silently discarded the
 * translate and threw the geometry back to the page origin. On screen the
 * shape simply vanished the moment it was rotated.
 *
 * Order matters: `rotate(...) translate(...)` maps a local point out to its
 * absolute place FIRST and then spins it about the bbox centre.
 */
export function shapeTransform(s: Shape): string {
  const b = shapeBBox(s)
  const parts: string[] = []
  if (s.rotation) parts.push(`rotate(${s.rotation} ${b.x + b.w / 2} ${b.y + b.h / 2})`)
  if (s.kind === 'path') parts.push(`translate(${s.x} ${s.y})`)
  return parts.join(' ')
}

/**
 * The user-space region and blur an SVG drop-shadow filter needs, or null when
 * the shape has no shadow.
 *
 * The DEFAULT filter region is a percentage of the bounding box, which clips a
 * wide shadow off a thin shape; an explicit region cannot.
 *
 * stdDeviation is HALF the blur because that is canvas's own definition of
 * shadowBlur, and the exporter paints through canvas — the two have to agree
 * or the exported file does not match the screen.
 *
 * A path's own `transform` establishes the user space this region is measured
 * in, so for a path it is LOCAL (its `d` starts at 0,0) while every other kind
 * carries absolute coordinates.
 */
export function shadowRegion(
  s: Shape
): { x: number; y: number; w: number; h: number; stdDeviation: number } | null {
  if (!s.shadow) return null
  const b = shapeBBox(s)
  const pad = s.shadow.blur * 2 + Math.max(Math.abs(s.shadow.dx), Math.abs(s.shadow.dy)) + s.strokeWidth + 4
  const box = s.kind === 'path' ? { x: 0, y: 0, w: b.w, h: b.h } : b
  return {
    x: box.x - pad,
    y: box.y - pad,
    w: box.w + pad * 2,
    h: box.h + pad * 2,
    stdDeviation: s.shadow.blur / 2
  }
}

/**
 * The two barbs of an arrow head at the LINE'S END, as absolute pt points.
 * Head length grows with the stroke but is capped at a third of the shaft so a
 * short arrow does not become all head.
 */
export function arrowHead(s: Shape): { tip: [number, number]; barbs: [[number, number], [number, number]] } {
  const tipX = s.x + s.w
  const tipY = s.y + s.h
  const len = Math.hypot(s.w, s.h)
  const size = Math.min(Math.max(6, s.strokeWidth * 3.5), len / 3 || 6)
  if (!len) return { tip: [tipX, tipY], barbs: [[tipX, tipY], [tipX, tipY]] }
  const ux = s.w / len
  const uy = s.h / len
  // step back along the shaft, then out along the perpendicular
  const baseX = tipX - ux * size
  const baseY = tipY - uy * size
  const px = -uy * size * 0.5
  const py = ux * size * 0.5
  return {
    tip: [tipX, tipY],
    barbs: [
      [baseX + px, baseY + py],
      [baseX - px, baseY - py]
    ]
  }
}

/**
 * Any shape as path data in its OWN local frame — (0,0) at the bounding box's
 * top-left, which is the contract `kind: 'path'` already follows.
 *
 * This is what lets Expand work on everything rather than only on traced
 * paths: "turn the stroke into filled artwork" has to mean the same thing for
 * a drawn rectangle as for a drawn curve, and the only way to say that once is
 * to convert first.
 *
 * Returns null when there is no drawable geometry, so the caller leaves the
 * artwork alone rather than replacing it with something the user did not draw.
 */
export function shapeToPathD(s: Shape): string | null {
  const b = shapeBBox(s)
  const n = (v: number): string => String(Math.round(v * 1000) / 1000)
  if (s.kind === 'path') return s.d || null
  if (s.kind === 'line' || s.kind === 'arrow') {
    // (x, y) is the FIRST endpoint and (w, h) a SIGNED delta, so the local
    // endpoints depend on which way the line was drawn.
    const x1 = s.w < 0 ? b.w : 0
    const y1 = s.h < 0 ? b.h : 0
    const x2 = s.w < 0 ? 0 : b.w
    const y2 = s.h < 0 ? 0 : b.h
    let d = `M${n(x1)} ${n(y1)}L${n(x2)} ${n(y2)}`
    if (s.kind === 'arrow') {
      // The head is a filled triangle in the same local frame; Expand has to
      // carry it across or the arrow loses its point.
      const { tip, barbs } = arrowHead(s)
      const lx = (v: number): string => n(v - b.x)
      const ly = (v: number): string => n(v - b.y)
      d += `M${lx(barbs[0][0])} ${ly(barbs[0][1])}L${lx(tip[0])} ${ly(tip[1])}L${lx(barbs[1][0])} ${ly(barbs[1][1])}Z`
    }
    return d
  }
  if (!(b.w > 0) || !(b.h > 0)) return null
  if (s.kind === 'ellipse') {
    const rx = b.w / 2
    const ry = b.h / 2
    // Four cubics at the magic 0.5522847498 — an ellipse is not expressible
    // exactly as a cubic, and this is the constant that minimises the error.
    const k = 0.5522847498
    const ox = rx * k
    const oy = ry * k
    return (
      `M0 ${n(ry)}` +
      `C0 ${n(ry - oy)} ${n(rx - ox)} 0 ${n(rx)} 0` +
      `C${n(rx + ox)} 0 ${n(b.w)} ${n(ry - oy)} ${n(b.w)} ${n(ry)}` +
      `C${n(b.w)} ${n(ry + oy)} ${n(rx + ox)} ${n(b.h)} ${n(rx)} ${n(b.h)}` +
      `C${n(rx - ox)} ${n(b.h)} 0 ${n(ry + oy)} 0 ${n(ry)}Z`
    )
  }
  // rect, with its corner radii if it has any
  const r = s.radius ?? [0, 0, 0, 0]
  const cap = Math.min(b.w, b.h) / 2
  const [tl, tr, br, bl] = r.map((v) => Math.max(0, Math.min(cap, v)))
  if (!tl && !tr && !br && !bl) {
    return `M0 0L${n(b.w)} 0L${n(b.w)} ${n(b.h)}L0 ${n(b.h)}Z`
  }
  const k = 0.5522847498
  // Each corner's two control points follow the two TANGENTS it joins — the
  // one it arrives along and the one it leaves along. A single direction for
  // both, which is the obvious shortcut, bends the curve outside the
  // rectangle: the shape ends up taller than the box it is supposed to be.
  const corner = (
    x1: number, y1: number,
    dx1: number, dy1: number,
    x2: number, y2: number,
    dx2: number, dy2: number,
    rr: number
  ): string =>
    `C${n(x1 + dx1 * rr * k)} ${n(y1 + dy1 * rr * k)} ${n(x2 - dx2 * rr * k)} ${n(y2 - dy2 * rr * k)} ${n(x2)} ${n(y2)}`
  return (
    `M${n(tl)} 0` +
    `L${n(b.w - tr)} 0` +
    (tr ? corner(b.w - tr, 0, 1, 0, b.w, tr, 0, 1, tr) : '') +
    `L${n(b.w)} ${n(b.h - br)}` +
    (br ? corner(b.w, b.h - br, 0, 1, b.w - br, b.h, -1, 0, br) : '') +
    `L${n(bl)} ${n(b.h)}` +
    (bl ? corner(bl, b.h, -1, 0, 0, b.h - bl, 0, -1, bl) : '') +
    `L0 ${n(tl)}` +
    (tl ? corner(0, tl, 0, -1, tl, 0, 1, 0, tl) : '') +
    'Z'
  )
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** '#rrggbb' + alpha as an rgba() string, for canvas shadow colours. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex)
  if (!m) return `rgba(0,0,0,${alpha})`
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${alpha})`
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** A sidecar is user-editable and travels with the file — never trust it. */
export function cleanShape(raw: unknown, index: number): Shape | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const kind = ALL_KINDS.includes(s.kind as ShapeKind) ? (s.kind as ShapeKind) : null
  if (!kind) return null
  if (kind === 'path' && (typeof s.d !== 'string' || !s.d || !SAFE_PATH_D.test(s.d))) return null
  const w = num(s.w, 0)
  const h = num(s.h, 0)
  // a zero-area rect/ellipse is invisible clutter; a zero-length line likewise
  if (!Math.abs(w) && !Math.abs(h)) return null
  const color = (v: unknown): string => (HEX.test(String(v)) ? String(v) : '')
  const stroke = color(s.stroke)
  const fill = color(s.fill)
  // a shape with neither fill nor stroke could never be seen or selected
  if (!stroke && !fill) return null
  return {
    id: String(s.id ?? `shape-${index + 1}`),
    kind,
    x: num(s.x, 0),
    y: num(s.y, 0),
    w,
    h,
    fill: isStrokedKind(kind) ? '' : fill,
    stroke,
    strokeWidth: Math.min(72, Math.max(0.25, num(s.strokeWidth, 2))),
    ...(kind === 'path' ? { d: String(s.d) } : {}),
    ...(kind === 'path' && cleanGradient(s.gradient) ? { gradient: cleanGradient(s.gradient)! } : {}),
    // v4 fields are emitted ONLY when they carry a non-default value, so a v3
    // sidecar that never used them survives a load/save round-trip unchanged.
    ...cleanV4(s, kind)
  }
}

/**
 * Drop v4 fields that sit at their default value.
 *
 * The document's version is DERIVED from whether any v4 field is present, so a
 * `rotation: 0` left behind by the editor would silently push a plain document
 * to v4 and make v0.3.0 refuse to open it. Deleting keys (rather than
 * rebuilding the object) also preserves key order, which is what keeps a v3
 * load/save round-trip byte-identical.
 */
export function stripDefaultV4(s: Shape): Shape {
  const out: Shape = { ...s }
  const rot = normRotation(out.rotation)
  if (rot) out.rotation = rot
  else delete out.rotation
  if (typeof out.opacity === 'number' && out.opacity < 1) out.opacity = Math.max(0, out.opacity)
  else delete out.opacity
  const r = out.kind === 'rect' ? cleanRadius(out.radius) : null
  if (r) out.radius = r
  else delete out.radius
  const shadow = cleanShadow(out.shadow)
  if (shadow) out.shadow = shadow
  else delete out.shadow
  const dash = cleanDash(out.dash)
  if (dash) out.dash = dash
  else delete out.dash
  return out
}

/** The v4 additions, or {} when every one of them is at its default. */
function cleanV4(s: Record<string, unknown>, kind: ShapeKind): Partial<Shape> {
  const out: Partial<Shape> = {}
  const rot = normRotation(s.rotation)
  if (rot) out.rotation = rot
  const op = num(s.opacity, 1)
  if (Number.isFinite(op) && op < 1) out.opacity = Math.max(0, Math.min(1, op))
  if (kind === 'rect') {
    const r = cleanRadius(s.radius)
    if (r) out.radius = r
  }
  const shadow = cleanShadow(s.shadow)
  if (shadow) out.shadow = shadow
  const dash = cleanDash(s.dash)
  if (dash) out.dash = dash
  return out
}

/** A sidecar travels with the file: a shadow is four numbers and a hex. */
function cleanShadow(v: unknown): NonNullable<Shape['shadow']> | null {
  if (!v || typeof v !== 'object') return null
  const sh = v as Record<string, unknown>
  const color = HEX.test(String(sh.color)) ? String(sh.color) : '#000000'
  const alpha = Math.max(0, Math.min(1, num(sh.alpha, 0.25)))
  // A fully transparent shadow is not a shadow; dropping it keeps the file at
  // version 3 rather than recording an invisible feature.
  if (alpha <= 0) return null
  const blur = Math.max(0, Math.min(200, num(sh.blur, 4)))
  const dx = Math.max(-200, Math.min(200, num(sh.dx, 0)))
  const dy = Math.max(-200, Math.min(200, num(sh.dy, 2)))
  if (!blur && !dx && !dy) return null
  return { dx, dy, blur, color, alpha }
}

/** Dash lengths must be positive, and an all-zero pattern is a solid line. */
function cleanDash(v: unknown): number[] | null {
  if (!Array.isArray(v) || !v.length || v.length > 8) return null
  const out = v.map((n) => Math.max(0, num(n, 0)))
  return out.some((n) => n > 0) ? out : null
}

/** Rotation is stored in [0, 360); anything unparseable means "not rotated". */
function normRotation(v: unknown): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  const a = n % 360
  const norm = a < 0 ? a + 360 : a
  // 0.001deg of float noise is not a rotation — treat it as square so the
  // field stays absent and the file stays v3.
  return Math.abs(norm) < 1e-6 || Math.abs(norm - 360) < 1e-6 ? 0 : round3(norm)
}

/** [tl, tr, br, bl] in pt; null when absent or all zero. */
function cleanRadius(v: unknown): [number, number, number, number] | null {
  if (!Array.isArray(v) || v.length !== 4) return null
  const r = v.map((n) => Math.max(0, num(n, 0))) as [number, number, number, number]
  return r.some((n) => n > 0) ? r : null
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function isStrokedKind(k: ShapeKind): boolean {
  return k === 'line' || k === 'arrow'
}

/** Hit test in pt — used by the select tool and to stop a click falling through. */
export function shapeHit(s: Shape, x: number, y: number, tolerance = 3): boolean {
  const b = shapeBBox(s)
  // v4: test in the shape's own upright frame — rotate the POINT back rather
  // than the shape forward, so every branch below stays axis-aligned.
  if (s.rotation) {
    const cx = b.x + b.w / 2
    const cy = b.y + b.h / 2
    const r = (-s.rotation * Math.PI) / 180
    const cos = Math.cos(r)
    const sin = Math.sin(r)
    const dx = x - cx
    const dy = y - cy
    return shapeHit(
      { ...s, rotation: undefined },
      cx + dx * cos - dy * sin,
      cy + dx * sin + dy * cos,
      tolerance
    )
  }
  if (isStroked(s)) {
    // distance from the point to the segment
    const len2 = s.w * s.w + s.h * s.h
    if (!len2) return Math.hypot(x - s.x, y - s.y) <= tolerance + s.strokeWidth
    let t = ((x - s.x) * s.w + (y - s.y) * s.h) / len2
    t = Math.max(0, Math.min(1, t))
    const d = Math.hypot(x - (s.x + s.w * t), y - (s.y + s.h * t))
    return d <= tolerance + s.strokeWidth / 2
  }
  const inBox =
    x >= b.x - tolerance && x <= b.x + b.w + tolerance && y >= b.y - tolerance && y <= b.y + b.h + tolerance
  if (!inBox) return false
  // a traced path is picked by its bounding box — testing the real outline
  // would need a rasteriser, and the box is what the user drags anyway
  if (s.kind === 'path') return true
  if (s.kind === 'ellipse' && s.fill) {
    const rx = b.w / 2 || 1
    const ry = b.h / 2 || 1
    const nx = (x - (b.x + rx)) / rx
    const ny = (y - (b.y + ry)) / ry
    return nx * nx + ny * ny <= 1.15
  }
  if (s.fill) return true
  // outline-only: only the border band counts as a hit
  const band = tolerance + s.strokeWidth
  const inner =
    x > b.x + band && x < b.x + b.w - band && y > b.y + band && y < b.y + b.h - band
  return !inner
}

/** Paint onto a 2D context whose units are PIXELS: k = pixels per pt. */
export function paintShape(ctx: CanvasRenderingContext2D, s: Shape, k: number): void {
  const b = shapeBBox(s)
  ctx.save()
  // v4: opacity MULTIPLIES whatever the caller already set, so a shape inside
  // a faded group does not silently become opaque again.
  if (s.opacity !== undefined && s.opacity < 1) ctx.globalAlpha *= Math.max(0, s.opacity)
  // v4: rotate about the bbox centre. Every branch below then draws in the
  // shape's own upright frame and needs no rotation awareness at all.
  if (s.rotation) {
    const rcx = (b.x + b.w / 2) * k
    const rcy = (b.y + b.h / 2) * k
    ctx.translate(rcx, rcy)
    ctx.rotate((s.rotation * Math.PI) / 180)
    ctx.translate(-rcx, -rcy)
  }
  // A shadow is set on the CONTEXT and applies to whatever is drawn next, so
  // it is configured once here rather than per branch below.
  if (s.shadow) {
    ctx.shadowColor = withAlpha(s.shadow.color, s.shadow.alpha)
    ctx.shadowBlur = s.shadow.blur * k
    ctx.shadowOffsetX = s.shadow.dx * k
    ctx.shadowOffsetY = s.shadow.dy * k
  }
  ctx.lineWidth = Math.max(0.5, s.strokeWidth * k)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.dash) ctx.setLineDash(s.dash.map((n) => n * k))
  if (s.kind === 'path') {
    if (s.d) {
      ctx.translate(s.x * k, s.y * k)
      ctx.scale(k, k)
      const p = new Path2D(s.d)
      // a centreline path is STROKED, never filled — filling an open run down
      // the middle of a pen stroke would paint a meaningless sliver
      if (!s.fill && s.stroke) {
        ctx.strokeStyle = s.stroke
        ctx.lineWidth = s.strokeWidth
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.stroke(p)
        ctx.restore()
        return
      }
      if (s.gradient) {
        const g = ctx.createLinearGradient(
          s.gradient.x1,
          s.gradient.y1,
          s.gradient.x2,
          s.gradient.y2
        )
        g.addColorStop(0, s.gradient.from)
        g.addColorStop(1, s.gradient.to)
        ctx.fillStyle = g
      } else {
        ctx.fillStyle = s.fill || '#000000'
      }
      ctx.fill(p, 'evenodd')
    }
    ctx.restore()
    return
  }
  if (s.kind === 'rect') {
    // v4: rounded corners go through a path so fill and stroke agree on the
    // outline. roundRect clamps radii that exceed the box for us.
    const rr = s.radius
    if (rr && typeof ctx.roundRect === 'function') {
      ctx.beginPath()
      ctx.roundRect(b.x * k, b.y * k, b.w * k, b.h * k, rr.map((r) => Math.max(0, r) * k))
      if (s.fill) {
        ctx.fillStyle = s.fill
        ctx.fill()
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke
        ctx.stroke()
      }
    } else {
      if (s.fill) {
        ctx.fillStyle = s.fill
        ctx.fillRect(b.x * k, b.y * k, b.w * k, b.h * k)
      }
      if (s.stroke) {
        ctx.strokeStyle = s.stroke
        ctx.strokeRect(b.x * k, b.y * k, b.w * k, b.h * k)
      }
    }
  } else if (s.kind === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(
      (b.x + b.w / 2) * k,
      (b.y + b.h / 2) * k,
      Math.max(0.5, (b.w / 2) * k),
      Math.max(0.5, (b.h / 2) * k),
      0,
      0,
      Math.PI * 2
    )
    if (s.fill) {
      ctx.fillStyle = s.fill
      ctx.fill()
    }
    if (s.stroke) {
      ctx.strokeStyle = s.stroke
      ctx.stroke()
    }
  } else {
    ctx.strokeStyle = s.stroke || '#000000'
    ctx.beginPath()
    ctx.moveTo(s.x * k, s.y * k)
    ctx.lineTo((s.x + s.w) * k, (s.y + s.h) * k)
    ctx.stroke()
    if (s.kind === 'arrow') {
      const { tip, barbs } = arrowHead(s)
      ctx.beginPath()
      ctx.moveTo(barbs[0][0] * k, barbs[0][1] * k)
      ctx.lineTo(tip[0] * k, tip[1] * k)
      ctx.lineTo(barbs[1][0] * k, barbs[1][1] * k)
      ctx.closePath()
      ctx.fillStyle = s.stroke || '#000000'
      ctx.fill()
    }
  }
  ctx.restore()
}
