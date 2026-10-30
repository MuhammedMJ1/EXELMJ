// The security boundary of the studio:// scheme.
//
// The guest can request any path it likes; resolveStudioPath is the only thing
// between that and the user's filesystem. These tests are the ones that would
// matter most if they were missing.

import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { mimeFor, resolveStudioPath, SCHEME } from '../electron/studio/studioProtocol'

const ROOT = path.resolve('C:/projects/demo')

describe('resolveStudioPath — containment', () => {
  it('resolves a plain file', () => {
    expect(resolveStudioPath(ROOT, '/index.html')).toBe(path.join(ROOT, 'index.html'))
  })

  it('resolves a nested file', () => {
    expect(resolveStudioPath(ROOT, '/assets/app.js')).toBe(path.join(ROOT, 'assets', 'app.js'))
  })

  it('defaults an empty path to index.html', () => {
    expect(resolveStudioPath(ROOT, '/')).toBe(path.join(ROOT, 'index.html'))
    expect(resolveStudioPath(ROOT, '')).toBe(path.join(ROOT, 'index.html'))
  })

  it('REFUSES a traversal', () => {
    expect(resolveStudioPath(ROOT, '/../secrets.txt')).toBe(null)
    expect(resolveStudioPath(ROOT, '/../../Windows/System32/config/SAM')).toBe(null)
    expect(resolveStudioPath(ROOT, '/a/b/../../../outside.txt')).toBe(null)
  })

  it('REFUSES an ENCODED traversal — decoding happens before the check', () => {
    expect(resolveStudioPath(ROOT, '/%2e%2e/secrets.txt')).toBe(null)
    expect(resolveStudioPath(ROOT, '/%2e%2e%2f%2e%2e%2fWindows')).toBe(null)
  })

  it('REFUSES a sibling directory whose name merely starts with the root', () => {
    // the classic string-prefix bug: "C:/projects/demo-evil" starts with the
    // root as a STRING but is not inside it
    expect(resolveStudioPath(ROOT, '/../demo-evil/x.js')).toBe(null)
  })

  it('REFUSES an absolute path', () => {
    expect(resolveStudioPath(ROOT, '/C:/Windows/System32/drivers/etc/hosts')).toBe(null)
  })

  it('REFUSES a NUL byte rather than normalising it away', () => {
    expect(resolveStudioPath(ROOT, '/index.html\0.png')).toBe(null)
  })

  it('refuses malformed percent-encoding instead of throwing', () => {
    expect(resolveStudioPath(ROOT, '/%zz')).toBe(null)
  })

  it('allows a legitimate dot in a filename', () => {
    expect(resolveStudioPath(ROOT, '/app.min.js')).toBe(path.join(ROOT, 'app.min.js'))
  })

  it('allows an Arabic filename', () => {
    expect(resolveStudioPath(ROOT, `/${encodeURIComponent('صفحة.html')}`)).toBe(
      path.join(ROOT, 'صفحة.html')
    )
  })

  it('collapses a doubled leading slash rather than treating it as a host', () => {
    expect(resolveStudioPath(ROOT, '//evil/x.js')).toBe(path.join(ROOT, 'evil', 'x.js'))
  })
})

describe('mimeFor', () => {
  it('types the formats a generated project actually uses', () => {
    expect(mimeFor('a.html')).toContain('text/html')
    expect(mimeFor('a.js')).toContain('text/javascript')
    expect(mimeFor('a.mjs')).toContain('text/javascript')
    expect(mimeFor('a.css')).toContain('text/css')
    expect(mimeFor('a.json')).toContain('application/json')
    expect(mimeFor('a.svg')).toBe('image/svg+xml')
    expect(mimeFor('a.woff2')).toBe('font/woff2')
  })

  it('declares a charset on every text type — a missing one mangles Arabic', () => {
    for (const f of ['a.html', 'a.js', 'a.css', 'a.json', 'a.txt', 'a.md']) {
      expect(mimeFor(f), f).toContain('charset=utf-8')
    }
  })

  it('is case-insensitive about the extension', () => {
    expect(mimeFor('A.HTML')).toContain('text/html')
  })

  it('falls back to octet-stream rather than GUESSING', () => {
    expect(mimeFor('a.weird')).toBe('application/octet-stream')
    expect(mimeFor('noextension')).toBe('application/octet-stream')
  })
})

describe('the scheme name', () => {
  it('is what the URL policy allows', () => {
    expect(SCHEME).toBe('studio')
  })
})
