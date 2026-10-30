// EXELMJ Photo — the new raster/layers editor page, mounted at #photo-app
// exactly like WordApp (#word-app) and DesignApp (#design-app): its own
// class, its own DOM tree appended once by mount(), shown/hidden by the mode
// pill (src/word/modeToggle.ts) toggling a `.visible` class it injects itself.
//
// Scope of this first milestone (see docs/PROJECT_MAP.md "MJEXEL Photo"):
// layers (raster + brightness/contrast & hue/saturation adjustment layers),
// blend modes, opacity, move/brush/eraser/rect-select/ellipse-select/
// eyedropper/crop/gradient tools, undo/redo, PNG/JPEG import+export, and a
// native .exelmjphoto container. NOT yet built: lasso, clone-stamp, a text/
// shape tool, levels/black-white UI (the math exists in adjustments.ts),
// and crash-recovery autosave — tracked as follow-up work, not silently
// skipped.
import { getLang, t } from '../i18n/i18n'
import { askForm } from '../word/askForm'
import { reportPhotoDirty } from '../word/dirtyMux'
import type { AdjustmentKind, BlendMode, Layer, PhotoDocument, RasterLayer } from './model'
import { BLEND_MODES, addLayer, createAdjustmentLayer, createEmptyLayer, createPhotoDocument, cropDocument, findLayerIndex, getLayer, removeLayer, reorderLayer, updateLayer } from './model'
import { HistoryStack } from './history'
import { IncrementalCompositor, compositeLayers } from './compositor'
import { documentFromRasterBytes, layerFromRasterBytes, openPhotoDocument, savePhotoDocument, encodePixelsToPng, encodePixelsToJpeg } from './io'
import { type BrushOptions, type BrushPoint, type SelectionMask, ellipseSelection, extractMasked, paintBrushStroke, paintLinearGradient, rectSelection, sampleColor, stampBrush } from './tools'

type PhotoTool = 'move' | 'brush' | 'eraser' | 'rect-select' | 'ellipse-select' | 'eyedropper' | 'crop' | 'gradient'

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8]

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export class PhotoApp {
  private root!: HTMLElement
  private canvas!: HTMLCanvasElement
  private ctx!: CanvasRenderingContext2D
  private canvasWrap!: HTMLElement
  private layersEl!: HTMLElement
  private propsEl!: HTMLElement
  private toolOptionsEl!: HTMLElement
  private statusEl!: HTMLElement
  private titleEl: HTMLElement | null = null

  // Constructed lazily (see main.ts's getPhotoApp), well after initI18n() has
  // already run — t() is safe to call here.
  private doc: PhotoDocument = createPhotoDocument(1080, 1080, 72, t('photoBackground'))
  private history = new HistoryStack<PhotoDocument>()
  private incremental = new IncrementalCompositor()
  private selection: SelectionMask | null = null
  private tool: PhotoTool = 'brush'
  private zoom = 1
  private filePath: string | null = null
  dirty = false

  private brush: BrushOptions = { size: 24, hardness: 0.8, color: [17, 24, 39, 255], erase: false }
  private strokeBefore: RasterLayer | null = null
  private dragStart: { x: number; y: number } | null = null
  private moveStartLayer: RasterLayer | null = null

  mount(): void {
    if (this.root) return
    injectCss()
    this.root = document.getElementById('photo-app') ?? document.body
    this.root.innerHTML = ''
    this.root.dir = getLang() === 'ar' ? 'rtl' : 'ltr'

    const shell = el('div', 'photo-shell')
    const toolbar = this.buildToolbar()
    const center = el('div', 'photo-center')
    const optionsBar = el('div', 'photo-tool-options')
    this.toolOptionsEl = optionsBar
    const canvasWrap = el('div', 'photo-canvas-wrap')
    this.canvasWrap = canvasWrap
    const canvas = document.createElement('canvas')
    canvas.className = 'photo-canvas'
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas context unavailable')
    this.ctx = ctx
    canvasWrap.append(canvas)
    center.append(optionsBar, canvasWrap)
    const right = this.buildRightPanel()
    const statusbar = el('div', 'photo-statusbar')
    this.statusEl = statusbar
    shell.append(toolbar, center, right)
    this.root.append(shell, statusbar)

    this.attachPointerHandlers()
    this.attachKeyboard()
    this.syncToolOptions()
    // setDocument() (called by newBlank/openViaBytes) fits the canvas to the
    // window — but the placeholder doc from the field initializer bypasses
    // it, so without this the very first render sits at zoom=1 (1080px).
    this.fitToWindow()
    this.renderLayers()
    this.render()
    this.updateStatus()
  }

  // -- document lifecycle ----------------------------------------------------

  async newBlank(width = 1080, height = 1080, dpi = 72): Promise<void> {
    this.setDocument(createPhotoDocument(width, height, dpi, t('photoBackground')))
    this.filePath = null
    this.setDirty(false)
    this.updateTitle()
  }

  async openNewDialog(): Promise<void> {
    await this.confirmDiscardThen(async () => {
      const presets: Array<[string, string]> = [
        ['1080x1080', t('photoPresetSquare')],
        ['1080x1350', t('photoPresetPortrait')],
        ['1080x1920', t('photoPresetStory')],
        ['1200x630', t('photoPresetCover')],
        ['custom', t('photoPresetCustom')]
      ]
      const answer = await askForm(t('photoNewTitle'), [
        { key: 'preset', label: t('photoPreset'), type: 'select', value: '1080x1080', options: presets },
        { key: 'width', label: t('photoWidth'), type: 'number', value: '1080', min: 1, max: 10000 },
        { key: 'height', label: t('photoHeight'), type: 'number', value: '1080', min: 1, max: 10000 },
        { key: 'dpi', label: t('photoDpi'), type: 'number', value: '72', min: 36, max: 1200 }
      ])
      if (!answer) return
      let width = Math.max(1, Math.round(Number(answer.width) || 1080))
      let height = Math.max(1, Math.round(Number(answer.height) || 1080))
      if (answer.preset && answer.preset !== 'custom') {
        const [w, h] = answer.preset.split('x').map(Number)
        if (w && h) {
          width = w
          height = h
        }
      }
      const dpi = Math.max(1, Math.round(Number(answer.dpi) || 72))
      await this.newBlank(width, height, dpi)
    })
  }

  async openDialog(): Promise<void> {
    if (!window.exelmj) return
    const res = await window.exelmj.openFile().catch(() => null)
    if (!res) return
    await this.openViaBytes(res.path, res.bytes)
  }

  async openPath(path: string): Promise<void> {
    if (!window.exelmj) return
    const res = await window.exelmj.readFile(path).catch(() => null)
    if (!res) return
    await this.openViaBytes(res.path, res.bytes)
  }

  async openViaBytes(path: string, bytes: Uint8Array): Promise<void> {
    await this.confirmDiscardThen(async () => {
      try {
        const isNative = /\.exelmjphoto$/i.test(path)
        const doc = isNative ? await openPhotoDocument(bytes) : await documentFromRasterBytes(bytes)
        if (!isNative) doc.layers[0] = { ...doc.layers[0], name: t('photoBackground') }
        this.setDocument(doc)
        this.filePath = isNative ? path : null
        this.setDirty(!isNative)
        this.updateTitle()
      } catch (err) {
        console.warn('[photo] open failed', err)
        alert(t('photoOpenFailed'))
      }
    })
  }

  async save(): Promise<boolean> {
    if (!window.exelmj) return false
    if (!this.filePath) return this.saveAs()
    try {
      const bytes = await savePhotoDocument(this.doc)
      const ok = await window.exelmj.saveFile(this.filePath, bytes)
      if (ok) {
        this.setDirty(false)
        this.updateTitle()
      } else alert(t('photoSaveFailed'))
      return ok
    } catch (err) {
      console.warn('[photo] save failed', err)
      alert(t('photoSaveFailed'))
      return false
    }
  }

  async saveAs(): Promise<boolean> {
    if (!window.exelmj) return false
    try {
      const bytes = await savePhotoDocument(this.doc)
      const suggested = this.filePath ? basename(this.filePath) : `${t('photoNewDocName')}.exelmjphoto`
      // 'data' keeps whatever extension the suggested name carries (see
      // electron/ipc.ts's file:save-as filter table) — .exelmjphoto isn't
      // one of the dedicated kinds, and doesn't need to be.
      const saved = await window.exelmj.saveFileAs(bytes, suggested, 'data')
      if (!saved) return false
      this.filePath = saved
      this.setDirty(false)
      this.updateTitle()
      return true
    } catch (err) {
      console.warn('[photo] save-as failed', err)
      alert(t('photoSaveFailed'))
      return false
    }
  }

  async exportPng(): Promise<void> {
    if (!window.exelmj) return
    const flat = compositeLayers(this.doc)
    const bytes = await encodePixelsToPng(flat)
    const suggested = `${this.filePath ? basename(this.filePath).replace(/\.[^.]+$/, '') : t('photoNewDocName')}.png`
    await window.exelmj.saveFileAs(bytes, suggested, 'png').catch(() => null)
  }

  async exportJpeg(): Promise<void> {
    if (!window.exelmj) return
    const flat = compositeLayers(this.doc)
    const bytes = await encodePixelsToJpeg(flat, 0.92)
    const suggested = `${this.filePath ? basename(this.filePath).replace(/\.[^.]+$/, '') : t('photoNewDocName')}.jpg`
    await window.exelmj.saveFileAs(bytes, suggested, 'data').catch(() => null)
  }

  private async confirmDiscardThen(run: () => void | Promise<void>): Promise<void> {
    // The app's own modal, not window.confirm — see src/word/wordApp.ts's
    // confirmDiscardThen for why (the native dialog stalls the renderer).
    if (this.dirty) {
      const answer = await askForm(t('photoDiscardTitle'), [{ key: 'note', label: t('photoDiscardConfirm'), type: 'note' }])
      if (!answer) return
    }
    await run()
  }

  updateTitle(): void {
    if (!this.titleEl) return
    const name = this.filePath ? basename(this.filePath) : t('photoNewDocName')
    this.titleEl.textContent = `${name}${this.dirty ? ' *' : ''}`
  }

  /** Every dirty-flag change goes through here so the native window-close
   * guard (src/word/dirtyMux.ts) always sees it — see check_plan warrant
   * 33176f8e: a page whose dirty flag never reaches the mux can lose
   * unsaved work silently on the OS close button, same as the word-mode
   * lesson on record for a missing confirmDiscardThen guard. */
  private setDirty(v: boolean): void {
    this.dirty = v
    reportPhotoDirty(v)
  }

  // -- undo/redo ---------------------------------------------------------

  undo(): void {
    if (!this.history.canUndo()) return
    this.doc = this.history.undo(this.doc)
    this.selection = null
    this.setDirty(true)
    this.updateTitle()
    this.render()
    this.renderLayers()
  }

  redo(): void {
    if (!this.history.canRedo()) return
    this.doc = this.history.redo(this.doc)
    this.selection = null
    this.setDirty(true)
    this.updateTitle()
    this.render()
    this.renderLayers()
  }

  private setDocument(doc: PhotoDocument): void {
    this.doc = doc
    this.history.clear()
    this.selection = null
    this.incremental = new IncrementalCompositor()
    this.fitToWindow()
    this.render()
    this.renderLayers()
  }

  /** Every non-stroke edit goes through here: commits a named, invertible
   * history entry and re-renders. Brush/eraser strokes commit their own
   * before/after pair on pointerup instead (see paintAt/endStroke). */
  private commit(name: string, next: PhotoDocument): void {
    const prev = this.doc
    this.history.push({ name, apply: () => next, invert: () => prev })
    this.doc = next
    this.setDirty(true)
    this.updateTitle()
    this.render()
    this.renderLayers()
  }

  // -- rendering -----------------------------------------------------------

  private render(inStroke = false): void {
    const pixels = inStroke ? compositeLayers(this.doc) : this.incremental.composite(this.doc)
    this.canvas.width = this.doc.width
    this.canvas.height = this.doc.height
    this.canvas.style.width = `${Math.round(this.doc.width * this.zoom)}px`
    this.canvas.style.height = `${Math.round(this.doc.height * this.zoom)}px`
    this.ctx.putImageData(new ImageData(pixels.data.slice(), pixels.width, pixels.height), 0, 0)
    this.updateStatus()
  }

  private fitToWindow(): void {
    const rect = this.canvasWrap.getBoundingClientRect()
    const availW = Math.max(100, rect.width - 32)
    const availH = Math.max(100, rect.height - 32)
    const fit = Math.min(availW / this.doc.width, availH / this.doc.height, 1)
    this.zoom = nearestZoom(fit > 0 ? fit : 1)
  }

  private updateStatus(): void {
    if (!this.statusEl) return
    this.statusEl.textContent = `${this.doc.width}×${this.doc.height}px · ${Math.round(this.zoom * 100)}% · ${this.doc.layers.length} ${t('photoLayers')}`
  }

  // -- toolbar / panels ------------------------------------------------------

  private buildToolbar(): HTMLElement {
    const bar = el('div', 'photo-toolbar')
    const tools: Array<[PhotoTool, string, string]> = [
      ['move', '✖', 'photoToolMove'],
      ['brush', '🖌', 'photoToolBrush'],
      ['eraser', '🧽', 'photoToolEraser'],
      ['rect-select', '▢', 'photoToolRectSelect'],
      ['ellipse-select', '◯', 'photoToolEllipseSelect'],
      ['eyedropper', '📍', 'photoToolEyedropper'],
      ['crop', '✂', 'photoToolCrop'],
      ['gradient', '▤', 'photoToolGradient']
    ]
    const buttons = new Map<PhotoTool, HTMLButtonElement>()
    for (const [id, glyph, key] of tools) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'photo-tool-btn'
      btn.textContent = glyph
      btn.title = t(key)
      btn.addEventListener('click', () => this.setTool(id))
      bar.append(btn)
      buttons.set(id, btn)
    }
    const sep = el('div', 'photo-toolbar-sep')
    bar.append(sep)
    const undoBtn = document.createElement('button')
    undoBtn.type = 'button'
    undoBtn.className = 'photo-tool-btn'
    undoBtn.textContent = '↶'
    undoBtn.title = t('photoUndo')
    undoBtn.addEventListener('click', () => this.undo())
    const redoBtn = document.createElement('button')
    redoBtn.type = 'button'
    redoBtn.className = 'photo-tool-btn'
    redoBtn.textContent = '↷'
    redoBtn.title = t('photoRedo')
    redoBtn.addEventListener('click', () => this.redo())
    bar.append(undoBtn, redoBtn)
    this.toolButtons = buttons
    this.syncToolButtons()
    return bar
  }

  private toolButtons = new Map<PhotoTool, HTMLButtonElement>()

  private setTool(tool: PhotoTool): void {
    this.tool = tool
    this.selection = null
    this.syncToolButtons()
    this.syncToolOptions()
    this.render()
  }

  private syncToolButtons(): void {
    for (const [id, btn] of this.toolButtons) btn.classList.toggle('active', id === this.tool)
  }

  private syncToolOptions(): void {
    const bar = this.toolOptionsEl
    bar.innerHTML = ''
    if (this.tool === 'brush' || this.tool === 'eraser') {
      bar.append(
        labeledRange(t('photoBrushSize'), 1, 300, this.brush.size, (v) => (this.brush.size = v)),
        labeledRange(t('photoBrushHardness'), 0, 100, Math.round(this.brush.hardness * 100), (v) => (this.brush.hardness = v / 100))
      )
      if (this.tool === 'brush') {
        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.value = rgbToHex(this.brush.color)
        colorInput.title = t('photoColor')
        colorInput.addEventListener('input', () => {
          const [r, g, b] = hexToRgb(colorInput.value)
          this.brush.color = [r, g, b, 255]
        })
        bar.append(labelWrap(t('photoColor'), colorInput))
      }
    } else if (this.tool === 'gradient') {
      const fromInput = document.createElement('input')
      fromInput.type = 'color'
      fromInput.value = '#111827'
      const toInput = document.createElement('input')
      toInput.type = 'color'
      toInput.value = '#ffffff'
      this.gradientFrom = fromInput
      this.gradientTo = toInput
      bar.append(labelWrap(t('photoGradientFrom'), fromInput), labelWrap(t('photoGradientTo'), toInput))
    } else {
      const hint = el('div', 'photo-tool-hint')
      hint.textContent = t(this.tool === 'crop' ? 'photoCropHint' : this.tool === 'move' ? 'photoMoveHint' : '')
      if (hint.textContent) bar.append(hint)
    }
  }

  private gradientFrom: HTMLInputElement | null = null
  private gradientTo: HTMLInputElement | null = null

  private buildRightPanel(): HTMLElement {
    const panel = el('div', 'photo-right')
    const title = el('div', 'photo-doc-title')
    this.titleEl = title
    const layersHeader = el('div', 'photo-panel-header')
    layersHeader.textContent = t('photoLayers')
    const layersList = el('div', 'photo-layers-list')
    this.layersEl = layersList
    const layerActions = el('div', 'photo-layer-actions')
    const addRaster = actionButton('+', t('photoAddLayer'), () => this.addRasterLayer())
    const addAdj1 = actionButton('±', t('photoAdjBrightnessContrast'), () => this.addAdjustmentLayer('brightness-contrast'))
    const addAdj2 = actionButton('◑', t('photoAdjHueSaturation'), () => this.addAdjustmentLayer('hue-saturation'))
    const del = actionButton('✕', t('photoDeleteLayer'), () => this.deleteActiveLayer())
    const up = actionButton('↑', t('photoMoveUp'), () => this.moveActiveLayer(1))
    const down = actionButton('↓', t('photoMoveDown'), () => this.moveActiveLayer(-1))
    layerActions.append(addRaster, addAdj1, addAdj2, del, up, down)
    const propsHeader = el('div', 'photo-panel-header')
    propsHeader.textContent = t('photoProperties')
    const props = el('div', 'photo-props')
    this.propsEl = props
    panel.append(title, layersHeader, layersList, layerActions, propsHeader, props)
    return panel
  }

  private renderLayers(): void {
    this.layersEl.innerHTML = ''
    // top-of-stack first in the list, matching every layer-panel convention.
    for (let i = this.doc.layers.length - 1; i >= 0; i--) {
      const layer = this.doc.layers[i]
      const row = el('div', 'photo-layer-row' + (layer.id === this.doc.activeLayerId ? ' active' : ''))
      const vis = document.createElement('button')
      vis.type = 'button'
      vis.className = 'photo-layer-vis'
      vis.textContent = layer.visible ? '👁' : '–'
      vis.title = t('photoVisible')
      vis.addEventListener('click', (e) => {
        e.stopPropagation()
        this.commit(t('photoHistVisibility'), updateLayer(this.doc, layer.id, { visible: !layer.visible } as Partial<Layer>))
      })
      const name = el('div', 'photo-layer-name')
      // layer.name already carries the localized adjustment type (see
      // addAdjustmentLayer) — no need to append it again here.
      name.textContent = layer.name
      row.append(vis, name)
      row.addEventListener('click', () => {
        this.doc = { ...this.doc, activeLayerId: layer.id }
        this.renderLayers()
        this.renderProperties()
      })
      this.layersEl.append(row)
    }
    this.renderProperties()
  }

  private renderProperties(): void {
    const props = this.propsEl
    props.innerHTML = ''
    const layer = getLayer(this.doc, this.doc.activeLayerId)
    if (!layer) return
    props.append(labeledRange(t('photoOpacity'), 0, 100, Math.round(layer.opacity * 100), (v) => this.commit(t('photoHistOpacity'), updateLayer(this.doc, layer.id, { opacity: v / 100 } as Partial<Layer>))))
    const blendSelect = document.createElement('select')
    for (const mode of BLEND_MODES) {
      const opt = document.createElement('option')
      opt.value = mode
      opt.textContent = t(`photoBlend_${mode}`)
      if (mode === layer.blendMode) opt.selected = true
      blendSelect.append(opt)
    }
    blendSelect.addEventListener('change', () => this.commit(t('photoHistBlend'), updateLayer(this.doc, layer.id, { blendMode: blendSelect.value as BlendMode } as Partial<Layer>)))
    props.append(labelWrap(t('photoBlendMode'), blendSelect))

    if (layer.kind === 'adjustment') {
      if (layer.adjustment === 'brightness-contrast') {
        const p = layer.params as { brightness: number; contrast: number }
        props.append(
          labeledRange(t('photoBrightness'), -100, 100, p.brightness, (v) => this.commit(t('photoHistAdjust'), updateLayer(this.doc, layer.id, { params: { ...p, brightness: v } } as Partial<Layer>))),
          labeledRange(t('photoContrast'), -100, 100, p.contrast, (v) => this.commit(t('photoHistAdjust'), updateLayer(this.doc, layer.id, { params: { ...p, contrast: v } } as Partial<Layer>)))
        )
      } else if (layer.adjustment === 'hue-saturation') {
        const p = layer.params as { hue: number; saturation: number; lightness: number }
        props.append(
          labeledRange(t('photoHue'), -180, 180, p.hue, (v) => this.commit(t('photoHistAdjust'), updateLayer(this.doc, layer.id, { params: { ...p, hue: v } } as Partial<Layer>))),
          labeledRange(t('photoSaturation'), -100, 100, p.saturation, (v) => this.commit(t('photoHistAdjust'), updateLayer(this.doc, layer.id, { params: { ...p, saturation: v } } as Partial<Layer>))),
          labeledRange(t('photoLightness'), -100, 100, p.lightness, (v) => this.commit(t('photoHistAdjust'), updateLayer(this.doc, layer.id, { params: { ...p, lightness: v } } as Partial<Layer>)))
        )
      }
    }
  }

  private addRasterLayer(): void {
    const layer = createEmptyLayer(this.doc, `${t('photoLayer')} ${this.doc.layers.length + 1}`)
    this.commit(t('photoHistAddLayer'), addLayer(this.doc, layer))
  }

  private addAdjustmentLayer(kind: AdjustmentKind): void {
    const layer = createAdjustmentLayer(t(kind === 'brightness-contrast' ? 'photoAdjBrightnessContrast' : 'photoAdjHueSaturation'), kind)
    this.commit(t('photoHistAddLayer'), addLayer(this.doc, layer))
  }

  private deleteActiveLayer(): void {
    if (!this.doc.activeLayerId || this.doc.layers.length <= 1) return
    this.commit(t('photoHistDeleteLayer'), removeLayer(this.doc, this.doc.activeLayerId))
  }

  private moveActiveLayer(delta: number): void {
    if (!this.doc.activeLayerId) return
    const idx = findLayerIndex(this.doc, this.doc.activeLayerId)
    if (idx === -1) return
    this.commit(t('photoHistReorder'), reorderLayer(this.doc, this.doc.activeLayerId, idx + delta))
  }

  // -- pointer interaction ---------------------------------------------------

  private attachPointerHandlers(): void {
    const toDoc = (e: PointerEvent): { x: number; y: number } => {
      const rect = this.canvas.getBoundingClientRect()
      return { x: ((e.clientX - rect.left) / rect.width) * this.doc.width, y: ((e.clientY - rect.top) / rect.height) * this.doc.height }
    }
    this.canvas.addEventListener('pointerdown', (e) => {
      this.canvas.setPointerCapture(e.pointerId)
      const p = toDoc(e)
      this.beginStroke(p)
    })
    this.canvas.addEventListener('pointermove', (e) => {
      if (e.buttons === 0) return
      const p = toDoc(e)
      this.continueStroke(p, e.pressure || 1)
    })
    this.canvas.addEventListener('pointerup', (e) => {
      const p = toDoc(e)
      this.endStroke(p)
      this.canvas.releasePointerCapture(e.pointerId)
    })
    this.canvasWrap.addEventListener('wheel', (e) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const dir = e.deltaY < 0 ? 1 : -1
      const idx = ZOOM_STEPS.findIndex((z) => Math.abs(z - this.zoom) < 0.001)
      const nextIdx = Math.max(0, Math.min(ZOOM_STEPS.length - 1, (idx === -1 ? 4 : idx) + dir))
      this.zoom = ZOOM_STEPS[nextIdx]
      this.render()
    }, { passive: false })
  }

  private beginStroke(p: { x: number; y: number }): void {
    const layer = getLayer(this.doc, this.doc.activeLayerId)
    if (this.tool === 'brush' || this.tool === 'eraser') {
      if (!layer || layer.kind !== 'raster' || layer.locked) return
      this.strokeBefore = { ...layer, pixels: { width: layer.pixels.width, height: layer.pixels.height, data: layer.pixels.data.slice() } }
      this.paintPoint(layer as RasterLayer, p)
      this.render(true)
    } else if (this.tool === 'move') {
      if (!layer || layer.kind !== 'raster' || layer.locked) return
      this.dragStart = p
      this.moveStartLayer = layer as RasterLayer
    } else if (this.tool === 'rect-select' || this.tool === 'ellipse-select' || this.tool === 'crop' || this.tool === 'gradient') {
      this.dragStart = p
    } else if (this.tool === 'eyedropper') {
      const flat = compositeLayers(this.doc)
      const color = sampleColor(flat, p.x, p.y)
      if (color) this.brush.color = [color[0], color[1], color[2], 255]
    }
  }

  private continueStroke(p: { x: number; y: number }, pressure: number): void {
    const layer = getLayer(this.doc, this.doc.activeLayerId)
    if ((this.tool === 'brush' || this.tool === 'eraser') && layer?.kind === 'raster') {
      this.paintPoint(layer as RasterLayer, p, pressure)
      this.render(true)
    } else if (this.tool === 'move' && this.dragStart && this.moveStartLayer) {
      const dx = Math.round(p.x - this.dragStart.x)
      const dy = Math.round(p.y - this.dragStart.y)
      this.doc = updateLayer(this.doc, this.moveStartLayer.id, { x: this.moveStartLayer.x + dx, y: this.moveStartLayer.y + dy } as Partial<Layer>)
      this.render(true)
    } else if ((this.tool === 'rect-select' || this.tool === 'ellipse-select' || this.tool === 'crop') && this.dragStart) {
      this.render()
      this.drawMarquee(this.dragStart, p)
    }
  }

  private lastPointerDoc: { x: number; y: number } | null = null

  private endStroke(p: { x: number; y: number }): void {
    this.lastPointerDoc = p
    const layer = getLayer(this.doc, this.doc.activeLayerId)
    if ((this.tool === 'brush' || this.tool === 'eraser') && this.strokeBefore && layer?.kind === 'raster') {
      const before = this.strokeBefore
      const afterPixels = { width: (layer as RasterLayer).pixels.width, height: (layer as RasterLayer).pixels.height, data: (layer as RasterLayer).pixels.data.slice() }
      const layerId = layer.id
      const prevDoc = updateLayer(this.doc, layerId, { pixels: before.pixels } as Partial<Layer>)
      const nextDoc = updateLayer(this.doc, layerId, { pixels: afterPixels } as Partial<Layer>)
      this.history.push({ name: t(this.tool === 'brush' ? 'photoHistBrush' : 'photoHistErase'), apply: () => nextDoc, invert: () => prevDoc })
      this.doc = nextDoc
      this.setDirty(true)
      this.updateTitle()
      this.strokeBefore = null
      this.render()
    } else if (this.tool === 'move' && this.moveStartLayer) {
      const layerId = this.moveStartLayer.id
      const before = this.moveStartLayer
      const after = getLayer(this.doc, layerId) as RasterLayer | null
      if (after && (after.x !== before.x || after.y !== before.y)) {
        const prevDoc = updateLayer(this.doc, layerId, { x: before.x, y: before.y } as Partial<Layer>)
        const nextDoc = this.doc
        this.history.push({ name: t('photoHistMove'), apply: () => nextDoc, invert: () => prevDoc })
        this.setDirty(true)
        this.updateTitle()
      }
      this.dragStart = null
      this.moveStartLayer = null
      this.render()
    } else if ((this.tool === 'rect-select' || this.tool === 'ellipse-select') && this.dragStart) {
      const rect = rectFrom(this.dragStart, p)
      this.selection = this.tool === 'rect-select' ? rectSelection(this.doc.width, this.doc.height, rect) : ellipseSelection(this.doc.width, this.doc.height, rect)
      this.dragStart = null
      this.render()
    } else if (this.tool === 'crop' && this.dragStart) {
      const rect = rectFrom(this.dragStart, p)
      if (rect.width >= 2 && rect.height >= 2) this.commit(t('photoHistCrop'), cropDocument(this.doc, rect))
      this.dragStart = null
    } else if (this.tool === 'gradient' && this.dragStart && layer?.kind === 'raster') {
      const stops = [
        { offset: 0, color: [...hexToRgb(this.gradientFrom?.value ?? '#111827'), 255] as [number, number, number, number] },
        { offset: 1, color: [...hexToRgb(this.gradientTo?.value ?? '#ffffff'), 255] as [number, number, number, number] }
      ]
      const before = { width: layer.pixels.width, height: layer.pixels.height, data: layer.pixels.data.slice() }
      paintLinearGradient(layer.pixels, this.dragStart, p, stops, this.selection ?? undefined)
      const after = { width: layer.pixels.width, height: layer.pixels.height, data: layer.pixels.data.slice() }
      const layerId = layer.id
      const prevDoc = updateLayer(this.doc, layerId, { pixels: before } as Partial<Layer>)
      const nextDoc = updateLayer(this.doc, layerId, { pixels: after } as Partial<Layer>)
      this.history.push({ name: t('photoHistGradient'), apply: () => nextDoc, invert: () => prevDoc })
      this.doc = nextDoc
      this.setDirty(true)
      this.updateTitle()
      this.dragStart = null
      this.render()
    }
  }

  private paintPoint(layer: RasterLayer, p: { x: number; y: number }, pressure = 1): void {
    const local = { x: p.x - layer.x, y: p.y - layer.y, pressure }
    const points: BrushPoint[] = this.lastPaintPoint ? [this.lastPaintPoint, local] : [local]
    paintBrushStroke(layer.pixels, points, { ...this.brush, erase: this.tool === 'eraser' })
    this.lastPaintPoint = local
    if (points.length === 1) stampBrush(layer.pixels, local.x, local.y, { ...this.brush, erase: this.tool === 'eraser' }, pressure)
  }

  private lastPaintPoint: BrushPoint | null = null

  private drawMarquee(a: { x: number; y: number }, b: { x: number; y: number }): void {
    const rect = rectFrom(a, b)
    this.ctx.save()
    this.ctx.strokeStyle = '#2f6fed'
    this.ctx.lineWidth = 1 / this.zoom
    this.ctx.setLineDash([4 / this.zoom, 4 / this.zoom])
    this.ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
    this.ctx.restore()
  }

  private attachKeyboard(): void {
    document.addEventListener('keydown', (e) => {
      const root = document.getElementById('photo-app')
      if (!root?.classList.contains('visible')) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input,textarea,[contenteditable]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        this.undo()
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        this.redo()
      } else if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void this.save()
      }
    })
  }
}

// -- small DOM helpers ---------------------------------------------------

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function labelWrap(label: string, control: HTMLElement): HTMLElement {
  const wrap = el('label', 'photo-field')
  const span = document.createElement('span')
  span.textContent = label
  wrap.append(span, control)
  return wrap
}

function labeledRange(label: string, min: number, max: number, value: number, onChange: (v: number) => void): HTMLElement {
  const input = document.createElement('input')
  input.type = 'range'
  input.min = String(min)
  input.max = String(max)
  input.value = String(value)
  const valueEl = document.createElement('span')
  valueEl.className = 'photo-field-value'
  valueEl.textContent = String(value)
  input.addEventListener('input', () => {
    valueEl.textContent = input.value
  })
  input.addEventListener('change', () => onChange(Number(input.value)))
  const wrap = el('label', 'photo-field')
  const top = document.createElement('div')
  top.className = 'photo-field-top'
  const span = document.createElement('span')
  span.textContent = label
  top.append(span, valueEl)
  wrap.append(top, input)
  return wrap
}

function actionButton(glyph: string, title: string, run: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'photo-action-btn'
  btn.textContent = glyph
  btn.title = title
  btn.addEventListener('click', run)
  return btn
}

function rectFrom(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; width: number; height: number } {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) }
}

function nearestZoom(z: number): number {
  return ZOOM_STEPS.reduce((best, v) => (Math.abs(v - z) < Math.abs(best - z) ? v : best), 1)
}

function rgbToHex([r, g, b]: [number, number, number, number] | [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

function injectCss(): void {
  if (document.getElementById('photo-app-style')) return
  const style = document.createElement('style')
  style.id = 'photo-app-style'
  style.textContent = `
#photo-app.visible { display: flex; }
#photo-app { background: #f2f4f7; color: #1d2939; font: 13px 'Segoe UI', Tahoma, sans-serif; flex-direction: column; min-height: 0; }
.photo-shell { display: flex; flex: 1; min-height: 0; min-width: 0; }
.photo-toolbar { display: flex; flex-direction: column; gap: 4px; padding: 8px; width: 44px; flex: 0 0 auto; background: #ffffff; border-inline-end: 1px solid #e4e7ec; }
.photo-tool-btn { width: 32px; height: 32px; border: 1px solid transparent; border-radius: 6px; background: transparent; cursor: pointer; font-size: 15px; }
.photo-tool-btn.active { background: #eaf1ff; border-color: #2f6fed; }
.photo-toolbar-sep { height: 1px; background: #e4e7ec; margin: 4px 0; }
/* min-width/height: 0 overrides flex's default min-width:auto (=content's
   intrinsic size) — without it a large canvas forces the WHOLE shell to grow
   to fit it instead of scrolling inside photo-canvas-wrap. */
.photo-center { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.photo-tool-options { display: flex; align-items: center; gap: 16px; padding: 6px 12px; background: #ffffff; border-bottom: 1px solid #e4e7ec; min-height: 36px; flex: 0 0 auto; }
.photo-tool-hint { color: #667085; font-size: 12px; }
.photo-canvas-wrap { flex: 1; min-width: 0; min-height: 0; overflow: auto; background: #d0d5dd; display: flex; align-items: center; justify-content: center; padding: 16px; }
.photo-canvas { background: #ffffff; box-shadow: 0 1px 6px rgba(16,24,40,.2); image-rendering: pixelated; flex: 0 0 auto; }
.photo-right { width: 260px; flex: 0 0 auto; background: #ffffff; border-inline-start: 1px solid #e4e7ec; display: flex; flex-direction: column; overflow-y: auto; }
.photo-doc-title { padding: 10px 12px; font-weight: 600; border-bottom: 1px solid #e4e7ec; }
.photo-panel-header { padding: 8px 12px 4px; font-size: 11px; font-weight: 600; color: #667085; text-transform: uppercase; }
.photo-layers-list { display: flex; flex-direction: column; }
.photo-layer-row { display: flex; align-items: center; gap: 6px; padding: 6px 12px; cursor: pointer; border-bottom: 1px solid #f2f4f7; }
.photo-layer-row.active { background: #eaf1ff; }
.photo-layer-vis { border: 0; background: transparent; cursor: pointer; width: 20px; }
.photo-layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.photo-layer-actions { display: flex; gap: 4px; padding: 6px 12px; border-bottom: 1px solid #e4e7ec; }
.photo-action-btn { width: 26px; height: 26px; border: 1px solid #d0d5dd; border-radius: 4px; background: #fff; cursor: pointer; }
.photo-props { display: flex; flex-direction: column; gap: 10px; padding: 8px 12px 16px; }
.photo-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.photo-field-top { display: flex; justify-content: space-between; }
.photo-field-value { color: #667085; }
.photo-statusbar { flex: 0 0 auto; padding: 4px 12px; font-size: 11px; color: #667085; background: #ffffff; border-top: 1px solid #e4e7ec; }
`
  document.head.append(style)
}
