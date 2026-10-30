// Scaling and rotating a SELECTION.
//
// This is the maths behind the owner's "icons cannot be enlarged": an icon is
// several separate runs, so enlarging it is a group operation, and there was
// no group operation.

import { describe, expect, it } from 'vitest'
import { orbitInGroup, scaleInGroup, spinInGroup } from '../src/design/group'
import { boxCenter, type Box } from '../src/design/transform'

const group: Box = { x: 100, y: 100, w: 200, h: 100 }

describe('scaleInGroup', () => {
  it('doubling the group doubles every member', () => {
    const member: Box = { x: 150, y: 120, w: 40, h: 20 }
    const out = scaleInGroup(member, group, { x: 100, y: 100, w: 400, h: 200 })
    expect(out).toEqual({ x: 200, y: 140, w: 80, h: 40 })
  })

  it('scales the POSITION as well as the size', () => {
    // Scaling only the size pins every member to its old corner and the
    // arrangement tears itself apart.
    const member: Box = { x: 280, y: 180, w: 20, h: 20 }
    const out = scaleInGroup(member, group, { x: 100, y: 100, w: 400, h: 200 })
    expect([out.x, out.y]).toEqual([460, 260])
  })

  it('a member on the group corner stays on the group corner', () => {
    const corner: Box = { x: 100, y: 100, w: 10, h: 10 }
    const to: Box = { x: 40, y: 60, w: 400, h: 200 }
    const out = scaleInGroup(corner, group, to)
    expect([out.x, out.y]).toEqual([to.x, to.y])
  })

  it('the far corner lands on the new far corner', () => {
    const far: Box = { x: 290, y: 190, w: 10, h: 10 }
    const to: Box = { x: 40, y: 60, w: 400, h: 200 }
    const out = scaleInGroup(far, group, to)
    expect(out.x + out.w).toBeCloseTo(to.x + to.w, 6)
    expect(out.y + out.h).toBeCloseTo(to.y + to.h, 6)
  })

  it('a move with no size change moves every member and resizes none', () => {
    const member: Box = { x: 150, y: 120, w: 40, h: 20 }
    const out = scaleInGroup(member, group, { x: 500, y: 400, w: 200, h: 100 })
    expect(out).toEqual({ x: 550, y: 420, w: 40, h: 20 })
  })

  it('a degenerate group scales by 1 rather than by infinity', () => {
    // A selection of one flat line has no height. Dividing by it would
    // annihilate every member the first time a grip moved.
    const flat: Box = { x: 0, y: 50, w: 100, h: 0 }
    const member: Box = { x: 10, y: 50, w: 20, h: 0 }
    const out = scaleInGroup(member, flat, { x: 0, y: 50, w: 200, h: 40 })
    expect(out.h).toBe(0)
    expect(out.w).toBe(40)
  })
})

describe('orbitInGroup', () => {
  const centre: [number, number] = [0, 0]

  it('carries a member a quarter turn around the centre', () => {
    const member: Box = { x: 90, y: -5, w: 20, h: 10 }
    const out = orbitInGroup(member, centre, 90)
    // Its centre was (100, 0); a quarter turn clockwise puts it at (0, 100).
    const [cx, cy] = boxCenter(out)
    expect(cx).toBeCloseTo(0, 6)
    expect(cy).toBeCloseTo(100, 6)
  })

  it('keeps the member its own size — the box cannot express the turn', () => {
    const member: Box = { x: 90, y: -5, w: 20, h: 10 }
    const out = orbitInGroup(member, centre, 37)
    expect([out.w, out.h]).toEqual([20, 10])
  })

  it('a member ON the centre does not move', () => {
    const member: Box = { x: -5, y: -5, w: 10, h: 10 }
    expect(orbitInGroup(member, centre, 123)).toEqual(member)
  })

  it('a full turn returns everything to where it started', () => {
    const member: Box = { x: 40, y: 70, w: 20, h: 10 }
    const out = orbitInGroup(member, [10, 10], 360)
    expect(out.x).toBeCloseTo(member.x, 6)
    expect(out.y).toBeCloseTo(member.y, 6)
  })
})

describe('spinInGroup', () => {
  it('advances a member that had no rotation of its own', () => {
    expect(spinInGroup(undefined, 30)).toBe(30)
  })

  it('adds to a member that was already turned', () => {
    expect(spinInGroup(45, 30)).toBe(75)
  })

  it('wraps rather than accumulating past a full turn', () => {
    expect(spinInGroup(350, 30)).toBe(20)
  })

  it('never reports a negative angle', () => {
    // A negative rotation reaching the renderer is legal but reads wrongly in
    // the inspector, and it breaks the "absent === 0" test that keeps a
    // document at version 3.
    expect(spinInGroup(10, -30)).toBe(340)
  })

  it('a full turn comes back to nothing, so the field can be dropped', () => {
    expect(spinInGroup(0, 360)).toBe(0)
  })
})

describe('the two halves of a group rotation belong together', () => {
  it('orbit WITHOUT spin leaves every object facing its old direction', () => {
    // Documented deliberately: this is the classic half-done group rotate.
    // The arrangement turns, the objects do not, and a row of arrows ends up
    // curved round a circle still all pointing east.
    const member: Box = { x: 90, y: -5, w: 20, h: 10 }
    expect(orbitInGroup(member, [0, 0], 90).w).toBe(20)
    expect(spinInGroup(0, 90)).toBe(90)
  })
})
