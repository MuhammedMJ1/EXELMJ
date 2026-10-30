// What happens when someone touches a thing.
//
// The model, and only the model: a record of intent, with no idea that CSS
// exists. motionCss.ts turns it into a stylesheet, the panel edits it, and the
// canvas previews it — three consumers, one shape of data, and none of them
// able to invent a field the others do not know about.
//
// It is a SIDE-TABLE, the same doctrine as groups and frames (studio/model.ts):
// interactions reference objects by id and nothing moves into them, so every
// renderer and exporter that knows nothing about motion still draws the right
// picture. A document that records no interaction serialises as version 3
// exactly as it always did.
//
// Pure: no DOM. Unit-tested in node.

/**
 * What sets the motion off.
 *
 *  hover   the pointer is over it            (:hover)
 *  press   the pointer is held down on it    (:active)
 *  focus   it has keyboard focus             (:focus-visible)
 *  toggle  a click that STAYS — on, then off
 *  appear  it entered the page               (@starting-style)
 *  scroll  it came into view                 (animation-timeline: view())
 *
 * Everything except `toggle` is expressible in CSS with no script at all.
 * `toggle` is too, through a hidden checkbox — at a cost stated in motionCss.
 */
export type Trigger = 'hover' | 'press' | 'focus' | 'toggle' | 'appear' | 'scroll'

/** What the motion changes. Deliberately small: each of these is a property a
 * browser can animate CHEAPLY, on the compositor, without re-laying out the
 * page. Adding width or top here would look identical and stutter. */
export type MotionProp =
  | 'x'
  | 'y'
  | 'scale'
  | 'rotate'
  | 'opacity'
  | 'fill'
  | 'stroke'
  | 'blur'
  | 'shadow'
  /**
   * How much of the stroke is DRAWN, 0..1 — the icon animation.
   *
   * An icon here is stroked paths, and the one motion every icon system leads
   * with (Lordicon's "draw", every stroke-reveal on the web) is the stroke
   * drawing itself in. Expressed through pathLength="1" on the exported paths,
   * so no path ever needs its real length measured.
   */
  | 'draw'

/** One intermediate stop, at a fraction of the way through. */
export interface Stop {
  /** 0..1, exclusive of both ends — those are `from` and `to`. */
  at: number
  value: number | string
}

export interface Change {
  prop: MotionProp
  /**
   * Where it STARTS. Required, and that is the point.
   *
   * It used to be optional, meaning "wherever the object already is". That
   * reads well and behaves badly: a motion with no stated beginning cannot be
   * replayed, cannot be reasoned about, and starts somewhere different
   * depending on what happened before it. A motion has a beginning and an end,
   * both chosen, or it is not a motion — it is a nudge.
   */
  from: number | string
  /** Where it ends. Units are implied by the property: pt for x/y/blur, a
   * multiplier for scale, degrees for rotate, 0..1 for opacity, hex for the
   * colours. */
  to: number | string
  /**
   * Stops between the two, for a path that is not a straight run.
   *
   * With any of these the motion can no longer be a CSS transition — a
   * transition knows two states — so the compiler emits keyframes instead.
   */
  via?: Stop[]
}

export type Easing = 'linear' | 'ease' | 'in' | 'out' | 'inOut' | 'spring' | 'back'
export type Direction = 'normal' | 'reverse' | 'alternate'

export interface Interaction {
  id: string
  /** the object this listens on AND acts upon, unless `affects` says otherwise */
  targetId: string
  /**
   * The object that MOVES, when it is not the one being touched.
   *
   * This is what "press the button and the panel slides in" needs, and it is
   * the reason trigger and target are two fields rather than one.
   */
  affects?: string
  trigger: Trigger
  changes: Change[]
  /** milliseconds */
  duration: number
  delay: number
  easing: Easing
  /** 0 = play once. -1 = forever. */
  repeat: number
  direction: Direction
  /**
   * Stay where it ended, instead of snapping back.
   *
   * Only means anything for the triggers that FIRE rather than hold: an
   * appear, a scroll, a repeat that runs out. While a pointer is held on an
   * object the state is the pointer's, and letting go is what ends it.
   */
  hold?: boolean
  /**
   * Milliseconds between MEMBERS when the moved object is a group.
   *
   * The other half of icon animation: an icon here is a group of separate
   * runs, and a bell whose parts swing together reads as a picture shaking,
   * while parts a beat apart read as a thing moving. Ignored when the moved
   * object has no members.
   */
  stagger?: number
}

export type PageInteractions = Record<string, Interaction[]>

export const TRIGGERS: Trigger[] = ['hover', 'press', 'focus', 'toggle', 'appear', 'scroll']
export const MOTION_PROPS: MotionProp[] = [
  'x', 'y', 'scale', 'rotate', 'opacity', 'fill', 'stroke', 'blur', 'shadow', 'draw'
]
export const EASINGS: Easing[] = ['linear', 'ease', 'in', 'out', 'inOut', 'spring', 'back']

/** Sensible starting values, so the panel never opens on a motion of nothing. */
export function newInteraction(id: string, targetId: string): Interaction {
  return {
    id,
    targetId,
    trigger: 'hover',
    // Both ends stated, from the very first motion the user records.
    changes: [{ prop: 'scale', from: 1, to: 1.06 }],
    duration: 200,
    delay: 0,
    easing: 'out',
    repeat: 0,
    direction: 'normal'
  }
}

const HEX = /^#[0-9a-fA-F]{6}$/

/** Is this property's value a colour rather than a number? */
export function isColourProp(p: MotionProp): boolean {
  return p === 'fill' || p === 'stroke'
}

/** The range a numeric property is allowed to take, and its neutral value. */
export function propRange(p: MotionProp): { min: number; max: number; rest: number; step: number } {
  switch (p) {
    case 'x':
    case 'y':
      return { min: -2000, max: 2000, rest: 0, step: 1 }
    case 'scale':
      // Zero would make it vanish and negative would mirror it; neither is a
      // motion anybody means by "scale".
      return { min: 0.01, max: 10, rest: 1, step: 0.01 }
    case 'rotate':
      return { min: -3600, max: 3600, rest: 0, step: 1 }
    case 'opacity':
      return { min: 0, max: 1, rest: 1, step: 0.01 }
    case 'blur':
      return { min: 0, max: 100, rest: 0, step: 0.5 }
    case 'draw':
      // 1 is fully drawn — the state an icon on the page already has.
      return { min: 0, max: 1, rest: 1, step: 0.01 }
    case 'shadow':
      return { min: 0, max: 100, rest: 0, step: 1 }
    default:
      return { min: 0, max: 1, rest: 1, step: 0.01 }
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** At most this many stops between the two ends. */
export const MAX_STOPS = 8

function cleanChange(raw: unknown): Change | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const prop = MOTION_PROPS.find((p) => p === c.prop)
  if (!prop) return null

  if (isColourProp(prop)) {
    const to = String(c.to)
    if (!HEX.test(to)) return null
    // 'auto' means "the element's own colour" — the compiler then writes no
    // resting colour at all, so the shape keeps looking like itself until the
    // trigger. A start is only forced when the user actually chose one.
    const from = typeof c.from === 'string' && HEX.test(c.from) ? c.from : 'auto'
    const via = cleanStops(c.via, (v) => (typeof v === 'string' && HEX.test(v) ? v : null))
    return { prop, from, to, ...(via.length ? { via } : {}) }
  }

  const r = propRange(prop)
  const clamp = (v: number): number => Math.min(r.max, Math.max(r.min, v))
  const to = clamp(num(c.to, r.rest))
  // The property's NEUTRAL value is the default beginning — a scale starts at
  // 1 and a rotation at 0, which is where the object already sits.
  const from = c.from === undefined || c.from === null ? r.rest : clamp(num(c.from, r.rest))
  const via = cleanStops(c.via, (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? clamp(n) : null
  })
  return { prop, from, to, ...(via.length ? { via } : {}) }
}

/**
 * Intermediate stops: inside the run, in order, and not too many.
 *
 * Sorted rather than refused when out of order — the panel can hand them over
 * in whatever order they were edited, and a stop at 0.7 before one at 0.3 is
 * a keyframe list the browser would reject outright.
 */
function cleanStops(raw: unknown, value: (v: unknown) => number | string | null): Stop[] {
  if (!Array.isArray(raw)) return []
  const out: Stop[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const s = item as Record<string, unknown>
    const at = Number(s.at)
    // 0 and 1 are `from` and `to`; a stop there would silently override an end.
    if (!Number.isFinite(at) || at <= 0 || at >= 1) continue
    const v = value(s.value)
    if (v === null) continue
    out.push({ at: Math.round(at * 1000) / 1000, value: v })
  }
  out.sort((a, b) => a.at - b.at)
  return out.slice(0, MAX_STOPS)
}

/**
 * Validate one interaction, or drop it.
 *
 * A sidecar travels with the file: same doctrine as shapes.ts. Nothing here is
 * repaired into something the user did not mean — an interaction that does not
 * parse is dropped, because a half-understood motion is worse than none.
 */
export function cleanInteraction(raw: unknown, index: number): Interaction | null {
  if (!raw || typeof raw !== 'object') return null
  const i = raw as Record<string, unknown>
  const targetId = typeof i.targetId === 'string' ? i.targetId : ''
  if (!targetId) return null
  const trigger = TRIGGERS.find((t) => t === i.trigger)
  if (!trigger) return null
  const changes = Array.isArray(i.changes)
    ? i.changes.map(cleanChange).filter((c): c is Change => !!c)
    : []
  // A motion that changes nothing is not a motion; keeping it would put a row
  // in the panel that does nothing when pressed.
  if (!changes.length) return null
  return {
    id: typeof i.id === 'string' && i.id ? i.id : `motion-${index + 1}`,
    targetId,
    ...(typeof i.affects === 'string' && i.affects ? { affects: i.affects } : {}),
    trigger,
    changes,
    // A zero-duration motion is a jump. Allowed — some are meant to be — but
    // an hour-long one is a mistake nobody makes on purpose.
    duration: Math.min(60000, Math.max(0, num(i.duration, 200))),
    delay: Math.min(60000, Math.max(0, num(i.delay, 0))),
    easing: EASINGS.find((e) => e === i.easing) ?? 'out',
    repeat: Math.max(-1, Math.min(1000, Math.round(num(i.repeat, 0)))),
    direction:
      i.direction === 'reverse' || i.direction === 'alternate' ? i.direction : 'normal',
    ...(i.hold ? { hold: true } : {}),
    ...(num(i.stagger, 0) > 0 ? { stagger: Math.min(2000, Math.round(num(i.stagger, 0))) } : {})
  }
}

export function cleanInteractions(raw: unknown): PageInteractions {
  const out: PageInteractions = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [page, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue
    const clean = list
      .map((x, i) => cleanInteraction(x, i))
      .filter((x): x is Interaction => !!x)
    if (clean.length) out[page] = clean
  }
  return out
}

/**
 * Drop interactions whose objects are gone.
 *
 * Deleting artwork does not go through this table, so without a prune a motion
 * slowly accumulates references to things that no longer exist — and the
 * exported CSS would carry rules matching nothing.
 */
export function pruneInteractions(list: Interaction[], liveIds: Set<string>): Interaction[] {
  return list.filter((i) => liveIds.has(i.targetId) && (!i.affects || liveIds.has(i.affects)))
}

/**
 * One interaction per group member, each a beat later.
 *
 * Done by EXPANSION rather than by teaching every emitter about groups: the
 * pseudo-interactions that come out are ordinary ones, so the compiler, the
 * preview and the transition-merging all handle them with the code they
 * already have. The trigger stays the group — hovering any member puts the
 * group's wrapper in :hover — and each member becomes the moved object with
 * its own delay.
 */
export function expandStagger(
  i: Interaction,
  members: Record<string, string[]>
): Interaction[] {
  if (!i.stagger) return [i]
  const movedId = i.affects ?? i.targetId
  const kids = members[movedId]
  if (!kids || kids.length < 2) return [i]
  return kids.map((kid, k) => ({
    ...i,
    affects: kid,
    delay: i.delay + k * (i.stagger as number),
    stagger: undefined
  }))
}

/**
 * Does this motion need keyframes rather than a transition?
 *
 * A transition interpolates between two states and nothing else, so anything
 * with a stop in the middle, a repeat, or a direction has to be an animation.
 */
export function needsKeyframes(i: Interaction): boolean {
  return i.repeat !== 0 || i.direction !== 'normal' || i.changes.some((c) => c.via?.length)
}

/** Everything this interaction touches — what the panel highlights. */
export function involvedIds(i: Interaction): string[] {
  return i.affects && i.affects !== i.targetId ? [i.targetId, i.affects] : [i.targetId]
}
