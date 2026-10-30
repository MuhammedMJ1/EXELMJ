// The panel where a motion is recorded without typing anything.
//
// Four decisions and no keyboard: which object, what sets it off, what
// changes, and how fast. Everything else — the CSS, the keyframes, the
// checkbox a toggle needs, the script that carries its ARIA state — is
// derived, and the person recording never sees any of it.
//
// The DOM half. Every decision it makes about what CSS to produce lives in
// motionCss.ts, and every rule about what a motion may contain lives in
// design/motion.ts; this file only asks the questions and shows the answers.

import { t } from '../i18n/i18n'
import {
  EASINGS,
  MAX_STOPS,
  MOTION_PROPS,
  TRIGGERS,
  isColourProp,
  needsKeyframes,
  newInteraction,
  propRange,
  type Change,
  type Easing,
  type Interaction,
  type MotionProp,
  type Trigger
} from '../design/motion'
import { motionStylesheet } from './motionCss'
import { ICON_PRESETS } from '../design/motionPresets'

export interface MotionHost {
  /** Everything on this artboard that a motion could be attached to. */
  objects(): Array<{ id: string; label: string }>
  /** Group id → member ids — what stagger and the draw export need. */
  memberMap(): Record<string, string[]>
  interactions(): Interaction[]
  save(list: Interaction[]): void
  /** Run one on the canvas so it can be judged rather than imagined. */
  preview(i: Interaction): void
  /** Highlight what an interaction touches while its row is open. */
  highlight(ids: string[]): void
  setStatus(msg: string): void
  nextId(): string
}

export class MotionPanel {
  private root: HTMLElement
  private openId: string | null = null
  /** The generated-CSS view, kept so an edit can refresh it WITHOUT a full
   * re-render — rebuilding the panel mid-drag kills the slider being dragged,
   * and a code view that only updates on reopen reads as the edit not
   * working even when the model took it. */
  private codePre: HTMLPreElement | null = null

  constructor(parent: HTMLElement, private readonly host: MotionHost) {
    this.root = document.createElement('div')
    this.root.className = 'dz-cp'
    parent.append(this.root)
    this.render()
  }

  destroy(): void {
    this.host.highlight([])
    this.root.remove()
  }

  refresh(): void {
    this.render()
  }

  // ── building blocks ───────────────────────────────────────────────────────

  private row(label: string, control: HTMLElement, host: HTMLElement): HTMLElement {
    const r = document.createElement('label')
    r.className = 'dz-mo-row'
    const s = document.createElement('span')
    s.textContent = label
    r.append(s, control)
    host.append(r)
    return r
  }

  private select<T extends string>(
    values: readonly T[],
    value: T,
    label: (v: T) => string,
    onChange: (v: T) => void
  ): HTMLSelectElement {
    const sel = document.createElement('select')
    for (const v of values) {
      const o = document.createElement('option')
      o.value = v
      o.textContent = label(v)
      sel.append(o)
    }
    sel.value = value
    sel.addEventListener('change', () => onChange(sel.value as T))
    return sel
  }

  /**
   * A slider and a number that drive one value together.
   *
   * The slider is for finding the value that looks right; the box is for
   * matching one you already know. Either alone is half a control.
   */
  private slider(
    value: number,
    range: { min: number; max: number; step: number },
    onChange: (v: number) => void
  ): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'dz-mo-num'
    const s = document.createElement('input')
    s.type = 'range'
    s.min = String(range.min)
    s.max = String(range.max)
    s.step = String(range.step)
    s.value = String(value)
    const n = document.createElement('input')
    n.type = 'number'
    n.step = String(range.step)
    n.value = String(value)
    s.addEventListener('input', () => {
      n.value = s.value
      onChange(Number(s.value))
    })
    n.addEventListener('input', () => {
      const v = Number(n.value)
      if (!Number.isFinite(v)) return
      s.value = String(Math.min(range.max, Math.max(range.min, v)))
      onChange(v)
    })
    wrap.append(s, n)
    return wrap
  }

  // ── the list ──────────────────────────────────────────────────────────────

  private render(): void {
    this.root.innerHTML = ''
    const list = this.host.interactions()
    const objects = this.host.objects()

    const head = document.createElement('div')
    head.className = 'dz-cp-head'
    head.textContent = t('motionTitle')
    this.root.append(head)

    if (!objects.length) {
      const empty = document.createElement('div')
      empty.className = 'dz-cp-note'
      empty.textContent = t('motionNeedObject')
      this.root.append(empty)
      return
    }

    // ── the one-click icon motions ──────────────────────────────────────
    // What makes an icon system usable by somebody who does not program is
    // not the engine — it is that "a bell that rings" is ONE press. Each
    // press records an ordinary interaction, so everything about it can
    // still be edited below.
    for (const family of ['hover', 'appear'] as const) {
      const head2 = document.createElement('div')
      head2.className = 'dz-mo-sec'
      head2.textContent = t(family === 'hover' ? 'motionPresetsHover' : 'motionPresetsAppear')
      this.root.append(head2)
      const strip = document.createElement('div')
      strip.className = 'dz-mo-presets'
      for (const preset of ICON_PRESETS.filter((x) => x.group === family)) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = 'dz-mo-preset'
        b.textContent = t(`motionPreset_${preset.id}`)
        b.addEventListener('click', () => {
          // Onto the current selection's object when there is one; the panel's
          // caller puts the selected object first in the list.
          const made: Interaction = {
            ...newInteraction(this.host.nextId(), objects[0].id),
            ...preset.patch,
            changes: preset.patch.changes.map((c) => ({ ...c, via: c.via ? [...c.via] : undefined }))
          }
          this.host.save([...this.host.interactions(), made])
          this.openId = made.id
          this.render()
          this.host.preview(made)
        })
        strip.append(b)
      }
      this.root.append(strip)
    }

    for (const i of list) this.renderCard(i, objects)

    const add = document.createElement('button')
    add.type = 'button'
    add.className = 'dz-btn dz-mo-add'
    add.textContent = t('motionAdd')
    add.addEventListener('click', () => {
      const made = newInteraction(this.host.nextId(), objects[0].id)
      this.host.save([...list, made])
      this.openId = made.id
      this.render()
      this.host.preview(made)
    })
    this.root.append(add)

    // What the recording actually produces, shown rather than described. A
    // person who never writes CSS still deserves to see that something real
    // came out — and anyone who does write it can check it.
    if (list.length) {
      const sheet = motionStylesheet(list, { groupMembers: this.host.memberMap() })
      const det = document.createElement('details')
      det.className = 'dz-mo-code'
      const sum = document.createElement('summary')
      sum.textContent = t('motionShowCode')
      const pre = document.createElement('pre')
      pre.dir = 'ltr'
      pre.textContent = sheet.css.trim()
      this.codePre = pre
      det.append(sum, pre)
      if (sheet.notes.length) {
        const notes = document.createElement('div')
        notes.className = 'dz-cp-note'
        notes.textContent = sheet.notes.join('\n')
        det.append(notes)
      }
      this.root.append(det)
    }
  }

  /**
   * The interaction AS IT IS NOW.
   *
   * THE BUG THIS EXISTS FOR: every control captured the interaction object at
   * render time, and the panel does not re-render on a slider drag (rebuilding
   * a slider mid-drag kills the drag). So the ▶ button previewed the values
   * from when the card was OPENED, and editing "starts at" then "ends at" had
   * the second write resurrect the first's old value — which from the outside
   * read as "duration, delay, from and to all do nothing".
   */
  private current(id: string): Interaction | undefined {
    return this.host.interactions().find((x) => x.id === id)
  }

  private previewTimer: number | null = null

  private update(id: string, patch: Partial<Interaction>): void {
    const next = this.host.interactions().map((x) => (x.id === id ? { ...x, ...patch } : x))
    this.host.save(next)
    // Debounced: a slider fires dozens of input events per second, and a new
    // preview per event is a stack of overlapping animations that reads as
    // flicker rather than as the motion.
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer)
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null
      const changed = this.current(id)
      if (changed) this.host.preview(changed)
      if (this.codePre) {
        this.codePre.textContent = motionStylesheet(this.host.interactions(), {
          groupMembers: this.host.memberMap()
        }).css.trim()
      }
    }, 220)
  }

  private renderCard(i: Interaction, objects: Array<{ id: string; label: string }>): void {
    const card = document.createElement('div')
    card.className = `dz-mo-card${this.openId === i.id ? ' open' : ''}`
    this.root.append(card)

    const bar = document.createElement('div')
    bar.className = 'dz-mo-bar'
    const name = document.createElement('button')
    name.type = 'button'
    name.className = 'dz-mo-name'
    const target = objects.find((o) => o.id === i.targetId)
    name.textContent = `${t(`motionTrigger_${i.trigger}`)} · ${target?.label ?? i.targetId}`
    name.addEventListener('click', () => {
      this.openId = this.openId === i.id ? null : i.id
      this.host.highlight(this.openId ? [i.targetId, ...(i.affects ? [i.affects] : [])] : [])
      this.render()
    })
    const play = document.createElement('button')
    play.type = 'button'
    play.className = 'dz-mo-act'
    play.textContent = '▶'
    play.title = t('motionPlay')
    play.addEventListener('click', (e) => {
      e.stopPropagation()
      this.host.preview(this.current(i.id) ?? i)
    })
    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'dz-mo-act'
    del.textContent = '✕'
    del.title = t('motionDelete')
    del.addEventListener('click', (e) => {
      e.stopPropagation()
      this.host.save(this.host.interactions().filter((x) => x.id !== i.id))
      this.host.highlight([])
      this.render()
    })
    bar.append(name, play, del)
    card.append(bar)

    if (this.openId !== i.id) return

    const body = document.createElement('div')
    body.className = 'dz-mo-body'
    card.append(body)

    // ── who, and what sets it off ───────────────────────────────────────
    this.row(
      t('motionTarget'),
      this.select(objects.map((o) => o.id), i.targetId, (id) => objects.find((o) => o.id === id)?.label ?? id,
        (id) => {
          this.update(i.id, { targetId: id })
          this.host.highlight([id])
          this.render()
        }),
      body
    )
    this.row(
      t('motionTrigger'),
      this.select(TRIGGERS, i.trigger, (v: Trigger) => t(`motionTrigger_${v}`), (v) => {
        this.update(i.id, { trigger: v })
        this.render()
      }),
      body
    )
    // "Press the button, the PANEL slides" — the reason trigger and target are
    // two fields. Left as "itself" unless the user says otherwise.
    const affects = ['', ...objects.map((o) => o.id)]
    this.row(
      t('motionAffects'),
      this.select(affects, i.affects ?? '', (id) => (id ? objects.find((o) => o.id === id)?.label ?? id : t('motionAffectsSelf')),
        (id) => {
          this.update(i.id, { affects: id || undefined })
          this.host.highlight(id ? [i.targetId, id] : [i.targetId])
          this.render()
        }),
      body
    )

    // ── what changes ────────────────────────────────────────────────────
    const changesHead = document.createElement('div')
    changesHead.className = 'dz-mo-sec'
    changesHead.textContent = t('motionChanges')
    body.append(changesHead)

    for (const [idx, c] of i.changes.entries()) this.renderChange(i, c, idx, body)

    const addChange = document.createElement('button')
    addChange.type = 'button'
    addChange.className = 'dz-btn dz-mo-addch'
    addChange.textContent = t('motionAddChange')
    addChange.addEventListener('click', () => {
      const used = new Set(i.changes.map((c) => c.prop))
      const free = MOTION_PROPS.find((p) => !used.has(p)) ?? 'opacity'
      const r = propRange(free)
      this.update(i.id, {
        changes: [
          ...i.changes,
          isColourProp(free)
            ? { prop: free, from: '#ffffff', to: '#185abd' }
            : { prop: free, from: r.rest, to: r.rest === 1 ? 1.1 : 20 }
        ]
      })
      this.render()
    })
    body.append(addChange)

    // ── how it moves ────────────────────────────────────────────────────
    const timingHead = document.createElement('div')
    timingHead.className = 'dz-mo-sec'
    timingHead.textContent = t('motionTiming')
    body.append(timingHead)

    this.row(t('motionDuration'),
      this.slider(i.duration, { min: 0, max: 3000, step: 10 }, (v) => this.update(i.id, { duration: v })), body)
    this.row(t('motionDelay'),
      this.slider(i.delay, { min: 0, max: 3000, step: 10 }, (v) => this.update(i.id, { delay: v })), body)
    this.row(t('motionEasing'),
      this.select(EASINGS, i.easing, (v: Easing) => t(`motionEasing_${v}`), (v) => this.update(i.id, { easing: v })), body)
    this.row(t('motionRepeat'),
      this.select(['0', '1', '2', '5', '-1'] as const, String(i.repeat) as '0',
        (v) => (v === '-1' ? t('motionForever') : v === '0' ? t('motionOnce') : v),
        (v) => this.update(i.id, { repeat: Number(v) })), body)
    this.row(t('motionDirection'),
      this.select(['normal', 'reverse', 'alternate'] as const, i.direction,
        (v) => t(`motionDir_${v}`), (v) => this.update(i.id, { direction: v })), body)
    // Stagger: only offered when the moved object actually HAS members —
    // a control that means nothing for the current target teaches the user
    // to distrust the panel.
    const movedId = i.affects ?? i.targetId
    if ((this.host.memberMap()[movedId]?.length ?? 0) > 1) {
      this.row(
        t('motionStagger'),
        this.slider(i.stagger ?? 0, { min: 0, max: 500, step: 10 }, (v) =>
          this.update(i.id, { stagger: v > 0 ? v : undefined })
        ),
        body
      )
    }

    // Only means anything for a motion that FIRES. While a pointer is held on
    // an object the state is the pointer's, and letting go is what ends it.
    if (i.trigger === 'appear' || i.trigger === 'scroll' || needsKeyframes(i)) {
      const hold = document.createElement('input')
      hold.type = 'checkbox'
      hold.checked = i.hold !== false
      hold.addEventListener('change', () => this.update(i.id, { hold: hold.checked }))
      this.row(t('motionHold'), hold, body)
    }
  }

  /**
   * One property's motion: where it starts, where it ends, and any stop in
   * between.
   *
   * START AND END ARE BOTH ALWAYS SHOWN. The start used to be a checkbox that
   * defaulted to off, meaning "wherever the object happens to be" — which
   * reads well and behaves badly: the same motion played differently depending
   * on what had happened before it, and could not be replayed at all.
   */
  private renderChange(i: Interaction, c: Change, idx: number, host: HTMLElement): void {
    const wrap = document.createElement('div')
    wrap.className = 'dz-mo-change'
    host.append(wrap)

    const patch = (next: Partial<Change>) => {
      // From the CURRENT list, not the captured one: with the captured list,
      // editing "starts at" and then "ends at" had the second write carry the
      // first's OLD value back in.
      const cur = this.current(i.id)
      if (!cur) return
      const changes = cur.changes.map((x, n) => (n === idx ? { ...x, ...next } : x))
      this.update(i.id, { changes })
    }

    const top = document.createElement('div')
    top.className = 'dz-mo-chtop'
    const prop = this.select(MOTION_PROPS, c.prop, (p: MotionProp) => t(`motionProp_${p}`), (p) => {
      const r = propRange(p)
      // The values have to change WITH the property: 1.06 means a scale and
      // nothing at all as a rotation, and 90 degrees as an opacity is a bug
      // the user would have to notice for themselves. The stops go too — they
      // were measured in the old property's units.
      patch(
        isColourProp(p)
          ? { prop: p, from: '#ffffff', to: '#185abd', via: undefined }
          : { prop: p, from: r.rest, to: r.rest === 1 ? 1.1 : 20, via: undefined }
      )
      this.render()
    })
    const drop = document.createElement('button')
    drop.type = 'button'
    drop.className = 'dz-mo-act'
    drop.textContent = '✕'
    drop.addEventListener('click', () => {
      // The last change cannot go: an interaction that changes nothing is
      // dropped by the validator, so removing it here would delete the row
      // from under the user without saying so.
      if (i.changes.length < 2) {
        this.host.setStatus(t('motionNeedOneChange'))
        return
      }
      this.update(i.id, { changes: i.changes.filter((_, n) => n !== idx) })
      this.render()
    })
    top.append(prop, drop)
    wrap.append(top)

    const colour = isColourProp(c.prop)
    const r = propRange(c.prop)

    /** One end of the run, or one stop along it. */
    const valueControl = (value: number | string, onChange: (v: number | string) => void): HTMLElement => {
      if (colour) {
        const col = document.createElement('input')
        col.type = 'color'
        col.value = typeof value === 'string' ? value : '#185abd'
        col.addEventListener('input', () => onChange(col.value))
        return col
      }
      return this.slider(Number(value), r, (v) => onChange(v))
    }

    this.row(t('motionTo'), valueControl(c.to, (v) => patch({ to: v })), wrap)

    // The start point. OFF means "from wherever the object is", which writes
    // no resting rule at all — recording a motion must not move the object.
    // ON pins an explicit beginning and the object sits there.
    const neutral = colour ? 'auto' : r.rest
    const isCustom = colour ? c.from !== 'auto' : Number(c.from) !== r.rest
    const customWrap = document.createElement('span')
    customWrap.className = 'dz-mo-from'
    const customBox = document.createElement('input')
    customBox.type = 'checkbox'
    customBox.checked = isCustom
    customBox.addEventListener('change', () => {
      patch({
        from: customBox.checked ? (colour ? '#185abd' : r.rest === 1 ? 0.5 : r.min < 0 ? -20 : r.max / 4) : neutral
      })
      this.render()
    })
    customWrap.append(customBox)
    if (isCustom) customWrap.append(valueControl(c.from, (v) => patch({ from: v })))
    this.row(t('motionCustomStart'), customWrap, wrap)

    // ── the stops in between ───────────────────────────────────────────
    const via = c.via ?? []
    for (const [n, stop] of via.entries()) {
      const line = document.createElement('div')
      line.className = 'dz-mo-stop'
      wrap.append(line)
      const patchStop = (next: Partial<typeof stop>) => {
        const curVia = this.current(i.id)?.changes[idx]?.via ?? via
        patch({ via: curVia.map((x, k) => (k === n ? { ...x, ...next } : x)) })
      }
      // WHERE along the run, as a percentage — the same number CSS keyframes
      // are written in, so what the panel says is what the stylesheet says.
      const at = document.createElement('input')
      at.type = 'number'
      at.min = '1'
      at.max = '99'
      at.step = '1'
      at.className = 'dz-mo-at'
      at.value = String(Math.round(stop.at * 100))
      at.addEventListener('input', () => {
        const v = Number(at.value)
        if (v > 0 && v < 100) patchStop({ at: v / 100 })
      })
      const kill = document.createElement('button')
      kill.type = 'button'
      kill.className = 'dz-mo-act'
      kill.textContent = '✕'
      kill.addEventListener('click', () => {
        patch({ via: via.filter((_, k) => k !== n) })
        this.render()
      })
      const head = document.createElement('div')
      head.className = 'dz-mo-stophead'
      const pct = document.createElement('span')
      pct.textContent = '%'
      head.append(at, pct, kill)
      line.append(head)
      line.append(valueControl(stop.value, (v) => patchStop({ value: v })))
    }

    if (via.length < MAX_STOPS) {
      const addStop = document.createElement('button')
      addStop.type = 'button'
      addStop.className = 'dz-btn dz-mo-addstop'
      addStop.textContent = t('motionAddStop')
      addStop.addEventListener('click', () => {
        // Halfway between the last stop and the end, which is where a second
        // stop almost always wants to be.
        const last = via.length ? via[via.length - 1].at : 0
        const at = Math.min(0.95, Math.round(((last + 1) / 2) * 100) / 100)
        patch({ via: [...via, { at, value: colour ? '#185abd' : r.rest }] })
        this.render()
      })
      wrap.append(addStop)
    }
  }
}
