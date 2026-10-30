// bezier-js 6.1.4 ships no type declarations, and the DefinitelyTyped package
// (@types/bezier-js) is still on the v4 API — installing it would type a
// different library than the one we actually call. This declares exactly the
// surface src/design/outline.ts uses, so a typo is still a compile error and
// nothing here claims to describe methods we have not verified.

declare module 'bezier-js' {
  export interface BPoint {
    x: number
    y: number
    /** present on the result of project() */
    t?: number
    /** present on the result of project(): distance to the projected point */
    d?: number
  }

  export class Bezier {
    constructor(
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      x3: number,
      y3: number,
      x4?: number,
      y4?: number
    )
    /** control points, 3 for a quadratic and 4 for a cubic */
    points: BPoint[]
    /** point at t */
    get(t: number): BPoint
    /** tangent vector at t */
    derivative(t: number): BPoint
    /** split into "simple" pieces at extrema and inflections */
    reduce(): Bezier[]
    /** offset the whole curve, or return the point at t offset by d */
    offset(d: number): Bezier | Bezier[]
    offset(t: number, d: number): BPoint
    /** sub-curve between t1 and t2 */
    split(t1: number, t2: number): Bezier
    /** nearest point on the curve, carrying t and d */
    project(point: { x: number; y: number }): BPoint
    length(): number
  }
}
