// The URL policy of the embedded browser, tested without Electron.
//
// canLoad is the gate between "our own preview" and "the open web", so it is
// the one piece of browserView.ts that must be provable in isolation. The
// WebContentsView plumbing around it needs a real window; this does not.

import { beforeEach, describe, expect, it } from 'vitest'
import { approveOrigin, canLoad, isApproved } from '../electron/studio/browserView'

// A fresh module registry per test file is enough isolation for the approval
// set; within the file, tests that approve an origin say so explicitly.
describe('canLoad — an allowlist with an explicit consent step', () => {
  it('allows our own scheme', () => {
    expect(canLoad('studio://project/index.html').ok).toBe(true)
  })

  it('allows the user own dev server', () => {
    expect(canLoad('http://localhost:5173/').ok).toBe(true)
    expect(canLoad('http://127.0.0.1:8080/x').ok).toBe(true)
  })

  it('asks for consent before the open web', () => {
    const r = canLoad('https://example.com')
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.reason).toBe('needs-consent')
  })

  it('is not fooled by a hostname that merely CONTAINS localhost', () => {
    expect(canLoad('https://localhost.evil.com/').ok).toBe(false)
  })

  it('FORBIDS the schemes that are never acceptable, consent or not', () => {
    for (const url of [
      'devtools://devtools/bundled/inspector.html',
      'file:///C:/Windows/System32/',
      'chrome://settings',
      'javascript:alert(1)',
      'data:text/html,<script>fetch("//evil")</script>'
    ]) {
      const r = canLoad(url)
      expect(r.ok, url).toBe(false)
      expect(r.ok === false && r.reason, url).toBe('forbidden')
    }
  })

  it('treats an unparseable address as needing consent, not as safe', () => {
    expect(canLoad('not a url').ok).toBe(false)
  })
})

describe('per-origin consent', () => {
  beforeEach(() => {
    // nothing to reset: each assertion below approves what it needs
  })

  it('a site the user approved becomes loadable', () => {
    expect(canLoad('https://approved.test/page').ok).toBe(false)
    approveOrigin('https://approved.test/page')
    expect(canLoad('https://approved.test/other').ok).toBe(true)
  })

  it('approval is per ORIGIN, not per URL — and does not leak to a sibling', () => {
    approveOrigin('https://a.test/one')
    expect(isApproved('https://a.test/two')).toBe(true)
    expect(isApproved('https://b.test/one')).toBe(false)
  })

  it('a different PORT is a different origin', () => {
    approveOrigin('http://site.test:3000/')
    expect(isApproved('http://site.test:3000/x')).toBe(true)
    expect(isApproved('http://site.test:4000/x')).toBe(false)
  })

  it('a different SCHEME is a different origin', () => {
    approveOrigin('http://scheme.test/')
    expect(isApproved('https://scheme.test/')).toBe(false)
  })

  it('approving a forbidden scheme still does not let it load', () => {
    approveOrigin('file:///C:/')
    expect(canLoad('file:///C:/Windows/').ok).toBe(false)
  })

  it('ignores an unparseable approval instead of throwing', () => {
    expect(() => approveOrigin('nonsense')).not.toThrow()
    expect(isApproved('nonsense')).toBe(false)
  })
})
