// The bundled icon library is REDISTRIBUTED ARTWORK, so its provenance is
// asserted here rather than trusted. If this file ever fails, do not "fix" the
// test — find out what changed in the extraction.

import { describe, expect, it } from 'vitest'
import library from '../resources/icons/hugeicons.json'
import { HUGEICONS } from '../src/studio/icon/presets'
import { flatten, normalize, pathBBox, splitSubPaths } from '../src/design/path'

describe('provenance — we may only ship what we may licence', () => {
  it('declares an MIT licence', () => {
    expect(library.license).toBe('MIT')
  })

  it('names the FREE package, never the pro one', () => {
    expect(library.source).toContain('core-free-icons')
    expect(library.source).not.toContain('pro')
  })
})

describe('the library is usable by the canvas', () => {
  it('ships the WHOLE free set, not a sample', () => {
    // 5,443 modules in the package; a handful carry no path data.
    expect(library.icons.length).toBeGreaterThan(5000)
  })

  it('marks how many are pinned to the front of the picker', () => {
    expect(library.pinned).toBeGreaterThan(50)
    expect(library.pinned).toBeLessThan(library.icons.length)
  })

  it('records the grid and stroke the artwork was drawn to', () => {
    expect(library.grid).toBe(HUGEICONS.grid)
    expect(library.strokeWidth).toBe(HUGEICONS.strokeWidth)
  })

  it('every icon has a name and at least one path', () => {
    for (const icon of library.icons) {
      expect(typeof icon.name, JSON.stringify(icon).slice(0, 60)).toBe('string')
      expect(icon.name.length).toBeGreaterThan(0)
      expect(icon.paths.length).toBeGreaterThan(0)
    }
  })

  it('EVERY path survives the kernel — an icon that cannot normalise cannot be edited', () => {
    for (const icon of library.icons) {
      for (const p of icon.paths) {
        expect(normalize(p.d), `${icon.name}: ${p.d.slice(0, 40)}`).toBeTruthy()
      }
    }
  })

  it('every path has real geometry', () => {
    for (const icon of library.icons) {
      for (const p of icon.paths) {
        const b = pathBBox(normalize(p.d)!)
        expect(b, icon.name).toBeTruthy()
        expect(b!.w + b!.h, icon.name).toBeGreaterThan(0)
      }
    }
  })

  it('the RENDERED artwork fits the 24 grid', () => {
    // Asserted on the FLATTENED curve, not on pathBBox. pathBBox is the
    // convex-hull bound, and a Bezier control point legitimately sits outside
    // the curve it steers — measured across the whole library the hull spans
    // -1.83..26.08 while the drawn artwork spans 1.00..23.00. Testing the hull
    // would fail an icon that is perfectly inside its grid.
    //
    // The extremes are accumulated in a plain loop and asserted ONCE: an
    // expect() per sampled point is ~2 million calls, which times out and
    // reports the first of millions rather than the worst.
    let min = Infinity
    let max = -Infinity
    let worst = ''
    for (const icon of library.icons) {
      for (const p of icon.paths) {
        for (const sub of splitSubPaths(normalize(p.d)!)) {
          for (const [x, y] of flatten(sub, 6)) {
            if (x < min || y < min) min = Math.min(x, y)
            if (x > max || y > max) {
              max = Math.max(x, y)
              worst = icon.name
            }
          }
        }
      }
    }
    expect(min, 'left/top overflow').toBeGreaterThanOrEqual(0)
    expect(max, `right/bottom overflow, worst: ${worst}`).toBeLessThanOrEqual(24)
  })

  it('names are unique, so inserting by name is unambiguous', () => {
    const names = library.icons.map((i) => i.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('has a fixed order, so a re-extraction diffs cleanly', () => {
    // Pinned head keeps its hand-chosen order; the tail is alphabetical.
    const tail = library.icons.slice(library.pinned).map((i) => i.name)
    expect([...tail].sort()).toEqual(tail)
  })

  it('carries the stroke width per path rather than assuming one', () => {
    for (const icon of library.icons) {
      for (const p of icon.paths) expect(p.strokeWidth).toBeGreaterThan(0)
    }
  })
})
