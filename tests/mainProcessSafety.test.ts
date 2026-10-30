// A guard against the class of bug that crashed the packaged app:
// touching a BrowserWindow's NATIVE side after it has been destroyed.
//
// Electron fires 'closed' AFTER the window is gone. Reading `w.webContents`
// (or `.contentView`, or any other native accessor) inside that handler throws
// "TypeError: Object has been destroyed", and an uncaught throw in the main
// process is a crash DIALOG, not a log line — the user sees the app die.
//
// This cannot be caught by a unit test of behaviour, because it needs a real
// Electron window. So it is caught by reading the source: the rule is simple
// enough to check statically, and a rule that is checked is a rule that holds.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string): string => readFileSync(p, 'utf8')

/** The bodies of every `X.on('closed', ...)` / `.once('closed', ...)` handler. */
function closedHandlers(src: string): string[] {
  const out: string[] = []
  const re = /\.(?:on|once)\(\s*['"]closed['"]\s*,\s*\(\)\s*=>\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    // walk braces from the handler's opening brace to its close
    let depth = 1
    let i = m.index + m[0].length
    const start = i
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    out.push(src.slice(start, i - 1))
  }
  return out
}

/** Native accessors that throw once the window is destroyed. */
const NATIVE = /\.(webContents|contentView|getBounds|setBounds|isVisible|getTitle|capturePage)\b/

const FILES = ['electron/main.ts', 'electron/studio/browserIpc.ts', 'electron/studio/browserView.ts']

describe("nothing touches a window's native side inside a 'closed' handler", () => {
  for (const file of FILES) {
    it(`${file} is clean`, () => {
      const handlers = closedHandlers(read(file))
      for (const body of handlers) {
        const hit = NATIVE.exec(body)
        expect(
          hit,
          `${file}: a 'closed' handler reads "${hit?.[0]}" — the window is already destroyed there. ` +
            `Capture the value at creation time, or do the work in 'close' (singular) instead.`
        ).toBe(null)
      }
    })
  }

  it('the checker actually detects the bug it is guarding against', () => {
    // The exact shape of the crash we shipped, so a broken checker fails here
    // rather than silently passing everything.
    const bad = `w.on('closed', () => {\n  dirtyByWc.delete(w.webContents.id)\n})`
    expect(closedHandlers(bad)).toHaveLength(1)
    expect(NATIVE.test(closedHandlers(bad)[0])).toBe(true)
  })

  it('and does not flag a clean handler', () => {
    const good = `w.on('closed', () => {\n  dirtyByWc.delete(wcId)\n  windows.delete(w)\n})`
    expect(NATIVE.test(closedHandlers(good)[0])).toBe(false)
  })
})

describe('the window teardown captures its id while the window is alive', () => {
  it('main.ts reads webContents.id at creation, not at close', () => {
    const src = read('electron/main.ts')
    expect(src).toMatch(/const wcId = w\.webContents\.id/)
    expect(src).toMatch(/dirtyByWc\.delete\(wcId\)/)
  })
})

describe('the embedded browser tears down while the window still exists', () => {
  it('destroys the view on close (singular), not on closed', () => {
    const src = read('electron/studio/browserIpc.ts')
    // destroy() reaches contentView, so it must run before the window is gone
    expect(src).toMatch(/win\.on\('close',[\s\S]{0,120}destroy\(\)/)
  })

  it('guards hide() against a window that is already gone', () => {
    expect(read('electron/studio/browserView.ts')).toMatch(/isDestroyed\(\)/)
  })
})
