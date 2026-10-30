// The layout panel: wrap a selection into an auto-layout frame and edit it.
//
// This is the tab that turns the canvas from a drawing surface into a UI tool.
// The engine is in layout.ts (pure, node-tested); this file is the inspector,
// and it applies the computed positions straight back onto the flat arrays —
// so PDF, SVG, PNG and Word export need to know nothing about frames.
//
// That last point is the whole reason frames are a SIDE-TABLE rather than a
// node tree: layout resolves to absolute points, and every existing exporter
// keeps working untouched.

import { t } from '../i18n/i18n'
import type { Frame, FrameAlign, FrameDirection, FrameJustify } from './model'

export interface LayoutPanelHost {
  /** Frames on the current artboard. */
  frames(): Frame[]
  /** The frame currently being edited, if any. */
  selectedFrame(): Frame | null
  selectFrame(id: string | null): void
  /** Wrap the current selection into a new frame; null when nothing is selected. */
  wrapSelection(): Frame | null
  /** Recompute and apply positions after a property changed. */
  applyLayout(frame: Frame): void
  /** Dissolve a frame, leaving its children where they are. */
  unwrap(id: string): void
  setStatus(message: string): void
}

const DIRECTIONS: Array<[FrameDirection, string]> = [
  ['row', 'studioLayRow'],
  ['column', 'studioLayColumn']
]
const ALIGNS: FrameAlign[] = ['start', 'center', 'end', 'stretch']
const JUSTIFIES: FrameJustify[] = ['start', 'center', 'end', 'between', 'around']

export class LayoutPanel {
  private root: HTMLElement
  private body: HTMLElement
  private list: HTMLElement

  constructor(
    parent: HTMLElement,
    private readonly host: LayoutPanelHost
  ) {
    this.root = document.createElement('section')
    this.root.className = 'dz-laypanel'

    const title = document.createElement('h3')
    title.textContent = t('studioLayout')
    this.root.append(title)

    const actions = document.createElement('div')
    actions.className = 'dz-cp-actions'
    actions.append(
      this.button(t('studioLayWrap'), () => {
        const f = this.host.wrapSelection()
        if (!f) {
          this.host.setStatus(t('studioLayNoSelection'))
          return
        }
        this.host.selectFrame(f.id)
        this.refresh()
        this.host.setStatus(t('studioLayWrapped').replace('{n}', String(f.children.length)))
      })
    )
    this.root.append(actions)

    this.list = document.createElement('div')
    this.list.className = 'dz-tpl-list'
    this.root.append(this.list)

    this.body = document.createElement('div')
    this.body.className = 'dz-lay-body'
    this.root.append(this.body)

    parent.append(this.root)
    this.refresh()
  }

  destroy(): void {
    this.root.remove()
  }

  private button(label: string, run: () => void): HTMLElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dz-btn'
    b.textContent = label
    b.addEventListener('click', run)
    return b
  }

  refresh(): void {
    this.renderList()
    this.renderInspector()
  }

  private renderList(): void {
    this.list.innerHTML = ''
    const frames = this.host.frames()
    if (!frames.length) {
      const empty = document.createElement('div')
      empty.className = 'dz-icon-note'
      empty.textContent = t('studioLayEmpty')
      this.list.append(empty)
      return
    }
    const selected = this.host.selectedFrame()
    for (const f of frames) {
      const row = document.createElement('div')
      row.className = 'dz-tpl-row'
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `dz-tpl-name${f.id === selected?.id ? ' selected' : ''}`
      b.innerHTML = `<span>${t('studioLayFrame')}</span><small dir="ltr">${f.children.length} · ${Math.round(f.w)}×${Math.round(f.h)}</small>`
      b.addEventListener('click', () => {
        this.host.selectFrame(f.id)
        this.refresh()
      })
      row.append(b)
      const off = document.createElement('button')
      off.type = 'button'
      off.className = 'dz-tpl-act'
      off.textContent = '×'
      off.title = t('studioLayUnwrap')
      off.addEventListener('click', () => {
        this.host.unwrap(f.id)
        this.refresh()
      })
      row.append(off)
      this.list.append(row)
    }
  }

  private renderInspector(): void {
    this.body.innerHTML = ''
    const frame = this.host.selectedFrame()
    if (!frame) return
    // A frame with no layout is a plain group; giving it one is what starts
    // arranging its children.
    const L = frame.layout ?? {
      direction: 'row' as FrameDirection,
      gap: 0,
      padding: [0, 0, 0, 0] as [number, number, number, number],
      align: 'start' as FrameAlign,
      justify: 'start' as FrameJustify,
      wrap: false,
      dir: 'rtl' as const
    }
    frame.layout = L

    const commit = (): void => {
      this.host.applyLayout(frame)
      this.renderList()
    }

    this.body.append(
      this.pills(t('studioLayDirection'), DIRECTIONS.map(([v, k]) => [v, t(k)]), L.direction, (v) => {
        L.direction = v as FrameDirection
        commit()
      })
    )
    this.body.append(
      this.number(t('studioLayGap'), L.gap, (v) => {
        L.gap = v
        commit()
      })
    )
    this.body.append(
      this.number(t('studioLayPadding'), L.padding[0], (v) => {
        L.padding = [v, v, v, v]
        commit()
      })
    )
    this.body.append(
      this.pills(t('studioLayJustify'), JUSTIFIES.map((j) => [j, t(`studioLayJ_${j}`)]), L.justify, (v) => {
        L.justify = v as FrameJustify
        commit()
      })
    )
    this.body.append(
      this.pills(t('studioLayAlign'), ALIGNS.map((a) => [a, t(`studioLayA_${a}`)]), L.align, (v) => {
        L.align = v as FrameAlign
        commit()
      })
    )
    this.body.append(
      this.toggle(t('studioLayWrapItems'), L.wrap, (v) => {
        L.wrap = v
        commit()
      })
    )
    // Direction is a LAYOUT property here, not a text property: it mirrors the
    // arrangement of a row and touches no child's own text direction.
    this.body.append(
      this.pills(
        t('studioLayDir'),
        [
          ['rtl', t('studioLayRtl')],
          ['ltr', t('studioLayLtr')]
        ],
        L.dir,
        (v) => {
          L.dir = v as 'rtl' | 'ltr'
          commit()
        }
      )
    )
  }

  private field(label: string): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'dz-lay-field'
    const l = document.createElement('label')
    l.textContent = label
    wrap.append(l)
    return wrap
  }

  private pills(
    label: string,
    options: Array<[string, string]>,
    current: string,
    onPick: (value: string) => void
  ): HTMLElement {
    const wrap = this.field(label)
    const row = document.createElement('div')
    row.className = 'dz-lay-pills'
    for (const [value, text] of options) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `dz-lay-pill${value === current ? ' active' : ''}`
      b.textContent = text
      b.addEventListener('click', () => {
        onPick(value)
        // Re-rendering the whole inspector keeps the active pill honest
        // without every handler having to remember to update it.
        this.renderInspector()
      })
      row.append(b)
    }
    wrap.append(row)
    return wrap
  }

  private number(label: string, value: number, onChange: (v: number) => void): HTMLElement {
    const wrap = this.field(label)
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '0'
    input.max = '400'
    input.step = '1'
    input.value = String(value)
    input.className = 'dz-lay-num'
    input.addEventListener('input', () => {
      const v = Number(input.value)
      // A blank or negative box is a mid-typing state, not an instruction to
      // set a negative gap — which the engine would clamp anyway, silently
      // disagreeing with what the field shows.
      if (Number.isFinite(v) && v >= 0) onChange(v)
    })
    wrap.append(input)
    return wrap
  }

  private toggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const wrap = this.field(label)
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = value
    input.addEventListener('change', () => onChange(input.checked))
    wrap.append(input)
    return wrap
  }
}
