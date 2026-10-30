// Membership: which objects belong together, and what a click on one means.
//
// A group here is a RECORD, not a container (see studio/model.ts). Nothing
// moves into it and nothing is nested inside it — the flat per-page arrays are
// untouched, so every renderer and exporter keeps working without knowing
// groups exist. All that changes is what a selection RESOLVES to.
//
// Pure, and unit-tested in node: the mistakes this invites are set-arithmetic
// ones — a group left holding a deleted child, a selection that expands
// forever, two groups that should have merged and did not.

import type { Group } from '../studio/model'

export type GroupList = Group[]

/** The group a leaf belongs to, or null. A leaf belongs to at most one. */
export function groupOf(groups: GroupList, id: string): Group | null {
  return groups.find((g) => g.children.includes(id)) ?? null
}

/**
 * What a selection of `ids` actually means once groups are taken into account:
 * touching any member selects every member.
 *
 * This is the whole behaviour of a group at the canvas. Order is preserved and
 * duplicates collapse, so the result can be fed straight into a Set.
 */
export function resolveSelection(groups: GroupList, ids: Iterable<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const push = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    out.push(id)
  }
  for (const id of ids) {
    const g = groupOf(groups, id)
    if (g) for (const c of g.children) push(c)
    else push(id)
  }
  return out
}

/**
 * Group `ids` together, absorbing any group they already touch.
 *
 * Absorbing matters: selecting one member of an existing group and one loose
 * object and pressing Group must produce ONE group of everything, not a second
 * group that overlaps the first. A leaf in two groups has no defined meaning —
 * resolveSelection would have to pick one.
 *
 * Returns null when there is nothing to group: fewer than two objects, or a
 * selection that is already exactly one whole group.
 */
export function makeGroup(groups: GroupList, ids: string[], newId: string, name: string): GroupList | null {
  const members = new Set(ids)
  if (members.size < 2) return null
  const touched = groups.filter((g) => g.children.some((c) => members.has(c)))
  for (const g of touched) for (const c of g.children) members.add(c)
  if (touched.length === 1 && touched[0].children.length === members.size) return null
  const rest = groups.filter((g) => !touched.includes(g))
  return [...rest, { id: newId, name, children: [...members] }]
}

/**
 * Break apart every group the selection touches.
 *
 * Returns null when the selection is in no group at all, so the caller can say
 * so rather than silently doing nothing.
 */
export function ungroup(groups: GroupList, ids: string[]): GroupList | null {
  const members = new Set(ids)
  const touched = groups.filter((g) => g.children.some((c) => members.has(c)))
  if (!touched.length) return null
  return groups.filter((g) => !touched.includes(g))
}

/**
 * Drop children that no longer exist, and groups that no longer hold two.
 *
 * Deleting artwork does not go through the group table, so without this a
 * group slowly fills with ids of things that are gone — and a "group" of one
 * surviving object would keep selecting a phantom alongside it.
 */
export function pruneGroups(groups: GroupList, liveIds: Set<string>): GroupList {
  const out: GroupList = []
  for (const g of groups) {
    const children = g.children.filter((c) => liveIds.has(c))
    if (children.length < 2) continue
    out.push(children.length === g.children.length ? g : { ...g, children })
  }
  return out
}
