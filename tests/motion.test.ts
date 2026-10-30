// The interaction model and the compiler that turns it into a stylesheet.
//
// The compiler is the piece written from scratch instead of imported, so it
// carries the whole weight: if it emits CSS that a browser will not run, or
// that composes two changes into a fight, there is no library underneath to
// have got it right.

import { describe, expect, it } from 'vitest'
import {
  cleanInteraction,
  cleanInteractions,
  expandStagger,
  newInteraction,
  propRange,
  pruneInteractions,
  type Interaction
} from '../src/design/motion'
import { compileMotion, easingCss, motionStylesheet, springLinear } from '../src/studio/motionCss'

const I = (over: Partial<Interaction> = {}): Interaction => ({
  ...newInteraction('m1', 'shape-1'),
  ...over
})

describe('the model refuses what it cannot mean', () => {
  it('drops an interaction with no target', () => {
    expect(cleanInteraction({ trigger: 'hover', changes: [{ prop: 'scale', from: 1, to: 2 }] }, 0)).toBe(null)
  })

  it('drops an unknown trigger rather than guessing one', () => {
    expect(cleanInteraction({ targetId: 'a', trigger: 'telepathy', changes: [] }, 0)).toBe(null)
  })

  it('drops a motion that changes nothing', () => {
    // It would sit in the panel as a row that does nothing when pressed.
    expect(cleanInteraction({ targetId: 'a', trigger: 'hover', changes: [] }, 0)).toBe(null)
  })

  it('drops an unknown property but keeps the rest', () => {
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover',
      changes: [{ prop: 'levitate', to: 3 }, { prop: 'opacity', from: 1, to: 0.5 }]
    }, 0)!
    expect(out.changes.map((c) => c.prop)).toEqual(['opacity'])
  })

  it('refuses a colour that is not a colour', () => {
    expect(cleanInteraction({
      targetId: 'a', trigger: 'hover', changes: [{ prop: 'fill', to: 'red; }body{' }]
    }, 0)).toBe(null)
  })

  it('clamps a scale of zero, which would make the object vanish', () => {
    const out = cleanInteraction({ targetId: 'a', trigger: 'hover', changes: [{ prop: 'scale', from: 1, to: 0 }] }, 0)!
    expect(out.changes[0].to).toBe(propRange('scale').min)
  })

  it('clamps an hour-long duration', () => {
    expect(cleanInteraction({
      targetId: 'a', trigger: 'hover', duration: 9e9, changes: [{ prop: 'opacity', from: 1, to: 0 }]
    }, 0)!.duration).toBe(60000)
  })

  it('keeps -1 as forever and refuses less', () => {
    const mk = (repeat: number) => cleanInteraction({
      targetId: 'a', trigger: 'hover', repeat, changes: [{ prop: 'opacity', from: 1, to: 0 }]
    }, 0)!.repeat
    expect(mk(-1)).toBe(-1)
    expect(mk(-99)).toBe(-1)
  })

  it('parses a whole page table and skips the rubbish', () => {
    const out = cleanInteractions({
      '1': [{ targetId: 'a', trigger: 'hover', changes: [{ prop: 'scale', from: 1, to: 2 }] }, null, 7],
      '2': 'not a list'
    })
    expect(Object.keys(out)).toEqual(['1'])
    expect(out['1']).toHaveLength(1)
  })
})

describe('pruneInteractions', () => {
  it('drops one whose object was deleted', () => {
    expect(pruneInteractions([I()], new Set(['other']))).toEqual([])
  })

  it('drops one whose AFFECTED object was deleted', () => {
    // Otherwise the exported CSS carries a rule matching nothing.
    expect(pruneInteractions([I({ affects: 'gone' })], new Set(['shape-1']))).toEqual([])
  })

  it('keeps one whose objects are both alive', () => {
    expect(pruneInteractions([I({ affects: 'panel' })], new Set(['shape-1', 'panel']))).toHaveLength(1)
  })
})

describe('easing', () => {
  it('names the standard curves', () => {
    expect(easingCss('linear')).toBe('linear')
    expect(easingCss('inOut')).toContain('cubic-bezier')
  })

  it('builds a spring as linear(), because a bezier cannot overshoot twice', () => {
    const s = easingCss('spring')
    expect(s.startsWith('linear(')).toBe(true)
    expect(s.split(',').length).toBeGreaterThan(10)
  })

  it('the spring starts at rest and ends EXACTLY on target', () => {
    // Ending at 0.9997 leaves the element a fraction of a pixel short forever.
    const vals = springLinear().replace('linear(', '').replace(')', '').split(',').map(Number)
    expect(vals[0]).toBe(0)
    expect(vals[vals.length - 1]).toBe(1)
  })

  it('the spring actually overshoots — otherwise it is just an ease', () => {
    const vals = springLinear().replace('linear(', '').replace(')', '').split(',').map(Number)
    expect(Math.max(...vals)).toBeGreaterThan(1)
  })
})

describe('compiling one transform out of several changes', () => {
  it('composes move, rotate and scale into ONE transform', () => {
    // Written as three declarations, CSS would keep only the last.
    const { css } = compileMotion([I({
      changes: [{ prop: 'x', from: 0, to: 30 }, { prop: 'rotate', from: 0, to: 45 }, { prop: 'scale', from: 1, to: 2 }]
    })])
    // The END state, which is the trigger rule. The rest block now holds the
    // chosen START, so reading the first transform would find the beginning.
    const line = css.slice(css.indexOf(':hover')).split('\n').find((l) => l.includes('transform:'))!
    expect(line).toContain('translate(')
    expect(line).toContain('rotate(45deg)')
    expect(line).toContain('scale(2)')
  })

  it('the REST block holds the chosen BEGINNING, not the end', () => {
    // This is what "a motion has a start" means in CSS: the object sits at the
    // value that was picked, and the trigger takes it to the other one. With
    // the start optional it sat wherever the layout left it, and the same
    // motion played differently depending on what had happened before.
    const { css } = compileMotion([I({ changes: [{ prop: 'x', from: 75, to: 0 }] })])
    const rest = css.slice(0, css.indexOf(':hover'))
    expect(rest).toContain('translate(100px, 0px)')
    expect(css.slice(css.indexOf(':hover'))).toContain('translate(0px, 0px)')
  })

  it('translates BEFORE it rotates', () => {
    // The other order moves along the rotated axis, which is never what
    // "move it right" means.
    const { css } = compileMotion([I({ changes: [{ prop: 'x', from: 0, to: 30 }, { prop: 'rotate', from: 0, to: 45 }] })])
    const line = css.slice(css.indexOf(':hover')).split('\n').find((l) => l.includes('translate('))!
    expect(line.indexOf('translate(')).toBeLessThan(line.indexOf('rotate('))
  })

  it('converts distances to px like the html exporter does', () => {
    const { css } = compileMotion([I({ changes: [{ prop: 'x', from: 0, to: 75 }] })])
    expect(css).toContain('translate(100px, 0px)')
  })
})

describe('the six triggers', () => {
  it('hover is :hover, and nothing else is emitted', () => {
    const { css, js } = compileMotion([I({ trigger: 'hover' })])
    expect(css).toContain('.o-shape-1:hover')
    expect(js).toBe('')
  })

  it('press is :active', () => {
    expect(compileMotion([I({ trigger: 'press' })]).css).toContain('.o-shape-1:active')
  })

  it('focus is :focus-visible, not :focus', () => {
    // :focus would light up on a mouse click too, which is a ring nobody asked
    // for on every press.
    expect(compileMotion([I({ trigger: 'focus' })]).css).toContain(':focus-visible')
  })

  it('names the properties it transitions, rather than transitioning all', () => {
    const { css } = compileMotion([I({ changes: [{ prop: 'opacity', from: 1, to: 0.2 }] })])
    expect(css).toContain('transition: opacity 200ms')
    expect(css).not.toContain('transition: all')
  })

  it('appear uses @starting-style, which is what makes it need no script', () => {
    expect(compileMotion([I({ trigger: 'appear' })]).css).toContain('@starting-style')
  })

  it('scroll drives itself from the element passing through the viewport', () => {
    const { css } = compileMotion([I({ trigger: 'scroll' })])
    expect(css).toContain('animation-timeline: view()')
    expect(css).toContain('@keyframes')
  })
})

describe('one object triggers, another moves', () => {
  it('uses :has(), so it still needs no script', () => {
    const { css } = compileMotion([I({ targetId: 'btn', affects: 'panel', trigger: 'hover' })])
    expect(css).toContain(':has(.o-btn:hover) .o-panel')
  })

  it('puts the motion on the AFFECTED object, not the trigger', () => {
    const { css } = compileMotion([I({ targetId: 'btn', affects: 'panel', trigger: 'hover',
      changes: [{ prop: 'opacity', from: 0, to: 1 }] })])
    expect(css).toContain('.o-panel {')
    expect(css).not.toContain('.o-btn {\n  opacity')
  })
})

describe('toggle: the one that costs something', () => {
  const out = compileMotion([I({ trigger: 'toggle' })])

  it('needs a checkbox in the markup, and says so', () => {
    expect(out.markup['shape-1'].before).toContain('type="checkbox"')
    expect(out.markup['shape-1'].wrap).toBe('label')
  })

  it('styles on :checked through :has()', () => {
    expect(out.css).toContain(':has(#exl-t-o-shape-1:checked)')
  })

  it('emits the few lines that carry aria-pressed, because CSS cannot', () => {
    // A CSS-only toggle looks right and reads wrong to a screen reader.
    expect(out.js).toContain('aria-pressed')
    expect(out.notes.join(' ')).toContain('aria-pressed')
  })

  it('the script is refusable, and then nothing is written', () => {
    expect(compileMotion([I({ trigger: 'toggle' })], { emitAria: false }).js).toBe('')
  })

  it('makes the toggle reachable by keyboard, not only by pointer', () => {
    expect(out.js).toContain('tabindex')
    expect(out.js).toContain('Enter')
  })
})

describe('repeat and direction become keyframes', () => {
  it('because a transition cannot repeat', () => {
    const { css } = compileMotion([I({ repeat: -1 })])
    expect(css).toContain('@keyframes')
    expect(css).toContain('infinite')
  })

  it('a count is the repeat plus the first play', () => {
    expect(compileMotion([I({ repeat: 2 })]).css).toContain(' 3 normal both')
  })

  it('carries the direction through', () => {
    expect(compileMotion([I({ repeat: -1, direction: 'alternate' })]).css).toContain('alternate')
  })
})

describe('the sheet as a whole', () => {
  it('honours a request for less movement', () => {
    // Somebody who asked their system for less movement usually did so because
    // movement makes them ill.
    expect(motionStylesheet([I()]).css).toContain('prefers-reduced-motion')
  })

  it('writes nothing at all when there is nothing to write', () => {
    expect(motionStylesheet([]).css).toBe('')
  })

  it('can be scoped, so two exports can share a page', () => {
    expect(compileMotion([I()], { scope: '#a' }).css).toContain('#a .o-shape-1')
  })

  it('never emits a selector for an object it was not given', () => {
    const { css } = compileMotion([I({ targetId: 'only' })])
    expect(css).toContain('o-only')
    expect(css).not.toContain('o-shape-1')
  })
})

describe('two motions on ONE object', () => {
  // Found by loading the emitted page in a real browser: each interaction was
  // writing its own `.o-panel { transition: ... }` block, and CSS keeps only
  // the last declaration. A panel that faded on hover and turned on click lost
  // its fade — the rule was there, the transition naming `opacity` was not,
  // and the property jumped instead of animating.
  const two = [
    I({ id: 'a', targetId: 'p', trigger: 'hover', changes: [{ prop: 'opacity', from: 1, to: 0.3 }], duration: 300 }),
    I({ id: 'b', targetId: 'p', trigger: 'toggle', changes: [{ prop: 'rotate', from: 0, to: 12 }], duration: 400 })
  ]

  it('writes ONE rest block for the object, not one per motion', () => {
    const { css } = compileMotion(two)
    expect((css.match(/^\.o-p \{/gm) ?? []).length).toBe(1)
  })

  it('keeps every property in the transition', () => {
    const { css } = compileMotion(two)
    const line = css.split('\n').find((l) => l.includes('transition:'))!
    expect(line).toContain('opacity')
    expect(line).toContain('transform')
  })

  it('gives each property the timing of the motion that owns it', () => {
    const { css } = compileMotion(two)
    const line = css.split('\n').find((l) => l.includes('transition:'))!
    expect(line).toMatch(/opacity 300ms/)
    expect(line).toMatch(/transform 400ms/)
  })

  it('puts the rest block BEFORE the state rules, so they still win', () => {
    const { css } = compileMotion(two)
    expect(css.indexOf('.o-p {')).toBeLessThan(css.indexOf(':hover'))
  })

  it('does not repeat a property in one transition list', () => {
    // A property listed twice takes its LAST timing, silently overriding the
    // motion that actually owns it.
    const { css } = compileMotion([
      I({ id: 'a', targetId: 'p', trigger: 'hover', changes: [{ prop: 'x', from: 0, to: 10 }], duration: 100 }),
      I({ id: 'b', targetId: 'p', trigger: 'press', changes: [{ prop: 'scale', from: 1, to: 2 }], duration: 900 })
    ])
    const line = css.split('\n').find((l) => l.includes('transition:'))!
    expect((line.match(/transform/g) ?? []).length).toBe(1)
    expect(line).toContain('transform 100ms')
  })
})

describe('a beginning, an end, and the stops between', () => {
  it('a straight run stays a transition — two states is all it needs', () => {
    const { css } = compileMotion([I({ changes: [{ prop: 'x', from: 0, to: 50 }] })])
    expect(css).toContain('transition:')
    expect(css).not.toContain('@keyframes')
  })

  it('one stop in the middle turns it into keyframes', () => {
    // A transition interpolates between TWO states and knows nothing else, so
    // a path with a waypoint cannot be one.
    const { css } = compileMotion([I({
      changes: [{ prop: 'x', from: 0, to: 50, via: [{ at: 0.5, value: 200 }] }]
    })])
    expect(css).toContain('@keyframes')
    expect(css).toContain('50%')
  })

  it('the stop carries its own value, not an interpolation', () => {
    const { css } = compileMotion([I({
      changes: [{ prop: 'x', from: 0, to: 0, via: [{ at: 0.5, value: 75 }] }]
    })])
    const kf = css.slice(css.indexOf('@keyframes'))
    expect(kf).toContain('translate(100px, 0px)')
  })

  it('every change is sampled at every offset, so they stay in step', () => {
    // One @keyframes block drives them all: a stop in one is a frame the
    // others must also have a value at, or the browser interpolates them
    // across a frame they were never given.
    const { css } = compileMotion([I({
      changes: [
        { prop: 'x', from: 0, to: 50, via: [{ at: 0.3, value: 10 }] },
        { prop: 'opacity', from: 1, to: 0 }
      ]
    })])
    const kf = css.slice(css.indexOf('@keyframes'), css.indexOf('}', css.indexOf('to {')))
    expect(kf).toContain('30%')
    expect((kf.match(/opacity:/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('orders the stops however they were edited', () => {
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover',
      changes: [{ prop: 'x', from: 0, to: 9, via: [{ at: 0.8, value: 5 }, { at: 0.2, value: 3 }] }]
    }, 0)!
    expect(out.changes[0].via!.map((v) => v.at)).toEqual([0.2, 0.8])
  })

  it('refuses a stop ON either end — that is what from and to are', () => {
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover',
      changes: [{ prop: 'x', from: 0, to: 9, via: [{ at: 0, value: 1 }, { at: 1, value: 2 }] }]
    }, 0)!
    expect(out.changes[0].via).toBe(undefined)
  })

  it('fills a missing start with the property\'s neutral value', () => {
    // The migration path from the older shape, where the start was optional.
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover', changes: [{ prop: 'scale', to: 2 }]
    }, 0)!
    expect(out.changes[0].from).toBe(1)
  })
})

describe('appear runs forwards', () => {
  const appear = I({
    trigger: 'appear',
    changes: [{ prop: 'opacity', from: 0, to: 1 }, { prop: 'y', from: 20, to: 0 }]
  })

  it('starts at the BEGINNING — @starting-style holds `from`', () => {
    // It held `to`, and the rest rule held `from`, so every appear motion
    // played backwards and settled on the value it was meant to have left.
    // Making the start required is what made it obvious.
    const { css } = compileMotion([appear])
    const start = css.slice(css.indexOf('@starting-style'))
    expect(start).toContain('opacity: 0;')
    expect(start).toContain('translate(0px, 26.67px)')
  })

  it('settles at the END', () => {
    // The settling rule is written after the starting-style block; both apply,
    // and the one-frame start state is what the transition runs FROM.
    const { css } = compileMotion([appear])
    const after = css.slice(css.indexOf('}', css.indexOf('@starting-style')))
    expect(after).toContain('opacity: 1;')
    expect(after).toContain('translate(0px, 0px)')
  })
})

describe('hold', () => {
  it('a fired motion keeps its last frame by default', () => {
    expect(compileMotion([I({ repeat: 1 })]).css).toContain(' both;')
  })

  it('and lets go when told to', () => {
    expect(compileMotion([I({ repeat: 1, hold: false })]).css).toContain(' backwards;')
  })
})

describe('a keyframed motion runs on its TRIGGER', () => {
  // Found by reading the panel's own output: the animation was attached to the
  // element, so it played the moment the page loaded and never again — the
  // motion happened once, to nobody, before anyone had touched anything.
  const withStop = I({
    trigger: 'hover',
    changes: [{ prop: 'scale', from: 1, to: 1.5, via: [{ at: 0.5, value: 0.8 }] }]
  })

  it('puts the animation on :hover, not on the element', () => {
    const { css } = compileMotion([withStop])
    const line = css.split('\n').find((l) => l.includes('animation:'))!
    const rule = css.slice(0, css.indexOf(line)).split('\n').reverse().find((l) => l.includes('{'))!
    expect(rule).toContain(':hover')
  })

  it('and on :checked for a toggle', () => {
    const { css } = compileMotion([I({ ...withStop, trigger: 'toggle' })])
    expect(css).toContain(':checked')
    const line = css.split('\n').find((l) => l.includes('animation:'))!
    const rule = css.slice(0, css.indexOf(line)).split('\n').reverse().find((l) => l.includes('{'))!
    expect(rule).toContain(':checked')
  })

  it('does NOT also emit a transition — the two would fight for the value', () => {
    expect(compileMotion([withStop]).css).not.toContain('transition:')
  })

  it('does NOT also emit a plain end-state rule, which would snap past it', () => {
    const { css } = compileMotion([withStop])
    // exactly one rule mentions :hover, and it is the animation
    expect((css.match(/:hover/g) ?? []).length).toBe(1)
  })

  it('appear and scroll keep theirs on the element — neither is a state', () => {
    for (const trigger of ['appear', 'scroll'] as const) {
      const { css } = compileMotion([I({ ...withStop, trigger })])
      expect(css).not.toContain(':hover')
    }
  })

  it('a two-state motion is still a transition, not an animation', () => {
    expect(compileMotion([I()]).css).toContain('transition:')
    expect(compileMotion([I()]).css).not.toContain('animation:')
  })
})

describe('the icon system: draw', () => {
  const draw = I({
    trigger: 'hover',
    changes: [{ prop: 'draw', from: 0, to: 1 }]
  })

  it('animates the STROKES, not the box — stroke-dashoffset on path/line', () => {
    const { css } = compileMotion([draw])
    expect(css).toContain(':is(path, line)')
    expect(css).toContain('stroke-dasharray: 1;')
    expect(css).toContain('stroke-dashoffset: 1;')
    expect(css).toContain('stroke-dashoffset: 0;')
  })

  it('reports which objects need pathLength="1" stamped on their strokes', () => {
    // Without the attribute the CSS is measured against the real length and
    // the stroke either never moves or vanishes at once.
    expect(compileMotion([draw]).drawTargets).toEqual(['shape-1'])
  })

  it('transitions the dashoffset with the motion\'s own timing', () => {
    const { css } = compileMotion([I({ ...draw, duration: 800 })])
    expect(css).toContain('stroke-dashoffset 800ms')
  })

  it('a draw with a repeat becomes stroke keyframes on the trigger', () => {
    const { css } = compileMotion([I({ ...draw, repeat: -1 })])
    expect(css).toContain('@keyframes exl-d-')
    expect(css).toContain('infinite')
  })

  it('draw and a box change ride one interaction without colliding', () => {
    const { css } = compileMotion([I({
      trigger: 'hover',
      changes: [{ prop: 'draw', from: 0, to: 1 }, { prop: 'scale', from: 1, to: 1.1 }]
    })])
    expect(css).toContain(':is(path, line)')
    expect(css).toContain('scale(1.1)')
  })

  it('the model accepts draw like any other numeric property', () => {
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover', changes: [{ prop: 'draw', from: 0, to: 1 }]
    }, 0)!
    expect(out.changes[0].prop).toBe('draw')
  })
})

describe('the icon system: stagger', () => {
  const members = { icon: ['a', 'b', 'c'] }
  const staggered = I({ targetId: 'icon', stagger: 80, delay: 100 })

  it('expands one group motion into one per member, each a beat later', () => {
    const out = expandStagger(staggered, members)
    expect(out.map((x) => x.affects)).toEqual(['a', 'b', 'c'])
    expect(out.map((x) => x.delay)).toEqual([100, 180, 260])
  })

  it('the trigger stays the GROUP — hovering any member lights the wrapper', () => {
    expect(expandStagger(staggered, members).every((x) => x.targetId === 'icon')).toBe(true)
  })

  it('strips the stagger from what it emits, so nothing expands twice', () => {
    expect(expandStagger(staggered, members).every((x) => x.stagger === undefined)).toBe(true)
  })

  it('leaves a motion alone when the moved object has no members', () => {
    expect(expandStagger(staggered, {})).toEqual([staggered])
    expect(expandStagger(I({ stagger: 80 }), members)).toEqual([I({ stagger: 80 })])
  })

  it('compiles to per-member delays through the ordinary paths', () => {
    const { css } = compileMotion([staggered], { groupMembers: members })
    const block = (cls: string) => css.slice(css.indexOf(`.${cls} {`), css.indexOf('}', css.indexOf(`.${cls} {`)))
    expect(block('o-a')).toContain('100ms')
    expect(block('o-b')).toContain('180ms')
    expect(block('o-c')).toContain('260ms')
  })

  it('the model clamps a stagger like every other duration', () => {
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover', stagger: 9e9,
      changes: [{ prop: 'scale', from: 1, to: 2 }]
    }, 0)!
    expect(out.stagger).toBe(2000)
  })
})

describe('the icon presets', () => {
  it('every preset survives the validator exactly as written', async () => {
    // A preset that the model would repair or drop is a button that records
    // something other than what it says.
    const { ICON_PRESETS } = await import('../src/design/motionPresets')
    const { cleanInteraction: clean } = await import('../src/design/motion')
    for (const p of ICON_PRESETS) {
      const made = { id: 'x', targetId: 'a', ...p.patch }
      const out = clean(made, 0)
      expect(out, p.id).not.toBe(null)
      expect(out!.changes.length, p.id).toBe(p.patch.changes.length)
      expect(out!.duration, p.id).toBe(p.patch.duration)
    }
  })

  it('the wiggle decays and ends where it began', async () => {
    const { presetById } = await import('../src/design/motionPresets')
    const w = presetById('wiggle')!.patch.changes[0]
    expect(w.from).toBe(0)
    expect(w.to).toBe(0)
    const swings = (w.via ?? []).map((v) => Math.abs(Number(v.value)))
    for (let k = 1; k < swings.length; k++) expect(swings[k]).toBeLessThan(swings[k - 1])
  })

  it('the draw preset staggers by default — that is what makes it read as drawing', async () => {
    const { presetById } = await import('../src/design/motionPresets')
    expect(presetById('draw')!.patch.stagger).toBeGreaterThan(0)
  })
})

describe('a motion starts from where the object IS', () => {
  it('a neutral start writes NO resting rule — recording must not move things', () => {
    // THE BUG: the rest rule was written even for a neutral start, so saving a
    // motion shoved the object to the rest pose before anything was touched.
    const { css } = compileMotion([I({ changes: [{ prop: 'scale', from: 1, to: 1.2 }] })])
    const rest = css.slice(0, css.indexOf(':hover'))
    // The transition LIST names transform; a transform DECLARATION would be
    // the displacement. The colon-anchored match tells them apart.
    expect(rest).not.toMatch(/^\s*transform:/m)
    expect(rest).toContain('transition')
  })

  it('an explicit start still pins the object there', () => {
    const { css } = compileMotion([I({ changes: [{ prop: 'x', from: 75, to: 0 }] })])
    expect(css.slice(0, css.indexOf(':hover'))).toContain('translate(100px, 0px)')
  })

  it('a colour with no chosen start keeps the element\'s own colour', () => {
    // '#ffffff' as a silent default REPAINTED the shape white at rest.
    const out = cleanInteraction({
      targetId: 'a', trigger: 'hover', changes: [{ prop: 'fill', to: '#ff0000' }]
    }, 0)!
    expect(out.changes[0].from).toBe('auto')
    const { css } = compileMotion([{ ...I(), changes: out.changes }])
    expect(css.slice(0, css.indexOf(':hover'))).not.toMatch(/^\s*background-color:/m)
    expect(css.slice(css.indexOf(':hover'))).toContain('background-color: #ff0000')
  })

  it('mixed changes only anchor the ones that chose a start', () => {
    const { css } = compileMotion([I({
      changes: [
        { prop: 'opacity', from: 0.4, to: 1 },
        { prop: 'scale', from: 1, to: 1.3 }
      ]
    })])
    const rest = css.slice(0, css.indexOf(':hover'))
    expect(rest).toContain('opacity: 0.4')
    expect(rest).not.toContain('scale')
  })
})

describe('the preset families', () => {
  it('every hover preset starts from neutral, so pressing it moves nothing', async () => {
    const { ICON_PRESETS } = await import('../src/design/motionPresets')
    const { isColourProp, propRange: pr } = await import('../src/design/motion')
    for (const p of ICON_PRESETS.filter((x) => x.group === 'hover')) {
      for (const c of p.patch.changes) {
        if (c.prop === 'draw') continue // hidden-at-rest is the draw's point
        const neutral = isColourProp(c.prop) ? 'auto' : pr(c.prop).rest
        expect(c.from, `${p.id}:${c.prop}`).toBe(neutral)
      }
    }
  })

  it('every appear preset states where it arrives FROM', async () => {
    const { ICON_PRESETS } = await import('../src/design/motionPresets')
    const { propRange: pr } = await import('../src/design/motion')
    for (const p of ICON_PRESETS.filter((x) => x.group === 'appear')) {
      const anyExplicit = p.patch.changes.some((c) => Number(c.from) !== pr(c.prop).rest)
      expect(anyExplicit, p.id).toBe(true)
    }
  })

  it('the library is wide: at least a dozen touch motions and six arrivals', async () => {
    const { ICON_PRESETS } = await import('../src/design/motionPresets')
    expect(ICON_PRESETS.filter((x) => x.group === 'hover').length).toBeGreaterThanOrEqual(12)
    expect(ICON_PRESETS.filter((x) => x.group === 'appear').length).toBeGreaterThanOrEqual(6)
  })
})
