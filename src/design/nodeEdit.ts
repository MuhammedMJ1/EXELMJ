// The node editor overlay: per-anchor grips and Bezier control handles for a
// selected path.
//
// This is what closes the longest-standing gap in the design page — "traced
// paths cannot be re-coloured or node-edited, they can only be moved and
// deleted". The geometry all lives in path.ts (pure, node-tested); this file
// is the DOM half, deliberately shaped like handles.ts so the two overlays
// behave the same way under the hand.
//
// The path being edited is in the shape's LOCAL pt space (0,0 at shape.x/y),
// so every coordinate here is converted through the shape origin exactly once,
// at the boundary. Mixing the two spaces is the classic bug in this kind of
// editor and the reason the conversion is confined to toLocal/toPage below.

import {
  controlsOf,
  deleteNode,
  insertNodeAfter,
  moveControl,
  moveNode,
  nodesOf,
  parse,
  segsToD,
  toCurve,
  toLine,
  type Seg
} from './path'

const NS = 'http://www.w3.org/2000/svg'

export interface NodeEditCallbacks {
  /** Live, on every pointermove — the caller re-renders the shape. */
  onChange(d: string): void
  /** Once per gesture, on pointerup. */
  onCommit(): void
}

interface Grab {
  kind: 'anchor' | 'control'
  seg: number
  which: 0 | 1
}

export class NodeEditor {
  private svg: SVGSVGElement
  private g: SVGGElement
  private segs: Seg[] = []
  private origin: { x: number; y: number } = { x: 0, y: 0 }
  private grab: Grab | null = null
  private selected: number | null = null
  private active = false

  constructor(
    private readonly parent: HTMLElement,
    private readonly pxPerPt: () => number,
    private readonly cb: NodeEditCallbacks
  ) {
    this.svg = document.createElementNS(NS, 'svg')
    this.svg.setAttribute('class', 'dz-nodes')
    this.g = document.createElementNS(NS, 'g')
    this.svg.append(this.g)
    this.parent.append(this.svg)
    this.svg.style.display = 'none'
  }

  destroy(): void {
    this.svg.remove()
  }

  get editing(): boolean {
    return this.active
  }

  /** Enter node-edit mode on a path. `d` is in the shape's LOCAL pt space. */
  open(d: string, originX: number, originY: number): void {
    this.segs = parse(d)
    this.origin = { x: originX, y: originY }
    this.selected = null
    this.active = this.segs.length > 0
    this.svg.style.display = this.active ? '' : 'none'
    this.render()
  }

  close(): void {
    this.active = false
    this.segs = []
    this.selected = null
    this.svg.style.display = 'none'
    this.g.innerHTML = ''
  }

  /** The selected anchor's segment index, for the toolbar's node actions. */
  get selectedSeg(): number | null {
    return this.selected
  }

  /** Delete the selected anchor. Returns false when the path refuses (it
   * would leave a dangling single point). */
  deleteSelected(): boolean {
    if (this.selected === null) return false
    const out = deleteNode(this.segs, this.selected)
    if (out === this.segs) return false
    this.segs = out
    this.selected = null
    this.emit()
    this.cb.onCommit()
    return true
  }

  /** Add an anchor after the selected one. */
  insertAfterSelected(): boolean {
    if (this.selected === null) return false
    const out = insertNodeAfter(this.segs, this.selected)
    if (out === this.segs) return false
    this.segs = out
    this.emit()
    this.cb.onCommit()
    return true
  }

  /** Straight <-> curved for the segment ENDING at the selected anchor. */
  toggleSelectedCurve(): boolean {
    if (this.selected === null) return false
    const cur = this.segs[this.selected]
    if (!cur || cur.c === 'Z' || cur.c === 'M') return false
    const out = cur.c === 'L' ? toCurve(this.segs, this.selected) : toLine(this.segs, this.selected)
    if (out === this.segs) return false
    this.segs = out
    this.emit()
    this.cb.onCommit()
    return true
  }

  private emit(): void {
    this.cb.onChange(segsToD(this.segs))
    this.render()
  }

  private toPage(x: number, y: number): [number, number] {
    return [(this.origin.x + x) * this.pxPerPt(), (this.origin.y + y) * this.pxPerPt()]
  }

  private toLocal(clientX: number, clientY: number): [number, number] {
    const r = this.parent.getBoundingClientRect()
    const k = this.pxPerPt()
    return [(clientX - r.left) / k - this.origin.x, (clientY - r.top) / k - this.origin.y]
  }

  private render(): void {
    this.g.innerHTML = ''
    if (!this.active) return
    const nodes = nodesOf(segsToD(this.segs))

    // Control handles only for the selected anchor and its neighbour, because
    // showing every handle on a traced logo with 400 nodes is unreadable and
    // makes the anchors themselves impossible to hit.
    if (this.selected !== null) {
      for (const i of [this.selected, this.selected + 1]) {
        const cs = controlsOf(this.segs, i)
        if (!cs) continue
        const seg = this.segs[i]
        const prev = this.segs[i - 1]
        if (!seg || seg.c === 'Z' || !prev || prev.c === 'Z') continue
        // handle 0 belongs to the segment's START point, handle 1 to its END
        this.g.append(this.tether(prev.x, prev.y, cs[0][0], cs[0][1]))
        this.g.append(this.tether(seg.x, seg.y, cs[1][0], cs[1][1]))
        this.g.append(this.controlGrip(i, 0, cs[0][0], cs[0][1]))
        this.g.append(this.controlGrip(i, 1, cs[1][0], cs[1][1]))
      }
    }

    for (const n of nodes) {
      const isCurve = this.segs[n.seg]?.c === 'C'
      this.g.append(this.anchorGrip(n.seg, n.x, n.y, isCurve, n.seg === this.selected))
    }
  }

  private tether(x1: number, y1: number, x2: number, y2: number): SVGLineElement {
    const [ax, ay] = this.toPage(x1, y1)
    const [bx, by] = this.toPage(x2, y2)
    const l = document.createElementNS(NS, 'line')
    l.setAttribute('x1', String(ax))
    l.setAttribute('y1', String(ay))
    l.setAttribute('x2', String(bx))
    l.setAttribute('y2', String(by))
    l.setAttribute('class', 'dz-node-tether')
    return l
  }

  private anchorGrip(seg: number, x: number, y: number, curve: boolean, sel: boolean): SVGElement {
    const [px, py] = this.toPage(x, y)
    // A curve anchor is drawn round and a corner square — the same visual
    // vocabulary every vector editor uses, so the shape of the grip tells the
    // user what the segment is before they touch it.
    const el = document.createElementNS(NS, curve ? 'circle' : 'rect')
    if (curve) {
      el.setAttribute('cx', String(px))
      el.setAttribute('cy', String(py))
      el.setAttribute('r', '4')
    } else {
      el.setAttribute('x', String(px - 3.5))
      el.setAttribute('y', String(py - 3.5))
      el.setAttribute('width', '7')
      el.setAttribute('height', '7')
    }
    el.setAttribute('class', `dz-node${sel ? ' selected' : ''}`)
    el.addEventListener('pointerdown', (e) => this.begin(e as PointerEvent, { kind: 'anchor', seg, which: 0 }))
    return el
  }

  private controlGrip(seg: number, which: 0 | 1, x: number, y: number): SVGElement {
    const [px, py] = this.toPage(x, y)
    const el = document.createElementNS(NS, 'circle')
    el.setAttribute('cx', String(px))
    el.setAttribute('cy', String(py))
    el.setAttribute('r', '3.5')
    el.setAttribute('class', 'dz-node-control')
    el.addEventListener('pointerdown', (e) => this.begin(e as PointerEvent, { kind: 'control', seg, which }))
    return el
  }

  private begin(e: PointerEvent, grab: Grab): void {
    e.preventDefault()
    e.stopPropagation()
    this.grab = grab
    if (grab.kind === 'anchor') {
      this.selected = grab.seg
      this.render()
    }
    const el = e.currentTarget as SVGElement
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      /* synthetic event */
    }
    let moved = false
    const move = (ev: PointerEvent): void => {
      moved = true
      this.move(ev)
    }
    const up = (ev: PointerEvent): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      try {
        el.releasePointerCapture(ev.pointerId)
      } catch {
        /* released by a re-render */
      }
      this.grab = null
      // A click that never moved is a SELECTION, not an edit — committing it
      // would push an identical state onto the undo stack for every click.
      if (moved) this.cb.onCommit()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  private move(e: PointerEvent): void {
    const g = this.grab
    if (!g) return
    const [x, y] = this.toLocal(e.clientX, e.clientY)
    this.segs =
      g.kind === 'anchor' ? moveNode(this.segs, g.seg, x, y) : moveControl(this.segs, g.seg, g.which, x, y)
    this.emit()
  }
}
