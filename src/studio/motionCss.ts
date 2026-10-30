// The compiler: an interaction model in, a stylesheet out.
//
// This is the piece written from scratch rather than imported. Nothing here
// depends on a runtime, a library or a build step — what comes out is CSS text
// that a browser already knows how to run, which is the only way the export
// can be opened on a machine with nothing installed.
//
// WHAT IT KNOWS, AND WHAT IT REFUSES TO PRETEND
// Six triggers reach the browser with no script at all: hover, press, focus,
// appear, scroll, and — through a hidden checkbox — toggle. The checkbox has a
// real cost: CSS cannot set `aria-pressed`, so a screen reader is never told
// the button's state. `emitAria` therefore writes four lines of plain script
// to carry the state, and turning it off is a deliberate choice the caller
// makes, not a default it stumbles into.
//
// COMPOSITION IS THE HARD PART
// Several changes on one element must become ONE transform, in a fixed order,
// or they fight: `transform: translate(...)` written twice keeps the second.
// buildTransform below is that ordering, and it is the reason this is a
// compiler and not a template.
//
// Pure: no DOM. Unit-tested in node.

import {
  expandStagger,
  isColourProp,
  needsKeyframes,
  propRange,
  type Change,
  type Easing,
  type Interaction,
  type MotionProp
} from '../design/motion'
import { classOf, PX_PER_PT, type MarkupInject } from './htmlExport'

/** The cubic-bezier behind each named curve. */
export const EASING_CSS: Record<Easing, string> = {
  linear: 'linear',
  ease: 'ease',
  in: 'cubic-bezier(0.4, 0, 1, 1)',
  out: 'cubic-bezier(0, 0, 0.2, 1)',
  inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  // A spring cannot be a cubic-bezier — a real one oscillates and a bezier is
  // monotonic in time. This is the closest single overshoot, and `linear()`
  // below is used instead wherever the browser supports it.
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  back: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)'
}

/**
 * A sampled spring as a `linear()` easing.
 *
 * `linear()` takes a list of output values and plays them evenly across the
 * duration, which lets an arbitrary curve — including one that overshoots and
 * comes back several times — be expressed in pure CSS. A bezier cannot do
 * that: it has one hump.
 *
 * The model is the standard damped harmonic oscillator. Stiffness and damping
 * are fixed rather than exposed: two more knobs on a panel aimed at somebody
 * who does not program buys nothing, and these values are the ones that read
 * as "a spring" rather than as "a wobble".
 */
export function springLinear(samples = 24, stiffness = 180, damping = 14, mass = 1): string {
  const out: number[] = []
  const w0 = Math.sqrt(stiffness / mass)
  const zeta = damping / (2 * Math.sqrt(stiffness * mass))
  // Total time to settle, so the curve is sampled across its own life rather
  // than across an arbitrary second.
  const settle = zeta < 1 ? -Math.log(0.001) / (zeta * w0) : 4 / w0
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * settle
    let v: number
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta)
      v = 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
    } else {
      v = 1 - Math.exp(-w0 * t) * (1 + w0 * t)
    }
    out.push(Math.round(v * 10000) / 10000)
  }
  // Ends exactly on 1: a spring that stops at 0.9997 leaves the element a
  // fraction of a pixel short, forever.
  out[out.length - 1] = 1
  return `linear(${out.join(', ')})`
}

export function easingCss(e: Easing): string {
  return e === 'spring' ? springLinear() : EASING_CSS[e]
}

/** pt → px, matching the HTML exporter exactly. */
function px(pt: number): number {
  return Math.round(pt * PX_PER_PT * 100) / 100
}

/**
 * One transform string from several changes, in a FIXED order.
 *
 * Order matters twice over. Once because CSS keeps only the last `transform`
 * declaration, so the parts have to be composed into a single value. And once
 * because transforms are not commutative: rotating then translating moves
 * along the rotated axis, which is almost never what "move it right" means.
 * Translate first, then rotate, then scale — the order every design tool
 * shows in its own inspector.
 */
export function buildTransform(changes: Change[], pick: (c: Change) => number | undefined): string {
  const at = (p: MotionProp): number | undefined => {
    const c = changes.find((x) => x.prop === p)
    return c ? pick(c) : undefined
  }
  const parts: string[] = []
  const x = at('x')
  const y = at('y')
  if (x !== undefined || y !== undefined) {
    parts.push(`translate(${px(x ?? 0)}px, ${px(y ?? 0)}px)`)
  }
  const r = at('rotate')
  if (r !== undefined) parts.push(`rotate(${r}deg)`)
  const s = at('scale')
  if (s !== undefined) parts.push(`scale(${s})`)
  return parts.join(' ')
}

/** The non-transform declarations a set of changes asks for. */
export function buildDecls(changes: Change[], pick: (c: Change) => number | string | undefined): string[] {
  const out: string[] = []
  for (const c of changes) {
    const v = pick(c)
    // 'auto' is a colour's "its own" — nothing to write; the element simply
    // keeps the colour the layout gave it until the trigger changes it.
    if (v === undefined || v === 'auto') continue
    switch (c.prop) {
      case 'opacity':
        out.push(`opacity: ${v};`)
        break
      case 'fill':
        // Both a filled div and an inline SVG are covered: the div uses
        // background, the SVG child uses fill, and neither reaches the other.
        out.push(`background-color: ${v};`)
        break
      case 'stroke':
        out.push(`border-color: ${v};`)
        break
      case 'blur':
        out.push(`filter: blur(${px(Number(v))}px);`)
        break
      case 'shadow':
        out.push(`box-shadow: 0 ${px(Number(v) / 2)}px ${px(Number(v))}px rgba(16,24,40,0.28);`)
        break
      default:
        break
    }
  }
  return out
}

/**
 * The value a change holds at a point in the run.
 *
 * `at` is 0 for the beginning, 1 for the end, and anything between picks the
 * last stop at or before it — so a change with no stop of its own simply holds
 * its start until the end, which is what lets several changes with different
 * stop lists share one keyframe list.
 */
function valueAt(c: Change, at: number): number | string {
  if (at <= 0) return c.from
  if (at >= 1) return c.to
  let best: number | string = c.from
  for (const stop of c.via ?? []) {
    if (stop.at <= at) best = stop.value
  }
  return best
}

/** Everything a change set asks for at one point in the run, as CSS lines. */
function stateBlock(changes: Change[], at: number | 'from' | 'to'): string[] {
  const point = at === 'from' ? 0 : at === 'to' ? 1 : at
  const pick = (c: Change): number | string | undefined => valueAt(c, point)
  const lines = buildDecls(changes, pick)
  const tf = buildTransform(changes, (c) => {
    const v = valueAt(c, point)
    return typeof v === 'number' ? v : undefined
  })
  if (tf) lines.unshift(`transform: ${tf};`)
  return lines
}

/**
 * Every offset the keyframe list needs: both ends, plus every stop any change
 * asked for. Shared across the changes, because one @keyframes block drives
 * all of them and a stop in one is a frame the others must also be sampled at.
 */
function offsetsOf(changes: Change[]): number[] {
  const set = new Set<number>([0, 1])
  for (const c of changes) for (const stop of c.via ?? []) set.add(stop.at)
  return [...set].sort((a, b) => a - b)
}

/** The whole run as a @keyframes body. */
function keyframeBody(changes: Change[]): string {
  return offsetsOf(changes)
    .map((at) => {
      const label = at === 0 ? 'from' : at === 1 ? 'to' : `${Math.round(at * 1000) / 10}%`
      return `  ${label} {\n${indent(indent(stateBlock(changes, at)))}\n  }`
    })
    .join('\n')
}

/** The properties a transition has to name, so it does not animate everything. */
function transitionProps(changes: Change[]): string[] {
  const set = new Set<string>()
  for (const c of changes) {
    if (c.prop === 'x' || c.prop === 'y' || c.prop === 'rotate' || c.prop === 'scale') set.add('transform')
    else if (c.prop === 'opacity') set.add('opacity')
    else if (c.prop === 'fill') set.add('background-color')
    else if (c.prop === 'stroke') set.add('border-color')
    else if (c.prop === 'blur') set.add('filter')
    else if (c.prop === 'shadow') set.add('box-shadow')
  }
  return [...set]
}

function timing(i: Interaction): string {
  return `${i.duration}ms ${easingCss(i.easing)}${i.delay ? ` ${i.delay}ms` : ''}`
}

/**
 * The selector that means "the trigger is happening", or null for the two
 * triggers that are not a state the element is IN.
 *
 * appear fires once as the element arrives and scroll is driven by a timeline,
 * so neither has a selector to hang an animation on — they belong on the
 * element itself. Everything else does, and putting an animation on the
 * element instead would run it the moment the page loaded.
 */
function triggerSelector(i: Interaction, scope: string, on: string, from: string): string | null {
  const remote = i.affects !== undefined && i.affects !== i.targetId
  switch (i.trigger) {
    case 'hover':
    case 'press':
    case 'focus': {
      const pseudo =
        i.trigger === 'hover' ? ':hover' : i.trigger === 'press' ? ':active' : ':focus-visible'
      return remote
        ? `${scope}.exl-stage:has(.${from}${pseudo}) .${on}`
        : `${scope}.${on}${pseudo}`
    }
    case 'toggle':
      return `${scope}.exl-stage:has(#exl-t-${from}:checked) .${on}`
    default:
      return null
  }
}

/** Two spaces per level, on a block of lines or on an already-joined string. */
function indent(lines: string[] | string): string {
  const arr = Array.isArray(lines) ? lines : lines.split('\n')
  return arr.map((l) => `  ${l}`).join('\n')
}

export interface CompileOptions {
  /**
   * Group id → member ids, for stagger.
   *
   * A staggered motion is EXPANDED into one ordinary interaction per member,
   * each a beat later (see expandStagger) — so everything downstream, the
   * transition-merging included, runs on code it already has.
   */
  groupMembers?: Record<string, string[]>
  /**
   * Write the few lines of script that keep `aria-pressed` in step with a
   * toggle. Default ON, and the reason is in this file's header: CSS cannot
   * set an ARIA attribute, so a CSS-only toggle looks right and reads wrong.
   */
  emitAria?: boolean
  /** Prefix every selector, so one page can host two exports without a clash. */
  scope?: string
}

export interface Compiled {
  css: string
  /**
   * Objects whose exported <path>/<line> elements need pathLength="1".
   *
   * The draw motion is stroke-dashoffset over a NORMALISED length — that
   * attribute is what spares every path from having its real length measured,
   * and the CSS selects nothing real without it.
   */
  drawTargets: string[]
  /** Empty when nothing needed it — an empty string is never written to disk. */
  js: string
  /** Markup the CSS depends on, keyed by the object it belongs to. */
  markup: Record<string, MarkupInject>
  /** What the caller should be told rather than left to discover. */
  notes: string[]
}

/**
 * Compile one page's interactions.
 *
 * Returns the stylesheet, any script that was genuinely required, and the
 * markup the CSS leans on — because a toggle needs a checkbox in the document
 * and the exporter cannot know that unless it is told.
 */
export function compileMotion(list: Interaction[], opts: CompileOptions = {}): Compiled {
  const scope = opts.scope ? `${opts.scope} ` : ''
  const css: string[] = []
  const markup: Compiled['markup'] = {}
  const notes: string[] = []
  const needAria: string[] = []

  /**
   * The resting state, gathered PER ELEMENT rather than per interaction.
   *
   * Two motions on one object each want a `transition`, and CSS keeps only the
   * last declaration — so emitting a block per interaction silently threw away
   * every transition but one. A panel that faded on hover and turned on click
   * lost its fade: the rule was there, the transition naming `opacity` was
   * not, and the property jumped instead of animating.
   */
  const rests = new Map<string, { decls: Map<string, string>; transitions: string[] }>()
  const restOf = (cls: string) => {
    let hit = rests.get(cls)
    if (!hit) {
      hit = { decls: new Map(), transitions: [] }
      rests.set(cls, hit)
    }
    return hit
  }
  const drawTargets: string[] = []

  for (const raw of list.flatMap((x) => expandStagger(x, opts.groupMembers ?? {}))) {
    // The draw changes live on the stroke CHILDREN, not on the object's box —
    // stroke-dashoffset means nothing on a <div> — so they are split off and
    // emitted against `:is(path, line)` descendants below.
    const drawCs = raw.changes.filter((c) => c.prop === 'draw')
    const i: Interaction = drawCs.length
      ? { ...raw, changes: raw.changes.filter((c) => c.prop !== 'draw') }
      : raw
    const on = classOf(i.affects ?? i.targetId)
    const from = classOf(i.targetId)
    const props = transitionProps(i.changes)
    // The object SITS at the chosen beginning — but ONLY when a beginning was
    // actually chosen. A start equal to the property's neutral value means
    // "from where it is", and writing it out anyway is what was TELEPORTING
    // objects: a motion recorded on an icon shoved the icon to the rest pose
    // the moment it was saved, before anything had been touched at all.
    const anchored = i.changes.filter((c) =>
      isColourProp(c.prop) ? c.from !== 'auto' : Number(c.from) !== propRange(c.prop).rest
    )
    const rest = i.trigger === 'appear' ? [] : stateBlock(anchored, 'from')

    // The resting state is ACCUMULATED, not written yet — see `rests` above.
    const bucket = restOf(on)
    for (const line of rest) {
      const [prop] = line.split(':')
      bucket.decls.set(prop.trim(), line)
    }
    // A keyframed motion is driven by `animation`, and a transition on the
    // same properties would fight it: the two would each try to own the value
    // and the result flickers. Only a two-state motion gets a transition.
    if (props.length && i.trigger !== 'scroll' && !needsKeyframes(i)) {
      for (const prop of props) bucket.transitions.push(`${prop} ${timing(i)}`)
    }

    // ── the draw half, on the stroke children ──────────────────────────
    if (drawCs.length) {
      const movedId = raw.affects ?? raw.targetId
      if (!drawTargets.includes(movedId)) drawTargets.push(movedId)
      const desc = `${on} :is(path, line)`
      const offAt = (v: number | string): string =>
        String(Math.round((1 - Number(v)) * 1000) / 1000)
      const bucket = restOf(desc)
      bucket.decls.set('stroke-dasharray', 'stroke-dasharray: 1;')
      bucket.decls.set('stroke-dashoffset', `stroke-dashoffset: ${offAt(drawCs[0].from)};`)
      const drawFrames = drawCs.some((c) => c.via?.length)
      if (!drawFrames && raw.repeat === 0 && raw.direction === 'normal') {
        bucket.transitions.push(`stroke-dashoffset ${timing(raw)}`)
        const sel = triggerSelector(raw, scope, on, from)
        if (sel) {
          css.push(`${sel} :is(path, line) {\n${indent([`stroke-dashoffset: ${offAt(drawCs[0].to)};`])}\n}`)
        } else if (raw.trigger === 'appear') {
          css.push(
            `@starting-style {\n  ${scope}.${desc} {\n${indent(indent([`stroke-dashoffset: ${offAt(drawCs[0].from)};`]))}\n  }\n}`
          )
          bucket.decls.set('stroke-dashoffset', `stroke-dashoffset: ${offAt(drawCs[0].to)};`)
        }
      } else {
        // Stops, a repeat or a direction: the draw becomes its own keyframes,
        // driven from the trigger like every other keyframed motion.
        const name = `exl-d-${classOf(raw.id)}`
        const frames = offsetsOf(drawCs)
          .map((at) => {
            const label = at === 0 ? 'from' : at === 1 ? 'to' : `${Math.round(at * 1000) / 10}%`
            const v = drawCs[0]
            const value = at <= 0 ? v.from : at >= 1 ? v.to : (v.via ?? []).reduce(
              (acc, stop) => (stop.at <= at ? stop.value : acc),
              v.from as number | string
            )
            return `  ${label} {\n${indent(indent([`stroke-dashoffset: ${offAt(value)};`]))}\n  }`
          })
          .join('\n')
        css.push(`@keyframes ${name} {\n${frames}\n}`)
        const sel = triggerSelector(raw, scope, on, from) ?? `${scope}.${on}`
        css.push(
          `${sel} :is(path, line) {\n` +
            indent([
              `animation: ${name} ${raw.duration}ms ${easingCss(raw.easing)}${raw.delay ? ` ${raw.delay}ms` : ''} ` +
                `${raw.repeat < 0 ? 'infinite' : raw.repeat + 1} ${raw.direction} ` +
                `${raw.hold === false ? 'backwards' : 'both'};`
            ]) +
            `\n}`
        )
      }
      // Everything left in `i` is the box half; with nothing left, this
      // interaction was draw alone and the shared paths below have no work.
      if (!i.changes.length) continue
    }


    const active = stateBlock(i.changes, 'to')
    if (!active.length) continue

    switch (i.trigger) {
      case 'hover':
      case 'press':
      case 'focus': {
        // A keyframed motion already carries its own end state through the
        // animation; a second rule setting the same properties would win over
        // the animation's final frame and the motion would appear to snap.
        if (needsKeyframes(i)) break
        // When the thing that MOVES is not the thing being touched, the
        // trigger is expressed with :has() — which is what makes "press the
        // button, the panel slides" possible with no script at all.
        css.push(`${triggerSelector(i, scope, on, from)} {\n${indent(active)}\n}`)
        break
      }
      case 'toggle': {
        const box = `exl-t-${classOf(i.targetId)}`
        markup[i.targetId] = {
          before: `<input type="checkbox" id="${box}" class="exl-toggle" hidden>`,
          wrap: 'label'
        }
        needAria.push(box)
        if (needsKeyframes(i)) break
        css.push(`${triggerSelector(i, scope, on, from)} {\n${indent(active)}\n}`)
        break
      }
      case 'appear': {
        // @starting-style is the state the element has for ONE FRAME BEFORE it
        // is first rendered — so it holds the BEGINNING, and the resting rule
        // holds the end.
        //
        // This was the wrong way round: the start style carried `to` and the
        // rest carried `from`, so every appear motion played backwards and
        // settled on the value it was supposed to have left. Making `from`
        // required is what made it obvious.
        css.push(
          `@starting-style {\n  ${scope}.${on} {\n${indent(indent(stateBlock(i.changes, 'from')))}\n  }\n}`
        )
        css.push(`${scope}.${on} {\n${indent(stateBlock(i.changes, 'to'))}\n}`)
        break
      }
      case 'scroll': {
        const name = `exl-k-${classOf(i.id)}`
        // from → to, like every other trigger. It used to be written backwards
        // here as well, which made a scroll motion run from its end.
        css.push(`@keyframes ${name} {\n${keyframeBody(i.changes)}\n}`)
        css.push(
          `${scope}.${on} {\n` +
            indent([
              `animation: ${name} linear both;`,
              // The TIMELINE is the element's own passage through the
              // viewport, so the motion is scrubbed by scrolling rather than
              // played once when it appears.
              `animation-timeline: view();`,
              `animation-range: entry 0% cover 40%;`
            ]) +
            `\n}`
        )
        break
      }
    }

    // A transition knows TWO states. A stop in the middle, a repeat, or a
    // direction is therefore not expressible as one, and the motion is
    // re-emitted as a keyframe list covering every offset any change asked for.
    if (needsKeyframes(i) && i.trigger !== 'scroll') {
      const name = `exl-r-${classOf(i.id)}`
      css.push(`@keyframes ${name} {\n${keyframeBody(i.changes)}\n}`)
      // ON THE TRIGGER, not on the element. Attached to the element it played
      // the moment the page loaded and never again — the motion happened once,
      // to nobody, before anyone had touched anything.
      const sel = triggerSelector(i, scope, on, from) ?? `${scope}.${on}`
      css.push(
        `${sel} {\n` +
          indent([
            `animation: ${name} ${i.duration}ms ${easingCss(i.easing)}${i.delay ? ` ${i.delay}ms` : ''} ` +
              `${i.repeat < 0 ? 'infinite' : i.repeat + 1} ${i.direction} ` +
              // `both` holds the last frame AND applies the first during the
              // delay; `backwards` applies the first and then lets go.
              `${i.hold === false ? 'backwards' : 'both'};`
          ]) +
          `\n}`
      )
    }
  }

  // One rest block per element, ahead of every state rule, so the state rules
  // win on equal specificity and no transition is lost to a later duplicate.
  const restCss: string[] = []
  for (const [cls, r] of rests) {
    const lines = [...r.decls.values()]
    if (r.transitions.length) {
      // A property listed twice would take its LAST timing; the first is the
      // one the user set on the motion that owns the property, so duplicates
      // are dropped from the end rather than the start.
      const seen = new Set<string>()
      const merged = r.transitions.filter((tr) => {
        const prop = tr.split(' ')[0]
        if (seen.has(prop)) return false
        seen.add(prop)
        return true
      })
      lines.push(`transition: ${merged.join(', ')};`)
    }
    if (lines.length) restCss.push(`${scope}.${cls} {\n${indent(lines)}\n}`)
  }
  css.unshift(...restCss)

  let js = ''
  if (needAria.length && opts.emitAria !== false) {
    notes.push(
      'A toggle is a hidden checkbox, and CSS cannot set aria-pressed — the few lines in motion.js carry the state to a screen reader.'
    )
    js = [
      '// Keeps a toggle\'s ARIA state in step with its checkbox.',
      '// CSS can style on :checked but cannot set an attribute, so a toggle',
      '// built in CSS alone looks right and reads wrong to a screen reader.',
      'for (const box of document.querySelectorAll(\'.exl-toggle\')) {',
      '  const label = box.closest(\'label\') || document.querySelector(`[for="${box.id}"]`)',
      '  if (!label) continue',
      '  label.setAttribute(\'role\', \'button\')',
      '  label.setAttribute(\'tabindex\', \'0\')',
      '  const sync = () => label.setAttribute(\'aria-pressed\', String(box.checked))',
      '  box.addEventListener(\'change\', sync)',
      '  label.addEventListener(\'keydown\', (e) => {',
      '    if (e.key === \' \' || e.key === \'Enter\') { e.preventDefault(); box.checked = !box.checked; sync() }',
      '  })',
      '  sync()',
      '}',
      ''
    ].join('\n')
  }

  return { css: css.join('\n\n'), js, markup, notes, drawTargets }
}

/**
 * The whole motion sheet, header and all.
 *
 * The reduced-motion block is not optional politeness: a person who has asked
 * their system for less movement has usually done so because movement makes
 * them ill, and an exported page that ignores it is a page that hurts someone.
 */
export function motionStylesheet(list: Interaction[], opts: CompileOptions = {}): Compiled {
  const out = compileMotion(list, opts)
  if (!out.css) return out
  const css = [
    '/* Motion — generated by EXELMJ Studio. */',
    out.css,
    '',
    '/* Someone who asked their system for less movement has usually asked for',
    '   a reason. Their page still works; it just stops moving. */',
    '@media (prefers-reduced-motion: reduce) {',
    '  .exl-stage *, .exl-stage *::before, .exl-stage *::after {',
    '    animation-duration: 1ms !important;',
    '    animation-iteration-count: 1 !important;',
    '    transition-duration: 1ms !important;',
    '  }',
    '}',
    ''
  ].join('\n')
  return { ...out, css }
}
