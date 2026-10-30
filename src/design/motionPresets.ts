// The one-press motions.
//
// What actually makes Lordicon and its kind usable by somebody who does not
// program is not the engine — it is that "a bell that rings" is ONE press, not
// nine decisions. Each preset here is a fully-decided interaction body; the
// panel stamps it onto a new interaction and everything about it can still be
// edited afterwards, because it is made of the same fields as a hand-built one.
//
// Two families, because they answer two different questions:
//   hover  — what does it do when TOUCHED
//   appear — how does it ARRIVE
//
// Values are chosen against the references, not invented: swings decay
// (±12 → ∓10 → ±6 → 0) rather than tick like a metronome; idles are slow and
// shallow because they play forever and anything faster reads as a bug; and
// every hover preset starts from NEUTRAL, so recording one never moves the
// object — it sits exactly where it was drawn until it is touched.

import type { Interaction } from './motion'

export type PresetPatch = Pick<
  Interaction,
  'trigger' | 'changes' | 'duration' | 'delay' | 'easing' | 'repeat' | 'direction'
> &
  Partial<Pick<Interaction, 'hold' | 'stagger'>>

export interface IconPreset {
  id: string
  /** which strip it renders in: touched, or arriving */
  group: 'hover' | 'appear'
  patch: PresetPatch
}

export const ICON_PRESETS: IconPreset[] = [
  // ── touched ───────────────────────────────────────────────────────────────
  {
    // The stroke draws itself in — THE icon animation. Staggered by default:
    // parts arriving a beat apart is what makes it read as drawing.
    id: 'draw',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [{ prop: 'draw', from: 0, to: 1 }],
      duration: 800,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      stagger: 120
    }
  },
  {
    id: 'pulse',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [{ prop: 'scale', from: 1, to: 1.12 }],
      duration: 450,
      delay: 0,
      easing: 'inOut',
      repeat: -1,
      direction: 'alternate'
    }
  },
  {
    // The bell-swing: a decaying oscillation, ending back at zero.
    id: 'wiggle',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [
        {
          prop: 'rotate',
          from: 0,
          to: 0,
          via: [
            { at: 0.2, value: -12 },
            { at: 0.45, value: 10 },
            { at: 0.7, value: -6 },
            { at: 0.85, value: 3 }
          ]
        }
      ],
      duration: 700,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      hold: false
    }
  },
  {
    // The refusal shake — sideways, decaying.
    id: 'shake',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [
        {
          prop: 'x',
          from: 0,
          to: 0,
          via: [
            { at: 0.15, value: -6 },
            { at: 0.35, value: 5 },
            { at: 0.55, value: -4 },
            { at: 0.75, value: 2 }
          ]
        }
      ],
      duration: 500,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      hold: false
    }
  },
  {
    id: 'spin',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [{ prop: 'rotate', from: 0, to: 360 }],
      duration: 900,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      hold: false
    }
  },
  {
    // Up, catch, settle — the notification hop.
    id: 'bounce',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [
        {
          prop: 'y',
          from: 0,
          to: 0,
          via: [
            { at: 0.35, value: -9 },
            { at: 0.65, value: 0 },
            { at: 0.8, value: -4 }
          ]
        }
      ],
      duration: 650,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal',
      hold: false
    }
  },
  {
    // The celebration: a dip, a swell, a settle — with a little twist riding
    // the same run, sampled at the same offsets.
    id: 'tada',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [
        {
          prop: 'scale',
          from: 1,
          to: 1,
          via: [
            { at: 0.15, value: 0.92 },
            { at: 0.45, value: 1.15 },
            { at: 0.75, value: 1.08 }
          ]
        },
        {
          prop: 'rotate',
          from: 0,
          to: 0,
          via: [
            { at: 0.2, value: -4 },
            { at: 0.5, value: 4 },
            { at: 0.8, value: -2 }
          ]
        }
      ],
      duration: 800,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      hold: false
    }
  },
  {
    // Lub-dub: two beats of different sizes, then quiet.
    id: 'heartbeat',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [
        {
          prop: 'scale',
          from: 1,
          to: 1,
          via: [
            { at: 0.15, value: 1.18 },
            { at: 0.3, value: 1 },
            { at: 0.45, value: 1.26 },
            { at: 0.65, value: 1 }
          ]
        }
      ],
      duration: 900,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      hold: false
    }
  },
  {
    // Squash and recover — the soft-body press.
    id: 'jelly',
    group: 'hover',
    patch: {
      trigger: 'press',
      changes: [
        {
          prop: 'scale',
          from: 1,
          to: 0.92,
          via: [
            { at: 0.4, value: 1.06 },
            { at: 0.7, value: 0.96 }
          ]
        }
      ],
      duration: 350,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    // The button lift: up a touch, shadow grows underneath.
    id: 'lift',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [
        { prop: 'y', from: 0, to: -5 },
        { prop: 'shadow', from: 0, to: 12 }
      ],
      duration: 200,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    id: 'glow',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [{ prop: 'shadow', from: 0, to: 16 }],
      duration: 250,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    // The idle: slow, shallow, forever.
    id: 'float',
    group: 'hover',
    patch: {
      trigger: 'hover',
      changes: [{ prop: 'y', from: 0, to: -4 }],
      duration: 1200,
      delay: 0,
      easing: 'inOut',
      repeat: -1,
      direction: 'alternate'
    }
  },

  // ── arriving ──────────────────────────────────────────────────────────────
  {
    id: 'fadeIn',
    group: 'appear',
    patch: {
      trigger: 'appear',
      changes: [{ prop: 'opacity', from: 0, to: 1 }],
      duration: 500,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    // Small and clear, swelling into place on the spring.
    id: 'popIn',
    group: 'appear',
    patch: {
      trigger: 'appear',
      changes: [
        { prop: 'scale', from: 0.6, to: 1 },
        { prop: 'opacity', from: 0, to: 1 }
      ],
      duration: 450,
      delay: 0,
      easing: 'spring',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    id: 'slideIn',
    group: 'appear',
    patch: {
      trigger: 'appear',
      changes: [
        { prop: 'x', from: -40, to: 0 },
        { prop: 'opacity', from: 0, to: 1 }
      ],
      duration: 450,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    id: 'riseIn',
    group: 'appear',
    patch: {
      trigger: 'appear',
      changes: [
        { prop: 'y', from: 24, to: 0 },
        { prop: 'opacity', from: 0, to: 1 }
      ],
      duration: 500,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    id: 'blurIn',
    group: 'appear',
    patch: {
      trigger: 'appear',
      changes: [
        { prop: 'blur', from: 8, to: 0 },
        { prop: 'opacity', from: 0, to: 1 }
      ],
      duration: 550,
      delay: 0,
      easing: 'out',
      repeat: 0,
      direction: 'normal'
    }
  },
  {
    // The icon entrance: the strokes draw themselves as the page arrives.
    id: 'drawIn',
    group: 'appear',
    patch: {
      trigger: 'appear',
      changes: [{ prop: 'draw', from: 0, to: 1 }],
      duration: 900,
      delay: 0,
      easing: 'inOut',
      repeat: 0,
      direction: 'normal',
      stagger: 150
    }
  }
]

export function presetById(id: string): IconPreset | undefined {
  return ICON_PRESETS.find((p) => p.id === id)
}
