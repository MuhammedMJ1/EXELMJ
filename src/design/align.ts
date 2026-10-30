// Align and distribute — the operations that turn a pile of objects into a
// layout, and the ones every design tool is judged on.
//
// Two rules, both learned from tools that get them wrong:
//
// 1. ALIGNMENT MOVES OBJECTS, NEVER RESIZES THEM. "Align left" means put every
//    left edge on the same x. A tool that stretched objects to match would be
//    doing something the user did not ask for and cannot easily undo.
//
// 2. DISTRIBUTE SPACES THE GAPS, NOT THE CENTRES. Evenly spaced CENTRES look
//    wrong the moment the objects differ in size — the gaps come out unequal,
//    which is what the eye actually reads. Spacing the gaps is what "distribute"
//    means to a designer, and it is why this is not a one-line average.
//
// Pure: no DOM. Unit-tested in node.

import type { Box } from './transform'

export type AlignMode = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'
export type DistributeMode = 'horizontal' | 'vertical'

export interface Positioned {
  id: string
  box: Box
}

/** The delta each object must move to satisfy the alignment. */
export function alignDeltas(items: Positioned[], mode: AlignMode): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  // Two objects are the minimum: aligning one to itself is a no-op, and
  // silently "succeeding" would tell the user the tool did something.
  if (items.length < 2) return out

  const lefts = items.map((i) => i.box.x)
  const rights = items.map((i) => i.box.x + i.box.w)
  const tops = items.map((i) => i.box.y)
  const bottoms = items.map((i) => i.box.y + i.box.h)

  // Aligned to the SELECTION's bounds, not to the page: the user is arranging
  // these objects relative to each other, and jumping them to a page edge is
  // never what the button appears to promise.
  const minX = Math.min(...lefts)
  const maxX = Math.max(...rights)
  const minY = Math.min(...tops)
  const maxY = Math.max(...bottoms)
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2

  for (const i of items) {
    let dx = 0
    let dy = 0
    switch (mode) {
      case 'left':
        dx = minX - i.box.x
        break
      case 'right':
        dx = maxX - (i.box.x + i.box.w)
        break
      case 'centerX':
        dx = midX - (i.box.x + i.box.w / 2)
        break
      case 'top':
        dy = minY - i.box.y
        break
      case 'bottom':
        dy = maxY - (i.box.y + i.box.h)
        break
      case 'centerY':
        dy = midY - (i.box.y + i.box.h / 2)
        break
    }
    if (dx || dy) out.set(i.id, [dx, dy])
  }
  return out
}

/**
 * Deltas that leave EQUAL GAPS between neighbours.
 *
 * The two outermost objects stay put — they define the span the others are
 * distributed inside. Moving them would make "distribute" also a "resize the
 * arrangement", which is a different operation.
 */
export function distributeDeltas(
  items: Positioned[],
  mode: DistributeMode
): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>()
  // Three is the minimum that has an inside: with two, there is nothing
  // between them to space.
  if (items.length < 3) return out

  const horizontal = mode === 'horizontal'
  const start = (b: Box): number => (horizontal ? b.x : b.y)
  const size = (b: Box): number => (horizontal ? b.w : b.h)

  const sorted = [...items].sort((a, b) => start(a.box) - start(b.box))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = start(last.box) + size(last.box) - start(first.box)
  const used = sorted.reduce((n, i) => n + size(i.box), 0)
  // Negative free space means the objects overlap; spacing them would then
  // pull them further apart than the span the user drew, so the gap is
  // clamped at zero and they simply sit edge to edge.
  const gap = Math.max(0, (span - used) / (sorted.length - 1))

  let cursor = start(first.box)
  for (const item of sorted) {
    const delta = cursor - start(item.box)
    if (delta) out.set(item.id, horizontal ? [delta, 0] : [0, delta])
    cursor += size(item.box) + gap
  }
  return out
}

/** The measured gaps between neighbours, for verifying a distribution. */
export function gapsBetween(items: Positioned[], mode: DistributeMode): number[] {
  const horizontal = mode === 'horizontal'
  const start = (b: Box): number => (horizontal ? b.x : b.y)
  const size = (b: Box): number => (horizontal ? b.w : b.h)
  const sorted = [...items].sort((a, b) => start(a.box) - start(b.box))
  const out: number[] = []
  for (let i = 1; i < sorted.length; i++) {
    out.push(start(sorted[i].box) - (start(sorted[i - 1].box) + size(sorted[i - 1].box)))
  }
  return out
}
