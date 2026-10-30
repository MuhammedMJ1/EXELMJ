// Grouping: the set arithmetic behind "these belong together".

import { describe, expect, it } from 'vitest'
import { groupOf, makeGroup, pruneGroups, resolveSelection, ungroup } from '../src/design/grouping'
import type { Group } from '../src/studio/model'

const g = (id: string, ...children: string[]): Group => ({ id, name: id, children })

describe('resolveSelection', () => {
  const groups = [g('g1', 'a', 'b', 'c')]

  it('touching one member selects them all — the whole point of a group', () => {
    expect(resolveSelection(groups, ['b'])).toEqual(['a', 'b', 'c'])
  })

  it('leaves a loose object alone', () => {
    expect(resolveSelection(groups, ['z'])).toEqual(['z'])
  })

  it('mixes a group and a loose object without duplicating either', () => {
    expect(resolveSelection(groups, ['a', 'z', 'c'])).toEqual(['a', 'b', 'c', 'z'])
  })

  it('is stable when nothing is grouped', () => {
    expect(resolveSelection([], ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('does not expand forever on overlapping input', () => {
    expect(resolveSelection(groups, ['a', 'b', 'c']).length).toBe(3)
  })
})

describe('makeGroup', () => {
  it('groups two loose objects', () => {
    const out = makeGroup([], ['a', 'b'], 'g1', 'Group')!
    expect(out).toHaveLength(1)
    expect(out[0].children.sort()).toEqual(['a', 'b'])
  })

  it('refuses a group of one', () => {
    expect(makeGroup([], ['a'], 'g1', 'Group')).toBe(null)
  })

  it('ABSORBS a group the selection touches instead of overlapping it', () => {
    // A leaf in two groups has no defined meaning: resolveSelection would have
    // to pick one, and which one would depend on array order.
    const out = makeGroup([g('g1', 'a', 'b')], ['a', 'z'], 'g2', 'Group')!
    expect(out).toHaveLength(1)
    expect(out[0].children.sort()).toEqual(['a', 'b', 'z'])
  })

  it('merges two existing groups into one', () => {
    const out = makeGroup([g('g1', 'a', 'b'), g('g2', 'c', 'd')], ['a', 'c'], 'g3', 'Group')!
    expect(out).toHaveLength(1)
    expect(out[0].children.sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('leaves untouched groups alone', () => {
    const out = makeGroup([g('g1', 'a', 'b'), g('g2', 'c', 'd')], ['a', 'z'], 'g3', 'Group')!
    expect(out.map((x) => x.id)).toContain('g2')
  })

  it('refuses to re-group a selection that is already exactly one group', () => {
    expect(makeGroup([g('g1', 'a', 'b')], ['a', 'b'], 'g2', 'Group')).toBe(null)
  })
})

describe('ungroup', () => {
  it('breaks the group the selection is in', () => {
    expect(ungroup([g('g1', 'a', 'b')], ['a'])).toEqual([])
  })

  it('reports nothing to do rather than silently doing nothing', () => {
    expect(ungroup([g('g1', 'a', 'b')], ['z'])).toBe(null)
    expect(ungroup([], ['a'])).toBe(null)
  })

  it('leaves other groups standing', () => {
    const out = ungroup([g('g1', 'a', 'b'), g('g2', 'c', 'd')], ['c'])!
    expect(out.map((x) => x.id)).toEqual(['g1'])
  })
})

describe('pruneGroups', () => {
  it('drops a child that was deleted', () => {
    const out = pruneGroups([g('g1', 'a', 'b', 'c')], new Set(['a', 'b']))
    expect(out[0].children).toEqual(['a', 'b'])
  })

  it('drops a group that is down to one survivor', () => {
    // A "group" of one keeps selecting a phantom alongside the real object.
    expect(pruneGroups([g('g1', 'a', 'b')], new Set(['a']))).toEqual([])
  })

  it('returns the SAME object when nothing changed, so undo sees no edit', () => {
    const groups = [g('g1', 'a', 'b')]
    expect(pruneGroups(groups, new Set(['a', 'b']))[0]).toBe(groups[0])
  })

  it('drops a group whose members are all gone', () => {
    expect(pruneGroups([g('g1', 'a', 'b')], new Set<string>())).toEqual([])
  })
})

describe('groupOf', () => {
  it('finds the group a leaf is in', () => {
    expect(groupOf([g('g1', 'a', 'b')], 'b')!.id).toBe('g1')
  })

  it('is null for a loose object', () => {
    expect(groupOf([g('g1', 'a', 'b')], 'z')).toBe(null)
  })
})
