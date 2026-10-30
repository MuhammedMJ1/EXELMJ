// What the right-click menu offers, and when each entry is live.
//
// The LABELS and the HANDLERS stay in designApp — they need i18n and the
// document. What lives here is the decision: given the state of the selection,
// the clipboard and the history, which entries are enabled.
//
// It is separate because "make sure they actually work" is a claim that has to
// be checkable, and an entry that is enabled when its action cannot run is the
// exact failure that makes a menu untrustworthy. Every rule below is pinned by
// a test.

/** Everything an entry is allowed to look at. */
export interface MenuState {
  /** how many objects are selected */
  selection: number
  hasClipboard: boolean
  canUndo: boolean
  canRedo: boolean
  /** at least one selected object belongs to a group */
  grouped: boolean
  /** this artboard has any group at all */
  anyGroups: boolean
  /** exactly one path is selected — the node tools need that */
  isPath: boolean
  /** the canvas is currently inside a group */
  isolated: boolean
}

export type MenuAction =
  | 'cut'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'undo'
  | 'redo'
  | 'group'
  | 'ungroup'
  | 'ungroupAll'
  | 'isolate'
  | 'exitIsolate'
  | 'arrange'
  | 'zFront'
  | 'zForward'
  | 'zBackward'
  | 'zBack'
  | 'expand'
  | 'expandAppearance'
  | 'nodes'
  | 'release'
  | 'selectAll'
  | 'delete'

export interface MenuItem {
  id: MenuAction
  shortcut?: string
  enabled: boolean
  children?: MenuItem[]
}

export type MenuEntry = 'sep' | MenuItem

export function contextMenu(s: MenuState): MenuEntry[] {
  const some = s.selection > 0
  const z: MenuItem[] = [
    { id: 'zFront', shortcut: 'Shift+Ctrl+]', enabled: some },
    { id: 'zForward', shortcut: 'Ctrl+]', enabled: some },
    { id: 'zBackward', shortcut: 'Ctrl+[', enabled: some },
    { id: 'zBack', shortcut: 'Shift+Ctrl+[', enabled: some }
  ]
  return [
    { id: 'cut', shortcut: 'Ctrl+X', enabled: some },
    { id: 'copy', shortcut: 'Ctrl+C', enabled: some },
    // Paste depends on the CLIPBOARD, not on the selection — it is the one
    // entry that is useful with nothing selected at all.
    { id: 'paste', shortcut: 'Ctrl+V', enabled: s.hasClipboard },
    { id: 'duplicate', shortcut: 'Ctrl+D', enabled: some },
    'sep',
    { id: 'undo', shortcut: 'Ctrl+Z', enabled: s.canUndo },
    { id: 'redo', shortcut: 'Ctrl+Y', enabled: s.canRedo },
    'sep',
    // Grouping ONE object is not grouping; the app refuses it, so the menu
    // must not offer it either.
    { id: 'group', shortcut: 'Ctrl+G', enabled: s.selection > 1 },
    { id: 'ungroup', shortcut: 'Ctrl+Shift+G', enabled: s.grouped },
    // Stepping IN needs a group to step into and somewhere to go — offering
    // it while already inside that same group would be a no-op with a label.
    { id: 'isolate', enabled: s.grouped && !s.isolated },
    { id: 'exitIsolate', enabled: s.isolated },
    // …but Ungroup All reaches past the selection, so it only needs a group to
    // exist somewhere on the artboard.
    { id: 'ungroupAll', enabled: s.anyGroups },
    'sep',
    { id: 'arrange', enabled: some, children: z },
    'sep',
    { id: 'expand', enabled: some },
    { id: 'expandAppearance', enabled: some },
    // The node editor and compound release act on ONE path: with several
    // selected there is no single geometry for them to open.
    { id: 'nodes', enabled: s.isPath },
    { id: 'release', enabled: s.isPath },
    'sep',
    // Select All is the other entry that works from an empty selection.
    { id: 'selectAll', shortcut: 'Ctrl+A', enabled: true },
    { id: 'delete', shortcut: 'Delete', enabled: some }
  ]
}
