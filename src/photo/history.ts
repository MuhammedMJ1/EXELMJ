// EXELMJ Photo — undo/redo as a stack of command objects, each with its own
// apply/invert and a human-readable name for the History panel. This is
// deliberately generic (HistoryStack<T>) rather than tied to PhotoDocument:
// photoApp.ts owns the mutable "current document" reference and replaces it
// wholesale on every undo/redo, which is what keeps every other tool in this
// file pure (a command never mutates a document in place).

export interface Command<T> {
  name: string
  apply: (state: T) => T
  invert: (state: T) => T
}

export class HistoryStack<T> {
  private undoStack: Command<T>[] = []
  private redoStack: Command<T>[] = []
  private readonly limit: number

  constructor(limit = 200) {
    this.limit = limit
  }

  /** Records a command that has ALREADY been applied by the caller — push
   * never re-runs apply(). Clears the redo stack, as any new edit does. */
  push(cmd: Command<T>): void {
    this.undoStack.push(cmd)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(state: T): T {
    const cmd = this.undoStack.pop()
    if (!cmd) return state
    this.redoStack.push(cmd)
    return cmd.invert(state)
  }

  redo(state: T): T {
    const cmd = this.redoStack.pop()
    if (!cmd) return state
    this.undoStack.push(cmd)
    return cmd.apply(state)
  }

  /** Oldest first — what a History panel lists top-to-bottom after reversing. */
  names(): string[] {
    return this.undoStack.map((c) => c.name)
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }
}
