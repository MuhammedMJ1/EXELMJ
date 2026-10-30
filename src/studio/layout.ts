// Auto-layout on the canvas — the flexbox subset a UI designer actually uses.
//
// WHY WE IMPLEMENT IT RATHER THAN EMBED YOGA
// Yoga (and Taffy) are excellent and both are a WASM binary plus a loader, for
// a feature that needs one axis, a gap, padding, two alignment axes, wrapping
// and three sizing modes. That subset is ~200 lines and is EXACTLY testable
// against a real browser's flexbox, which is the oracle that matters. Shipping
// a WASM module into a lean offline app to avoid writing 200 tested lines is
// the wrong trade — and a wrong-but-embedded layout engine is harder to debug
// than a wrong-but-ours one.
//
// WHAT IT IS NOT: this is not a CSS engine. No percentages, no min/max, no
// baseline alignment, no grid. Those are the things a canvas designer does not
// reach for, and each one that is missing is a thing that cannot be subtly
// wrong.
//
// RTL IS FIRST-CLASS. `dir: 'rtl'` mirrors the MAIN axis of a row (and only a
// row — a column stacks top-to-bottom in both directions). It does not touch
// any child's own text direction. Getting this right at the layout level is
// why an Arabic screen does not need a second, mirrored design.
//
// Pure: no DOM, no canvas. Unit-tested in node.

import type { Frame, FrameAlign, FrameJustify, FrameSizing } from './model'

export interface LayoutBox {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutChild {
  id: string
  /** intrinsic size — what the object measures when nothing constrains it */
  w: number
  h: number
  /** per-child override of the frame's sizing, e.g. one 'fill' child in a row */
  grow?: FrameSizing
}

export interface LayoutResult {
  /** the frame's own box, which may have grown to hug its content */
  frame: { w: number; h: number }
  children: LayoutBox[]
  /** rows (or columns) the children were wrapped into */
  lines: number
}

const DEFAULT_LAYOUT: NonNullable<Frame['layout']> = {
  direction: 'row',
  gap: 0,
  padding: [0, 0, 0, 0],
  align: 'start',
  justify: 'start',
  wrap: false,
  dir: 'rtl'
}

/**
 * Lay children out inside a frame.
 *
 * Returns positions RELATIVE to the frame's top-left, in pt. The caller adds
 * the frame origin — keeping this function origin-free is what lets a nested
 * frame be laid out by the same code with no special case.
 */
export function layoutFrame(frame: Frame, children: LayoutChild[]): LayoutResult {
  const L = { ...DEFAULT_LAYOUT, ...(frame.layout ?? {}) }
  const [pt, pr, pb, pl] = L.padding
  const sizing = frame.sizing ?? { w: 'fixed' as FrameSizing, h: 'fixed' as FrameSizing }
  const row = L.direction === 'row'

  // Available space along each axis. A 'hug' frame has no constraint on that
  // axis yet — it takes its size FROM the content, so wrapping cannot apply.
  const hugMain = row ? sizing.w === 'hug' : sizing.h === 'hug'
  const hugCross = row ? sizing.h === 'hug' : sizing.w === 'hug'
  const availMain = (row ? frame.w - pl - pr : frame.h - pt - pb) || 0
  const availCross = (row ? frame.h - pt - pb : frame.w - pl - pr) || 0

  const mainOf = (c: LayoutChild): number => (row ? c.w : c.h)
  const crossOf = (c: LayoutChild): number => (row ? c.h : c.w)

  // ── 1. break into lines ────────────────────────────────────────────────────
  const lines: LayoutChild[][] = []
  if (!L.wrap || hugMain) {
    lines.push(children)
  } else {
    let line: LayoutChild[] = []
    let used = 0
    for (const c of children) {
      const size = mainOf(c)
      const next = line.length ? used + L.gap + size : size
      if (line.length && next > availMain) {
        lines.push(line)
        line = [c]
        used = size
      } else {
        line.push(c)
        used = next
      }
    }
    if (line.length) lines.push(line)
  }

  // ── 2. size each line ──────────────────────────────────────────────────────
  const out: LayoutBox[] = []
  const lineCross: number[] = []
  const lineMainUsed: number[] = []
  const lineSizes: Array<Map<string, { main: number; cross: number }>> = []

  for (const line of lines) {
    const sizes = new Map<string, { main: number; cross: number }>()
    let fixedMain = 0
    let fillers = 0
    for (const c of line) {
      const grow = c.grow ?? 'fixed'
      if (grow === 'fill') fillers++
      else fixedMain += mainOf(c)
    }
    const gaps = Math.max(0, line.length - 1) * L.gap
    // 'fill' children share whatever is left after the fixed ones and the gaps.
    // With no room left they collapse to zero rather than overflowing, which is
    // what a browser does and what keeps a frame's box honest.
    const free = hugMain ? 0 : Math.max(0, availMain - fixedMain - gaps)
    const per = fillers ? free / fillers : 0

    let usedMain = gaps
    let maxCross = 0
    for (const c of line) {
      const grow = c.grow ?? 'fixed'
      const main = grow === 'fill' ? per : mainOf(c)
      // 'stretch' on the cross axis is an ALIGNMENT, not a sizing mode — it is
      // read below, because it depends on the line's height, not the child's.
      const cross = L.align === 'stretch' && !hugCross ? 0 : crossOf(c)
      sizes.set(c.id, { main, cross })
      usedMain += main
      maxCross = Math.max(maxCross, crossOf(c))
    }
    lineSizes.push(sizes)
    lineMainUsed.push(usedMain)
    lineCross.push(maxCross)
  }

  // ── 3. the frame's own size ────────────────────────────────────────────────
  const contentMain = lines.length ? Math.max(...lineMainUsed) : 0
  const contentCross =
    lineCross.reduce((a, b) => a + b, 0) + Math.max(0, lines.length - 1) * L.gap
  const frameMain = hugMain ? contentMain + (row ? pl + pr : pt + pb) : row ? frame.w : frame.h
  const frameCross = hugCross ? contentCross + (row ? pt + pb : pl + pr) : row ? frame.h : frame.w
  const innerMain = frameMain - (row ? pl + pr : pt + pb)
  const innerCross = frameCross - (row ? pt + pb : pl + pr)

  // ── 4. place ───────────────────────────────────────────────────────────────
  let crossCursor = row ? pt : pl
  for (const [li, line] of lines.entries()) {
    const sizes = lineSizes[li]
    const used = lineMainUsed[li]
    const slack = Math.max(0, innerMain - used)
    let mainCursor = (row ? pl : pt) + justifyOffset(L.justify, slack, line.length)
    const between = justifyBetween(L.justify, slack, line.length)

    for (const c of line) {
      const size = sizes.get(c.id) ?? { main: mainOf(c), cross: crossOf(c) }
      const crossSize = L.align === 'stretch' ? lineCross[li] : crossOf(c)
      const crossOff = alignOffset(L.align, lineCross[li], crossSize)
      const box: LayoutBox = row
        ? { id: c.id, x: mainCursor, y: crossCursor + crossOff, w: size.main, h: crossSize }
        : { id: c.id, x: crossCursor + crossOff, y: mainCursor, w: crossSize, h: size.main }
      out.push(box)
      mainCursor += size.main + L.gap + between
    }
    crossCursor += lineCross[li] + L.gap
  }

  // ── 5. RTL mirror ──────────────────────────────────────────────────────────
  // Only a ROW mirrors: a column stacks top-to-bottom in both directions, and
  // flipping it is the single most common RTL bug in layout code. The mirror is
  // applied at the END, over final positions, so every rule above stays written
  // once in logical order.
  if (row && L.dir === 'rtl') {
    for (const b of out) b.x = frameMain - b.x - b.w
  }

  return {
    frame: row ? { w: frameMain, h: frameCross } : { w: frameCross, h: frameMain },
    children: out,
    lines: lines.length
  }
}

function justifyOffset(j: FrameJustify, slack: number, n: number): number {
  if (n <= 0) return 0
  if (j === 'center') return slack / 2
  if (j === 'end') return slack
  if (j === 'around') return n ? slack / n / 2 : 0
  return 0
}

function justifyBetween(j: FrameJustify, slack: number, n: number): number {
  if (j === 'between') return n > 1 ? slack / (n - 1) : 0
  if (j === 'around') return n ? slack / n : 0
  return 0
}

function alignOffset(a: FrameAlign, lineCross: number, own: number): number {
  if (a === 'center') return (lineCross - own) / 2
  if (a === 'end') return lineCross - own
  return 0
}

/**
 * Where a dragged child should be INSERTED, given the pointer position.
 *
 * This is what makes auto-layout feel like layout rather than like a locked
 * box: dragging a child inside its frame reorders it instead of moving it. The
 * answer is the index of the first child whose midpoint the pointer has passed
 * — and under RTL, "passed" means the other way, which is why the comparison
 * is written against the mirrored coordinate rather than the raw one.
 */
export function dropIndex(
  frame: Frame,
  boxes: LayoutBox[],
  pointerX: number,
  pointerY: number
): number {
  const L = { ...DEFAULT_LAYOUT, ...(frame.layout ?? {}) }
  const row = L.direction === 'row'
  if (!boxes.length) return 0
  const p = row ? pointerX : pointerY
  const mid = (b: LayoutBox): number => (row ? b.x + b.w / 2 : b.y + b.h / 2)

  if (row && L.dir === 'rtl') {
    // rightmost is first
    for (let i = 0; i < boxes.length; i++) if (p > mid(boxes[i])) return i
    return boxes.length
  }
  for (let i = 0; i < boxes.length; i++) if (p < mid(boxes[i])) return i
  return boxes.length
}

/** Move an item from one index to another, as a reorder rather than a swap. */
export function reorder<T>(list: T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length) return list
  const out = list.slice()
  const [item] = out.splice(from, 1)
  // Removing shifts everything after it down by one, so a rightward move must
  // target one less. Omitting this is the classic off-by-one that makes a drag
  // to the very end land second-to-last.
  const target = Math.max(0, Math.min(out.length, to > from ? to - 1 : to))
  out.splice(target, 0, item)
  return out
}

/**
 * The CSS that reproduces this frame, for the code emitter and for verifying
 * our own maths against a real browser.
 *
 * Emitted with LOGICAL properties, never physical: `padding-inline-start`
 * rather than `padding-left`. That is what makes one design serve both
 * directions instead of needing a mirrored stylesheet.
 */
export function frameToCss(frame: Frame): Record<string, string> {
  const L = { ...DEFAULT_LAYOUT, ...(frame.layout ?? {}) }
  const [pt, pr, pb, pl] = L.padding
  const justify: Record<FrameJustify, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around'
  }
  const align: Record<FrameAlign, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch'
  }
  return {
    display: 'flex',
    'flex-direction': L.direction,
    gap: `${L.gap}px`,
    'padding-block-start': `${pt}px`,
    'padding-inline-end': `${pr}px`,
    'padding-block-end': `${pb}px`,
    'padding-inline-start': `${pl}px`,
    'justify-content': justify[L.justify],
    'align-items': align[L.align],
    'flex-wrap': L.wrap ? 'wrap' : 'nowrap'
  }
}
