// The right-click menu: every entry live exactly when its action can run.
//
// "تأكد من انها فعالة" — make sure they actually work. An entry that is
// enabled while its action refuses to run is what makes a menu untrustworthy,
// so each rule below is stated against the behaviour it has to match.

import { describe, expect, it } from 'vitest'
import { contextMenu, type MenuAction, type MenuEntry, type MenuState } from '../src/design/contextMenu'

const state = (over: Partial<MenuState> = {}): MenuState => ({
  selection: 0,
  hasClipboard: false,
  canUndo: false,
  canRedo: false,
  grouped: false,
  anyGroups: false,
  isPath: false,
  isolated: false,
  ...over
})

const flat = (entries: MenuEntry[]): Array<Exclude<MenuEntry, 'sep'>> => {
  const out: Array<Exclude<MenuEntry, 'sep'>> = []
  for (const e of entries) {
    if (e === 'sep') continue
    out.push(e)
    if (e.children) out.push(...e.children)
  }
  return out
}

const on = (s: MenuState, id: MenuAction): boolean =>
  flat(contextMenu(s)).find((e) => e.id === id)!.enabled

describe('nothing selected', () => {
  const empty = state()

  it('offers Select All, which is the one thing that always applies', () => {
    expect(on(empty, 'selectAll')).toBe(true)
  })

  it('disables everything that needs an object', () => {
    for (const id of ['cut', 'copy', 'duplicate', 'delete', 'expand', 'arrange'] as const) {
      expect(on(empty, id), id).toBe(false)
    }
  })

  it('still offers Paste once something has been copied', () => {
    // Paste is the other entry that is useful with an empty selection — it is
    // about the clipboard, not about what is selected.
    expect(on(empty, 'paste')).toBe(false)
    expect(on(state({ hasClipboard: true }), 'paste')).toBe(true)
  })
})

describe('grouping', () => {
  it('will not group one object — the app refuses it, so the menu must too', () => {
    expect(on(state({ selection: 1 }), 'group')).toBe(false)
    expect(on(state({ selection: 2 }), 'group')).toBe(true)
  })

  it('offers Ungroup only when the selection is actually in a group', () => {
    expect(on(state({ selection: 2 }), 'ungroup')).toBe(false)
    expect(on(state({ selection: 2, grouped: true }), 'ungroup')).toBe(true)
  })

  it('offers Ungroup All whenever the artboard has a group, selected or not', () => {
    // It reaches past the selection, so it must not require one.
    expect(on(state({ anyGroups: true }), 'ungroupAll')).toBe(true)
    expect(on(state({ selection: 3, anyGroups: false }), 'ungroupAll')).toBe(false)
  })
})

describe('history', () => {
  it('follows the stacks, not the selection', () => {
    expect(on(state(), 'undo')).toBe(false)
    expect(on(state({ canUndo: true }), 'undo')).toBe(true)
    expect(on(state({ canRedo: true }), 'redo')).toBe(true)
    expect(on(state({ selection: 5 }), 'redo')).toBe(false)
  })
})

describe('the path-only tools', () => {
  it('need exactly one path', () => {
    expect(on(state({ selection: 3 }), 'nodes')).toBe(false)
    expect(on(state({ selection: 1, isPath: true }), 'nodes')).toBe(true)
    expect(on(state({ selection: 1, isPath: true }), 'release')).toBe(true)
  })

  it('are off for a selected rectangle', () => {
    expect(on(state({ selection: 1 }), 'release')).toBe(false)
  })
})

describe('Arrange', () => {
  it('carries the four z-order commands as its children', () => {
    const arrange = contextMenu(state({ selection: 1 })).find(
      (e): e is Exclude<MenuEntry, 'sep'> => e !== 'sep' && e.id === 'arrange'
    )!
    expect(arrange.children?.map((c) => c.id)).toEqual(['zFront', 'zForward', 'zBackward', 'zBack'])
  })

  it('its children follow the selection like the parent does', () => {
    expect(on(state({ selection: 1 }), 'zFront')).toBe(true)
    expect(on(state(), 'zBack')).toBe(false)
  })

  it('spells the shortcuts the way the key handler listens for them', () => {
    // Ctrl+] / Ctrl+[ with Alt for "all the way" is what designApp binds; the
    // menu shows Shift for the extremes because that is Illustrator's label.
    const items = flat(contextMenu(state({ selection: 1 })))
    expect(items.find((i) => i.id === 'zForward')!.shortcut).toBe('Ctrl+]')
    expect(items.find((i) => i.id === 'zBack')!.shortcut).toBe('Shift+Ctrl+[')
  })
})

describe('the menu as a whole', () => {
  it('lists every action exactly once', () => {
    const ids = flat(contextMenu(state({ selection: 2 }))).map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps its entries in place whatever the state — no jumping rows', () => {
    // Disabled entries stay VISIBLE: a menu whose rows move as the selection
    // changes cannot be used from muscle memory.
    const a = flat(contextMenu(state())).map((e) => e.id)
    const b = flat(contextMenu(state({ selection: 4, grouped: true, canUndo: true, isPath: true }))).map((e) => e.id)
    expect(a).toEqual(b)
  })

  it('separates the groups of entries rather than running them together', () => {
    expect(contextMenu(state()).filter((e) => e === 'sep').length).toBeGreaterThanOrEqual(4)
  })
})

describe('isolation', () => {
  it('offers stepping IN only when there is a group to step into', () => {
    expect(on(state({ selection: 1 }), 'isolate')).toBe(false)
    expect(on(state({ selection: 1, grouped: true }), 'isolate')).toBe(true)
  })

  it('does not offer stepping in when already inside', () => {
    // It would be a no-op with a label on it.
    expect(on(state({ selection: 1, grouped: true, isolated: true }), 'isolate')).toBe(false)
  })

  it('offers stepping OUT only when inside', () => {
    expect(on(state({ selection: 1, grouped: true }), 'exitIsolate')).toBe(false)
    expect(on(state({ isolated: true }), 'exitIsolate')).toBe(true)
  })

  it('leaves the way out available with nothing selected', () => {
    // Deselecting inside a group must not strand the user there.
    expect(on(state({ selection: 0, isolated: true }), 'exitIsolate')).toBe(true)
  })
})
