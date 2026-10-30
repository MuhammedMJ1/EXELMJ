// Z-order: array position IS paint order, so reordering is a list operation.
//
// The rule that is easy to get wrong and hard to notice: a selection keeps its
// own INTERNAL order when it moves. Raising a group must not scramble the
// stacking of its members relative to each other — that silently rearranges
// artwork the user did not touch.

import { describe, expect, it } from 'vitest'

/** The exact algorithm designApp.reorderZ applies to each array. */
function reorder<T extends { id: string }>(
  list: T[],
  ids: Set<string>,
  where: 'front' | 'back' | 'forward' | 'backward'
): T[] {
  const picked = list.filter((x) => ids.has(x.id))
  if (!picked.length) return list
  const rest = list.filter((x) => !ids.has(x.id))
  if (where === 'front') return [...rest, ...picked]
  if (where === 'back') return [...picked, ...rest]
  const first = list.findIndex((x) => ids.has(x.id))
  const last = list.length - 1 - [...list].reverse().findIndex((x) => ids.has(x.id))
  const at = where === 'forward' ? Math.min(rest.length, first + 1) : Math.max(0, first - 1)
  if (where === 'forward' && last >= list.length - 1) return list
  if (where === 'backward' && first <= 0) return list
  const out = [...rest]
  out.splice(at, 0, ...picked)
  return out
}

const list = (...ids: string[]) => ids.map((id) => ({ id }))
const names = (l: Array<{ id: string }>) => l.map((x) => x.id)

describe('bring to front / send to back', () => {
  const l = list('a', 'b', 'c', 'd')

  it('front moves the selection to the END (painted last, so on top)', () => {
    expect(names(reorder(l, new Set(['b']), 'front'))).toEqual(['a', 'c', 'd', 'b'])
  })

  it('back moves it to the START', () => {
    expect(names(reorder(l, new Set(['c']), 'back'))).toEqual(['c', 'a', 'b', 'd'])
  })

  it('KEEPS the internal order of a multi-selection', () => {
    expect(names(reorder(l, new Set(['a', 'c']), 'front'))).toEqual(['b', 'd', 'a', 'c'])
    expect(names(reorder(l, new Set(['b', 'd']), 'back'))).toEqual(['b', 'd', 'a', 'c'])
  })

  it('is a no-op when everything is selected', () => {
    expect(names(reorder(l, new Set(['a', 'b', 'c', 'd']), 'front'))).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('one step forward / backward', () => {
  const l = list('a', 'b', 'c', 'd')

  it('forward moves one position', () => {
    expect(names(reorder(l, new Set(['a']), 'forward'))).toEqual(['b', 'a', 'c', 'd'])
  })

  it('backward moves one position', () => {
    expect(names(reorder(l, new Set(['c']), 'backward'))).toEqual(['a', 'c', 'b', 'd'])
  })

  it('CLAMPS at the top rather than wrapping to the bottom', () => {
    expect(names(reorder(l, new Set(['d']), 'forward'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('clamps at the bottom too', () => {
    expect(names(reorder(l, new Set(['a']), 'backward'))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('moves a contiguous block as one', () => {
    expect(names(reorder(l, new Set(['a', 'b']), 'forward'))).toEqual(['c', 'a', 'b', 'd'])
  })
})

describe('nothing selected', () => {
  it('leaves the list identical, by reference', () => {
    const l = list('a', 'b')
    expect(reorder(l, new Set(), 'front')).toBe(l)
    expect(reorder(l, new Set(['zzz']), 'front')).toBe(l)
  })
})

describe('repeated operations converge', () => {
  it('front twice is the same as front once', () => {
    const l = list('a', 'b', 'c')
    const once = reorder(l, new Set(['a']), 'front')
    expect(names(reorder(once, new Set(['a']), 'front'))).toEqual(names(once))
  })

  it('forward until the top then stops', () => {
    let l = list('a', 'b', 'c')
    for (let i = 0; i < 5; i++) l = reorder(l, new Set(['a']), 'forward')
    expect(names(l)).toEqual(['b', 'c', 'a'])
  })

  it('never loses or duplicates an object', () => {
    let l = list('a', 'b', 'c', 'd', 'e')
    for (const w of ['front', 'backward', 'back', 'forward'] as const) {
      l = reorder(l, new Set(['b', 'd']), w)
      expect(new Set(names(l)).size).toBe(5)
      expect(l).toHaveLength(5)
    }
  })
})
