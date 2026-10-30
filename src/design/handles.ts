// The selection overlay: eight resize grips, a rotate grip, four crop grips,
// and the smart guides drawn while something is being dragged.
//
// One overlay serves BOTH shapes and images. Before this, images had their own
// single corner grip (`.dz-img-grip`) with its own drag code and shapes had no
// grips at all — two behaviours for the same gesture, and neither could rotate.
// Everything here works on a plain { x, y, w, h } box plus a rotation, so the
// caller only has to say what the selected object's box IS and what to do when
// it changes. The maths lives in transform.ts and is unit-tested in node;
// this file is the DOM half and deliberately holds no geometry of its own.

import {
  RESIZE_HANDLES,
  angleFromCenter,
  boxCenter,
  handlePoint,
  inflate,
  hitHandle,
  normalizeAngle,
  resizeRotated,
  rotatePoint,
  snapBox,
  type Box,
  type HandleId,
  type SnapGuides
} from './transform'

const NS = 'http://www.w3.org/2000/svg'

/** Cursor per grip, rotated with the object so the arrow always points the way
 * the edge will actually move — an unrotated cursor set is actively misleading
 * once a shape is turned 45 degrees. */
const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize']
const CURSOR_ANGLE: Record<Exclude<HandleId, 'rot'>, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315
}

/** How far outside the box the rotation band reaches, in CSS px. */
const ROT_BAND_PX = 16

/**
 * The rotate cursor, turned to lie tangential at `deg`.
 *
 * There is no CSS cursor for rotation — `grab` was standing in, and a hand
 * says "drag me", not "turn me". This is the glyph every vector editor uses: a
 * crescent with an arrowhead at each end, drawn white-under-black so it stays
 * readable on artwork of any colour.
 *
 * Quantised to 15°, which is finer than the eye can tell at 24px and keeps the
 * cache to two dozen strings instead of one per pointermove.
 */
const rotCursorCache = new Map<number, string>()
function rotateCursor(deg: number): string {
  const step = ((Math.round(deg / 15) * 15) % 360 + 360) % 360
  const hit = rotCursorCache.get(step)
  if (hit) return hit
  // An arc over the top from (6,16) to (18,16), with a chevron at each end.
  // The tangent at both ends of that arc is vertical, so both chevrons point
  // straight down and the glyph reads as two-way at any rotation.
  const glyph =
    `<path d="M6 16A8 8 0 1 1 18 16" fill="none"/>` +
    `<path d="M2.5 12.5 6 16.5 9.5 12.5" fill="none"/>` +
    `<path d="M14.5 12.5 18 16.5 21.5 12.5" fill="none"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<g transform="rotate(${step} 12 12)" stroke-linecap="round" stroke-linejoin="round">` +
    `<g stroke="#fff" stroke-width="4">${glyph}</g>` +
    `<g stroke="#000" stroke-width="1.6">${glyph}</g>` +
    `</g></svg>`
  // encodeURIComponent, not base64: it is shorter here and stays readable in
  // devtools, and Chromium accepts either.
  const css = `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, grab`
  rotCursorCache.set(step, css)
  return css
}

export function cursorFor(h: HandleId, rotation: number): string {
  if (h === 'rot') return rotateCursor(rotation)
  const a = normalizeAngle(CURSOR_ANGLE[h] + rotation)
  return CURSORS[Math.round(a / 45) % 4]
}

/** What the caller must provide for the overlay to drive an object. */
export interface HandleTarget {
  box: Box
  rotation: number
  /** Crop grips only appear when the object can be cropped (images). */
  cropable?: boolean
  /** Current crop, as fractions of the natural size. */
  crop?: { l: number; t: number; r: number; b: number }
}

export type DragKind = 'resize' | 'rotate' | 'crop' | 'move'

export interface DragState {
  kind: DragKind
  handle: HandleId
  /** The object's state when the gesture began — every frame recomputes from
   * THIS, never from the previous frame, so a drag cannot accumulate drift. */
  startBox: Box
  startRotation: number
  startCrop?: { l: number; t: number; r: number; b: number }
  /** Pointer angle at grab time, so rotation is relative to where you grabbed
   * rather than snapping the object to the cursor on the first move. */
  grabAngle: number
  /**
   * Pointer MINUS the true handle point at grab time.
   *
   * The grips are drawn on a ring pushed outside the object, and a grip can be
   * grabbed anywhere within its 8px square — so the pointer is never exactly
   * on the edge it controls. Subtracting this keeps the edge where it was
   * until the pointer actually moves, instead of snapping out to meet it.
   */
  grabDx: number
  grabDy: number
}

export interface OverlayCallbacks {
  /** Live, on every pointermove. */
  onResize(box: Box): void
  onRotate(deg: number): void
  onCrop(crop: { l: number; t: number; r: number; b: number }): void
  /**
   * The selection was DRAGGED by its own body rather than by a grip.
   *
   * A stroked object — an icon of three bars, a hairline frame — has almost no
   * ink to grab, so grabbing it means hitting a 2pt line exactly. Once it is
   * selected its whole box becomes draggable, which is what every editor does
   * and what makes thin artwork usable at all.
   */
  onMove(box: Box): void
  /**
   * Shift+click inside the selection's box, in page pt.
   *
   * The move plate sits over the artwork, so a shift+click meant for the
   * object underneath would otherwise never reach it. The caller hit-tests its
   * own model rather than the DOM — it has every box already.
   */
  onShiftPick(x: number, y: number): void
  /** Once, on pointerup — the single place the caller marks the doc dirty. */
  onCommit(kind: DragKind): void
  /** Snap targets in pt for the current page, recomputed per gesture. */
  snapTargets(): { x: number[]; y: number[] }
}

/**
 * Rotation snaps to 15deg while Shift is held — the same increment Illustrator
 * and Figma use, and the reason a "straight" rotation is achievable by hand.
 */
const ROT_SNAP_DEG = 15

/** Crop grips live at the four edge midpoints, inside the frame. */
const CROP_HANDLES: HandleId[] = ['n', 'e', 's', 'w']

export class HandleOverlay {
  private svg: SVGSVGElement
  private g: SVGGElement
  private guideG: SVGGElement
  private drag: DragState | null = null
  private target: HandleTarget | null = null
  private mode: 'transform' | 'crop' = 'transform'

  constructor(
    private readonly parent: HTMLElement,
    private readonly pxPerPt: () => number,
    private readonly cb: OverlayCallbacks
  ) {
    this.svg = document.createElementNS(NS, 'svg')
    this.svg.setAttribute('class', 'dz-handles')
    this.guideG = document.createElementNS(NS, 'g')
    this.guideG.setAttribute('class', 'dz-guides')
    this.g = document.createElementNS(NS, 'g')
    this.svg.append(this.guideG, this.g)
    this.parent.append(this.svg)
  }

  destroy(): void {
    this.svg.remove()
  }

  setCropMode(on: boolean): void {
    this.mode = on ? 'crop' : 'transform'
    this.render()
  }

  isCropMode(): boolean {
    return this.mode === 'crop'
  }

  /** null clears the overlay. */
  show(target: HandleTarget | null): void {
    this.target = target
    if (!target) this.mode = 'transform'
    this.render()
  }

  /** Is a gesture in flight? The caller uses this to suppress its own drag. */
  get busy(): boolean {
    return this.drag !== null
  }

  private render(guides: SnapGuides = { x: null, y: null }): void {
    this.g.innerHTML = ''
    this.guideG.innerHTML = ''
    const t = this.target
    if (!t) {
      this.svg.style.display = 'none'
      return
    }
    this.svg.style.display = ''
    const k = this.pxPerPt()

    // The frame outline, drawn as a rotated polygon rather than a rect so it
    // wraps the object rather than its axis-aligned bounds.
    const corners: HandleId[] = ['nw', 'ne', 'se', 'sw']
    const pts = corners
      .map((h) => handlePoint(t.box, t.rotation, h))
      .map(([x, y]) => `${x * k},${y * k}`)
      .join(' ')
    // The MOVE PLATE: the object's own box, transparent, drag-to-move. Added
    // BEFORE the grips so the grips sit on top of it and still win a click on
    // the edge — a plate over the grips would make resizing impossible.
    const plate = document.createElementNS(NS, 'polygon')
    plate.setAttribute('points', pts)
    plate.setAttribute('class', 'dz-move')
    plate.addEventListener('pointerdown', (e) => {
      const ev = e as PointerEvent
      // Shift is for changing the selection, never for moving it.
      if (ev.shiftKey) {
        ev.preventDefault()
        ev.stopPropagation()
        const [x, y] = this.ptAt(ev)
        this.cb.onShiftPick(x, y)
        return
      }
      this.begin(ev, 'nw', 'move')
    })
    this.g.append(plate)

    const frame = document.createElementNS(NS, 'polygon')
    frame.setAttribute('points', pts)
    frame.setAttribute('class', 'dz-frame')
    this.g.append(frame)

    if (this.mode === 'crop') {
      // Crop grips stay ON the picture's edge: they trim it, so they have to
      // point at the edge being trimmed.
      for (const h of CROP_HANDLES) this.g.append(this.grip(t, h, k, 'crop'))
      return
    }

    // THE ROTATION BAND: a ring just outside the box.
    //
    // This is where rotation lives now, instead of one grip floating above the
    // top edge on a tether. Two reasons: the tether was part of the "the frame
    // is too big" complaint, and a single grip can only be reached from one
    // side — reaching just outside whichever corner you are already near is
    // how every vector editor does it.
    //
    // Drawn as ONE path with two rings and evenodd, so its middle is a hole
    // and clicks inside the box still reach the move plate.
    const pad = ROT_BAND_PX / k
    const ring = (b: Box): string =>
      corners
        .map((h) => handlePoint(b, t.rotation, h))
        .map(([x, y], i) => `${i ? 'L' : 'M'}${x * k} ${y * k}`)
        .join('') + 'Z'
    const band = document.createElementNS(NS, 'path')
    band.setAttribute('d', `${ring(inflate(t.box, pad))}${ring(t.box)}`)
    band.setAttribute('fill-rule', 'evenodd')
    band.setAttribute('class', 'dz-rotband')
    // The glyph is turned to lie tangential WHERE THE POINTER IS, which is the
    // only way one element can carry a cursor that means something all the way
    // round the box.
    band.addEventListener('pointermove', (e) => {
      const [x, y] = this.ptAt(e as PointerEvent)
      const [cx, cy] = boxCenter(t.box)
      band.style.cursor = rotateCursor((Math.atan2(y - cy, x - cx) * 180) / Math.PI)
    })
    band.addEventListener('pointerdown', (e) => this.begin(e as PointerEvent, 'rot', 'rotate'))
    this.g.append(band)

    for (const h of RESIZE_HANDLES) this.g.append(this.grip(t, h, k, 'resize'))

    // Smart guides, drawn the full length of the page so they read as guides
    // rather than as part of the shape.
    const big = 100000
    if (guides.x !== null) this.guideG.append(this.guide(guides.x * k, 0, guides.x * k, big))
    if (guides.y !== null) this.guideG.append(this.guide(0, guides.y * k, big, guides.y * k))
  }

  private guide(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
    const l = document.createElementNS(NS, 'line')
    l.setAttribute('x1', String(x1))
    l.setAttribute('y1', String(y1))
    l.setAttribute('x2', String(x2))
    l.setAttribute('y2', String(y2))
    l.setAttribute('class', 'dz-guide')
    return l
  }

  private grip(t: HandleTarget, h: HandleId, k: number, kind: DragKind): SVGElement {
    const [x, y] = handlePoint(t.box, t.rotation, h)
    const el = document.createElementNS(NS, h === 'rot' ? 'circle' : 'rect')
    if (h === 'rot') {
      el.setAttribute('cx', String(x * k))
      el.setAttribute('cy', String(y * k))
      el.setAttribute('r', '5')
    } else {
      el.setAttribute('x', String(x * k - 4))
      el.setAttribute('y', String(y * k - 4))
      el.setAttribute('width', '8')
      el.setAttribute('height', '8')
    }
    el.setAttribute('class', `dz-grip dz-grip-${kind}`)
    ;(el as SVGElement).style.cursor = cursorFor(h, t.rotation)
    el.addEventListener('pointerdown', (e) => this.begin(e as PointerEvent, h, kind))
    return el
  }

  /** Page point in pt from a pointer event. */
  private ptAt(e: PointerEvent): [number, number] {
    const r = this.parent.getBoundingClientRect()
    const k = this.pxPerPt()
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]
  }

  private begin(e: PointerEvent, handle: HandleId, kind: DragKind): void {
    const t = this.target
    if (!t) return
    e.preventDefault()
    e.stopPropagation()
    const [px, py] = this.ptAt(e)
    // The grab is measured against the handle point, so grabbing a grip
    // anywhere but its exact centre does not snap the edge out to the pointer.
    const [hx, hy] = handlePoint(t.box, t.rotation, handle)
    this.drag = {
      kind,
      handle,
      startBox: { ...t.box },
      startRotation: t.rotation,
      startCrop: t.crop ? { ...t.crop } : { l: 0, t: 0, r: 0, b: 0 },
      grabAngle: angleFromCenter(t.box, px, py) - t.rotation,
      // A MOVE measures from the box's own origin: the plate can be grabbed
      // anywhere inside, and the object must not jump so its corner meets the
      // pointer on the first frame.
      grabDx: kind === 'move' ? px - t.box.x : handle === 'rot' ? 0 : px - hx,
      grabDy: kind === 'move' ? py - t.box.y : handle === 'rot' ? 0 : py - hy
    }
    const el = e.currentTarget as SVGElement
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* a synthetic event has no capture target */
    }
    const move = (ev: PointerEvent): void => this.move(ev)
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        el.releasePointerCapture(ev.pointerId)
      } catch {
        /* released by a re-render */
      }
      const k2 = this.drag?.kind
      this.drag = null
      this.render()
      if (k2) this.cb.onCommit(k2)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  private move(e: PointerEvent): void {
    const d = this.drag
    const t = this.target
    if (!d || !t) return
    const [px, py] = this.ptAt(e)

    if (d.kind === 'rotate') {
      let deg = angleFromCenter(d.startBox, px, py) - d.grabAngle
      if (e.shiftKey) deg = Math.round(deg / ROT_SNAP_DEG) * ROT_SNAP_DEG
      deg = normalizeAngle(deg)
      t.rotation = deg
      this.cb.onRotate(deg)
      this.render()
      return
    }

    if (d.kind === 'move') {
      let box: Box = {
        x: px - d.grabDx,
        y: py - d.grabDy,
        w: d.startBox.w,
        h: d.startBox.h
      }
      // Same rule as every other gesture: snapping applies to an UNROTATED box
      // only, and Ctrl suspends it, because a designer sometimes means the
      // position they are pointing at.
      let guides: SnapGuides = { x: null, y: null }
      if (!d.startRotation && !e.ctrlKey) {
        const targets = this.cb.snapTargets()
        const snapped = snapBox(box, targets.x, targets.y, 4 / this.pxPerPt())
        box = snapped.box
        guides = snapped.guides
      }
      t.box = box
      this.cb.onMove(box)
      this.render(guides)
      return
    }

    if (d.kind === 'crop') {
      const c = { ...(d.startCrop ?? { l: 0, t: 0, r: 0, b: 0 }) }
      // Work in the object's own frame so cropping a rotated image still
      // trims the edge the user grabbed.
      const [cx, cy] = boxCenter(d.startBox)
      const [lx, ly] = rotatePoint(px - d.grabDx, py - d.grabDy, cx, cy, -d.startRotation)
      const fx = (lx - d.startBox.x) / Math.max(1e-6, d.startBox.w)
      const fy = (ly - d.startBox.y) / Math.max(1e-6, d.startBox.h)
      const clamp = (v: number): number => Math.max(0, Math.min(0.95, v))
      if (d.handle === 'w') c.l = clamp(fx)
      if (d.handle === 'e') c.r = clamp(1 - fx)
      if (d.handle === 'n') c.t = clamp(fy)
      if (d.handle === 's') c.b = clamp(1 - fy)
      // A crop that erases the picture is a mis-drag, not an intent.
      if (c.l + c.r > 0.95 || c.t + c.b > 0.95) return
      t.crop = c
      this.cb.onCrop(c)
      this.render()
      return
    }

    let box = resizeRotated(d.startBox, d.startRotation, d.handle, px - d.grabDx, py - d.grabDy, {
      aspect: e.shiftKey,
      fromCenter: e.altKey
    })
    // Snapping applies to an UNROTATED box only: a rotated box has no edge that
    // is parallel to the guide, so snapping it would move the object without
    // ever visibly aligning anything.
    let guides: SnapGuides = { x: null, y: null }
    if (!d.startRotation && !e.ctrlKey) {
      const targets = this.cb.snapTargets()
      const snapped = snapResizedEdge(box, d.handle, targets.x, targets.y, 4 / this.pxPerPt())
      box = snapped.box
      guides = snapped.guides
    }
    t.box = box
    this.cb.onResize(box)
    this.render(guides)
  }
}

/**
 * Snap only the edges the grip is actually moving.
 *
 * snapBox() in transform.ts translates a whole box and is right for a MOVE; a
 * resize must leave the anchored edge exactly where it is, so snapping the
 * box's centre or its far edge here would visibly drag the anchor. This is the
 * resize-shaped variant, kept next to its one caller.
 */
export function snapResizedEdge(
  box: Box,
  handle: HandleId,
  xTargets: number[],
  yTargets: number[],
  tolerance: number
): { box: Box; guides: SnapGuides } {
  const guides: SnapGuides = { x: null, y: null }
  const out = { ...box }
  const movesLeft = handle === 'w' || handle === 'nw' || handle === 'sw'
  const movesRight = handle === 'e' || handle === 'ne' || handle === 'se'
  const movesTop = handle === 'n' || handle === 'nw' || handle === 'ne'
  const movesBottom = handle === 's' || handle === 'sw' || handle === 'se'

  const near = (v: number, targets: number[]): number | null => {
    let best: number | null = null
    let bestD = tolerance
    for (const t of targets) {
      const d = Math.abs(v - t)
      if (d <= bestD) {
        bestD = d
        best = t
      }
    }
    return best
  }

  if (movesLeft) {
    const t = near(out.x, xTargets)
    if (t !== null) {
      out.w += out.x - t
      out.x = t
      guides.x = t
    }
  } else if (movesRight) {
    const t = near(out.x + out.w, xTargets)
    if (t !== null) {
      out.w = t - out.x
      guides.x = t
    }
  }
  if (movesTop) {
    const t = near(out.y, yTargets)
    if (t !== null) {
      out.h += out.y - t
      out.y = t
      guides.y = t
    }
  } else if (movesBottom) {
    const t = near(out.y + out.h, yTargets)
    if (t !== null) {
      out.h = t - out.y
      guides.y = t
    }
  }
  if (out.w < 1 || out.h < 1) return { box, guides: { x: null, y: null } }
  return { box: out, guides }
}

/** Re-exported so callers need only one import for the overlay. */
export { hitHandle, type Box, type HandleId }
