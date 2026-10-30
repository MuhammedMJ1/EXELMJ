// The colour panel: an OKLCH picker with a live gamut boundary, scale
// generation from one seed, contrast verdicts, extract-from-image, dark-mode
// derivation and token export.
//
// WHY THE PICKER IS HAND-ROLLED
// Every framework-free picker worth using has a blocking flaw for this app.
// The one with real RTL support (Coloris) documents that there is only ONE
// instance — a shape inspector needs a FILL picker and a STROKE picker side by
// side, so that is a functional block, not a preference. And none of them draw
// the sRGB gamut boundary, which is the entire reason to pick in OKLCH: without
// it the user drags into colours the screen cannot show and silently gets
// something else back.
//
// The boundary is cheap because oklab.ts answers "max chroma at this L and hue"
// in a fitted polynomial plus one Halley step, so it can be evaluated per pixel
// column at 60fps with no solver in the loop.

import { t } from '../i18n/i18n'
import { clampToGamut, hexToLch, lchToHex, maxChroma, type LCH } from './color/oklab'
import { contrastRatio, readableOn, verdict, type ContrastVerdict } from './color/contrast'
import { STEPS, darkFrom, scaleFrom, simulateCVD, type CVD, type Scale } from './color/scale'
import { extractPalette, type Swatch } from './color/extract'
import { colorSwatches, scaleToGroup, toAse, toCssVars, toDtcg } from './color/tokens'
import type { TokenGroup, TokenSet } from './model'

// Drawn at a HIGHER resolution than it is shown: the canvas is stretched to
// the dock's width, and a 220px bitmap scaled up is a soft, banded gradient.
const PLANE_W = 264
const PLANE_H = 180
const HUE_H = 16

export interface ColorPanelHost {
  /** The document's token set — mutated in place, like the rest of the model. */
  tokens(): TokenSet
  /** Called after any change that must be saved. */
  onChange(): void
  /** Pixels of the currently selected image, for extract-from-image. */
  selectedImagePixels(): { data: Uint8ClampedArray; w: number; h: number } | null
  /** Apply a colour to the current selection (fill). */
  applyToSelection(hex: string): void
  /** Ask the host to write a file the user picked a location for. */
  saveFile(name: string, bytes: Uint8Array): void
}

export class ColorPanel {
  private root: HTMLElement
  private plane: HTMLCanvasElement
  private hueStrip: HTMLCanvasElement
  private swatchGrid: HTMLElement
  private scaleRow: HTMLElement
  private readout: HTMLElement
  private hexInput: HTMLInputElement
  /** The big colour chip at the top — what the panel is currently about. */
  private preview!: HTMLElement
  /** The OKLCH numbers, beside the hex rather than buried in the readout. */
  private oklch!: HTMLElement
  private cvd: CVD | null = null
  private cvdSeverity = 1
  private current: LCH = { L: 0.55, C: 0.12, h: 250 }
  /** What the contrast readout measures against. */
  private against = '#ffffff'

  constructor(
    parent: HTMLElement,
    private readonly host: ColorPanelHost
  ) {
    this.root = document.createElement('section')
    this.root.className = 'dz-colorpanel'

    // ── the colour itself: a big preview, its hex, and where it goes ───────
    const head = document.createElement('div')
    head.className = 'dz-cp-head'
    this.preview = document.createElement('div')
    this.preview.className = 'dz-cp-preview'
    const headText = document.createElement('div')
    headText.className = 'dz-cp-headtext'
    this.hexInput = document.createElement('input')
    this.hexInput.type = 'text'
    this.hexInput.className = 'dz-cp-hex'
    this.hexInput.spellcheck = false
    // A hex code is machine text: it must read left-to-right even inside an
    // Arabic panel, and the direction is scoped to the RUN, not the container.
    this.hexInput.dir = 'ltr'
    this.hexInput.addEventListener('change', () => this.setHex(this.hexInput.value))
    this.oklch = document.createElement('div')
    this.oklch.className = 'dz-cp-num'
    this.oklch.dir = 'ltr'
    headText.append(this.hexInput, this.oklch)
    head.append(this.preview, headText)
    this.root.append(head)

    const applyRow = document.createElement('div')
    applyRow.className = 'dz-cp-applyrow'
    const apply = document.createElement('button')
    apply.type = 'button'
    apply.className = 'dz-btn dz-btn-primary'
    apply.textContent = t('studioApply')
    apply.title = t('studioApplyHint')
    apply.addEventListener('click', () => this.host.applyToSelection(this.hex()))
    const save = document.createElement('button')
    save.type = 'button'
    save.className = 'dz-btn'
    save.textContent = t('studioSaveSwatch')
    save.title = t('studioSaveSwatchHint')
    save.addEventListener('click', () => this.saveSwatch())
    applyRow.append(apply, save)
    this.root.append(applyRow)

    // ── the picker ────────────────────────────────────────────────────────
    this.root.append(this.section(t('studioSectionPick')))
    this.plane = document.createElement('canvas')
    this.plane.width = PLANE_W
    this.plane.height = PLANE_H
    this.plane.className = 'dz-cp-plane'
    this.plane.title = t('studioPlaneHint')
    this.root.append(this.plane)
    const planeNote = document.createElement('div')
    planeNote.className = 'dz-cp-note'
    // The shape of the painted region IS the sRGB boundary. Saying so turns a
    // curved edge that looks like a rendering fault into information.
    planeNote.textContent = t('studioGamutNote')
    this.root.append(planeNote)

    this.hueStrip = document.createElement('canvas')
    this.hueStrip.width = PLANE_W
    this.hueStrip.height = HUE_H
    this.hueStrip.className = 'dz-cp-hue'
    this.root.append(this.hueStrip)

    // ── contrast ──────────────────────────────────────────────────────────
    this.root.append(this.section(t('studioSectionContrast')))
    this.readout = document.createElement('div')
    this.readout.className = 'dz-cp-readout'
    this.root.append(this.readout)

    // ── the scale ─────────────────────────────────────────────────────────
    this.root.append(this.section(t('studioSectionScale')))
    this.scaleRow = document.createElement('div')
    this.scaleRow.className = 'dz-cp-scale'
    this.root.append(this.scaleRow)
    const scaleActions = document.createElement('div')
    scaleActions.className = 'dz-cp-actions'
    scaleActions.append(
      this.button(t('studioMakeScale'), t('studioMakeScaleHint'), () => this.generateScale()),
      this.button(t('studioDark'), t('studioDarkHint'), () => this.deriveDark()),
      this.button(t('studioExtract'), t('studioExtractHint'), () => this.extractFromImage())
    )
    this.root.append(scaleActions)

    // ── the document's own colours ────────────────────────────────────────
    this.root.append(this.section(t('studioSectionSwatches')))
    this.swatchGrid = document.createElement('div')
    this.swatchGrid.className = 'dz-cp-swatches'
    this.root.append(this.swatchGrid)

    // ── colour-blind preview ──────────────────────────────────────────────
    this.root.append(this.section(t('studioSectionVision')))
    const cvdRow = document.createElement('div')
    cvdRow.className = 'dz-cp-row'
    const cvdSel = document.createElement('select')
    cvdSel.className = 'dz-select'
    for (const [value, label] of [
      ['', t('studioCvdNone')],
      ['protan', t('studioCvdProtan')],
      ['deutan', t('studioCvdDeutan')],
      ['tritan', t('studioCvdTritan')],
      ['achroma', t('studioCvdAchroma')]
    ] as const) {
      const o = document.createElement('option')
      o.value = value
      o.textContent = label
      cvdSel.append(o)
    }
    const sev = document.createElement('input')
    sev.type = 'range'
    sev.min = '0'
    sev.max = '100'
    sev.value = '100'
    sev.className = 'dz-cp-sev'
    // The severity slider only means something once a deficiency is chosen;
    // live at "normal vision" it is a control that does nothing.
    sev.disabled = true
    cvdSel.addEventListener('change', () => {
      this.cvd = (cvdSel.value || null) as CVD | null
      sev.disabled = !this.cvd
      this.renderSwatches()
    })
    sev.addEventListener('input', () => {
      this.cvdSeverity = Number(sev.value) / 100
      this.renderSwatches()
    })
    cvdRow.append(cvdSel, sev)
    this.root.append(cvdRow)

    // ── export ────────────────────────────────────────────────────────────
    this.root.append(this.section(t('studioSectionExport')))
    const exports = document.createElement('div')
    exports.className = 'dz-cp-actions'
    exports.append(
      this.button('DTCG', t('studioExportDtcg'), () => this.exportDtcg()),
      this.button('CSS', t('studioExportCss'), () => this.exportCss()),
      this.button('ASE', t('studioExportAse'), () => this.exportAse())
    )
    this.root.append(exports)

    parent.append(this.root)
    this.installPointer(this.plane, (x, y) => this.pickPlane(x, y))
    this.installPointer(this.hueStrip, (x) => this.pickHue(x))
    this.refresh()
  }

  /**
   * A section heading. The panel is long, and unlabelled runs of controls in
   * it are the reason it read as a pile of widgets rather than as a tool.
   */
  private section(label: string): HTMLElement {
    const h = document.createElement('div')
    h.className = 'dz-cp-sec'
    h.textContent = label
    return h
  }

  private button(label: string, title: string, run: () => void): HTMLElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'dz-btn'
    b.textContent = label
    b.title = title
    b.addEventListener('click', run)
    return b
  }

  /**
   * Keep the current colour in the document's palette.
   *
   * The panel could generate a whole scale and extract a palette from an
   * image, but it could not save the ONE colour just picked — so a colour the
   * user liked survived only until they moved the cursor.
   */
  private saveSwatch(): void {
    const tokens = this.host.tokens()
    const color = (tokens.base.color as TokenGroup | undefined) ?? {}
    const saved = (color.saved as TokenGroup | undefined) ?? {}
    const hex = this.hex()
    // Already saved: adding it twice grows the grid with chips that are
    // impossible to tell apart.
    const exists = Object.values(saved).some(
      (v) =>
        !!v &&
        typeof v === 'object' &&
        '$value' in v &&
        String((v as { $value: unknown }).$value).toLowerCase() === hex.toLowerCase()
    )
    if (!exists) {
      saved[`c${Object.keys(saved).length + 1}`] = { $value: hex, $type: 'color' }
      color.saved = saved
      tokens.base.color = color
      this.host.onChange()
    }
    this.renderSwatches()
  }

  destroy(): void {
    this.root.remove()
  }

  hex(): string {
    return lchToHex(this.current)
  }

  setHex(hex: string): void {
    const c = hexToLch(hex)
    if (!c) {
      // an unparseable entry reverts rather than silently becoming black
      this.hexInput.value = this.hex()
      return
    }
    this.current = c
    this.refresh()
  }

  /** What the contrast readout compares against. */
  setBackground(hex: string): void {
    if (hexToLch(hex)) this.against = hex
    this.renderReadout()
  }

  refresh(): void {
    this.drawPlane()
    this.drawHue()
    const hex = this.hex()
    this.hexInput.value = hex
    this.preview.style.background = hex
    this.oklch.textContent = `L ${this.current.L.toFixed(3)}  C ${this.current.C.toFixed(3)}  H ${Math.round(this.current.h)}`
    this.renderReadout()
    this.renderSwatches()
  }

  // ─── the picker ────────────────────────────────────────────────────────────

  /**
   * The L/C plane for the current hue, with the sRGB boundary drawn as the
   * edge of the painted region.
   *
   * Everything outside the boundary is left as the panel background, so an
   * out-of-gamut colour is not merely clamped on release — it is visibly not
   * there to click. That is the difference between a picker that lies and one
   * that does not.
   */
  private drawPlane(): void {
    const ctx = this.plane.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, PLANE_W, PLANE_H)
    const img = ctx.createImageData(PLANE_W, PLANE_H)
    // Outside the gamut used to be TRANSPARENT over a checkerboard, which read
    // as a rendering fault rather than as information. A flat neutral says the
    // same thing — the screen has no colour here — without looking broken.
    const OUT: [number, number, number] = [244, 244, 245]
    // Chroma axis is scaled to the hue's own maximum so the whole plane is
    // usable at every hue — a fixed 0..0.4 axis wastes most of the width on
    // yellows and clips nothing on blues.
    const cMax = this.hueMaxChroma()
    for (let px = 0; px < PLANE_W; px++) {
      const L = px / (PLANE_W - 1)
      const room = maxChroma(L, this.current.h)
      for (let py = 0; py < PLANE_H; py++) {
        const C = (1 - py / (PLANE_H - 1)) * cMax
        const i = (py * PLANE_W + px) * 4
        if (C > room) {
          img.data[i] = OUT[0]
          img.data[i + 1] = OUT[1]
          img.data[i + 2] = OUT[2]
          img.data[i + 3] = 255
          continue
        }
        const hex = lchToHex({ L, C, h: this.current.h })
        const n = parseInt(hex.slice(1), 16)
        img.data[i] = (n >> 16) & 255
        img.data[i + 1] = (n >> 8) & 255
        img.data[i + 2] = n & 255
        img.data[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)

    // the cursor
    const cx = this.current.L * (PLANE_W - 1)
    const cy = (1 - this.current.C / (cMax || 1)) * (PLANE_H - 1)
    // Two rings, dark under light: one ring takes the colour of whatever it
    // sits on, and at the boundary it sits on two colours at once.
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'
    ctx.lineWidth = 3
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(cx, cy, 6, 0, Math.PI * 2)
    ctx.strokeStyle = readableOn(this.hex()) === '#000000' ? '#ffffff' : '#ffffff'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  private hueMaxChroma(): number {
    let m = 0
    for (let i = 0; i <= 40; i++) m = Math.max(m, maxChroma(i / 40, this.current.h))
    return m || 0.001
  }

  private drawHue(): void {
    const ctx = this.hueStrip.getContext('2d')
    if (!ctx) return
    for (let x = 0; x < PLANE_W; x++) {
      const h = (x / (PLANE_W - 1)) * 360
      // draw each hue at ITS most saturated point, so the strip shows what the
      // hue can actually do rather than a uniformly dull band
      ctx.fillStyle = lchToHex(clampToGamut({ L: 0.62, C: maxChroma(0.62, h), h }))
      ctx.fillRect(x, 0, 1, HUE_H)
    }
    // A KNOB, not a hairline: a 2px white line disappears over yellow, and a
    // marker you cannot see is a marker you cannot aim with.
    const at = (this.current.h / 360) * (PLANE_W - 1)
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'
    ctx.strokeRect(at - 3, 0.5, 6, HUE_H - 1)
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#ffffff'
    ctx.strokeRect(at - 3, 0.5, 6, HUE_H - 1)
  }

  private installPointer(el: HTMLCanvasElement, onMove: (x: number, y: number) => void): void {
    const handle = (e: PointerEvent): void => {
      const r = el.getBoundingClientRect()
      onMove(
        Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
        Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
      )
    }
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      handle(e)
      const move = (ev: PointerEvent): void => handle(ev)
      const up = (ev: PointerEvent): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        try {
          el.releasePointerCapture(ev.pointerId)
        } catch {
          /* already released */
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
  }

  private pickPlane(fx: number, fy: number): void {
    const L = fx
    const C = (1 - fy) * this.hueMaxChroma()
    // clampToGamut keeps L and h and only reduces C, so dragging past the
    // boundary slides ALONG it instead of jumping somewhere else
    this.current = clampToGamut({ L, C, h: this.current.h })
    this.refresh()
  }

  private pickHue(fx: number): void {
    this.current = clampToGamut({ ...this.current, h: fx * 360 })
    this.refresh()
  }

  // ─── readouts ──────────────────────────────────────────────────────────────

  /**
   * The contrast block.
   *
   * A ratio on its own is a number the user has to look up. This shows the
   * colour ON the background being measured, at real text size, with the
   * verdict spelled out — and lets the background be switched, because a
   * palette that passes on white routinely fails on black.
   */
  private renderReadout(): void {
    const hex = this.hex()
    const ratio = contrastRatio(hex, this.against)
    const v: ContrastVerdict | null = ratio === null ? null : verdict(ratio)
    this.readout.innerHTML = ''

    const sample = document.createElement('div')
    sample.className = 'dz-cp-sample'
    sample.style.background = this.against
    sample.style.color = hex
    sample.textContent = t('studioContrastSample')
    this.readout.append(sample)

    const line = document.createElement('div')
    line.className = 'dz-cp-verdict'
    if (v) {
      const badge = document.createElement('span')
      badge.className = `dz-cp-badge ${v === 'Fail' ? 'fail' : v === 'AAA' ? 'aaa' : 'aa'}`
      badge.dir = 'ltr'
      badge.textContent = `${v} · ${ratio!.toFixed(2)}:1`
      const says = document.createElement('span')
      says.className = 'dz-cp-says'
      says.textContent =
        v === 'Fail'
          ? t('studioContrastFail')
          : v === 'AAA'
            ? t('studioContrastAaa')
            : v === 'AA'
              ? t('studioContrastAa')
              : t('studioContrastLarge')
      line.append(badge, says)
    }
    this.readout.append(line)

    const against = document.createElement('div')
    against.className = 'dz-cp-against'
    const label = document.createElement('span')
    label.textContent = t('studioAgainst')
    against.append(label)
    for (const bg of ['#ffffff', '#000000', '#f4f4f5', '#1f2937']) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `dz-cp-bg${this.against === bg ? ' on' : ''}`
      b.style.background = bg
      b.title = bg
      b.addEventListener('click', () => {
        this.against = bg
        this.renderReadout()
      })
      against.append(b)
    }
    this.readout.append(against)
  }

  private renderSwatches(): void {
    this.swatchGrid.innerHTML = ''
    const list = colorSwatches(this.host.tokens())
    if (!list.length) {
      // An empty grid with no explanation reads as a broken panel. Say what
      // would fill it.
      const empty = document.createElement('div')
      empty.className = 'dz-cp-note'
      empty.textContent = t('studioNoSwatches')
      this.swatchGrid.append(empty)
      return
    }
    for (const sw of list) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'dz-cp-chip'
      // The CVD preview recolours the SWATCHES, not the app — the point is to
      // see whether the palette still separates, not to simulate the whole UI.
      chip.style.background = this.cvd ? simulateCVD(sw.hex, this.cvd, this.cvdSeverity) : sw.hex
      chip.title = `${sw.name} · ${sw.hex}`
      chip.addEventListener('click', () => this.setHex(sw.hex))
      // A double-click paints the selection: the grid is the fastest place to
      // reach a colour the document already uses.
      chip.addEventListener('dblclick', () => this.host.applyToSelection(sw.hex))
      this.swatchGrid.append(chip)
    }
  }

  private renderScale(scale: Scale): void {
    this.scaleRow.innerHTML = ''
    for (const step of STEPS) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'dz-cp-step'
      chip.style.background = this.cvd ? simulateCVD(scale[step], this.cvd, this.cvdSeverity) : scale[step]
      chip.title = `${step} · ${scale[step]}`
      // The step number is written ON the swatch in whichever of black or
      // white can be read against it — a legend beside the row would double
      // its height for information that belongs on the chip.
      chip.textContent = String(step)
      chip.style.color = readableOn(scale[step])
      chip.addEventListener('click', () => this.setHex(scale[step]))
      chip.addEventListener('dblclick', () => this.host.applyToSelection(scale[step]))
      this.scaleRow.append(chip)
    }
  }

  // ─── actions ───────────────────────────────────────────────────────────────

  private generateScale(): void {
    const scale = scaleFrom(this.hex())
    if (!scale) return
    const tokens = this.host.tokens()
    const color = (tokens.base.color as TokenGroup | undefined) ?? {}
    color.brand = scaleToGroup(scale, 'Brand')
    tokens.base.color = color
    this.renderScale(scale)
    this.renderSwatches()
    this.host.onChange()
  }

  private deriveDark(): void {
    const scale = scaleFrom(this.hex())
    if (!scale) return
    const tokens = this.host.tokens()
    const dark = darkFrom(scale)
    tokens.dark = { ...(tokens.dark ?? {}), color: { brand: scaleToGroup(dark, 'Brand dark') } }
    this.renderScale(dark)
    this.host.onChange()
  }

  private extractFromImage(): void {
    const px = this.host.selectedImagePixels()
    if (!px) return
    const swatches: Swatch[] = extractPalette(px.data, px.w, px.h, { colors: 8 })
    if (!swatches.length) return
    const tokens = this.host.tokens()
    const group: TokenGroup = {}
    for (const s of swatches) {
      group[s.role] = { $value: s.hex, $type: 'color', $description: `from image (${Math.round(s.weight * 100)}%)` }
    }
    const color = (tokens.base.color as TokenGroup | undefined) ?? {}
    color.image = group
    tokens.base.color = color
    this.setHex(swatches[0].hex)
    this.host.onChange()
  }

  private exportDtcg(): void {
    this.host.saveFile('tokens.tokens.json', new TextEncoder().encode(toDtcg(this.host.tokens())))
  }

  private exportCss(): void {
    this.host.saveFile('tokens.css', new TextEncoder().encode(toCssVars(this.host.tokens())))
  }

  private exportAse(): void {
    const sw = colorSwatches(this.host.tokens())
    if (!sw.length) return
    this.host.saveFile('palette.ase', toAse(sw))
  }
}
