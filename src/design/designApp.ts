// EXELMJ Design mode — open Illustrator (.ai), PDF and SVG artwork, write
// Arabic text over it naturally, re-edit those texts any time, and export.
//
// Model: the artwork is a READ-ONLY background (canvas via pdf.js for ai/pdf,
// live shadow-DOM svg for svg). The user's text lives in overlay boxes
// (native contenteditable — full Arabic bidi/shaping/caret from Chromium),
// stored in PDF points and persisted to a sidecar <file>.exelmj.json so they
// stay editable forever. Exports produce NEW files (PDF with real vector text
// via pdf-lib, or PNG); the original artwork is never touched. For SVG, the
// file's OWN <text> elements are also editable in place and saved back.
import { getLang, t } from '../i18n/i18n'
import { openArtwork, sniffArtwork, type ArtworkDoc, type ExtractedText, type PageInfo } from './aiBackground'
import { buildCoverPatch, wipeRect } from './inpaint'
import { boxCoveringRun, maxBoxId, newBox, parseProject, serializeProject, sidecarPathFor, type PageBoxes, type TextBox } from './overlayModel'
import { MAX_COLORS, pathsToSvg, scalePathData, traceImage, type TracedPath } from './trace'
import { TraceClient } from './traceWorker'
import {
  cleanImage,
  fitIntoPage,
  cropRectPx,
  paintImage,
  isEmbeddableImage,
  type PageImages,
  type PlacedImage
} from './images'
import {
  arrowHead,
  newShape,
  paintShape,
  shadowRegion,
  shapeBBox,
  shapePaint,
  shapeToPathD,
  shapeTransform,
  SHAPE_KINDS,
  type PageShapes,
  type Shape,
  type ShapeKind
} from './shapes'
import { HandleOverlay } from './handles'
import { NodeEditor } from './nodeEdit'
import { releaseCompound } from './compound'
import { dashPathD, outlineStroke } from './outline'
import { normalize, pathBBox, shiftPathD } from './path'
import {
  cleanSetup,
  defaultSetup,
  DOC_PRESETS,
  fromPt,
  landscape,
  portrait,
  presetIdFor,
  setupToPt,
  type DocSetup,
  type Unit
} from './docSetup'
import {
  applyBoxToShape,
  boxCenter,
  rotatePoint,
  rotatedAABB,
  snapBox,
  strokeScaleFactor,
  transformPathD,
  type Box
} from './transform'
import { orbitInGroup, scaleInGroup, spinInGroup } from './group'
import { expandStagger, pruneInteractions, type Interaction } from './motion'
import { MotionPanel } from '../studio/motionPanel'
import { buildDecls, buildTransform, easingCss } from '../studio/motionCss'
import { groupOf, makeGroup, pruneGroups, resolveSelection, ungroup } from './grouping'
import { contextMenu, type MenuAction, type MenuItem, type MenuState } from './contextMenu'
import { alignDeltas, distributeDeltas, type AlignMode, type DistributeMode } from './align'
import { booleanOp, type BooleanKind } from './boolean'
import {
  boxSelectable,
  dragRect,
  imageSelectable,
  marqueeHits,
  moveSelection,
  shapeSelectable,
  unionBox,
  type Selectable
} from './marquee'
import { emptyStudioDoc, isEmptyStudioDoc, type StudioDoc } from '../studio/model'
import { ColorPanel } from '../studio/colorPanel'
import { BrowserPanel } from '../studio/browserPanel'
import { IconPanel } from '../studio/iconPanel'
import { TemplatePanel } from '../studio/templatePanel'
import { LayoutPanel } from '../studio/layoutPanel'
import { defFromSelection, expandInstance } from '../studio/template'
import { layoutFrame, type LayoutChild } from '../studio/layout'
import type { ComponentDef, Frame } from '../studio/model'
import { keylineShapes, liveArea, presetById, type IconPreset } from '../studio/icon/presets'
import { runStudioTool, type DocumentView } from '../studio/mcpHandlers'
/** Reported in the handoff so a consumer knows which build wrote it. Kept as a
 * literal rather than imported from package.json: the renderer bundle should
 * not pull the manifest in just for a version string. */
const APP_VERSION = '0.4.0'

/** The Studio dock's tabs. Icons, templates and layout join this as they land. */
type StudioTab = 'colors' | 'icons' | 'templates' | 'layout' | 'motion' | 'browser'
import { cssColorToHex, type HandoffInput } from '../studio/handoff'
import { importCapture, type Capture } from '../studio/captureImport'
import { toZip } from '../studio/bundle'
import { toMarkdown } from '../studio/handoff'

/** A one-shot file picker — the app's own openFile() dialog filters to
 * documents, and images need their own accept list. */
function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg'
    input.style.display = 'none'
    document.body.append(input)
    input.addEventListener('change', () => {
      const f = input.files?.[0] ?? null
      input.remove()
      resolve(f)
    })
    input.addEventListener('cancel', () => {
      input.remove()
      resolve(null)
    })
    input.click()
  })
}

/** Blob type from the extension — the decoder needs it to pick a codec. */
function mimeForPath(path: string): string {
  const ext = (/\.([a-z0-9]+)$/i.exec(path)?.[1] ?? '').toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'avif') return 'image/avif'
  return 'image/png'
}

/** Static picture formats the design page can open as artwork. */
export const RASTER_EXT_RE = /\.(png|jpe?g|webp|bmp|gif|avif)$/i

function loadBitmap(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error('image decode failed'))
    im.src = src
  })
}

/** Highest numeric suffix among ids, so new ones never collide after deletes. */
function maxIdSuffix(ids: string[]): number {
  let max = 0
  for (const id of ids) {
    const m = /(\d+)$/.exec(id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** The right-hand palette's tools — 'select' is the resting state. */
/** Palette tools. Deliberately NOT `ShapeKind`: 'path' is produced by the
 * tracer, never drawn by hand, so it must not become a button. */
export type DesignTool =
  | 'select'
  | 'node'
  | 'pen'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'arrow'
  | 'image'
  | 'trace'
  | 'eyedropper'
import { exportOverlayPdf, setPdfColorMode } from './pdfOverlayExport'
import { buildDesignWord } from './wordExport'
import {
  captureRootAttrs,
  commitText,
  inlineTextStyles,
  mountSvg,
  parseSvg,
  serializeSvg,
  svgSizePx,
  textElements,
  textLines,
  type SvgRootAttrs
} from './svgDesign'
import { reportDesignDirty } from '../word/dirtyMux'
import { ICONS } from '../word/icons'

/** 'raster' covers an opened photo/logo AND a blank page started from
 * scratch: both are just a picture the overlay sits on. */
type SourceKind = 'pdf' | 'svg' | 'raster' | null

const FONT_CHOICES = ['Arial', 'Tahoma', 'Segoe UI', 'Calibri', 'Sakkal Majalla', 'Traditional Arabic', 'Simplified Arabic', 'Amiri', 'Cairo']

export class DesignApp {
  private root: HTMLElement
  private toolbar: HTMLElement | null = null
  private stage: HTMLElement | null = null
  private pageEl: HTMLElement | null = null
  private bgCanvas: HTMLCanvasElement | null = null
  private svgHost: HTMLElement | null = null
  private boxLayer: HTMLElement | null = null
  private statusEl: HTMLElement | null = null
  private mounted = false

  private kind: SourceKind = null
  private filePath: string | null = null
  private artworkBytes: Uint8Array | null = null
  private rasterSource: HTMLImageElement | null = null
  private rasterSize: { w: number; h: number } | null = null
  private artwork: ArtworkDoc | null = null
  private svgRoot: SVGSVGElement | null = null
  private pageInfo: PageInfo | null = null
  private page = 1
  private zoom = 1
  private boxes: TextBox[] = []
  /** all artboards' boxes (sidecar schema v2) — this.boxes aliases the current page */
  private allPages: PageBoxes = {}
  private svgOriginalAttrs: SvgRootAttrs | null = null
  private boxIdSeq = 0
  private selectedId: string | null = null
  dirty = false
  private loading = false
  private addMode = false
  private editOriginalMode = false
  private extractedText: ExtractedText[] | null = null
  private hotspotLayer: HTMLElement | null = null
  private layersEl: HTMLElement | null = null
  /** The scrolling half of the layers aside — renderLayers() owns it. */
  private layersListEl: HTMLElement | null = null
  /** The pinned footer: the count, group / ungroup, and the trash. */
  private layersFootEl: HTMLElement | null = null
  /** Groups whose members are showing in the panel. */
  private openGroups = new Set<string>()
  /** The row being dragged, and the band it may be dropped into. */
  private layerDrag: { kind: string; id: string } | null = null
  private toolsEl: HTMLElement | null = null
  private shapeLayer: SVGSVGElement | null = null
  private tool: DesignTool = 'select'
  private shapes: Shape[] = []
  private allShapes: PageShapes = {}
  private shapeIdSeq = 0
  private selectedShapeId: string | null = null
  private shapeStyle = { fill: '#185abd', stroke: '#0f172a', strokeWidth: 2 }
  /**
   * Scale stroke widths WITH the shape — Illustrator's "Scale Strokes &
   * Effects", on by default because it is what resizing an icon means: an
   * icon enlarged four times with hairline strokes is a different icon.
   */
  private scaleStrokes = true
  private images: PlacedImage[] = []
  private allImages: PageImages = {}
  private imageIdSeq = 0
  private selectedImageId: string | null = null
  private imageLayer: HTMLElement | null = null
  /** Resize / rotate / crop grips for whatever is selected. Rebuilt per page. */
  private overlay: HandleOverlay | null = null
  /** Off-thread tracing. Created on first trace, so a user who never traces
   * never pays for the worker. */
  private traceClient: TraceClient | null = null
  private traceJob: { cancel(): void } | null = null
  /** Per-anchor grips for a selected path. Rebuilt per page. */
  private nodeEditor: NodeEditor | null = null
  /** v4 design-system side-table. Stays empty (and unwritten) until used. */
  private studio: StudioDoc = emptyStudioDoc()
  /** The Studio dock (colours now; icons/templates/layout join it). */
  private studioEl: HTMLElement | null = null
  private colorPanel: ColorPanel | null = null
  private browserPanel: BrowserPanel | null = null
  /** Which Studio tab is showing, or null when the dock is closed. */
  private tab: StudioTab | null = null
  /** One container per tab, so a panel is built once and simply shown again. */
  private tabHosts: Record<StudioTab, HTMLElement> = {
    colors: document.createElement('div'),
    icons: document.createElement('div'),
    templates: document.createElement('div'),
    layout: document.createElement('div'),
    motion: document.createElement('div'),
    browser: document.createElement('div')
  }
  private templatePanel: TemplatePanel | null = null
  private layoutPanel: LayoutPanel | null = null
  private selectedFrameId: string | null = null
  /** Ids of every object in a MULTI selection, of any kind. Empty when a
   * single object (or nothing) is selected — the two modes never overlap. */
  private multi = new Set<string>()
  private marqueeEl: SVGRectElement | null = null
  /** Opacity / stroke / corners / shadow for the selected shape(s). */
  private inspectorEl: HTMLElement | null = null
  private frameSeq = 0
  private iconPanel: IconPanel | null = null
  /** Non-printing icon guides for the current artboard. */
  private iconGuides: ReturnType<typeof keylineShapes> = []
  private iconLive: ReturnType<typeof liveArea> | null = null
  private instanceSeq = 0
  private bitmaps = new Map<string, HTMLImageElement>()
  // ---- undo/redo: one serialized snapshot per user action ----
  private undoStack: string[] = []
  private redoStack: string[] = []
  private lastState = '{"boxes":[],"shapes":[],"images":[]}'
  private restoring = false
  /** live settings for the tracer, driven by the «تتبّع» panel */
  private traceOpts = {
    colors: 'auto' as number | 'auto',
    detail: 0.6 as number, // RDP tolerance in px — smaller is more faithful
    smooth: true,
    ignoreBackground: 'auto' as 'auto' | boolean,
    dropColors: [] as [number, number, number][],
    mode: 'color' as 'color' | 'grayscale' | 'bw',
    threshold: 128,
    cornerDeg: 62,
    gradients: true,
    strokes: false,
    /** emit a straight line when a fitted curve is flat within tolerance */
    snapLines: true,
    /** speck size in px to drop; 'auto' scales with the picture */
    noise: 'auto' as number | 'auto'
  }

  /** Named starting points — the capability set of Illustrator's presets,
   * in our own panel. Each entry only OVERRIDES; the rest stays as-is. */
  /** The full preset table Illustrator's Vectorize plugin ships (extracted
   * from its DefaultPreset list) — values are OUR mapping of each preset's
   * intent onto our engine's knobs, not copied numbers. */
  private static readonly TRACE_PRESETS: Record<string, Partial<DesignApp['traceOpts']>> = {
    default: { colors: 'auto', detail: 0.6, smooth: true, mode: 'color', noise: 'auto', threshold: 128, cornerDeg: 62, gradients: true },
    hifi: { colors: 'auto', detail: 0.25, smooth: true, mode: 'color', noise: 2, cornerDeg: 62, gradients: true },
    lofi: { colors: 6, detail: 1.2, smooth: true, mode: 'color', noise: 'auto', cornerDeg: 62, gradients: true },
    // flat-colour presets: a gradient would blur the deliberate posterisation
    c3: { colors: 3, mode: 'color', gradients: false },
    c6: { colors: 6, mode: 'color', gradients: false },
    c16: { colors: 16, mode: 'color', gradients: false },
    gray: { colors: 8, mode: 'grayscale', gradients: true },
    bwlogo: { colors: 2, mode: 'bw', threshold: 128, detail: 0.4, noise: 4, cornerDeg: 62, gradients: false },
    // technical lines: catch every corner, keep every speck of a thin line
    technical: { colors: 2, mode: 'bw', threshold: 160, detail: 0.25, noise: 1, cornerDeg: 42, smooth: true, gradients: false, strokes: true },
    // pencil sketch: darker-only ink, gentle corners so strokes stay organic
    sketch: { colors: 2, mode: 'bw', threshold: 110, detail: 0.5, noise: 2, cornerDeg: 70 },
    // solid black cut-outs: large forms, small specks dropped, few corners
    silhouette: { colors: 2, mode: 'bw', threshold: 190, detail: 0.9, noise: 8, cornerDeg: 75 },
    // darkest strokes only
    lineart: { colors: 2, mode: 'bw', threshold: 60, detail: 0.3, noise: 1, cornerDeg: 45, gradients: false, strokes: true }
  }
  /** The six quick modes Illustrator puts along the top of the panel. */
  private static readonly TRACE_QUICK: Array<[string, string]> = [
    ['default', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="6.4"/><path d="M10 3.6v12.8M3.6 10h12.8"/></svg>'],
    ['hifi', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3" y="4.6" width="14" height="10.8" rx="1.4"/><circle cx="7.4" cy="8.6" r="1.3"/><path d="M3.6 14 8 9.8l3 2.6 2.4-2 3 2.8"/></svg>'],
    ['lofi', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><rect x="3" y="4.6" width="14" height="10.8" rx="1.4"/><path d="M3.4 12.6 8 8.4l3.4 3 2-1.6 3.2 2.8"/></svg>'],
    ['gray', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="3" y="5" width="14" height="10" rx="1.4"/><path d="M6.5 5v10M10 5v10M13.5 5v10" stroke-opacity="0.45"/></svg>'],
    ['bwlogo', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="10" cy="10" r="6.4"/><path d="M10 3.6a6.4 6.4 0 0 1 0 12.8z" fill="currentColor" stroke="none"/></svg>'],
    ['lineart', '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.6 14.4c3-7.2 9.8-9 12.8-8.4"/><path d="M3.6 16.6h12.8"/></svg>']
  ]

  private motionPanel: MotionPanel | null = null
  /** Objects the open motion row touches — outlined while it is open. */
  private motionHighlight = new Set<string>()
  private tracePanel: HTMLElement | null = null
  /** which preset is selected — kept so reopening the panel does not lose it */
  private tracePreset = 'default'
  /** whether the Advanced fold is open, likewise */
  private traceAdvOpen = false
  private previewOn = false
  private previewEl: HTMLElement | null = null
  private previewTimer: number | null = null
  private previewBusy = false
  private previewDirty = false
  /** when set, the next eyedropper pick feeds the tracer, not the fill */
  private pickForTrace = false
  /**
   * Removes the in-flight trace's progressive layers. Held on the instance so
   * a cancel or a failure can undo a draw that a callback already made.
   */
  private tracePreviewCleanup: (() => void) | null = null
  /** the last trace, kept so it can be saved as a standalone .svg */
  private lastTraceSvg: string | null = null
  private dragRect: HTMLElement | null = null
  /** true once Illustrator's own extraction replaced the pdf.js one */
  private usingIllustrator = false
  private svgEditOverlay: HTMLTextAreaElement | null = null

  constructor() {
    this.root = document.getElementById('design-app') as HTMLElement
  }

  mount() {
    if (this.mounted) return
    this.mounted = true
    injectCss()
    const rtl = getLang() === 'ar'
    this.root.dir = rtl ? 'rtl' : 'ltr'
    this.root.innerHTML = ''

    this.toolbar = document.createElement('div')
    this.toolbar.id = 'exelmj-design-toolbar'
    this.root.append(this.toolbar)
    this.buildToolbar()

    // stage + layers panel share a row; the panel lists every element on the
    // artboard so it can be picked, edited and deleted without hunting for it
    const main = document.createElement('div')
    main.id = 'exelmj-design-main'
    this.stage = document.createElement('div')
    this.stage.id = 'exelmj-design-stage'
    // Trackpad pinch arrives as a wheel event with ctrlKey set (Chromium), and
    // Ctrl+wheel is the mouse equivalent — both mean "zoom", not "scroll".
    this.stage.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey) return
        e.preventDefault()
        const factor = Math.exp(-e.deltaY / 320)
        void this.setZoom(this.zoom * factor)
      },
      { passive: false }
    )
    // The breadcrumb bar sits ABOVE the scrolling area, not inside it: it
    // says where you are, and a sign that scrolls out of view is no sign.
    this.crumbEl = document.createElement('div')
    this.crumbEl.className = 'dz-crumbs'
    this.crumbEl.hidden = true
    // Double-click steps INTO a group and OUT again on empty canvas.
    this.stage.addEventListener('dblclick', (e) => this.handleCanvasDoubleClick(e as MouseEvent))
    // Right-click anywhere on the canvas. Bound to the STAGE rather than the
    // whole app so a right-click in the toolbar or the layers panel still
    // gets the system menu instead of canvas actions that make no sense there.
    this.stage.addEventListener('contextmenu', (e) => this.openContextMenu(e as MouseEvent))
    // Anything that moves the world under the menu closes it: a menu left
    // hanging over scrolled-away artwork points at the wrong thing.
    for (const [target, type] of [
      [window, 'pointerdown'],
      [window, 'resize'],
      [window, 'blur'],
      [this.stage, 'scroll']
    ] as const) {
      target.addEventListener(type, (e) => {
        if (type === 'pointerdown' && (e.target as HTMLElement | null)?.closest('.dz-menu')) return
        this.closeContextMenu()
      })
    }
    this.layersEl = document.createElement('aside')
    this.layersEl.id = 'exelmj-design-layers'
    // The layers list SCROLLS; the inspector under it does not. They are two
    // children rather than one because renderLayers() clears its own host on
    // every redraw, and an inspector inside it would be destroyed mid-edit.
    this.layersListEl = document.createElement('div')
    this.layersListEl.className = 'dz-layers-scroll'
    // Appearance controls belong UNDER THE LAYERS PANEL, docked to the object
    // they describe — not in the tool palette, which is for choosing a tool.
    this.inspectorEl = document.createElement('div')
    this.inspectorEl.className = 'dz-inspector'
    this.inspectorEl.hidden = true
    // The footer is pinned BELOW the scrolling list, the way Illustrator's is:
    // the trash has to be reachable however long the list gets.
    this.layersFootEl = document.createElement('div')
    this.layersFootEl.className = 'dz-layers-foot'
    this.layersEl.append(this.layersListEl, this.inspectorEl, this.layersFootEl)
    this.toolsEl = document.createElement('aside')
    this.toolsEl.id = 'exelmj-design-tools'
    // The Studio dock lives beside the layers list: both are inspectors, and
    // keeping them on the same edge leaves the stage one uninterrupted area.
    this.studioEl = document.createElement('aside')
    this.studioEl.id = 'exelmj-design-studio'
    this.studioEl.hidden = true
    // Rebuilt per mount so a remount does not reuse detached nodes.
    this.tabHosts = {
      colors: document.createElement('div'),
      icons: document.createElement('div'),
      templates: document.createElement('div'),
      layout: document.createElement('div'),
      motion: document.createElement('div'),
      browser: document.createElement('div')
    }
    for (const host of Object.values(this.tabHosts)) {
      host.className = 'dz-studio-tab'
      host.hidden = true
      this.studioEl.append(host)
    }
    // RTL: the tools sit on the RIGHT edge, the layers list on the left
    // The crumb bar and the stage share a column so the bar spans the canvas.
    const canvasCol = document.createElement('div')
    canvasCol.id = 'exelmj-design-canvas'
    canvasCol.append(this.crumbEl, this.stage)
    main.append(this.toolsEl, canvasCol, this.layersEl, this.studioEl)
    this.root.append(main)
    this.buildTools()
    this.renderLayers()
    this.renderEmptyState()

    this.statusEl = document.createElement('div')
    this.statusEl.id = 'exelmj-design-status'
    this.root.append(this.statusEl)
    this.setStatus(t('designEmptyHint'))

    // Published into the boot-time capture hook (src/main.ts) — registering a
    // listener HERE would run after Univer's, which swallows Ctrl+Z / Delete
    // even while the sheet is hidden.
    ;(window as unknown as { __exelmjDesignKeys?: (ev: KeyboardEvent) => void }).__exelmjDesignKeys = (e) => {
      if (!this.root.classList.contains('visible')) return
      if (e.key === 'Escape' && this.isolated && !this.menuEl) {
        e.preventDefault()
        e.stopImmediatePropagation()
        this.exitIsolation()
        return
      }
      if (e.key === 'Escape' && this.menuEl) {
        e.preventDefault()
        e.stopImmediatePropagation()
        this.closeContextMenu()
        return
      }
      if (e.key === 'Escape' && this.tool !== 'select') {
        this.setTool('select')
        e.stopImmediatePropagation()
        return
      }
      const inEditable = (e.target as HTMLElement | null)?.closest?.(
        'input, textarea, select, [contenteditable="true"]'
      )
      if ((e.ctrlKey || e.metaKey) && !inEditable) {
        // e.code is the PHYSICAL key — with an Arabic layout the Z key delivers
        // e.key === 'ئ', so matching on the letter never fires for this user
        // Ctrl+0 fits the page, Ctrl+1 is actual size — the two bindings every
        // editor shares, and the fastest way out of "I cannot see my page".
        if (e.code === 'Digit0' || e.code === 'Numpad0') {
          e.preventDefault()
          e.stopImmediatePropagation()
          void this.fitToWindow()
          return
        }
        if (e.code === 'Digit1' || e.code === 'Numpad1') {
          e.preventDefault()
          e.stopImmediatePropagation()
          void this.setZoom(1)
          return
        }
        const z = e.code === 'KeyZ' || e.key.toLowerCase() === 'z'
        const y = e.code === 'KeyY' || e.key.toLowerCase() === 'y'
        if (z && !e.shiftKey) {
          e.preventDefault()
          e.stopImmediatePropagation()
          void this.undo()
          return
        }
        if (y || (z && e.shiftKey)) {
          e.preventDefault()
          e.stopImmediatePropagation()
          void this.redo()
          return
        }
      }
      // Canvas shortcuts, matched on e.code where a LETTER is involved: this
      // user's keyboard is Arabic, so e.key for the A key is 'ش'.
      if ((e.ctrlKey || e.metaKey) && !inEditable) {
        if (e.code === 'KeyA') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.selectAll()
          return
        }
        if (e.code === 'KeyD') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.duplicateSelection()
          return
        }
        if (e.code === 'KeyC') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.copySelection()
          return
        }
        if (e.code === 'KeyX') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.cutSelection()
          return
        }
        if (e.code === 'KeyV') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.pasteClipboard()
          return
        }
        // Figma's z-order bindings: Ctrl+] / Ctrl+[ step, Alt adds "all the
        // way". Matched on e.code so an Arabic layout still reaches them.
        // Ctrl+G groups, Ctrl+Shift+G ungroups — Illustrator's bindings, on
        // e.code because an Arabic layout puts something else on that key.
        if (e.code === 'KeyG') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (e.shiftKey) this.ungroupSelection()
          else this.groupSelection()
          return
        }
        if (e.code === 'BracketRight') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.reorderZ(e.altKey ? 'front' : 'forward')
          return
        }
        if (e.code === 'BracketLeft') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.reorderZ(e.altKey ? 'back' : 'backward')
          return
        }
      }
      // Single-key tool shortcuts, Illustrator's letters. e.code again: on an
      // Arabic layout e.key for V is 'ر'.
      if (!inEditable && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const TOOL_KEYS: Record<string, DesignTool> = {
          KeyV: 'select',
          KeyA: 'node',
          KeyM: 'rect',
          KeyL: 'ellipse',
          Backslash: 'line',
          KeyJ: 'arrow',
          KeyT: 'text',
          KeyP: 'pen',
          KeyO: 'image',
          KeyI: 'eyedropper',
          KeyQ: 'trace'
        }
        const picked = TOOL_KEYS[e.code]
        if (picked) {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.pickTool(picked)
          return
        }
        // Shift+X swaps fill and stroke, X alone switches which is in front.
        if (e.code === 'KeyX') {
          e.preventDefault()
          e.stopImmediatePropagation()
          if (e.shiftKey) this.swapColors()
          else {
            this.activeSwatch = this.activeSwatch === 'fill' ? 'stroke' : 'fill'
            this.syncSwatch()
          }
          return
        }
      }
      if (!inEditable) {
        const STEP = e.shiftKey ? 10 : 1
        const arrows: Record<string, [number, number]> = {
          ArrowLeft: [-STEP, 0],
          ArrowRight: [STEP, 0],
          ArrowUp: [0, -STEP],
          ArrowDown: [0, STEP]
        }
        const move = arrows[e.key]
        if (move && this.selectionIds().length) {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.nudge(move[0], move[1])
          return
        }
        if (e.key === 'Escape' && this.multi.size) {
          e.preventDefault()
          this.clearMulti()
          return
        }
      }
      if (e.key === 'Delete' && this.nodeEditor?.editing) {
        // In node-edit mode Delete belongs to the NODE, not the whole shape —
        // deleting the artwork out from under the editor is never the intent.
        if (this.nodeEditor.deleteSelected()) {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
        return
      }
      // The pen owns Enter and Escape while a path is in progress.
      if (this.tool === 'pen' && this.penPoints.length) {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.commitPen(false)
          return
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.penPoints = []
          this.drawPenPreview()
          this.setTool('select')
          return
        }
      }
      if (e.key === 'Delete' && this.multi.size) {
        const target = e.target as HTMLElement | null
        if (!target?.closest?.('input, textarea, [contenteditable="true"]')) {
          e.preventDefault()
          e.stopImmediatePropagation()
          this.removeMulti()
          return
        }
      }
      if (e.key !== 'Delete' || (!this.selectedId && !this.selectedShapeId && !this.selectedImageId)) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return
      e.stopImmediatePropagation()
      if (this.selectedImageId) this.removeImage(this.selectedImageId)
      else if (this.selectedShapeId) this.removeShape(this.selectedShapeId)
      else if (this.selectedId) this.removeBox(this.selectedId)
    }
  }

  // ---------------- toolbar ----------------
  private controls: Record<string, HTMLElement> = {}

  private buildToolbar() {
    const bar = this.toolbar
    if (!bar) return
    bar.innerHTML = ''
    /** Glyphs this bar needs that the shared word/sheet icon set has none of. */
    const EXTRA: Record<string, string> = {
      outline:
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3.2" y="5.2" width="13.6" height="9.6" rx="1.4"/><rect x="5.6" y="7.6" width="8.8" height="4.8" rx="0.8" stroke-dasharray="2 1.6"/></svg>',
      outlineDash:
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3.2" y="5.2" width="13.6" height="9.6" rx="1.4" stroke-dasharray="3 2"/><path d="M6.4 10h7.2"/></svg>',
      split:
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.6" y="4.4" width="6.4" height="11.2" rx="1"/><rect x="11" y="4.4" width="6.4" height="11.2" rx="1"/></svg>'
    }
    const btn = (key: string, title: string, run: () => void, label?: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-btn'
      b.innerHTML = (EXTRA[key] ?? ICONS[key] ?? '') + (label ? `<span>${label}</span>` : '')
      b.title = title
      b.addEventListener('click', run)
      bar.append(b)
      this.controls[key] = b
      return b
    }
    const sep = () => {
      const s = document.createElement('span')
      s.className = 'dz-sep'
      bar.append(s)
    }

    btn('open', t('designOpen'), () => void this.openDialog(), t('designOpen'))
    btn('save', t('designSaveBoxes'), () => void this.save(), t('designSaveBoxes'))
    btn('pdf', t('designExportPdf'), () => void this.exportPdf(), 'PDF')
    btn('image', t('designExportPng'), () => void this.exportPng(), 'PNG')
    btn('saveAs', t('designExportWord'), () => void this.exportWord(), t('designWordShort'))
    sep()
    const add = btn('new', t('designAddText'), () => {
      this.addMode = !this.addMode
      add.classList.toggle('active', this.addMode)
      this.setStatus(this.addMode ? t('designClickToPlace') : '')
    }, t('designAddText'))
    btn('undo', t('undo'), () => void this.undo())
    btn('redo', t('redo'), () => void this.redo())
    sep()
    btn('new', t('designNewBlank'), () => this.openNewDialog(), t('designNewBlankShort'))
    const editOrig = btn('color', t('designEditOriginal'), () => {
      this.editOriginalMode = !this.editOriginalMode
      editOrig.classList.toggle('active', this.editOriginalMode)
      if (this.editOriginalMode) {
        this.addMode = false
        ;(this.controls.new as HTMLElement | undefined)?.classList.remove('active')
        void this.showTextHotspots()
      } else {
        this.hideTextHotspots()
      }
    }, t('designEditOriginal'))
    this.controls.editOrig = editOrig
    const aiBtn = btn('open', t('designAiBridge'), () => void this.extractViaIllustrator(), t('designAiBridgeShort'))
    aiBtn.style.display = 'none'
    this.controls.aiBridge = aiBtn
    void window.exelmj?.illustratorDetect?.().then((has) => {
      if (has) aiBtn.style.display = ''
    }).catch(() => undefined)
    btn('delTable', t('designDeleteBox'), () => this.selectedId && this.removeBox(this.selectedId))
    // Crop is a MODE, not a gesture: the same four edge grips would otherwise
    // fight the resize grips for the same pixels.
    const cropBtn = btn('image', t('designCrop'), () => this.toggleCrop(), t('designCropShort'))
    this.controls.crop = cropBtn
    // Path tools (M2): only meaningful on a traced/imported path, and they say
    // so rather than silently doing nothing.
    this.controls.nodes = btn('new', t('designNodeEdit'), () => this.toggleNodeEdit(), t('designNodeEditShort'))
    this.controls.release = btn('split', t('designRelease'), () => this.releaseSelected(), t('designReleaseShort'))
    // Distinct glyphs: these two were both drawn as the bold "B", which names
    // neither of them and makes the pair impossible to tell apart.
    this.controls.outline = btn('outline', t('designExpand'), () => this.expandSelection(false), t('designExpandShort'))
    this.controls.expandAppearance = btn(
      'outlineDash',
      t('designExpandAppearance'),
      () => this.expandSelection(true),
      t('designExpandAppearanceShort')
    )
    // The five Studio tabs live in ONE segmented control, not scattered among
    // two dozen toolbar buttons. Before this they were five more anonymous
    // icons in a wrapping wall and the owner could not find the browser at all
    // — a feature nobody can locate is a feature that is not there.
    // Align and distribute. Hidden until two things are selected, because
    // every one of these buttons is a no-op on a single object.
    const alignBar = document.createElement('div')
    alignBar.className = 'dz-alignbar'
    alignBar.hidden = true
    const alignBtn = (mode: AlignMode | DistributeMode, glyph: string, key: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-align-btn'
      b.textContent = glyph
      b.title = t(key)
      b.addEventListener('click', () => this.arrange(mode))
      alignBar.append(b)
    }
    alignBtn('left', '⇤', 'designAlignLeft')
    alignBtn('centerX', '↔', 'designAlignCenterX')
    alignBtn('right', '⇥', 'designAlignRight')
    alignBtn('top', '⇡', 'designAlignTop')
    alignBtn('centerY', '↕', 'designAlignCenterY')
    alignBtn('bottom', '⇣', 'designAlignBottom')
    alignBtn('horizontal', '⇹', 'designDistributeH')
    alignBtn('vertical', '⇳', 'designDistributeV')
    const zBtn = (where: 'front' | 'back', glyph: string, key: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-align-btn'
      b.textContent = glyph
      b.title = t(key)
      b.addEventListener('click', () => this.reorderZ(where))
      alignBar.append(b)
    }
    zBtn('front', '⤒', 'designToFront')
    zBtn('back', '⤓', 'designToBack')
    // Pathfinder: union / subtract / intersect / exclude. Same dz-align-btn
    // glyph-button pattern as align/z-order above — one bar, one language.
    const boolBtn = (op: BooleanKind, glyph: string, key: string) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-align-btn'
      b.textContent = glyph
      b.title = t(key)
      b.addEventListener('click', () => this.applyBoolean(op))
      alignBar.append(b)
    }
    boolBtn('union', '∪', 'designUnion')
    boolBtn('subtract', '−', 'designSubtract')
    boolBtn('intersect', '∩', 'designIntersect')
    boolBtn('exclude', '⊕', 'designExclude')
    bar.append(alignBar)
    this.controls.alignBar = alignBar

    const studioGroup = document.createElement('div')
    studioGroup.className = 'dz-studio-tabs'
    const tabBtn = (key: StudioTab, label: string): HTMLElement => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-studio-tab-btn'
      b.textContent = label
      b.title = label
      b.addEventListener('click', () => void this.openStudioTab(this.tab === key ? null : key))
      studioGroup.append(b)
      return b
    }
    this.controls.studio = tabBtn('colors', t('studioColors'))
    this.controls.icons = tabBtn('icons', t('studioIcons'))
    this.controls.templates = tabBtn('templates', t('studioTemplates'))
    this.controls.layout = tabBtn('layout', t('studioLayout'))
    this.controls.motion = tabBtn('motion', t('motionTab'))
    this.controls.browser = tabBtn('browser', t('studioBrowser'))
    bar.append(studioGroup)
    // The handoff: the whole design as a bundle Claude (or anyone) can rebuild
    // from. Built and tested since M9 but unreachable until now — a feature
    // with no way to invoke it is not delivered.
    btn('saveAs', t('studioExportZip'), () => void this.exportBundle(), t('studioExportZipShort'))
    btn('saveAs', t('studioExportMd'), () => void this.exportHandoffMd(), 'MD')
    sep()

    const fontSel = document.createElement('select')
    fontSel.className = 'dz-font'
    for (const f of FONT_CHOICES) {
      const o = document.createElement('option')
      o.value = f
      o.textContent = f
      o.style.fontFamily = f
      fontSel.append(o)
    }
    fontSel.addEventListener('change', () => this.updateSelected({ font: fontSel.value }))
    bar.append(fontSel)
    this.controls.font = fontSel

    const sizeIn = document.createElement('input')
    sizeIn.type = 'number'
    sizeIn.min = '6'
    sizeIn.max = '200'
    sizeIn.value = '14'
    sizeIn.className = 'dz-size'
    sizeIn.title = t('wordFontSize')
    sizeIn.addEventListener('change', () => this.updateSelected({ sizePt: Number(sizeIn.value) || 14 }))
    bar.append(sizeIn)
    this.controls.size = sizeIn

    const colorIn = document.createElement('input')
    colorIn.type = 'color'
    colorIn.value = '#111111'
    colorIn.title = t('wordTextColor')
    colorIn.addEventListener('input', () => this.updateSelected({ color: colorIn.value }))
    bar.append(colorIn)
    this.controls.color = colorIn

    const boldBtn = btn('bold', t('wordBold'), () => {
      const box = this.selectedBox()
      if (box) {
        this.updateSelected({ bold: !box.bold })
        boldBtn.classList.toggle('active', box.bold)
      }
    })
    sep()

    // Page navigation and zoom are each a UNIT. The toolbar wraps, and a
    // wrapping row split them: the minus landed on one line and the plus with
    // its percentage on another, at opposite ends of the window.
    const group = (): HTMLElement => {
      const g = document.createElement('span')
      g.className = 'dz-btn-group'
      bar.append(g)
      return g
    }

    // page navigation (multi-artboard .ai)
    const pageGroup = group()
    const prev = document.createElement('button')
    prev.type = 'button'
    prev.className = 'dz-btn'
    prev.textContent = '‹'
    prev.title = t('designPrevBoard')
    prev.addEventListener('click', () => void this.gotoPage(this.page - 1))
    const pageLabel = document.createElement('span')
    pageLabel.className = 'dz-page'
    pageLabel.textContent = ''
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'dz-btn'
    next.textContent = '›'
    next.title = t('designNextBoard')
    next.addEventListener('click', () => void this.gotoPage(this.page + 1))
    pageGroup.append(prev, pageLabel, next)
    this.controls.pageLabel = pageLabel
    sep()

    const zoomGroup = group()

    const zoomOut = document.createElement('button')
    zoomOut.type = 'button'
    zoomOut.className = 'dz-btn'
    zoomOut.textContent = '−'
    zoomOut.addEventListener('click', () => void this.setZoom(this.zoom / 1.2))
    const zoomLabel = document.createElement('span')
    zoomLabel.className = 'dz-page'
    zoomLabel.textContent = '100%'
    const zoomIn = document.createElement('button')
    zoomIn.type = 'button'
    zoomIn.className = 'dz-btn'
    zoomIn.textContent = '+'
    zoomIn.addEventListener('click', () => void this.setZoom(this.zoom * 1.2))
    // Fit sits INSIDE the zoom group, between the two steppers, because it is
    // the zoom you want most often and hunting for it in a wall of icons is
    // the reason people give up and scroll a document they cannot see.
    const fit = document.createElement('button')
    fit.type = 'button'
    fit.className = 'dz-btn'
    fit.textContent = '⤢'
    fit.title = `${t('designFit')} (Ctrl+0)`
    fit.addEventListener('click', () => void this.fitToWindow())
    zoomGroup.append(zoomOut, zoomLabel, zoomIn, fit)
    this.controls.zoomLabel = zoomLabel
    this.controls.fit = fit
    this.syncToolbar()
  }

  /**
   * What the canvas says when there is nothing on it.
   *
   * It used to be an empty grey area with one sentence in the status bar at
   * the very bottom of the window — the last place anybody looks. A person
   * opening this page for the first time had no way to know that "new" even
   * existed. This is the two things you can do, on the canvas, where you are
   * already looking.
   */
  private renderEmptyState() {
    if (!this.stage) return
    this.stage.querySelector('.dz-empty')?.remove()
    if (this.pageInfo) return
    const wrap = document.createElement('div')
    wrap.className = 'dz-empty'
    const title = document.createElement('div')
    title.className = 'dz-empty-title'
    title.textContent = t('designEmptyTitle')
    const row = document.createElement('div')
    row.className = 'dz-empty-actions'
    const act = (label: string, hint: string, primary: boolean, run: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `dz-empty-btn${primary ? ' primary' : ''}`
      const strong = document.createElement('b')
      strong.textContent = label
      const small = document.createElement('span')
      small.textContent = hint
      b.append(strong, small)
      b.addEventListener('click', run)
      row.append(b)
    }
    act(t('designNewBlankShort'), t('designEmptyNewHint'), true, () => this.openNewDialog())
    act(t('designOpen'), t('designEmptyOpenHint'), false, () => void this.openDialog())
    wrap.append(title, row)
    this.stage.append(wrap)
  }

  /**
   * Zoom so the whole page is visible.
   *
   * A new 1080pt document opened at 100% in a 614pt stage, so the first thing
   * you saw of the document you had just made was its top half. Every editor
   * fits on open; this one did not, and there was no button to ask for it.
   */
  async fitToWindow() {
    if (!this.stage || !this.pageInfo) return
    // Slack for the shadow and a little breathing room, so the page does not
    // touch the panels on either side.
    const PAD = 48
    const w = (this.stage.clientWidth - PAD) / Math.max(1, this.pageInfo.cssWidth)
    const h = (this.stage.clientHeight - PAD) / Math.max(1, this.pageInfo.cssHeight)
    await this.setZoom(Math.min(w, h))
  }

  /**
   * Grey out what cannot work yet.
   *
   * The right-click menu already does this and the toolbar did not: with an
   * empty canvas and nothing selected, eleven buttons still looked live —
   * export, expand, split, node-edit, crop. Pressing one did nothing at all,
   * which teaches the user that the toolbar is decorative.
   */
  private syncToolbar() {
    this.renderEmptyState()
    const hasDoc = !!this.pageInfo
    const sel = this.selectionIds().length
    const isPath = this.selectedShape()?.kind === 'path'
    const isImage = !!this.selectedImage()
    const isPdf = this.kind === 'pdf' && !!this.artwork
    const set = (key: string, on: boolean) => {
      const b = this.controls[key] as HTMLButtonElement | undefined
      if (b) b.disabled = !on
    }
    for (const key of ['save', 'pdf', 'image', 'new', 'zoomLabel']) set(key, hasDoc)
    set('fit', hasDoc)
    set('saveAs', isPdf)
    set('editOrig', isPdf)
    set('crop', isImage)
    set('nodes', isPath)
    set('release', isPath)
    set('outline', sel > 0)
    set('expandAppearance', sel > 0)
    set('delTable', sel > 0)
    const bar = this.controls.alignBar as HTMLElement | undefined
    if (bar) bar.hidden = sel < 1
  }

  private setStatus(msg: string) {
    if (this.statusEl) this.statusEl.textContent = msg
  }

  // ---------------- open ----------------
  async openDialog() {
    if (!window.exelmj) return
    const res = await window.exelmj.openFile().catch(() => null)
    if (!res) return
    await this.openViaBytes(res.path, res.bytes)
  }

  async openPath(path: string) {
    if (!window.exelmj) return
    const res = await window.exelmj.readFile(path).catch(() => null)
    if (res) await this.openViaBytes(res.path, res.bytes)
  }

  async openViaBytes(path: string, bytes: Uint8Array) {
    this.loading = true
    try {
      await this.reset()
      this.filePath = path
      if (/\.svg$/i.test(path)) {
        await this.openSvg(bytes)
      } else if (RASTER_EXT_RE.test(path)) {
        await this.openRaster(bytes, path)
      } else {
        const kind = sniffArtwork(bytes)
        if (kind !== 'pdf') {
          alert(t('designEpsMessage'))
          this.filePath = null
          return
        }
        await this.openPdfLike(bytes)
      }
      await this.loadSidecar()
      this.renderBoxes()
      this.renderShapes()
      this.renderImages()
      this.renderLayers()
      // Opened artwork is fitted too: an A3 poster at 100% shows a corner.
      await this.fitToWindow()
      this.setDirty(false)
      this.updateTitle()
      this.syncToolbar()
    } catch (err) {
      console.warn('[design] open failed', err)
      alert(t('designOpenFailed'))
    } finally {
      this.loading = false
    }
  }

  private async reset() {
    await this.artwork?.destroy().catch(() => undefined)
    // a live trace panel belongs to the PREVIOUS document — drop it, or the
    // stale reference makes the next toolbar click "close" a ghost panel
    this.tracePanel?.remove()
    this.tracePanel = null
    this.clearPreview()
    this.previewOn = false
    this.pickForTrace = false
    this.artwork = null
    this.artworkBytes = null
    this.rasterSource = null
    this.rasterSize = null
    this.undoStack = []
    this.redoStack = []
    this.lastState = this.captureState()
    this.svgRoot = null
    this.svgOriginalAttrs = null
    this.kind = null
    this.boxes = []
    this.allPages = {}
    this.shapes = []
    this.allShapes = {}
    this.images = []
    this.allImages = {}
    this.extractedText = null
    this.usingIllustrator = false
    this.editOriginalMode = false
    this.hotspotLayer = null
    ;(this.controls.editOrig as HTMLElement | undefined)?.classList.remove('active')
    this.selectedId = null
    this.page = 1
    this.zoom = 1
    if (this.stage) this.stage.innerHTML = ''
    this.pageEl = null
    this.bgCanvas = null
    this.svgHost = null
    this.boxLayer = null
    this.shapeLayer = null
    this.imageLayer = null
  }

  private buildPage(cssWidth: number, cssHeight: number) {
    if (!this.stage) return
    this.stage.innerHTML = ''
    this.pageEl = document.createElement('div')
    this.pageEl.className = 'dz-pagewrap'
    this.pageEl.style.width = `${cssWidth}px`
    this.pageEl.style.height = `${cssHeight}px`
    this.stage.append(this.pageEl)
    this.boxLayer = document.createElement('div')
    this.boxLayer.className = 'dz-boxlayer'
    // shapes sit UNDER the text boxes: text stays clickable on top of a fill
    this.shapeLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    this.shapeLayer.setAttribute('class', 'dz-shapelayer')
    this.imageLayer = document.createElement('div')
    this.imageLayer.className = 'dz-imglayer'
    // One overlay drives resize / rotate / crop for BOTH shapes and images —
    // see handles.ts for why they cannot each own their own grips.
    this.overlay?.destroy()
    this.overlay = new HandleOverlay(this.pageEl, () => this.pxPerPt(), {
      onResize: (box) => this.applyOverlayResize(box),
      onMove: (box) => this.applyOverlayMove(box),
      onShiftPick: (x, y) => this.shiftPickAt(x, y),
      onRotate: (deg) => this.applyOverlayRotation(deg),
      onCrop: (crop) => this.applyOverlayCrop(crop),
      onCommit: () => {
        // The gesture is over: the next one must measure from where the
        // objects ended up, not from where this one found them.
        this.groupStart = null
        this.renderLayers()
        this.syncOverlay()
        this.setDirty(true)
      },
      snapTargets: () => this.snapTargets()
    })
    this.nodeEditor?.destroy()
    this.nodeEditor = new NodeEditor(this.pageEl, () => this.pxPerPt(), {
      onChange: (d) => this.applyNodeEdit(d),
      onCommit: () => {
        this.renderLayers()
        this.setDirty(true)
      }
    })
    this.pageEl.addEventListener('pointerdown', (e) => {
      if (this.editOriginalMode) {
        this.beginCoverDrag(e)
        return
      }
      if (SHAPE_KINDS.includes(this.tool as ShapeKind)) {
        this.beginShapeDraw(e, this.tool as ShapeKind)
        return
      }
      if (this.tool === 'eyedropper') {
        this.pickColorAt(e)
        return
      }
      if (this.tool === 'pen') {
        this.penClick(e)
        return
      }
      if (!this.addMode) {
        if (e.target === this.pageEl || e.target === this.bgCanvas || e.target === this.svgHost) {
          this.select(null)
          this.selectShape(null)
          this.selectImage(null)
          // A press on empty canvas with the select tool starts a MARQUEE.
          // It only becomes one once the pointer has actually travelled — a
          // click that wobbled must stay a click that cleared the selection.
          if (this.tool === 'select') this.beginMarquee(e)
        }
        return
      }
      const rect = this.pageEl!.getBoundingClientRect()
      const pxPerPt = this.pxPerPt()
      const x = (e.clientX - rect.left) / pxPerPt
      const y = (e.clientY - rect.top) / pxPerPt
      this.addMode = false
      ;(this.controls.new as HTMLElement | undefined)?.classList.remove('active')
      this.addBoxAt(x, y)
    })
  }

  private pxPerPt(): number {
    if (!this.pageInfo || !this.pageEl) return 1
    return this.pageEl.getBoundingClientRect().width / this.pageInfo.widthPt
  }

  /**
   * Open a plain picture as the artwork. The page is the image's own pixel
   * size taken as points (1px = 1pt), which keeps everything the overlay does —
   * colour sampling, patches, exports — working unchanged, because they all
   * read this.bgCanvas.
   */
  private async openRaster(bytes: Uint8Array, path: string) {
    const type = mimeForPath(path)
    const blob = new Blob([bytes as unknown as BlobPart], { type })
    const url = URL.createObjectURL(blob)
    try {
      const bm = await loadBitmap(url)
      this.rasterSource = bm
      this.kind = 'raster'
      this.rasterSize = { w: bm.naturalWidth, h: bm.naturalHeight }
      // a 4000px photo at 100% would open far off-screen — fit it first
      const box = this.stage?.getBoundingClientRect()
      if (box && box.width > 40) {
        const fit = Math.min((box.width - 60) / bm.naturalWidth, (box.height - 60) / bm.naturalHeight)
        this.zoom = Math.max(0.1, Math.min(1, fit))
      }
      await this.renderRasterPage()
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  /** A blank artboard to design on from nothing. */
  async newBlank(widthPt = 595.28, heightPt = 841.89) {
    await this.reset()
    this.filePath = null
    this.kind = 'raster'
    this.rasterSource = null
    this.rasterSize = { w: Math.round(widthPt), h: Math.round(heightPt) }
    await this.renderRasterPage()
    // Fitted, not at 100%: a 1080pt page in a 600pt stage otherwise opens
    // showing its top half and nothing says why.
    await this.fitToWindow()
    this.setDirty(false)
    this.updateTitle()
    this.syncToolbar()
    this.setStatus(t('designBlankReady'))
  }

  private async renderRasterPage() {
    if (!this.stage || !this.rasterSize) return
    const { w, h } = this.rasterSize
    const css = { width: w * this.zoom, height: h * this.zoom }
    this.pageInfo = {
      widthPt: w,
      heightPt: h,
      cssWidth: Math.round(css.width),
      cssHeight: Math.round(css.height),
      isA4: false
    }
    this.buildPage(this.pageInfo.cssWidth, this.pageInfo.cssHeight)
    const canvas = document.createElement('canvas')
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(this.pageInfo.cssWidth * dpr))
    canvas.height = Math.max(1, Math.round(this.pageInfo.cssHeight * dpr))
    canvas.style.width = `${this.pageInfo.cssWidth}px`
    canvas.style.height = `${this.pageInfo.cssHeight}px`
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (ctx) {
      // a blank page is white paper; a photo is drawn to fill the page exactly
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (this.rasterSource) ctx.drawImage(this.rasterSource, 0, 0, canvas.width, canvas.height)
    }
    this.bgCanvas = canvas
    this.bgCanvas.className = 'dz-bg'
    this.pageEl!.append(this.bgCanvas, this.shapeLayer!, this.imageLayer!, this.boxLayer!)
    const pl = this.controls.pageLabel
    if (pl) pl.textContent = ''
    const zl = this.controls.zoomLabel
    if (zl) zl.textContent = `${Math.round(this.zoom * 100)}%`
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    if (this.previewOn) this.schedulePreview()
    this.setStatus(`${w}×${h} pt`)
  }

  private async openPdfLike(bytes: Uint8Array) {
    this.kind = 'pdf'
    this.artworkBytes = bytes
    this.artwork = await openArtwork(bytes)
    if (await this.artwork.noPdfContent()) {
      alert(t('designNoPdfContent'))
    }
    await this.renderPdfPage()
  }

  private async renderPdfPage() {
    if (!this.artwork || !this.stage) return
    const scale = 1.35 * this.zoom
    const probeCanvas = document.createElement('canvas')
    const info = await this.artwork.render(this.page, probeCanvas, scale)
    this.pageInfo = info
    this.buildPage(info.cssWidth, info.cssHeight)
    this.bgCanvas = probeCanvas
    this.bgCanvas.className = 'dz-bg'
    this.pageEl!.append(this.bgCanvas, this.shapeLayer!, this.imageLayer!, this.boxLayer!)
    const pl = this.controls.pageLabel
    if (pl) pl.textContent = this.artwork.pages > 1 ? `${this.page} / ${this.artwork.pages}` : ''
    const zl = this.controls.zoomLabel
    if (zl) zl.textContent = `${Math.round(this.zoom * 100)}%`
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    if (!this.usingIllustrator) this.extractedText = null
    if (this.editOriginalMode) void this.showTextHotspots()
    this.setStatus(info.isA4 ? 'A4' : `${Math.round(info.widthPt)}×${Math.round(info.heightPt)} pt`)
  }

  private async openSvg(bytes: Uint8Array) {
    this.kind = 'svg'
    const source = new TextDecoder('utf-8').decode(bytes)
    const svg = parseSvg(source)
    const size = svgSizePx(svg)
    // svg user units ≈ pt for our purposes; page info drives the box layer
    this.pageInfo = {
      widthPt: size.width,
      heightPt: size.height,
      cssWidth: size.width,
      cssHeight: size.height,
      isA4: false
    }
    this.buildPage(size.width, size.height)
    this.svgHost = document.createElement('div')
    this.svgHost.className = 'dz-bg dz-svg'
    this.pageEl!.append(this.svgHost, this.shapeLayer!, this.imageLayer!, this.boxLayer!)
    this.svgOriginalAttrs = captureRootAttrs(svg)
    this.svgRoot = mountSvg(this.svgHost, svg)
    this.svgRoot.setAttribute('width', '100%')
    this.svgRoot.setAttribute('height', '100%')
    if (!this.svgRoot.getAttribute('viewBox')) {
      this.svgRoot.setAttribute('viewBox', `0 0 ${size.width} ${size.height}`)
    }
    this.installSvgTextEditing()
    const pl = this.controls.pageLabel
    if (pl) pl.textContent = ''
    this.setStatus(t('designSvgHint'))
  }

  /** Double-click any of the SVG's own texts → overlay editor at its rect. */
  private installSvgTextEditing() {
    if (!this.svgHost || !this.svgRoot) return
    this.svgHost.addEventListener('dblclick', (e) => {
      if (!this.svgRoot) return
      const path = e.composedPath()
      const textEl = path.find(
        (n): n is SVGTextElement => n instanceof SVGElement && n.tagName === 'text'
      )
      if (!textEl || !textElements(this.svgRoot).includes(textEl)) return
      e.preventDefault()
      this.openSvgTextEditor(textEl)
    })
  }

  private openSvgTextEditor(textEl: SVGTextElement) {
    this.closeSvgTextEditor()
    inlineTextStyles(textEl)
    const rect = textEl.getBoundingClientRect()
    const stageRect = this.stage!.getBoundingClientRect()
    const cs = getComputedStyle(textEl)
    const ta = document.createElement('textarea')
    ta.className = 'dz-svgedit'
    ta.value = textLines(textEl).join('\n')
    ta.dir = 'auto'
    ta.lang = 'ar'
    Object.assign(ta.style, {
      left: `${rect.left - stageRect.left + this.stage!.scrollLeft}px`,
      top: `${rect.top - stageRect.top + this.stage!.scrollTop - 2}px`,
      minWidth: `${Math.max(rect.width + 30, 120)}px`,
      height: `${Math.max(rect.height + 14, 34)}px`,
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      color: cs.fill && cs.fill !== 'none' ? cs.fill : '#111'
    })
    const original = textEl.style.visibility
    textEl.style.visibility = 'hidden'
    const commit = () => {
      textEl.style.visibility = original
      if (ta.value !== textLines(textEl).join('\n')) {
        commitText(textEl, ta.value)
        this.setDirty(true)
      }
      this.closeSvgTextEditor()
    }
    ta.addEventListener('blur', commit)
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        ta.value = textLines(textEl).join('\n')
        ta.blur()
      }
      e.stopPropagation()
    })
    this.stage!.append(ta)
    this.svgEditOverlay = ta
    ta.focus()
    ta.select()
  }

  private closeSvgTextEditor() {
    this.svgEditOverlay?.remove()
    this.svgEditOverlay = null
  }

  // ---------------- overlay boxes ----------------
  private addBoxAt(xPt: number, yPt: number) {
    const rtl = getLang() === 'ar'
    const box = newBox(`box-${++this.boxIdSeq}`, xPt, yPt, rtl)
    const fontSel = this.controls.font as HTMLSelectElement | undefined
    const sizeIn = this.controls.size as HTMLInputElement | undefined
    const colorIn = this.controls.color as HTMLInputElement | undefined
    if (fontSel?.value) box.font = fontSel.value
    if (sizeIn?.value) box.sizePt = Number(sizeIn.value) || 14
    if (colorIn?.value) box.color = colorIn.value
    this.boxes.push(box)
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    this.select(box.id)
    this.setDirty(true)
    // focus the fresh editable
    const el = this.boxLayer?.querySelector<HTMLElement>(`[data-box="${box.id}"] .dz-text`)
    el?.focus()
  }

  private removeBox(id: string) {
    this.boxes = this.boxes.filter((b) => b.id !== id)
    if (this.selectedId === id) this.selectedId = null
    this.multi.delete(id)
    this.pruneGroupsNow()
    this.pruneMotionNow()
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    this.renderLayers()
    this.setDirty(true)
  }

  private selectedBox(): TextBox | null {
    return this.boxes.find((b) => b.id === this.selectedId) ?? null
  }

  private select(id: string | null) {
    this.selectedId = id
    for (const el of this.boxLayer?.querySelectorAll('.dz-box') ?? []) {
      el.classList.toggle('selected', (el as HTMLElement).dataset.box === id)
    }
    const box = this.selectedBox()
    if (box) {
      const fontSel = this.controls.font as HTMLSelectElement
      const sizeIn = this.controls.size as HTMLInputElement
      const colorIn = this.controls.color as HTMLInputElement
      if (fontSel) fontSel.value = FONT_CHOICES.includes(box.font) ? box.font : FONT_CHOICES[0]
      if (sizeIn) sizeIn.value = String(box.sizePt)
      if (colorIn) colorIn.value = box.color
      this.controls.bold?.classList.toggle('active', box.bold)
    }
    for (const row of this.layersEl?.querySelectorAll('.dz-layer') ?? []) {
      row.classList.toggle('selected', (row as HTMLElement).dataset.box === id)
    }
  }

  private updateSelected(patch: Partial<TextBox>) {
    const box = this.selectedBox()
    if (!box) return
    Object.assign(box, patch)
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    this.select(box.id)
    this.setDirty(true)
  }

  private isEditingText(): boolean {
    const el = document.activeElement
    return !!el && (el.classList?.contains('dz-text') || el.classList?.contains('dz-svgedit'))
  }

  private renderBoxes() {
    const layer = this.boxLayer
    if (!layer || !this.pageInfo) return
    layer.innerHTML = ''
    const pxPerPt = this.pxPerPt()
    for (const box of this.boxes) {
      if (box.cover) {
        const patch = document.createElement('div')
        patch.className = 'dz-patch'
        Object.assign(patch.style, {
          left: `${box.cover.x * pxPerPt}px`,
          top: `${box.cover.y * pxPerPt}px`,
          width: `${box.cover.w * pxPerPt}px`,
          height: `${box.cover.h * pxPerPt}px`,
          background: box.cover.bg,
          // the reconstruction, stretched over the same rect it was built from
          backgroundImage: box.cover.img ? `url("${box.cover.img}")` : 'none',
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat'
        })
        layer.append(patch)
      }
      const wrap = document.createElement('div')
      wrap.className = 'dz-box'
      wrap.dataset.box = box.id
      if (box.id === this.selectedId) wrap.classList.add('selected')
      if (this.isDimmed(box.id)) wrap.classList.add('dimmed')
      const anchorX = box.x * pxPerPt
      Object.assign(wrap.style, {
        top: `${box.y * pxPerPt}px`,
        ...(box.align === 'right'
          ? { right: `${(this.pageInfo.widthPt - box.x) * pxPerPt}px` }
          : box.align === 'center'
            ? { left: `${anchorX}px`, transform: 'translateX(-50%)' }
            : { left: `${anchorX}px` })
      })
      const handle = document.createElement('div')
      handle.className = 'dz-handle'
      handle.title = t('designDragHint')
      this.installDrag(handle, box)
      const text = document.createElement('div')
      text.className = 'dz-text'
      text.contentEditable = 'true'
      text.dir = 'auto'
      text.lang = 'ar'
      text.innerText = box.text
      Object.assign(text.style, {
        fontFamily: `'${box.font}', 'Segoe UI', Tahoma, sans-serif`,
        fontSize: `${box.sizePt * pxPerPt}px`,
        color: box.color,
        fontWeight: box.bold ? '700' : '400',
        textAlign: box.align,
        ...(box.width > 0 ? { width: `${box.width * pxPerPt}px` } : {})
      })
      text.addEventListener('focus', () => this.select(box.id))
      text.addEventListener('input', () => {
        box.text = text.innerText
        this.setDirty(true)
      })
      wrap.append(handle, text)
      layer.append(wrap)
    }
  }

  private installDrag(handle: HTMLElement, box: TextBox) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      // A grouped text box moves with its group, like every other member.
      if (this.selectWholeGroup(e, box.id)) return
      if (this.multi.has(box.id)) {
        this.beginMultiDrag(e)
        return
      }
      this.select(box.id)
      handle.setPointerCapture(e.pointerId)
      const startX = e.clientX
      const startY = e.clientY
      const origX = box.x
      const origY = box.y
      const pxPerPt = this.pxPerPt()
      const move = (ev: PointerEvent) => {
        box.x = origX + (ev.clientX - startX) / pxPerPt
        box.y = origY + (ev.clientY - startY) / pxPerPt
        // move the wrapper directly — a full re-render would tear down the
        // captured handle mid-drag
        const wrap = this.boxLayer?.querySelector<HTMLElement>(`[data-box="${box.id}"]`)
        if (wrap && this.pageInfo) {
          wrap.style.top = `${box.y * pxPerPt}px`
          if (box.align === 'right') wrap.style.right = `${(this.pageInfo.widthPt - box.x) * pxPerPt}px`
          else wrap.style.left = `${box.x * pxPerPt}px`
        }
      }
      const up = (ev: PointerEvent) => {
        handle.releasePointerCapture(ev.pointerId)
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        this.renderBoxes()
    this.renderShapes()
    this.renderImages()
        this.select(box.id)
        this.setDirty(true)
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
    this.renderLayers()
  }

  // ---------------- tool palette (right edge) ----------------

  /** Our own glyphs — deliberately NOT Adobe's artwork, only the behaviour. */
  private static readonly TOOL_ICONS: Record<DesignTool, string> = {
    select:
      '<svg viewBox="0 0 20 20" fill="currentColor"><path d="M5 2.6a.6.6 0 0 1 .95-.49l9.2 6.5c.5.36.28 1.15-.33 1.2l-4.06.3a.6.6 0 0 0-.43.24l-2.4 3.3c-.36.5-1.15.28-1.2-.33z"/></svg>',
    // Illustrator's white arrow: the DIRECT selection tool, for nodes.
    node:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M5.4 2.4 5.9 14l2.5-3.1 4.3-.3z"/><rect x="13.2" y="12.4" width="4" height="4" rx="0.5" fill="currentColor"/></svg>',
    text:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4.5h12M10 4.5v11M7.5 15.5h5"/></svg>',
    pen:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M13.4 2.9 17 6.5l-8.6 8.6-4.4.8.8-4.4z"/><path d="M11.8 4.5 15.4 8.1"/></svg>',
    rect: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.2" y="4.8" width="13.6" height="10.4" rx="1.2"/></svg>',
    ellipse:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="10" cy="10" rx="6.8" ry="5.2"/></svg>',
    line: '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 15.5 16 4.5"/></svg>',
    arrow:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16 15 5"/><path d="M9.5 4.6H15.4V10.5"/></svg>',
    trace:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M3.6 13.4c2.6-6.6 6.4-9 12.8-8.2"/><circle cx="4.2" cy="14.6" r="1.6"/><circle cx="16.4" cy="4.6" r="1.6"/><path d="M8.6 15.8h7.8M12.5 13.6l-3.9 2.2 3.9 2.2"/></svg>',
    image:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2.8" y="4.2" width="14.4" height="11.6" rx="1.4"/><circle cx="7.2" cy="8.4" r="1.3" fill="currentColor" stroke="none"/><path d="M3.4 14.2 7.8 10.4l3 2.6 2.6-2.2 3.2 3"/></svg>',
    eyedropper:
      '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13.4 3.4a2 2 0 0 1 2.8 2.8l-1.1 1.1 1 1-1.4 1.4-1-1-5.1 5.1-2.8.7.7-2.8 5.1-5.1-1-1L12 4.2l1 1z"/></svg>'
  }

  private buildTools() {
    const el = this.toolsEl
    if (!el) return
    el.innerHTML = ''
    // TWO COLUMNS, Illustrator-style. Ten tools, each with its single-key
    // shortcut in the tooltip — the shortcuts are what make a palette faster
    // than a menu, and a palette without them is just a smaller menu.
    const grid = document.createElement('div')
    grid.className = 'dz-tool-grid'
    const TOOLS: Array<{ tool: DesignTool; key: string }> = [
      // The pen sits in the top row BESIDE the main pointer: those two are
      // the pair a drawing session actually alternates between, and the grid
      // fills row by row, so slot 2 is the one next to select.
      { tool: 'select', key: 'V' },
      { tool: 'pen', key: 'P' },
      { tool: 'node', key: 'A' },
      { tool: 'rect', key: 'M' },
      { tool: 'ellipse', key: 'L' },
      { tool: 'line', key: '\\' },
      { tool: 'text', key: 'T' },
      { tool: 'image', key: 'O' },
      { tool: 'eyedropper', key: 'I' },
      { tool: 'trace', key: 'Q' }
    ]
    for (const { tool, key } of TOOLS) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-tool'
      b.dataset.tool = tool
      b.innerHTML = DesignApp.TOOL_ICONS[tool]
      b.title = `${t(`designTool_${tool}`)}  (${key})`
      b.addEventListener('click', () => this.pickTool(tool))
      grid.append(b)
    }
    el.append(grid)

    const sep = document.createElement('div')
    sep.className = 'dz-tool-sep'
    el.append(sep)

    // THE FILL / STROKE SWATCH, Illustrator's shape: a filled square with an
    // outlined square overlapping it. Which one is IN FRONT is which one the
    // colour controls edit — that is the whole convention, and it is why this
    // is one control rather than two labelled inputs.
    const swatch = document.createElement('div')
    swatch.className = 'dz-swatch'
    const make = (key: 'fill' | 'stroke'): HTMLElement => {
      const box = document.createElement('button')
      box.type = 'button'
      box.className = `dz-swatch-box dz-swatch-${key}`
      box.title = t(key === 'fill' ? 'designShapeFill' : 'designShapeStroke')
      const chip = document.createElement('span')
      chip.className = 'dz-swatch-chip'
      box.append(chip)
      // Clicking BRINGS IT FORWARD; clicking the one already in front opens
      // the picker. Two jobs on one control, the same as Illustrator.
      box.addEventListener('click', () => {
        if (this.activeSwatch !== key) {
          this.activeSwatch = key
          this.syncSwatch()
          return
        }
        this.openColorPicker(key)
      })
      swatch.append(box)
      this.controls[`swatch_${key}`] = box
      return box
    }
    make('stroke')
    make('fill')

    for (const key of ['fill', 'stroke'] as const) {
      const input = document.createElement('input')
      input.type = 'color'
      input.className = 'dz-swatch-input'
      input.value = this.shapeStyle[key]
      input.addEventListener('input', () => {
        this.shapeStyle[key] = input.value
        this.applyStyleToSelection(key, input.value)
        this.syncSwatch()
      })
      swatch.append(input)
      this.controls[`shape_${key}`] = input
    }
    el.append(swatch)

    // The two switches every vector tool has under the swatch.
    const swaps = document.createElement('div')
    swaps.className = 'dz-swatch-actions'
    const act = (label: string, title: string, run: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-swatch-act'
      b.textContent = label
      b.title = title
      b.addEventListener('click', run)
      swaps.append(b)
    }
    act('⇄', t('designSwapColors'), () => this.swapColors())
    act('∅', t('designNoColor'), () => this.clearActiveColor())
    el.append(swaps)

    this.syncToolButtons()
    this.syncSwatch()
    this.renderInspector()
  }

  /** Which of the two swatches the colour controls edit. */
  private activeSwatch: 'fill' | 'stroke' = 'fill'

  /**
   * Open the native colour dialog for one of the two swatches.
   *
   * `showPicker()` rather than `click()`: the real <input type=color> is a
   * 1px transparent stand-in parked behind the swatch, and Chromium ignores a
   * synthetic click on an input that small — the dialog simply never appeared,
   * which is exactly what "changing the colour does nothing" looked like.
   */
  private openColorPicker(key: 'fill' | 'stroke') {
    const input = this.controls[`shape_${key}`] as HTMLInputElement | undefined
    if (!input) return
    const picker = input as HTMLInputElement & { showPicker?: () => void }
    if (typeof picker.showPicker === 'function') {
      try {
        picker.showPicker()
        return
      } catch {
        /* not user-activated — fall through to the click path */
      }
    }
    input.click()
  }

  /**
   * Route a palette click.
   *
   * Three of the ten are ACTIONS rather than modes — image opens a file
   * picker, trace opens its panel, and node enters the path editor — so they
   * must not leave the palette showing a mode the canvas is not in.
   */
  private pickTool(tool: DesignTool) {
    if (tool === 'image') {
      void this.insertImage()
      return
    }
    if (tool === 'trace') {
      this.toggleTracePanel()
      return
    }
    if (tool === 'node') {
      this.setTool('select')
      this.toggleNodeEdit()
      return
    }
    if (tool === 'pen') {
      this.setTool('pen')
      this.penPoints = []
      this.setStatus(t('designPenHint'))
      return
    }
    if (tool === 'text') {
      // The text tool is the existing add-mode: the next canvas click places a
      // box. Reusing it keeps ONE code path for placing text.
      this.setTool('select')
      this.addMode = true
      ;(this.controls.new as HTMLElement | undefined)?.classList.add('active')
      this.setStatus(t('designClickToPlace'))
      this.syncToolButtons()
      return
    }
    this.addMode = false
    ;(this.controls.new as HTMLElement | undefined)?.classList.remove('active')
    this.setTool(tool)
  }

  /** Paint the swatch: colours, and which box is in front. */
  private syncSwatch() {
    for (const key of ['fill', 'stroke'] as const) {
      const box = this.controls[`swatch_${key}`] as HTMLElement | undefined
      if (!box) continue
      const chip = box.querySelector<HTMLElement>('.dz-swatch-chip')
      const colour = this.shapeStyle[key]
      if (chip) {
        // An EMPTY colour is "none", drawn as the diagonal slash every vector
        // tool uses — a white chip would read as white paint.
        chip.style.background = colour || 'transparent'
        chip.classList.toggle('none', !colour)
      }
      box.classList.toggle('active', this.activeSwatch === key)
      const input = this.controls[`shape_${key}`] as HTMLInputElement | undefined
      if (input && colour) input.value = colour
    }
  }

  /** Apply a colour to whatever is selected, one object or many. */
  private applyStyleToSelection(key: 'fill' | 'stroke', colour: string) {
    const ids = new Set(this.selectionIds())
    let touched = 0
    for (const sh of this.shapes) {
      if (!ids.has(sh.id)) continue
      sh[key] = colour
      // A gradient OUTRANKS the flat fill when painting, so choosing a colour
      // has to remove it. Otherwise the swatch changes, the file changes, and
      // the traced shape on screen stays exactly as it was.
      if (key === 'fill' && sh.gradient) delete sh.gradient
      touched++
    }
    // Text has no stroke, so a stroke colour must not silently do nothing to
    // it — the fill is what a text box's colour means.
    if (key === 'fill') {
      for (const b of this.boxes) {
        if (!ids.has(b.id)) continue
        b.color = colour
        touched++
      }
    }
    if (!touched) {
      // Nothing selected is not a failure — it arms the colour the NEXT shape
      // is drawn with — but silence reads as a broken control, so say so.
      this.setStatus(t('designColorArmed'))
      return
    }
    this.renderShapes()
    this.renderBoxes()
    this.setDirty(true)
  }

  /** Swap fill and stroke — Shift+X in every vector editor. */
  private swapColors() {
    const { fill, stroke } = this.shapeStyle
    this.shapeStyle.fill = stroke
    this.shapeStyle.stroke = fill
    for (const key of ['fill', 'stroke'] as const) {
      this.applyStyleToSelection(key, this.shapeStyle[key])
    }
    this.syncSwatch()
  }

  /** Set the active swatch to NONE. */
  private clearActiveColor() {
    const key = this.activeSwatch
    // A shape with neither fill nor stroke is invisible AND unselectable, so
    // clearing the last one is refused rather than losing the object.
    if (!this.shapeStyle[key === 'fill' ? 'stroke' : 'fill']) {
      this.setStatus(t('designNeedOneColor'))
      return
    }
    this.shapeStyle[key] = ''
    this.applyStyleToSelection(key, '')
    this.syncSwatch()
  }

  // ─── the new-document dialog ──────────────────────────────────────────────

  /**
   * What the CURRENT document was made as.
   *
   * Kept because two things downstream need it and neither can recover it from
   * the page size alone: the resolution decides how many pixels an export is
   * worth, and the colour mode decides whether a PDF is written in RGB or in
   * ink percentages.
   */
  private setup: DocSetup = defaultSetup()

  /**
   * Ask what to make before making it.
   *
   * A "new" button that silently produces A4 is fine until the first time
   * someone wants a 1080px square, and then there is nowhere to say so. Every
   * control here changes something real: the size and unit set the page, the
   * resolution gives a pixel its physical size AND sets the export scale, and
   * the colour mode decides how a PDF records its colours.
   */
  private openNewDialog() {
    let draft: DocSetup = { ...this.setup }
    const wrap = document.createElement('div')
    wrap.className = 'dz-modal-wrap'
    const box = document.createElement('div')
    box.className = 'dz-modal'
    wrap.append(box)

    const head = document.createElement('div')
    head.className = 'dz-modal-head'
    head.textContent = t('designNewTitle')
    box.append(head)

    const body = document.createElement('div')
    body.className = 'dz-modal-body'
    box.append(body)

    const close = () => wrap.remove()

    /** Rebuilt after every change so the preset and the numbers stay honest. */
    const render = () => {
      body.innerHTML = ''

      const row = (label: string, control: HTMLElement): void => {
        const r = document.createElement('label')
        r.className = 'dz-modal-row'
        const sp = document.createElement('span')
        sp.textContent = label
        r.append(sp, control)
        body.append(r)
      }

      // ── the presets strip ──────────────────────────────────────────────
      const strip = document.createElement('div')
      strip.className = 'dz-modal-presets'
      const current = presetIdFor(draft)
      for (const preset of DOC_PRESETS) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = `dz-modal-preset${preset.id === current ? ' active' : ''}`
        const name = document.createElement('b')
        name.textContent = t(`designPreset_${preset.id}`)
        const size = document.createElement('span')
        size.dir = 'ltr'
        size.textContent = `${preset.setup.width} × ${preset.setup.height} ${preset.setup.unit}`
        b.append(name, size)
        b.addEventListener('click', () => {
          // The preset carries its OWN resolution and colour mode: those are
          // part of what "a business card" or "an Instagram square" means.
          draft = { ...preset.setup }
          render()
        })
        strip.append(b)
      }
      body.append(strip)

      // ── size ───────────────────────────────────────────────────────────
      const num = (value: number, onChange: (v: number) => void): HTMLInputElement => {
        const i = document.createElement('input')
        i.type = 'number'
        i.min = '1'
        i.step = draft.unit === 'in' ? '0.1' : '1'
        i.className = 'dz-modal-num'
        // Trailing zeros on a whole number read as noise in a size field.
        i.value = String(Math.round(value * 100) / 100)
        i.addEventListener('change', () => {
          const v = Number(i.value)
          if (Number.isFinite(v) && v > 0) {
            onChange(v)
            render()
          }
        })
        return i
      }
      row(t('designNewWidth'), num(draft.width, (v) => { draft.width = v }))
      row(t('designNewHeight'), num(draft.height, (v) => { draft.height = v }))

      const unit = document.createElement('select')
      for (const u of ['px', 'mm', 'cm', 'in', 'pt'] as const) {
        const o = document.createElement('option')
        o.value = u
        o.textContent = t(`designUnit_${u}`)
        unit.append(o)
      }
      unit.value = draft.unit
      unit.addEventListener('change', () => {
        // Changing the UNIT must not change the PAGE. The size is carried
        // across at its physical value, so 210mm becomes 8.27in and not 210in.
        const { widthPt, heightPt } = setupToPt(draft)
        const next = unit.value as Unit
        draft = {
          ...draft,
          unit: next,
          width: Math.round(fromPt(widthPt, next, draft.dpi) * 100) / 100,
          height: Math.round(fromPt(heightPt, next, draft.dpi) * 100) / 100
        }
        render()
      })
      row(t('designNewUnit'), unit)

      // ── orientation ────────────────────────────────────────────────────
      const orient = document.createElement('div')
      orient.className = 'dz-modal-seg'
      for (const [id, fn] of [['portrait', portrait], ['landscape', landscape]] as const) {
        const b = document.createElement('button')
        b.type = 'button'
        const isOn = id === 'portrait' ? draft.height >= draft.width : draft.width >= draft.height
        b.className = `dz-modal-segbtn${isOn ? ' active' : ''}`
        b.textContent = t(`designOrient_${id}`)
        b.addEventListener('click', () => {
          draft = fn(draft)
          render()
        })
        orient.append(b)
      }
      row(t('designNewOrient'), orient)

      // ── resolution ─────────────────────────────────────────────────────
      const dpi = document.createElement('select')
      for (const v of [72, 96, 150, 300, 600]) {
        const o = document.createElement('option')
        o.value = String(v)
        o.textContent = `${v} DPI${v === 72 ? ` — ${t('designDpiScreen')}` : v >= 300 ? ` — ${t('designDpiPrint')}` : ''}`
        dpi.append(o)
      }
      dpi.value = String(draft.dpi)
      dpi.addEventListener('change', () => {
        const next = Number(dpi.value)
        if (draft.unit === 'px') {
          // In PIXELS the number stays and the page changes size — 1080px at
          // 300dpi is a smaller piece of paper than 1080px at 72.
          draft = { ...draft, dpi: next }
        } else {
          // In a physical unit the page stays and only the pixel count moves.
          draft = { ...draft, dpi: next }
        }
        render()
      })
      row(t('designNewDpi'), dpi)

      // ── colour mode ────────────────────────────────────────────────────
      const mode = document.createElement('div')
      mode.className = 'dz-modal-seg'
      for (const id of ['rgb', 'cmyk'] as const) {
        const b = document.createElement('button')
        b.type = 'button'
        b.className = `dz-modal-segbtn${draft.colorMode === id ? ' active' : ''}`
        b.textContent = t(`designColorMode_${id}`)
        b.title = t(`designColorModeHint_${id}`)
        b.addEventListener('click', () => {
          draft = { ...draft, colorMode: id }
          render()
        })
        mode.append(b)
      }
      row(t('designNewColorMode'), mode)

      // ── what it comes to ───────────────────────────────────────────────
      const clean = cleanSetup(draft)
      const { widthPt, heightPt } = setupToPt(clean)
      const note = document.createElement('div')
      note.className = 'dz-modal-note'
      note.dir = 'ltr'
      // The pixel count is the number that decides whether an export is sharp
      // or enormous, and it is the one the dialog's own controls hide.
      note.textContent =
        `${Math.round(fromPt(widthPt, 'px', clean.dpi))} × ${Math.round(fromPt(heightPt, 'px', clean.dpi))} px` +
        `  ·  ${Math.round(widthPt)} × ${Math.round(heightPt)} pt`
      body.append(note)
    }

    render()

    const foot = document.createElement('div')
    foot.className = 'dz-modal-foot'
    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'dz-modal-btn'
    cancel.textContent = t('cancel')
    cancel.addEventListener('click', close)
    const ok = document.createElement('button')
    ok.type = 'button'
    ok.className = 'dz-modal-btn primary'
    ok.textContent = t('designNewCreate')
    ok.addEventListener('click', () => {
      close()
      void this.newBlankFrom(cleanSetup(draft))
    })
    foot.append(cancel, ok)
    box.append(foot)

    // Clicking the backdrop cancels; clicking the panel must not.
    wrap.addEventListener('pointerdown', (e) => {
      if (e.target === wrap) close()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        close()
        window.removeEventListener('keydown', onKey, true)
      }
    }
    window.addEventListener('keydown', onKey, true)
    this.root.append(wrap)
  }

  /** Make the document the dialog described. */
  private async newBlankFrom(setup: DocSetup) {
    this.setup = setup
    const { widthPt, heightPt } = setupToPt(setup)
    await this.newBlank(widthPt, heightPt)
    this.setStatus(
      t('designNewMade')
        .replace('{w}', String(Math.round(fromPt(widthPt, setup.unit, setup.dpi) * 100) / 100))
        .replace('{h}', String(Math.round(fromPt(heightPt, setup.unit, setup.dpi) * 100) / 100))
        .replace('{u}', t(`designUnit_${setup.unit}`))
        .replace('{d}', String(setup.dpi))
        .replace('{m}', t(`designColorMode_${setup.colorMode}`))
    )
  }

  /**
   * Play one interaction on the canvas.
   *
   * Through the Web Animations API rather than by mutating the document: a
   * preview that edited the shapes would land in the undo stack and in the
   * saved file, and "let me see what this looks like" must not change
   * anything. The animation runs on the DOM node and evaporates.
   *
   * The values are the SAME ones the compiler will write into the stylesheet,
   * so what is previewed is what gets exported — computed from one place
   * (buildTransform/buildDecls) rather than reimplemented here.
   */
  private previewMotion(i: Interaction) {
    const members = Object.fromEntries(this.groups().map((g) => [g.id, g.children]))
    const parts = expandStagger(i, members)
    let played = 0
    for (const part of parts) {
      const id = part.affects ?? part.targetId
      // A GROUP has no node of its own on the canvas — its members do. An
      // unstaggered group motion plays on every member with the same timing,
      // which is what one transform on the exported wrapper will look like.
      const kids = members[id]
      if (kids?.length) {
        for (const kid of kids) played += this.previewOne({ ...part, affects: kid }) ? 1 : 0
      } else {
        played += this.previewOne(part) ? 1 : 0
      }
    }
    if (!played) this.setStatus(t('motionNoTarget'))
  }

  private previewOne(i: Interaction): boolean {
    const id = i.affects ?? i.targetId
    const node =
      this.shapeLayer?.querySelector<SVGElement>(`[data-shape="${id}"]`) ??
      this.pageEl?.querySelector<HTMLElement>(`[data-img="${id}"], [data-box="${id}"]`)
    if (!node) {
      return false
    }
    /** One keyframe, at a point along the run. */
    const at = (point: number): Record<string, string> => {
      const out: Record<string, string> = {}
      const value = (c: (typeof i.changes)[number]): number | string => {
        if (point <= 0) return c.from
        if (point >= 1) return c.to
        let best: number | string = c.from
        for (const stop of c.via ?? []) if (stop.at <= point) best = stop.value
        return best
      }
      const tf = buildTransform(i.changes, (c) => {
        const v = value(c)
        return typeof v === 'number' ? v : undefined
      })
      out.transform = tf || 'none'
      for (const line of buildDecls(i.changes, value)) {
        const [prop, ...rest] = line.replace(/;$/, '').split(':')
        out[prop.trim().replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase())] = rest.join(':').trim()
      }
      return out
    }
    // Every offset any change asked for, so a stop in one is a frame the
    // others are sampled at too — the same rule the compiler follows, so the
    // preview and the exported stylesheet cannot drift apart.
    const offsets = [...new Set([0, 1, ...i.changes.flatMap((c) => (c.via ?? []).map((v) => v.at))])]
      .sort((a, b) => a - b)
    const timingOpts: KeyframeAnimationOptions = {
      duration: Math.max(1, i.duration),
      delay: i.delay,
      easing: easingCss(i.easing),
      // The preview always comes BACK: it is a demonstration, not an edit,
      // and leaving the object moved would look exactly like a bug.
      direction: 'alternate',
      iterations: 2,
      fill: 'none'
    }
    try {
      // The draw half plays on the STROKES, not on the box: the canvas has
      // real path lengths, so the dash is measured with getTotalLength — the
      // same picture pathLength="1" normalisation gives the export.
      const draw = i.changes.find((c) => c.prop === 'draw')
      if (draw) {
        const strokes = node.querySelectorAll<SVGGeometryElement>('path, line')
        const target = strokes.length ? [...strokes] : node instanceof SVGGeometryElement ? [node] : []
        for (const el of target) {
          let len = 100
          try {
            len = el.getTotalLength()
          } catch {
            /* a <line> in an old engine — the fallback is close enough */
          }
          const off = (v: number | string): string => String(len * (1 - Number(v)))
          const dFrames = offsets.map((o) => {
            let v: number | string = draw.from
            if (o >= 1) v = draw.to
            else if (o > 0) for (const stop of draw.via ?? []) if (stop.at <= o) v = stop.value
            return { strokeDasharray: String(len), strokeDashoffset: off(v), offset: o }
          })
          el.animate(dFrames, timingOpts)
        }
      }
      const boxChanges = i.changes.filter((c) => c.prop !== 'draw')
      if (boxChanges.length) {
        const full = offsets.map((o) => ({ vals: at(o), offset: o }))
        // Transforms COMPOSITE onto the node's own transform. A path carries
        // its position in translate(x y), and a replacing animation would
        // teleport it to the page origin for the length of the preview —
        // which is exactly what previewing a pulse on an icon looked like.
        const tfFrames = full.map((f) => ({ transform: f.vals.transform ?? 'none', offset: f.offset }))
        if (tfFrames.some((f) => f.transform !== 'none')) {
          node.animate(tfFrames, { ...timingOpts, composite: 'add' })
        }
        const declFrames = full.map((f) => {
          const { transform: _tf, ...rest2 } = f.vals
          return { ...rest2, offset: f.offset }
        })
        if (declFrames.some((f) => Object.keys(f).length > 1)) {
          node.animate(declFrames, timingOpts)
        }
      }
      this.setStatus(t('motionPlaying'))
      return true
    } catch {
      // An easing string the browser will not take is a compiler bug, not a
      // reason to lose the panel.
      this.setStatus(t('motionPlayFailed'))
      return true
    }
  }

  // ─── isolation mode ───────────────────────────────────────────────────────

  /**
   * The group being edited from the inside, or null.
   *
   * Illustrator's isolation mode, and the answer to "how do I get at ONE bar
   * of this icon without cutting the icon apart". Outside isolation a group is
   * one object: click it and you get all of it. Step inside and it is a set of
   * ordinary objects again — but only those; everything else on the artboard
   * fades back and stops taking clicks, so there is nothing to hit by mistake.
   *
   * Nothing about the DOCUMENT changes. This is purely how the canvas reads
   * clicks, which is why leaving it is instant and cannot lose work.
   */
  private isolated: string | null = null

  /** The bar across the top of the stage naming where you are. */
  private crumbEl: HTMLElement | null = null

  /** Ids the canvas will currently respond to; null means "everything". */
  private isolatedIds(): Set<string> | null {
    if (!this.isolated) return null
    const g = this.groups().find((x) => x.id === this.isolated)
    if (!g) return null
    return new Set(g.children)
  }

  /** Is this object outside the isolated group — dimmed and unclickable? */
  private isDimmed(id: string): boolean {
    const live = this.isolatedIds()
    return !!live && !live.has(id)
  }

  /** Step into whichever group the selection belongs to. */
  private isolateSelected() {
    const g = this.selectionIds()
      .map((id) => groupOf(this.groups(), id))
      .find((x): x is NonNullable<typeof x> => !!x)
    if (!g) {
      this.setStatus(t('designUngroupNone'))
      return
    }
    const keep = this.selectionIds()
    this.enterIsolation(g.id)
    // Keep whatever was selected: the user picked those objects, and stepping
    // in should not make them go and find them again.
    const live = this.isolatedIds()
    const still = keep.filter((id) => live?.has(id))
    if (still.length === 1) this.selectAnyById(still[0])
    else if (still.length > 1) {
      this.multi = new Set(still)
      this.syncOverlay()
      this.renderShapes()
    }
  }

  private enterIsolation(groupId: string) {
    if (!this.groups().some((g) => g.id === groupId)) return
    this.isolated = groupId
    this.clearMulti()
    this.selectedShapeId = null
    this.selectedImageId = null
    this.selectedId = null
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.syncOverlay()
    this.renderCrumbs()
    this.setStatus(t('designIsolateHint'))
  }

  private exitIsolation() {
    if (!this.isolated) return
    this.isolated = null
    this.clearMulti()
    this.selectedShapeId = null
    this.selectedImageId = null
    this.selectedId = null
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.syncOverlay()
    this.renderCrumbs()
    this.setStatus('')
  }

  /**
   * The breadcrumb bar: a back arrow, the artboard, and the group you are in.
   *
   * Hidden entirely when nothing is isolated. A mode with no visible sign that
   * it is on is a mode the user gets stuck in — the arrow is the way out that
   * does not require knowing the double-click.
   */
  private renderCrumbs() {
    const host = this.crumbEl
    if (!host) return
    host.hidden = !this.isolated
    host.innerHTML = ''
    if (!this.isolated) return
    const back = document.createElement('button')
    back.type = 'button'
    back.className = 'dz-crumb-back'
    back.textContent = '‹'
    back.title = t('designIsolateExit')
    back.addEventListener('click', () => this.exitIsolation())
    const page = document.createElement('span')
    page.className = 'dz-crumb'
    page.textContent = `${t('designBoard')} ${this.page}`
    page.addEventListener('click', () => this.exitIsolation())
    const sep = document.createElement('span')
    sep.className = 'dz-crumb-sep'
    sep.textContent = '›'
    const here = document.createElement('span')
    here.className = 'dz-crumb current'
    const g = this.groups().find((x) => x.id === this.isolated)
    here.textContent = g?.name || t('designGroupName')
    host.append(back, page, sep, here)
  }

  /**
   * A double-click steps INTO a group, or OUT of isolation on empty canvas.
   *
   * The same gesture both ways, because that is the one every vector editor
   * uses and the only one the user will try.
   */
  private handleCanvasDoubleClick(e: MouseEvent) {
    const el = e.target as HTMLElement | null
    // Editing text is a double-click too; stepping into a group instead would
    // make a word impossible to select.
    if (el?.closest('[contenteditable="true"], input, textarea')) return
    const hit = el?.closest<HTMLElement>('[data-shape], [data-box], [data-img]')
    let id = hit?.dataset.shape ?? hit?.dataset.box ?? hit?.dataset.img
    // The MOVE PLATE lies over the selection and would swallow this — and the
    // selection is exactly what a double-click is usually aimed at. Fall back
    // to hit-testing our own model, which knows every box already.
    if (!id && el?.closest('.dz-handles')) id = this.objectAt(e)
    if (!id) {
      // Empty canvas: step back out one level.
      this.exitIsolation()
      return
    }
    const g = groupOf(this.groups(), id)
    if (g && g.id !== this.isolated) {
      e.preventDefault()
      e.stopPropagation()
      this.enterIsolation(g.id)
      // …and land on the thing that was actually double-clicked, so the first
      // click inside is not wasted re-finding it.
      this.selectAnyById(id)
    }
  }

  // ─── the right-click menu ─────────────────────────────────────────────────

  /** The open menu, if any. Only ever one. */
  private menuEl: HTMLElement | null = null

  /**
   * Label and handler per action. The DECISION about what is enabled lives in
   * contextMenu.ts, where it is unit-tested; this half only knows how to say
   * each entry's name and how to run it.
   */
  private menuAction(id: MenuAction): { label: string; run: () => void } {
    const A: Record<MenuAction, { label: string; run: () => void }> = {
      cut: { label: t('cut'), run: () => this.cutSelection() },
      copy: { label: t('copy'), run: () => this.copySelection() },
      paste: { label: t('paste'), run: () => this.pasteClipboard() },
      duplicate: { label: t('designDuplicate'), run: () => this.duplicateSelection() },
      undo: { label: t('undo'), run: () => void this.undo() },
      redo: { label: t('redo'), run: () => void this.redo() },
      group: { label: t('designGroup'), run: () => this.groupSelection() },
      ungroup: { label: t('designUngroup'), run: () => this.ungroupSelection() },
      ungroupAll: { label: t('designUngroupAll'), run: () => this.ungroupAll() },
      isolate: { label: t('designIsolate'), run: () => this.isolateSelected() },
      exitIsolate: { label: t('designIsolateExit'), run: () => this.exitIsolation() },
      arrange: { label: t('designArrangeZ'), run: () => undefined },
      zFront: { label: t('designZFront'), run: () => this.reorderZ('front') },
      zForward: { label: t('designZForward'), run: () => this.reorderZ('forward') },
      zBackward: { label: t('designZBackward'), run: () => this.reorderZ('backward') },
      zBack: { label: t('designZBack'), run: () => this.reorderZ('back') },
      expand: { label: t('designExpandShort'), run: () => this.expandSelection(false) },
      expandAppearance: { label: t('designExpandAppearanceShort'), run: () => this.expandSelection(true) },
      nodes: { label: t('designNodeEditShort'), run: () => this.toggleNodeEdit() },
      release: { label: t('designReleaseShort'), run: () => this.releaseSelected() },
      selectAll: { label: t('selectAll'), run: () => this.selectAll() },
      delete: { label: t('designLayerDeleteSel'), run: () => this.deleteSelection() }
    }
    return A[id]
  }

  /** The state the menu reads. Gathered once, when the menu opens. */
  private menuState(): MenuState {
    const sel = this.selectionIds()
    return {
      selection: sel.length,
      hasClipboard: !!this.clipboard,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      grouped: sel.some((id) => groupOf(this.groups(), id)),
      anyGroups: this.groups().length > 0,
      isPath: this.selectedShape()?.kind === 'path',
      isolated: !!this.isolated
    }
  }

  /**
   * Open the menu at a page point.
   *
   * Right-clicking an object that is NOT selected selects it first — the way
   * every editor behaves, and the only way the menu can be about the thing the
   * user is pointing at rather than about whatever was selected before.
   */
  private openContextMenu(e: MouseEvent) {
    e.preventDefault()
    this.closeContextMenu()
    const el = e.target as HTMLElement | null
    const hit = el?.closest<HTMLElement>('[data-shape], [data-box], [data-img]')
    const id = hit?.dataset.shape ?? hit?.dataset.box ?? hit?.dataset.img
    if (id && !this.selectionIds().includes(id)) this.selectAnyById(id)

    const menu = document.createElement('div')
    menu.className = 'dz-menu'
    const build = (item: MenuItem): HTMLElement => {
      const { label, run } = this.menuAction(item.id)
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'dz-menu-item'
      row.disabled = !item.enabled
      const text = document.createElement('span')
      text.textContent = label
      row.append(text)
      if (item.shortcut) {
        const key = document.createElement('span')
        key.className = 'dz-menu-key'
        key.textContent = item.shortcut
        row.append(key)
      }
      if (item.children?.length) {
        const arrow = document.createElement('span')
        arrow.className = 'dz-menu-arrow'
        arrow.textContent = '›'
        row.append(arrow)
        const sub = document.createElement('div')
        sub.className = 'dz-menu dz-menu-sub'
        for (const child of item.children) sub.append(build(child))
        row.append(sub)
      } else {
        row.addEventListener('click', () => {
          run()
          this.closeContextMenu()
        })
      }
      return row
    }
    for (const item of contextMenu(this.menuState())) {
      if (item === 'sep') {
        const hr = document.createElement('div')
        hr.className = 'dz-menu-sep'
        menu.append(hr)
        continue
      }
      menu.append(build(item))
    }

    // Measured AFTER it is in the DOM: a menu still in a fragment has no size,
    // and clamping against a zero box puts every menu in the corner.
    document.body.append(menu)
    this.menuEl = menu
    const box = menu.getBoundingClientRect()
    const x = Math.min(e.clientX, window.innerWidth - box.width - 4)
    const y = Math.min(e.clientY, window.innerHeight - box.height - 4)
    menu.style.left = `${Math.max(4, x)}px`
    menu.style.top = `${Math.max(4, y)}px`
    // A submenu opening off the right edge flips to the other side.
    if (e.clientX + box.width + 200 > window.innerWidth) menu.classList.add('flip')
  }

  private closeContextMenu() {
    this.menuEl?.remove()
    this.menuEl = null
  }

  /** Cut: copy, then delete. Nothing else needs to know it happened. */
  private cutSelection() {
    if (!this.selectionIds().length) return
    this.copySelection()
    this.deleteSelection()
  }

  /** Break EVERY group on this artboard, not only the ones selected. */
  private ungroupAll() {
    if (!this.groups().length) {
      this.setStatus(t('designUngroupNone'))
      return
    }
    this.setGroups([])
    this.renderLayers()
    this.setDirty(true)
    this.setStatus(t('designUngroupDone'))
  }

  // ─── the pen tool ─────────────────────────────────────────────────────────

  /** Points placed so far, in pt. Empty when no path is in progress. */
  private penPoints: Array<[number, number]> = []

  /**
   * Place a pen point.
   *
   * Click to add, click the FIRST point to close, Enter to finish open, and
   * Escape to abandon. That is the pen every vector tool ships, and the reason
   * it is click-to-place rather than drag-to-draw: a drag produces a freehand
   * scribble with hundreds of nodes, and this canvas is for shapes somebody
   * will later edit node by node.
   */
  private penClick(e: PointerEvent) {
    const page = this.pageEl
    if (!page) return
    const k = this.pxPerPt()
    const r = page.getBoundingClientRect()
    const x = (e.clientX - r.left) / k
    const y = (e.clientY - r.top) / k

    // Clicking the first point again CLOSES the path — the standard gesture,
    // and the only way to get a filled shape out of the pen.
    if (this.penPoints.length > 2) {
      const [fx, fy] = this.penPoints[0]
      if (Math.hypot(x - fx, y - fy) * k < 10) {
        this.commitPen(true)
        return
      }
    }
    this.penPoints.push([x, y])
    this.drawPenPreview([x, y])
  }

  /** The in-progress path, drawn as a guide rather than as artwork. */
  private drawPenPreview(cursor?: [number, number]) {
    const layer = this.shapeLayer
    if (!layer) return
    for (const el of layer.querySelectorAll('.dz-pen')) el.remove()
    if (!this.penPoints.length) return
    const NS = 'http://www.w3.org/2000/svg'
    const pts = cursor ? [...this.penPoints] : this.penPoints
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ')
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('class', 'dz-pen')
    layer.append(path)
    for (const [i, [x, y]] of pts.entries()) {
      const dot = document.createElementNS(NS, 'circle')
      dot.setAttribute('cx', String(x))
      dot.setAttribute('cy', String(y))
      dot.setAttribute('r', '2.5')
      // The FIRST point is marked, because it is the one that closes the path
      // and the user has to be able to aim at it.
      dot.setAttribute('class', `dz-pen-dot${i === 0 ? ' first' : ''}`)
      layer.append(dot)
    }
  }

  /** Turn the placed points into a real path shape. */
  private commitPen(close: boolean) {
    const pts = this.penPoints
    this.penPoints = []
    this.drawPenPreview()
    // Two points is a line; one is nothing. Below that there is no shape to
    // make, and silently creating an invisible one would be worse than a no-op.
    if (pts.length < 2) return
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const x = Math.min(...xs)
    const y = Math.min(...ys)
    const w = Math.max(...xs) - x
    const h = Math.max(...ys) - y
    if (w <= 0 && h <= 0) return
    // `d` is LOCAL to the shape, so the points are rebased onto its own origin
    // — the same contract every other path in the app follows.
    const d =
      pts.map(([px, py], i) => `${i ? 'L' : 'M'}${round3(px - x)} ${round3(py - y)}`).join(' ') +
      (close ? ' Z' : '')
    this.shapes.push({
      id: `shape-${++this.shapeIdSeq}`,
      kind: 'path',
      x,
      y,
      w: Math.max(w, 0.01),
      h: Math.max(h, 0.01),
      // An OPEN path is a stroke and a CLOSED one is a fill: filling an open
      // run paints a meaningless sliver across its mouth.
      fill: close ? this.shapeStyle.fill : '',
      stroke: close ? this.shapeStyle.stroke : this.shapeStyle.stroke || this.shapeStyle.fill,
      strokeWidth: this.shapeStyle.strokeWidth,
      d
    })
    this.renderShapes()
    this.renderLayers()
    this.setDirty(true)
    this.setTool('select')
    this.selectShape(this.shapes[this.shapes.length - 1].id)
    this.setStatus(t('designPenDone'))
  }

  // ─── the object inspector: opacity, corners, shadow, stroke ───────────────

  /**
   * Rebuild the inspector for the current selection.
   *
   * Shown only when something is selected, and only the rows that APPLY: a
   * corner-radius slider on an ellipse is a control that does nothing, which
   * teaches the user to distrust the whole panel.
   */
  private renderInspector() {
    const el = this.inspectorEl
    if (!el) return
    el.innerHTML = ''
    const ids = this.selectionIds()
    const shapes = this.shapes.filter((sh) => ids.includes(sh.id))
    el.hidden = !shapes.length
    if (!shapes.length) return

    const head = document.createElement('div')
    head.className = 'dz-insp-head'
    // Naming the count matters: every edit below applies to ALL of them, and
    // a panel that looks single-object while editing nine is a trap.
    head.textContent =
      shapes.length > 1 ? `${t('designAppearance')} (${shapes.length})` : t('designAppearance')
    el.append(head)

    // Edits apply to EVERY selected shape; the displayed value comes from the
    // first, which is the convention every inspector uses for a mixed set.
    const first = shapes[0]
    const apply = (fn: (sh: Shape) => void) => {
      for (const sh of shapes) fn(sh)
      this.renderShapes()
      this.setDirty(true)
    }

    el.append(
      this.inspectorRange(t('designOpacity'), (first.opacity ?? 1) * 100, 0, 100, (v) => {
        apply((sh) => {
          if (v >= 100) delete sh.opacity
          else sh.opacity = v / 100
        })
      })
    )

    // A slider AND a box: dragging is how you find the weight that looks
    // right, typing is how you match one you already know.
    el.append(
      this.inspectorSlider(
        t('designStrokeWidth'),
        { value: first.strokeWidth, min: 0.25, max: 40, step: 0.25, unit: 'pt' },
        (v) =>
          apply((sh) => {
            sh.strokeWidth = v
          })
      )
    )
    // Whether the stroke RIDES a resize. An app-wide switch, not a per-shape
    // field: it describes what dragging a handle means, not what a shape is.
    el.append(
      this.inspectorToggle(t('designScaleStrokes'), this.scaleStrokes, (on) => {
        this.scaleStrokes = on
      })
    )

    // Corners are a rect-only property, so the row only exists for rects.
    if (shapes.every((sh) => sh.kind === 'rect')) {
      // A slider like the one above it: a column where one row is a bare box
      // and the rest are sliders reads as unfinished, and the corner radius is
      // the property people most want to drag rather than type.
      el.append(
        this.inspectorSlider(
          t('designCorner'),
          { value: first.radius?.[0] ?? 0, min: 0, max: 120, step: 1, unit: 'pt' },
          (v) =>
            apply((sh) => {
              if (v <= 0) delete sh.radius
              else sh.radius = [v, v, v, v]
            })
        )
      )
    }

    el.append(
      this.inspectorToggle(t('designDashed'), !!first.dash, (on) => {
        apply((sh) => {
          if (on) sh.dash = [6, 3]
          else delete sh.dash
        })
      })
    )

    // Shadow: one switch, then its controls once it is on. Showing blur and
    // offset for a shape with no shadow is four dead controls.
    el.append(
      this.inspectorToggle(t('designShadow'), !!first.shadow, (on) => {
        apply((sh) => {
          if (on) sh.shadow = { dx: 0, dy: 2, blur: 6, color: '#000000', alpha: 0.3 }
          else delete sh.shadow
        })
        this.renderInspector()
      })
    )
    if (first.shadow) {
      const s0 = first.shadow
      const sub = document.createElement('div')
      sub.className = 'dz-insp-sub'
      el.append(sub)
      const el2 = { append: (n: HTMLElement) => sub.append(n) }
      el2.append(
        this.inspectorNumber(t('designShadowBlur'), s0.blur, 0, 100, 1, (v) =>
          apply((sh) => {
            if (sh.shadow) sh.shadow = { ...sh.shadow, blur: v }
          })
        )
      )
      el2.append(
        this.inspectorNumber(t('designShadowX'), s0.dx, -100, 100, 1, (v) =>
          apply((sh) => {
            if (sh.shadow) sh.shadow = { ...sh.shadow, dx: v }
          })
        )
      )
      el2.append(
        this.inspectorNumber(t('designShadowY'), s0.dy, -100, 100, 1, (v) =>
          apply((sh) => {
            if (sh.shadow) sh.shadow = { ...sh.shadow, dy: v }
          })
        )
      )
      el2.append(
        this.inspectorRange(t('designShadowAlpha'), s0.alpha * 100, 0, 100, (v) =>
          apply((sh) => {
            if (sh.shadow) sh.shadow = { ...sh.shadow, alpha: v / 100 }
          })
        )
      )
      el2.append(
        this.inspectorColor(t('designShadowColor'), s0.color, (v) =>
          apply((sh) => {
            if (sh.shadow) sh.shadow = { ...sh.shadow, color: v }
          })
        )
      )
    }
  }

  private inspectorColor(label: string, value: string, onChange: (v: string) => void): HTMLElement {
    const row = this.inspectorRow(label)
    const input = document.createElement('input')
    input.type = 'color'
    input.value = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000'
    input.className = 'dz-insp-color'
    input.addEventListener('input', () => onChange(input.value))
    row.append(input)
    return row
  }

  /**
   * A labelled slider with the exact value beside it, both driving the same
   * property. The pair matters: a slider alone cannot hit 1.5pt reliably and a
   * box alone cannot be explored.
   */
  private inspectorSlider(
    label: string,
    opts: { value: number; min: number; max: number; step: number; unit?: string },
    onChange: (v: number) => void
  ): HTMLElement {
    const row = this.inspectorRow(label)
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(opts.min)
    input.max = String(opts.max)
    input.step = String(opts.step)
    // A value above the slider's range is clamped for the KNOB only — the box
    // still shows the real number rather than silently rewriting the document.
    input.value = String(Math.min(opts.max, Math.max(opts.min, opts.value)))
    const num = document.createElement('input')
    num.type = 'number'
    num.className = 'dz-insp-num'
    num.min = String(opts.min)
    num.step = String(opts.step)
    num.value = String(opts.value)
    if (opts.unit) num.title = opts.unit
    input.addEventListener('input', () => {
      num.value = input.value
      onChange(Number(input.value))
    })
    num.addEventListener('input', () => {
      const v = Number(num.value)
      if (!Number.isFinite(v) || v < opts.min) return
      input.value = String(Math.min(opts.max, v))
      onChange(v)
    })
    row.append(input, num)
    return row
  }

  private inspectorRow(label: string): HTMLElement {
    const row = document.createElement('div')
    row.className = 'dz-insp-row'
    const l = document.createElement('label')
    l.textContent = label
    row.append(l)
    return row
  }

  private inspectorRange(
    label: string,
    value: number,
    min: number,
    max: number,
    onChange: (v: number) => void
  ): HTMLElement {
    const row = this.inspectorRow(label)
    const input = document.createElement('input')
    input.type = 'range'
    input.min = String(min)
    input.max = String(max)
    input.value = String(Math.round(value))
    const out = document.createElement('span')
    out.className = 'dz-insp-val'
    out.dir = 'ltr'
    out.textContent = `${Math.round(value)}%`
    input.addEventListener('input', () => {
      out.textContent = `${input.value}%`
      onChange(Number(input.value))
    })
    row.append(input, out)
    return row
  }

  private inspectorNumber(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (v: number) => void
  ): HTMLElement {
    const row = this.inspectorRow(label)
    const input = document.createElement('input')
    input.type = 'number'
    input.min = String(min)
    input.max = String(max)
    input.step = String(step)
    input.value = String(value)
    input.className = 'dz-insp-num'
    input.addEventListener('input', () => {
      const v = Number(input.value)
      // A blank box mid-typing is not an instruction to set NaN.
      if (Number.isFinite(v) && v >= min && v <= max) onChange(v)
    })
    row.append(input)
    return row
  }

  private inspectorToggle(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = this.inspectorRow(label)
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = value
    input.addEventListener('change', () => onChange(input.checked))
    row.append(input)
    return row
  }

  private setTool(tool: DesignTool) {
    // Leaving the pen ABANDONS the path in progress. Keeping the points would
    // leave guide dots on the canvas belonging to a tool that is no longer
    // active, and the next pen click would silently continue that old path.
    if (this.tool === 'pen' && tool !== 'pen' && this.penPoints.length) {
      this.penPoints = []
      this.drawPenPreview()
    }
    this.tool = tool
    // .dz-shape sets cursor:move, which would win over the page's crosshair
    // while the pen is hovering an existing shape.
    this.stage?.classList.toggle('dz-pen-mode', tool === 'pen')
    // the shape tools and the edit-original tool fight over the same drags
    if (tool !== 'select' && this.editOriginalMode) {
      this.editOriginalMode = false
      ;(this.controls.editOrig as HTMLElement | undefined)?.classList.remove('active')
      this.hideTextHotspots()
    }
    this.syncToolButtons()
    if (this.pageEl) {
      this.pageEl.style.cursor =
        tool === 'select' ? '' : tool === 'eyedropper' ? 'crosshair' : 'crosshair'
    }
    this.setStatus(tool === 'select' ? '' : t(`designToolHint_${tool}`))
  }

  private syncToolButtons() {
    for (const b of this.toolsEl?.querySelectorAll('.dz-tool') ?? []) {
      b.classList.toggle('active', (b as HTMLElement).dataset.tool === this.tool)
    }
  }

  /**
   * The Image Trace panel, laid out the way Illustrator's is: the quick mode
   * strip on top, then Preset / Mode / Palette, then everything fiddly folded
   * away under Advanced, then what to CREATE, then Info and the trace button.
   *
   * The layout is copied; the controls are not. Every row here drives a knob
   * this engine actually has — Illustrator's Method, Transparency, Shapes and
   * Auto-Grouping have no counterpart in a stacked-layer tracer, and a row
   * that does nothing teaches the user to distrust the rest of the panel.
   */
  private toggleTracePanel() {
    if (this.tracePanel) {
      this.tracePanel.remove()
      this.tracePanel = null
      this.clearPreview()
      return
    }
    const panel = document.createElement('div')
    panel.className = 'dz-trace-panel'
    this.tracePanel = panel

    const head = document.createElement('div')
    head.className = 'dz-trace-head'
    const title = document.createElement('span')
    title.textContent = t('designTracePanel')
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'dz-trace-x'
    close.textContent = '×'
    close.title = t('cancel')
    close.addEventListener('click', () => this.toggleTracePanel())
    head.append(title, close)
    panel.append(head)

    const body = document.createElement('div')
    body.className = 'dz-trace-body'
    panel.append(body)

    const reopen = () => {
      this.tracePanel?.remove()
      this.tracePanel = null
      this.toggleTracePanel()
      this.schedulePreview()
    }

    // ── the quick strip: six presets as icons, Illustrator's top row ───────
    const strip = document.createElement('div')
    strip.className = 'dz-trace-strip'
    for (const [key, glyph] of DesignApp.TRACE_QUICK) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-trace-mode'
      b.innerHTML = glyph
      b.title = t(`designTracePreset_${key}`)
      b.addEventListener('click', () => {
        Object.assign(this.traceOpts, DesignApp.TRACE_PRESETS[key])
        this.tracePreset = key
        reopen()
      })
      strip.append(b)
    }
    body.append(strip)

    const row = (label: string, control: HTMLElement, host: HTMLElement = body): HTMLElement => {
      const r = document.createElement('label')
      r.className = 'dz-trace-row'
      const sp = document.createElement('span')
      sp.textContent = label
      r.append(sp, control)
      host.append(r)
      return r
    }

    /** A slider with Illustrator's two end captions and a live value box. */
    const slider = (
      label: string,
      opts: { min: number; max: number; step?: number; value: number; low: string; high: string; suffix?: string },
      onChange: (v: number) => void,
      host: HTMLElement = body
    ): HTMLElement => {
      const wrap = document.createElement('div')
      wrap.className = 'dz-trace-slide'
      const top = document.createElement('div')
      top.className = 'dz-trace-slide-top'
      const name = document.createElement('span')
      name.textContent = label
      const out = document.createElement('input')
      out.type = 'number'
      out.className = 'dz-trace-val'
      out.min = String(opts.min)
      out.max = String(opts.max)
      out.step = String(opts.step ?? 1)
      out.value = String(opts.value)
      top.append(name, out)
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(opts.min)
      input.max = String(opts.max)
      input.step = String(opts.step ?? 1)
      input.value = String(opts.value)
      const ends = document.createElement('div')
      ends.className = 'dz-trace-ends'
      const lo = document.createElement('span')
      lo.textContent = opts.low
      const hi = document.createElement('span')
      hi.textContent = opts.high
      ends.append(lo, hi)
      // The box and the slider are ONE control: typing an exact value is what
      // the box is for, and dragging is what the slider is for.
      input.addEventListener('input', () => {
        out.value = input.value
        onChange(Number(input.value))
      })
      out.addEventListener('input', () => {
        const v = Number(out.value)
        if (!Number.isFinite(v) || v < opts.min || v > opts.max) return
        input.value = out.value
        onChange(v)
      })
      wrap.append(top, input, ends)
      host.append(wrap)
      return wrap
    }

    const check = (label: string, value: boolean, onChange: (v: boolean) => void, host: HTMLElement = body): HTMLElement => {
      const r = document.createElement('label')
      r.className = 'dz-trace-check'
      const input = document.createElement('input')
      input.type = 'checkbox'
      input.checked = value
      input.addEventListener('change', () => onChange(input.checked))
      const sp = document.createElement('span')
      sp.textContent = label
      r.append(input, sp)
      host.append(r)
      return r
    }

    // ── Preset ────────────────────────────────────────────────────────────
    const preset = document.createElement('select')
    for (const key of Object.keys(DesignApp.TRACE_PRESETS)) {
      const o = document.createElement('option')
      o.value = key
      o.textContent = t(`designTracePreset_${key}`)
      preset.append(o)
    }
    preset.value = this.tracePreset
    preset.addEventListener('change', () => {
      Object.assign(this.traceOpts, DesignApp.TRACE_PRESETS[preset.value])
      this.tracePreset = preset.value
      // reopen so every control reflects the preset it just applied
      reopen()
    })
    row(t('designTracePreset'), preset)

    // ── Mode ──────────────────────────────────────────────────────────────
    const mode = document.createElement('select')
    for (const [value, label] of [
      ['color', t('designTraceModeColor')],
      ['grayscale', t('designTraceModeGray')],
      ['bw', t('designTraceModeBw')]
    ]) {
      const o = document.createElement('option')
      o.value = value
      o.textContent = label
      mode.append(o)
    }
    mode.value = this.traceOpts.mode
    mode.addEventListener('change', () => {
      this.traceOpts.mode = mode.value as 'color' | 'grayscale' | 'bw'
      reopen()
    })
    row(t('designTraceMode'), mode)

    // ── Palette / Threshold: only ONE of them applies at a time ────────────
    if (this.traceOpts.mode === 'bw') {
      slider(
        t('designTraceThreshold'),
        { min: 0, max: 255, value: this.traceOpts.threshold, low: t('designTraceLess'), high: t('designTraceMore') },
        (v) => {
          this.traceOpts.threshold = v
        }
      )
    } else {
      const colorsWrap = document.createElement('span')
      colorsWrap.className = 'dz-trace-colors'
      const auto = document.createElement('input')
      auto.type = 'checkbox'
      auto.checked = this.traceOpts.colors === 'auto'
      auto.id = 'dz-trace-auto'
      const autoLabel = document.createElement('label')
      autoLabel.htmlFor = 'dz-trace-auto'
      autoLabel.textContent = t('designTraceAuto')
      const colors = document.createElement('input')
      colors.type = 'number'
      colors.min = '2'
      colors.max = String(MAX_COLORS)
      colors.className = 'dz-trace-val'
      colors.value = String(this.traceOpts.colors === 'auto' ? 12 : this.traceOpts.colors)
      colors.disabled = auto.checked
      const clamp = (v: number) => Math.min(MAX_COLORS, Math.max(2, v || 12))
      auto.addEventListener('change', () => {
        colors.disabled = auto.checked
        this.traceOpts.colors = auto.checked ? 'auto' : clamp(Number(colors.value))
        this.syncTraceInfo()
      })
      colors.addEventListener('input', () => {
        this.traceOpts.colors = clamp(Number(colors.value))
        this.syncTraceInfo()
      })
      colorsWrap.append(auto, autoLabel, colors)
      row(t('designTraceColors'), colorsWrap)
    }

    // ── Advanced, folded away exactly like Illustrator's ───────────────────
    const adv = document.createElement('details')
    adv.className = 'dz-trace-adv'
    adv.open = this.traceAdvOpen
    adv.addEventListener('toggle', () => {
      this.traceAdvOpen = adv.open
    })
    const sum = document.createElement('summary')
    sum.textContent = t('designTraceAdvanced')
    adv.append(sum)
    body.append(adv)

    // Illustrator's "Paths" runs the same way round as ours does not: its
    // slider is fidelity (high = follow the pixels), ours is an RDP tolerance
    // in px (low = follow the pixels), so the value is mirrored on the way in
    // and out rather than the label being quietly reversed.
    slider(
      t('designTracePaths'),
      { min: 0, max: 100, value: Math.round(((2 - this.traceOpts.detail) / 2) * 100), low: t('designTraceLow'), high: t('designTraceHigh') },
      (v) => {
        this.traceOpts.detail = Math.max(0, 2 - (v / 100) * 2)
      },
      adv
    )
    slider(
      t('designTraceCorners'),
      { min: 25, max: 85, value: this.traceOpts.cornerDeg, low: t('designTraceMore'), high: t('designTraceLess') },
      (v) => {
        this.traceOpts.cornerDeg = v
      },
      adv
    )
    const noise = document.createElement('input')
    noise.type = 'number'
    noise.className = 'dz-trace-val'
    noise.min = '0'
    noise.max = '100'
    noise.placeholder = t('designTraceAuto')
    noise.value = this.traceOpts.noise === 'auto' ? '' : String(this.traceOpts.noise)
    noise.addEventListener('input', () => {
      const v = Number(noise.value)
      this.traceOpts.noise = noise.value === '' || !Number.isFinite(v) ? 'auto' : Math.max(0, v)
    })
    row(t('designTraceNoise'), noise, adv)

    check(
      t('designTraceSnapLines'),
      this.traceOpts.snapLines,
      (v) => {
        this.traceOpts.snapLines = v
      },
      adv
    )

    const bg = document.createElement('select')
    for (const [value, label] of [
      ['auto', t('designTraceBgAuto')],
      ['true', t('designTraceBgAlways')],
      ['false', t('designTraceBgKeep')]
    ]) {
      const o = document.createElement('option')
      o.value = value
      o.textContent = label
      bg.append(o)
    }
    bg.value = String(this.traceOpts.ignoreBackground)
    bg.addEventListener('change', () => {
      this.traceOpts.ignoreBackground = bg.value === 'auto' ? 'auto' : bg.value === 'true'
    })
    row(t('designTraceBackground'), bg, adv)

    // ── Create ────────────────────────────────────────────────────────────
    const createHead = document.createElement('div')
    createHead.className = 'dz-trace-sec'
    createHead.textContent = t('designTraceCreate')
    body.append(createHead)
    check(t('designTraceSmooth'), this.traceOpts.smooth, (v) => {
      this.traceOpts.smooth = v
    })
    check(t('designTraceStrokes'), this.traceOpts.strokes, (v) => {
      this.traceOpts.strokes = v
    }).title = t('designTraceStrokesHint')
    check(t('designTraceGradients'), this.traceOpts.gradients, (v) => {
      this.traceOpts.gradients = v
    }).title = t('designTraceGradientsHint')

    // ── Ignore colour: the eyedropper knock-out list ───────────────────────
    const picks = document.createElement('div')
    picks.className = 'dz-trace-picks'
    const renderPicks = () => {
      picks.innerHTML = ''
      for (const [i, c] of this.traceOpts.dropColors.entries()) {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = 'dz-trace-chip'
        chip.style.background = `rgb(${c[0]},${c[1]},${c[2]})`
        chip.title = t('designTraceRemovePick')
        chip.addEventListener('click', () => {
          this.traceOpts.dropColors.splice(i, 1)
          renderPicks()
          this.schedulePreview()
        })
        picks.append(chip)
      }
      if (!this.traceOpts.dropColors.length) {
        const hint = document.createElement('span')
        hint.className = 'dz-trace-hint'
        hint.textContent = t('designTraceNoPicks')
        picks.append(hint)
      }
    }
    renderPicks()
    this.controls.tracePicks = picks

    const pickRow = document.createElement('div')
    pickRow.className = 'dz-trace-pickrow'
    const pick = document.createElement('button')
    pick.type = 'button'
    pick.className = 'dz-trace-eyedrop'
    pick.innerHTML = DesignApp.TOOL_ICONS.eyedropper
    pick.title = t('designTracePickBg')
    pick.addEventListener('click', () => {
      this.pickForTrace = true
      this.setTool('eyedropper')
      this.setStatus(t('designTracePickHint'))
    })
    const pickLabel = document.createElement('span')
    pickLabel.textContent = t('designTraceIgnoreColor')
    pickRow.append(pickLabel, pick)
    body.append(pickRow, picks)

    // ── Info: what the last run actually produced ─────────────────────────
    const info = document.createElement('div')
    info.className = 'dz-trace-info'
    this.controls.traceInfo = info
    body.append(info)

    // ── Preview + Trace ───────────────────────────────────────────────────
    const foot = document.createElement('div')
    foot.className = 'dz-trace-foot'
    const prevWrap = document.createElement('label')
    prevWrap.className = 'dz-trace-check'
    const preview = document.createElement('input')
    preview.type = 'checkbox'
    preview.checked = this.previewOn
    preview.title = t('designTracePreviewHint')
    preview.addEventListener('change', () => {
      this.previewOn = preview.checked
      if (this.previewOn) void this.renderPreview()
      else {
        this.clearPreview()
        this.setStatus('')
      }
    })
    const prevLabel = document.createElement('span')
    prevLabel.textContent = t('designTracePreview')
    prevWrap.append(preview, prevLabel)
    const run = document.createElement('button')
    run.type = 'button'
    run.className = 'dz-trace-btn dz-trace-run'
    run.textContent = t('designTraceRun')
    run.addEventListener('click', () => void this.traceSelectedImage())
    foot.append(prevWrap, run)
    panel.append(foot)

    this.syncTraceInfo()
    // ONE listener for the whole panel: every knob refreshes the preview
    panel.addEventListener('input', () => this.schedulePreview())
    panel.addEventListener('change', () => this.schedulePreview())
    this.root.append(panel)
  }

  /**
   * The Info block: what the last run produced, and the resolution the next
   * one will use.
   *
   * The resolution is shown because it is NOT constant — a large palette is
   * traced at a smaller raster (see traceCap), and a cost the user cannot see
   * is a cost they will blame on the wrong thing.
   */
  private syncTraceInfo(stats?: { paths: number; anchors: number; colors: number }) {
    const el = this.controls.traceInfo as HTMLElement | undefined
    if (!el) return
    el.innerHTML = ''
    const cell = (label: string, value: string) => {
      const d = document.createElement('div')
      const v = document.createElement('b')
      v.textContent = value
      const l = document.createElement('span')
      l.textContent = label
      d.append(v, l)
      el.append(d)
    }
    cell(t('designTraceInfoPaths'), String(stats?.paths ?? 0))
    cell(t('designTraceInfoAnchors'), String(stats?.anchors ?? 0))
    cell(t('designTraceInfoColors'), String(stats?.colors ?? 0))
    cell(t('designTraceInfoRes'), `${this.traceCap()}px`)
  }

  /**
   * The raster size the full trace runs at.
   *
   * Cost grows with the palette: every colour becomes its own layer, and every
   * layer is matched against the whole palette. Holding the pixel count times
   * that growth roughly constant keeps a 200-colour trace in the same time
   * budget as the 32-colour one, instead of taking minutes in silence.
   *
   * At or below 32 colours — which includes 'auto' — this is exactly the 2000
   * it has always been, so a normal trace is unchanged.
   */
  private traceCap(): number {
    const n = this.traceOpts.colors === 'auto' ? 32 : this.traceOpts.colors
    if (n <= 32) return 2000
    return Math.max(700, Math.round(2000 * Math.sqrt(32 / n)))
  }

  private refreshTracePicks() {
    const picks = this.controls.tracePicks
    if (!picks || !this.tracePanel) return
    // rebuild by reopening: the closure above owns the rendering
    this.tracePanel.remove()
    this.tracePanel = null
    this.toggleTracePanel()
  }

  /**
   * Illustrator's Image Trace, our own implementation: the selected picture is
   * rasterised at a capped resolution, quantised, contour-traced (see
   * trace.ts) and the result REPLACES it with real vector shapes that can then
   * be moved, recoloured and exported as vectors.
   */
  /** What the tracer will be pointed at: a selected image, or the page when a
   * picture was opened as the artwork itself. */
  private traceTarget(): {
    img: PlacedImage | null
    bitmap: HTMLImageElement
    area: { x: number; y: number; w: number; h: number }
  } | null {
    const img = this.selectedImage()
    const pageWide = !img && this.kind === 'raster' && !!this.rasterSource && !!this.pageInfo
    if (!img && !pageWide) return null
    const bitmap = img ? this.bitmaps.get(img.id) : this.rasterSource
    if (!bitmap) return null
    return {
      img,
      bitmap,
      area: img
        ? { x: img.x, y: img.y, w: img.w, h: img.h }
        : { x: 0, y: 0, w: this.pageInfo!.widthPt, h: this.pageInfo!.heightPt }
    }
  }

  /**
   * Run the tracer at a given raster cap and hand back the paths.
   *
   * ONE code path serves both the preview and the commit — a preview produced
   * by different code would be a promise the result does not keep. Only the
   * resolution differs: the preview trades detail for speed.
   */
  private traceAt(
    target: NonNullable<ReturnType<DesignApp['traceTarget']>>,
    capPx: number
  ): { paths: ReturnType<typeof traceImage>; cw: number; ch: number } | null {
    const { img, bitmap } = target
    const { sx, sy, sw, sh } = img
      ? cropRectPx(img)
      : { sx: 0, sy: 0, sw: bitmap.naturalWidth, sh: bitmap.naturalHeight }
    const scale = Math.min(1, capPx / Math.max(sw, sh))
    const cw = Math.max(1, Math.round(sw * scale))
    const ch = Math.max(1, Math.round(sh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cw, ch)
    const { data } = ctx.getImageData(0, 0, cw, ch)
    const paths = traceImage(data, cw, ch, this.traceRunOptions(cw, ch))
    return { paths, cw, ch }
  }

  /**
   * The raster the tracer works on, without running it.
   *
   * Split out of traceAt so the worker path rasterises EXACTLY the same way
   * the synchronous preview does — two rasterisers would be two different
   * pictures, and the promise "the preview is what you will get" would be a
   * lie at the first rounding difference.
   */
  private traceRaster(
    target: NonNullable<ReturnType<DesignApp['traceTarget']>>,
    capPx: number
  ): { data: Uint8ClampedArray; cw: number; ch: number } | null {
    const { img, bitmap } = target
    const { sx, sy, sw, sh } = img
      ? cropRectPx(img)
      : { sx: 0, sy: 0, sw: bitmap.naturalWidth, sh: bitmap.naturalHeight }
    const scale = Math.min(1, capPx / Math.max(sw, sh))
    const cw = Math.max(1, Math.round(sw * scale))
    const ch = Math.max(1, Math.round(sh * scale))
    const canvas = document.createElement('canvas')
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, cw, ch)
    return { data: ctx.getImageData(0, 0, cw, ch).data, cw, ch }
  }

  /**
   * Trace off the main thread.
   *
   * Falls back to the synchronous path when a Worker cannot be created — the
   * app must still trace in an environment without workers, just less politely.
   */
  private async traceOffThread(
    target: NonNullable<ReturnType<DesignApp['traceTarget']>>,
    capPx: number,
    onLayers?: (paths: TracedPath[], progress: number) => void
  ): Promise<{ paths: TracedPath[]; cw: number; ch: number } | null> {
    const raster = this.traceRaster(target, capPx)
    if (!raster) return null
    const { data, cw, ch } = raster
    try {
      this.traceClient ??= new TraceClient()
      const job = this.traceClient.trace(data, cw, ch, this.traceRunOptions(cw, ch), (p) => {
        if (p.paths?.length) onLayers?.(p.paths, p.value)
      })
      this.traceJob = job
      const paths = await job.promise
      this.traceJob = null
      return { paths, cw, ch }
    } catch {
      this.traceJob = null
      // getImageData already gave us the pixels; the worker transferred its
      // copy, so re-rasterise rather than reading a detached buffer.
      const again = this.traceRaster(target, capPx)
      if (!again) return null
      return {
        paths: traceImage(again.data, again.cw, again.ch, this.traceRunOptions(again.cw, again.ch)),
        cw: again.cw,
        ch: again.ch
      }
    }
  }

  /** Stop a running trace. Cooperative: it lands within one layer. */
  cancelTrace(): void {
    this.traceJob?.cancel()
  }

  /**
   * One traced path -> one canvas shape.
   *
   * Shared by the LIVE PREVIEW and the committed result, deliberately: two
   * converters would mean the preview showed something the commit did not
   * reproduce, which is the one promise a preview has to keep.
   */
  private tracedToShape(
    pth: TracedPath,
    area: { x: number; y: number; w: number; h: number },
    kx: number,
    ky: number
  ): Shape | null {
    const d = scalePathData(pth.d, kx, ky)
    if (!d) return null
    return {
      id: `shape-${++this.shapeIdSeq}`,
      kind: 'path',
      x: area.x,
      y: area.y,
      w: area.w,
      h: area.h,
      // a centreline arrives as a STROKE: no fill, the colour on the pen
      fill: pth.strokeWidth ? '' : pth.fill,
      stroke: pth.strokeWidth ? pth.fill : '',
      strokeWidth: pth.strokeWidth ? Math.max(0.25, pth.strokeWidth * ((kx + ky) / 2)) : 0.25,
      d,
      // the gradient lives in the same source-pixel space as the path, so it
      // takes the same scale onto the placed shape
      ...(pth.gradient
        ? {
            gradient: {
              x1: pth.gradient.x1 * kx,
              y1: pth.gradient.y1 * ky,
              x2: pth.gradient.x2 * kx,
              y2: pth.gradient.y2 * ky,
              from: pth.gradient.from,
              to: pth.gradient.to
            }
          }
        : {})
    }
  }

  /** The tracer settings the panel currently describes. */
  private traceRunOptions(cw: number, ch: number) {
    return {
      colors: this.traceOpts.colors,
      minArea:
        this.traceOpts.noise === 'auto'
          ? Math.max(2, (cw * ch) / 400000)
          : this.traceOpts.noise,
      simplify: this.traceOpts.detail,
      smooth: this.traceOpts.smooth,
      ignoreBackground: this.traceOpts.ignoreBackground,
      dropColors: this.traceOpts.dropColors,
      mode: this.traceOpts.mode,
      threshold: this.traceOpts.threshold,
      cornerDeg: this.traceOpts.cornerDeg,
      gradients: this.traceOpts.gradients,
      strokes: this.traceOpts.strokes,
      snapLines: this.traceOpts.snapLines
    }
  }

  /** Drop the preview overlay (on commit, on close, on a new document). */
  private clearPreview() {
    this.previewEl?.remove()
    this.previewEl = null
  }

  /** Re-run the preview soon; repeated edits collapse into one run. */
  private schedulePreview() {
    if (!this.previewOn) return
    if (this.previewTimer !== null) window.clearTimeout(this.previewTimer)
    this.previewTimer = window.setTimeout(() => {
      this.previewTimer = null
      void this.renderPreview()
    }, 260)
  }

  /**
   * Draw the trace result over the artwork without committing it.
   *
   * Runs at a much smaller raster than the real trace: a preview exists to
   * answer "are the settings right", and waiting seconds per keystroke would
   * defeat that. The status line says so, so the shown detail is never
   * mistaken for the final quality.
   */
  private async renderPreview() {
    if (!this.previewOn || !this.pageEl || !this.pageInfo) return
    if (this.previewBusy) {
      this.previewDirty = true
      return
    }
    const target = this.traceTarget()
    if (!target) {
      this.clearPreview()
      return
    }
    this.previewBusy = true
    try {
      await new Promise((r) => setTimeout(r, 0))
      const out = this.traceAt(target, 700)
      if (!out || !this.previewOn) {
        this.clearPreview()
        return
      }
      const pxPerPt = this.pxPerPt()
      if (!this.previewEl) {
        this.previewEl = document.createElement('div')
        this.previewEl.className = 'dz-trace-preview'
        this.pageEl.append(this.previewEl)
      }
      const { area } = target
      Object.assign(this.previewEl.style, {
        left: `${area.x * pxPerPt}px`,
        top: `${area.y * pxPerPt}px`,
        width: `${area.w * pxPerPt}px`,
        height: `${area.h * pxPerPt}px`
      })
      const svg = pathsToSvg(out.paths, out.cw, out.ch)
      this.previewEl.innerHTML = svg.replace(
        /<svg /,
        '<svg preserveAspectRatio="none" style="width:100%;height:100%" '
      )
      this.setStatus(`${t('designTracePreviewOn')} — ${out.paths.length}`)
    } finally {
      this.previewBusy = false
      if (this.previewDirty) {
        this.previewDirty = false
        this.schedulePreview()
      }
    }
  }

  private async traceSelectedImage() {
    const target = this.traceTarget()
    if (!target) {
      this.setStatus(t('designTraceNoImage'))
      return
    }
    const { img, area } = target
    this.setStatus(t('designTraceWorking'))
    try {
      // Cap the working raster at 2000px. The curve fitter averages the pixel
      // staircase away, so a finer staircase means a truer edge — the manager
      // asked for accuracy over speed, and this is where that trade is made.
      //
      // Off the main thread since M5: the window stays live, the status line
      // counts the layers as they land, and Cancel actually stops.
      // Layers are DRAWN as they arrive, not merely counted: the worker emits
      // each colour as it finishes, and watching the artwork build is what
      // tells the user whether the colour count is right — the whole reason
      // the pipeline was made progressive.
      const preview: Shape[] = []
      // The progressive layers are DRAWN as they arrive, which means EVERY way
      // out of this function has to take them back down again. Leaving them
      // behind is what put half-finished, low-resolution vectors on the canvas
      // beside the untouched picture — shapes the user never asked for and
      // could not account for.
      const dropPreview = () => {
        if (!preview.length) return
        const ids = new Set(preview.map((p) => p.id))
        this.shapes = this.shapes.filter((sh) => !ids.has(sh.id))
        preview.length = 0
        // Filtering the array is not enough: the nodes are already in the DOM
        // and stay there until something redraws.
        this.renderShapes()
        this.renderLayers()
      }
      this.tracePreviewCleanup = dropPreview
      const out = await this.traceOffThread(target, this.traceCap(), (layers, progress) => {
        this.setStatus(`${t('designTraceWorking')} ${Math.round(progress * 100)}%`)
        for (const p of layers) {
          const shape = this.tracedToShape(p, area, 1, 1)
          if (shape) {
            preview.push(shape)
            this.shapes.push(shape)
          }
        }
        if (layers.length) this.renderShapes()
      })
      // The preview shapes are provisional — the committed result below is
      // built from the FINAL paths at the real scale, so they are removed
      // rather than left as duplicates underneath it.
      dropPreview()
      if (!out) throw new Error('no ctx')
      const { paths, cw, ch } = out
      if (!paths.length) {
        this.setStatus(t('designTraceEmpty'))
        return
      }
      // source pixels → the pt box the picture occupies on the page
      const kx = area.w / cw
      const ky = area.h / ch
      for (const pth of paths) {
        const shape = this.tracedToShape(pth, area, kx, ky)
        if (shape) this.shapes.push(shape)
      }
      this.clearPreview()
      this.lastTraceSvg = pathsToSvg(paths, cw, ch)
      if (img) {
        this.removeImage(img.id) // the vectors stand in for it now
      } else {
        // the page WAS the picture: blank it so only the vectors remain
        this.rasterSource = null
        await this.renderRasterPage()
      }
      this.renderShapes()
      this.renderLayers()
      this.setDirty(true)
      const anchors = paths.reduce(
        (n, pth) => n + (pth.d.match(/[CLM]/g)?.length ?? 0),
        0
      )
      this.syncTraceInfo({
        paths: paths.length,
        anchors,
        colors: new Set(paths.map((pth) => pth.fill)).size
      })
      this.setStatus(
        `${t('designTraceDone')} — ${t('designTraceStats')
          .replace('{p}', String(paths.length))
          .replace('{a}', String(anchors))}`
      )
    } catch (err) {
      console.warn('[design] trace failed', err)
      // A failure part-way through leaves the layers drawn so far sitting on
      // top of the picture they came from. Take them down before saying so.
      this.tracePreviewCleanup?.()
      this.setStatus('')
      alert(t('designTraceFailed'))
    } finally {
      this.tracePreviewCleanup = null
    }
  }

  // ---------------- images / logos ----------------

  private selectedImage(): PlacedImage | null {
    return this.images.find((i) => i.id === this.selectedImageId) ?? null
  }

  /** Pick a PNG/JPEG and drop it on the page at a sane size. */
  private async insertImage() {
    if (!this.pageInfo) return
    const file = await pickImageFile()
    if (!file) return
    const src = await new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result))
      r.onerror = () => reject(r.error)
      r.readAsDataURL(file)
    }).catch(() => '')
    if (!isEmbeddableImage(src)) {
      alert(t('designImageKind'))
      return
    }
    const bitmap = await loadBitmap(src).catch(() => null)
    if (!bitmap) {
      alert(t('designImageFailed'))
      return
    }
    // a fresh logo lands at half the page's short side, centred
    const { w, h } = fitIntoPage(
      bitmap.naturalWidth,
      bitmap.naturalHeight,
      Math.min(this.pageInfo.widthPt, this.pageInfo.heightPt) * 0.5
    )
    const img: PlacedImage = {
      id: `img-${++this.imageIdSeq}`,
      x: (this.pageInfo.widthPt - w) / 2,
      y: (this.pageInfo.heightPt - h) / 2,
      w,
      h,
      src,
      naturalW: bitmap.naturalWidth,
      naturalH: bitmap.naturalHeight
    }
    this.bitmaps.set(img.id, bitmap)
    this.images.push(img)
    this.renderImages()
    this.renderLayers()
    this.selectImage(img.id)
    this.setDirty(true)
    this.setTool('select')
  }

  private selectImage(id: string | null) {
    if (id && this.multi.size) this.clearMulti()
    if (id) {
      this.select(null)
      this.selectShape(null)
    }
    this.selectedImageId = id
    for (const el of this.imageLayer?.querySelectorAll('.dz-img') ?? []) {
      el.classList.toggle('selected', (el as HTMLElement).dataset.img === id)
    }
    for (const row of this.layersEl?.querySelectorAll('.dz-layer') ?? []) {
      row.classList.toggle('selected', (row as HTMLElement).dataset.img === id)
    }
    this.syncOverlay()
  }

  private removeImage(id: string) {
    this.images = this.images.filter((i) => i.id !== id)
    this.bitmaps.delete(id)
    if (this.selectedImageId === id) this.selectedImageId = null
    this.multi.delete(id)
    this.pruneGroupsNow()
    this.pruneMotionNow()
    this.renderImages()
    this.renderLayers()
    this.setDirty(true)
  }

  private renderImages() {
    const layer = this.imageLayer
    if (!layer || !this.pageInfo) return
    layer.innerHTML = ''
    const pxPerPt = this.pxPerPt()
    for (const img of this.images) {
      const wrap = document.createElement('div')
      wrap.className = `dz-img${img.id === this.selectedImageId ? ' selected' : ''}${
        this.multi.has(img.id) ? ' in-group' : ''
      }${this.isDimmed(img.id) ? ' dimmed' : ''}`
      wrap.dataset.img = img.id
      Object.assign(wrap.style, {
        left: `${img.x * pxPerPt}px`,
        top: `${img.y * pxPerPt}px`,
        width: `${img.w * pxPerPt}px`,
        height: `${img.h * pxPerPt}px`,
        // v4: rotate about the box centre so the CSS matches the canvas and
        // PDF paths, which both rotate about the centre too
        transform: img.rotation ? `rotate(${img.rotation}deg)` : '',
        opacity: img.opacity !== undefined && img.opacity < 1 ? String(Math.max(0, img.opacity)) : ''
      })
      const clip = document.createElement('div')
      clip.className = 'dz-img-clip'
      const el = document.createElement('img')
      el.src = img.src
      el.draggable = false
      if (img.crop) {
        // show only the kept region by scaling the picture up inside the frame
        const c = img.crop
        const kx = 1 / Math.max(0.01, 1 - c.l - c.r)
        const ky = 1 / Math.max(0.01, 1 - c.t - c.b)
        Object.assign(el.style, {
          width: `${kx * 100}%`,
          height: `${ky * 100}%`,
          marginInlineStart: `${-c.l * kx * 100}%`,
          marginTop: `${-c.t * ky * 100}%`
        })
      }
      clip.append(el)
      wrap.append(clip)
      // The corner grip that used to live here is gone: the shared overlay
      // (handles.ts) now gives images the same eight grips, rotation and crop
      // that shapes have, instead of one resize-only corner.
      wrap.addEventListener('pointerdown', (ev) => this.beginImageDrag(ev, img))
      layer.append(wrap)
    }
  }

  private beginImageDrag(e: PointerEvent, img: PlacedImage) {
    if (this.tool !== 'select') return
    if (e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      this.toggleInSelection(img.id)
      return
    }
    if (this.multi.has(img.id)) {
      this.beginMultiDrag(e)
      return
    }
    if (this.selectWholeGroup(e, img.id)) return
    this.clearMulti()
    e.preventDefault()
    e.stopPropagation()
    this.selectImage(img.id)
    const pxPerPt = this.pxPerPt()
    const startX = e.clientX
    const startY = e.clientY
    const origX = img.x
    const origY = img.y
    const wrap = e.currentTarget as HTMLElement
    wrap.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      img.x = origX + (ev.clientX - startX) / pxPerPt
      img.y = origY + (ev.clientY - startY) / pxPerPt
      wrap.style.left = `${img.x * pxPerPt}px`
      wrap.style.top = `${img.y * pxPerPt}px`
    }
    const up = (ev: PointerEvent) => {
      try {
        wrap.releasePointerCapture(ev.pointerId)
      } catch {
        /* re-rendered mid-drag */
      }
      wrap.removeEventListener('pointermove', move)
      wrap.removeEventListener('pointerup', up)
      this.setDirty(true)
    }
    wrap.addEventListener('pointermove', move)
    wrap.addEventListener('pointerup', up)
  }

  /** Bitmaps are cached per image id; a re-opened sidecar has none yet. */
  private async ensureBitmaps() {
    for (const img of this.images) {
      if (this.bitmaps.has(img.id)) continue
      const bm = await loadBitmap(img.src).catch(() => null)
      if (bm) this.bitmaps.set(img.id, bm)
    }
  }

  /**
   * pdf-lib can embed a PNG/JPEG but cannot crop one, so any cropped image is
   * re-encoded to exactly its visible region before export. Uncropped images
   * are handed over untouched (no quality loss, no re-encode).
   */
  private async imagesForExport(): Promise<PlacedImage[]> {
    const out: PlacedImage[] = []
    for (const img of this.images) {
      if (!img.crop) {
        out.push(img)
        continue
      }
      const bm = this.bitmaps.get(img.id)
      if (!bm) continue
      const { sx, sy, sw, sh } = cropRectPx(img)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw))
      canvas.height = Math.max(1, Math.round(sh))
      const ctx = canvas.getContext('2d')
      if (!ctx) continue
      ctx.drawImage(bm, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      out.push({ ...img, src: canvas.toDataURL('image/png'), crop: undefined, naturalW: canvas.width, naturalH: canvas.height })
    }
    return out
  }

  // ---------------- shapes ----------------

  private selectedShape(): Shape | null {
    return this.shapes.find((s) => s.id === this.selectedShapeId) ?? null
  }

  /** Drag from the press point: exactly how Illustrator's shape tools behave —
   * shift constrains to a square/circle (or 45° steps for line/arrow). */
  private beginShapeDraw(e: PointerEvent, kind: ShapeKind) {
    if (!this.pageEl) return
    e.preventDefault()
    const rect = this.pageEl.getBoundingClientRect()
    const pxPerPt = this.pxPerPt()
    const x0 = (e.clientX - rect.left) / pxPerPt
    const y0 = (e.clientY - rect.top) / pxPerPt
    const shape = newShape(`shape-${++this.shapeIdSeq}`, kind, x0, y0)
    shape.fill = kind === 'rect' || kind === 'ellipse' ? this.shapeStyle.fill : ''
    shape.stroke = this.shapeStyle.stroke
    shape.strokeWidth = this.shapeStyle.strokeWidth
    this.shapes.push(shape)
    this.pageEl.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      let dx = (ev.clientX - rect.left) / pxPerPt - x0
      let dy = (ev.clientY - rect.top) / pxPerPt - y0
      if (ev.shiftKey) {
        if (kind === 'line' || kind === 'arrow') {
          // snap to the nearest 45°
          const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
          const len = Math.hypot(dx, dy)
          dx = Math.cos(a) * len
          dy = Math.sin(a) * len
        } else {
          const side = Math.max(Math.abs(dx), Math.abs(dy))
          dx = Math.sign(dx) * side
          dy = Math.sign(dy) * side
        }
      }
      shape.w = dx
      shape.h = dy
      this.renderShapes()
    }
    const up = (ev: PointerEvent) => {
      this.pageEl?.releasePointerCapture(ev.pointerId)
      this.pageEl?.removeEventListener('pointermove', move)
      this.pageEl?.removeEventListener('pointerup', up)
      // a click without a drag leaves nothing behind
      if (Math.abs(shape.w) < 2 && Math.abs(shape.h) < 2) {
        this.shapes = this.shapes.filter((s) => s !== shape)
      } else {
        this.selectShape(shape.id)
        this.setDirty(true)
      }
      this.setTool('select')
      this.renderShapes()
      this.renderLayers()
    }
    this.pageEl.addEventListener('pointermove', move)
    this.pageEl.addEventListener('pointerup', up)
  }

  // ─── marquee: select several objects and move them together ───────────────

  /** Everything on the current artboard that a marquee can pick up. */
  private selectables(): Selectable[] {
    return [
      ...this.shapes.map(shapeSelectable),
      ...this.images.map(imageSelectable),
      ...this.boxes.map(boxSelectable)
    ]
  }

  /** Drag a band over the canvas; on release, select what it touched. */
  private beginMarquee(e: PointerEvent) {
    const page = this.pageEl
    if (!page) return
    const k = this.pxPerPt()
    const rect = page.getBoundingClientRect()
    const x0 = (e.clientX - rect.left) / k
    const y0 = (e.clientY - rect.top) / k
    this.clearMulti()

    const move = (ev: PointerEvent) => {
      const x1 = (ev.clientX - rect.left) / k
      const y1 = (ev.clientY - rect.top) / k
      this.drawMarquee(dragRect(x0, y0, x1, y1))
    }
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      this.marqueeEl?.remove()
      this.marqueeEl = null
      const band = dragRect(x0, y0, (ev.clientX - rect.left) / k, (ev.clientY - rect.top) / k)
      // Sweeping ONE member of a group takes the whole group with it: a
      // marquee that half-selected a group would then scale half of it.
      const live = this.isolatedIds()
      const pool = live ? this.selectables().filter((it) => live.has(it.id)) : this.selectables()
      const raw = marqueeHits(band, pool)
      const hits = live ? raw : resolveSelection(this.groups(), raw)
      if (!hits.length) return
      // A single hit is an ordinary selection, not a group: the user gets the
      // resize and rotate handles they would have got by clicking it.
      if (hits.length === 1) {
        this.selectAnyById(hits[0])
        return
      }
      this.multi = new Set(hits)
      this.syncOverlay()
      this.renderShapes()
      this.setStatus(t('designSelectedN').replace('{n}', String(hits.length)))
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Shift+click: add to or remove from the selection.
   *
   * Starting from a SINGLE selection folds that object in first, so
   * shift-clicking a second object gives two — not one, which is what happens
   * if the existing single selection is ignored.
   */
  private toggleInSelection(id: string) {
    if (!this.multi.size) {
      const current = this.selectedShapeId ?? this.selectedImageId ?? this.selectedId
      if (current && current !== id) this.multi.add(current)
    }
    const g = groupOf(this.groups(), id)
    const touched = g ? g.children : [id]
    // A group joins and leaves a selection as a UNIT — removing one member
    // would leave a group that is only partly selected, and the next drag
    // would tear it in half.
    if (touched.every((c) => this.multi.has(c))) for (const c of touched) this.multi.delete(c)
    else for (const c of touched) this.multi.add(c)
    if (this.multi.size === 1) {
      // One left is an ordinary selection, with its own handles back.
      const only = [...this.multi][0]
      this.multi.clear()
      this.selectAnyById(only)
      return
    }
    this.selectedShapeId = null
    this.selectedImageId = null
    this.selectedId = null
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.syncOverlay()
    this.setStatus(
      this.multi.size ? t('designSelectedN').replace('{n}', String(this.multi.size)) : ''
    )
  }

  /** Every id on the artboard — Ctrl+A. */
  private selectAll() {
    // Select All means "everything I can currently touch", which inside a
    // group is the group's own members.
    const live = this.isolatedIds()
    const ids = this.selectables()
      .map((s) => s.id)
      .filter((id) => !live || live.has(id))
    if (ids.length < 2) {
      if (ids.length === 1) this.selectAnyById(ids[0])
      return
    }
    this.selectedShapeId = null
    this.selectedImageId = null
    this.selectedId = null
    this.multi = new Set(ids)
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.syncOverlay()
    this.setStatus(t('designSelectedN').replace('{n}', String(ids.length)))
  }

  /** The ids currently selected, single or multi. */
  private selectionIds(): string[] {
    if (this.multi.size) return [...this.multi]
    const one = this.selectedShapeId ?? this.selectedImageId ?? this.selectedId
    return one ? [one] : []
  }

  /**
   * Nudge with the arrow keys. Shift makes it a coarse step.
   *
   * 1pt and 10pt rather than 1px and 10px: the canvas measures in points, and
   * a nudge that moved by a pixel would move by 0.75pt and never land back on
   * a whole coordinate.
   */
  private nudge(dx: number, dy: number) {
    const ids = this.selectionIds()
    if (!ids.length) return
    moveSelection(new Set(ids), this.shapes, this.images, this.boxes, dx, dy)
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.syncOverlay()
    this.setDirty(true)
  }

  /** Duplicate the selection, offset so the copy is visibly a copy. */
  private duplicateSelection() {
    const ids = new Set(this.selectionIds())
    if (!ids.size) return
    const OFFSET = 10
    const newIds: string[] = []
    for (const s of this.shapes.filter((x) => ids.has(x.id))) {
      const copy: Shape = { ...s, id: `shape-${++this.shapeIdSeq}`, x: s.x + OFFSET, y: s.y + OFFSET }
      this.shapes.push(copy)
      newIds.push(copy.id)
    }
    for (const i of this.images.filter((x) => ids.has(x.id))) {
      const copy: PlacedImage = { ...i, id: `img-${++this.imageIdSeq}`, x: i.x + OFFSET, y: i.y + OFFSET }
      this.images.push(copy)
      // The bitmap is already decoded; sharing it means the copy appears
      // immediately instead of flashing empty until a re-decode finishes.
      const bm = this.bitmaps.get(i.id)
      if (bm) this.bitmaps.set(copy.id, bm)
      newIds.push(copy.id)
    }
    for (const b of this.boxes.filter((x) => ids.has(x.id))) {
      const copy: TextBox = { ...b, id: `box-${++this.boxIdSeq}`, x: b.x + OFFSET, y: b.y + OFFSET }
      this.boxes.push(copy)
      newIds.push(copy.id)
    }
    if (!newIds.length) return
    // The COPIES become the selection, so a second duplicate stacks rather
    // than making a second copy of the original in the same place.
    this.multi = newIds.length > 1 ? new Set(newIds) : new Set()
    if (newIds.length === 1) this.selectAnyById(newIds[0])
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.syncOverlay()
    this.setDirty(true)
    this.setStatus(t('designDuplicated').replace('{n}', String(newIds.length)))
  }

  // ─── z-order ──────────────────────────────────────────────────────────────

  /**
   * Move the selection through the paint order.
   *
   * Array order IS paint order for shapes and images, so this is a reorder of
   * those arrays. The selected objects keep their RELATIVE order among
   * themselves — scrambling a group's internal stacking while raising it would
   * silently rearrange artwork the user did not touch.
   */
  private reorderZ(where: 'front' | 'back' | 'forward' | 'backward') {
    const ids = new Set(this.selectionIds())
    if (!ids.size) return
    const move = <T extends { id: string }>(list: T[]): T[] => {
      const picked = list.filter((x) => ids.has(x.id))
      if (!picked.length) return list
      const rest = list.filter((x) => !ids.has(x.id))
      if (where === 'front') return [...rest, ...picked]
      if (where === 'back') return [...picked, ...rest]
      // One STEP: shift the whole block by one position, clamped at the ends.
      const first = list.findIndex((x) => ids.has(x.id))
      const last = list.length - 1 - [...list].reverse().findIndex((x) => ids.has(x.id))
      const at = where === 'forward' ? Math.min(rest.length, first + 1) : Math.max(0, first - 1)
      if (where === 'forward' && last >= list.length - 1) return list
      if (where === 'backward' && first <= 0) return list
      const out = [...rest]
      out.splice(at, 0, ...picked)
      return out
    }
    this.shapes = move(this.shapes)
    this.images = move(this.images)
    this.renderShapes()
    this.renderImages()
    this.renderLayers()
    this.setDirty(true)
  }

  // ─── clipboard ────────────────────────────────────────────────────────────

  /** Copy the selection. An internal clipboard, not the OS one: the objects
   * are our own model and round-tripping them through text would lose the
   * bitmaps images carry. */
  private clipboard: { shapes: Shape[]; images: PlacedImage[]; boxes: TextBox[] } | null = null

  private copySelection() {
    const ids = new Set(this.selectionIds())
    if (!ids.size) return
    this.clipboard = {
      shapes: this.shapes.filter((x) => ids.has(x.id)).map((x) => ({ ...x })),
      images: this.images.filter((x) => ids.has(x.id)).map((x) => ({ ...x })),
      boxes: this.boxes.filter((x) => ids.has(x.id)).map((x) => ({ ...x }))
    }
    this.setStatus(t('designCopied').replace('{n}', String(ids.size)))
  }

  private pasteClipboard() {
    const c = this.clipboard
    if (!c) return
    const OFFSET = 12
    const newIds: string[] = []
    for (const sh of c.shapes) {
      const copy = { ...sh, id: `shape-${++this.shapeIdSeq}`, x: sh.x + OFFSET, y: sh.y + OFFSET }
      this.shapes.push(copy)
      newIds.push(copy.id)
    }
    for (const im of c.images) {
      const copy = { ...im, id: `img-${++this.imageIdSeq}`, x: im.x + OFFSET, y: im.y + OFFSET }
      this.images.push(copy)
      newIds.push(copy.id)
    }
    for (const b of c.boxes) {
      const copy = { ...b, id: `box-${++this.boxIdSeq}`, x: b.x + OFFSET, y: b.y + OFFSET }
      this.boxes.push(copy)
      newIds.push(copy.id)
    }
    if (!newIds.length) return
    // Pasting across ARTBOARDS is the point of a clipboard, so the bitmaps are
    // re-resolved rather than assumed present on this page.
    void this.ensureBitmaps().then(() => this.renderImages())
    this.multi = newIds.length > 1 ? new Set(newIds) : new Set()
    if (newIds.length === 1) this.selectAnyById(newIds[0])
    this.renderShapes()
    this.renderBoxes()
    this.renderLayers()
    this.syncOverlay()
    this.setDirty(true)
    this.setStatus(t('designPasted').replace('{n}', String(newIds.length)))
  }

  /** Align or distribute the selection. */
  private arrange(mode: AlignMode | DistributeMode) {
    const ids = new Set(this.selectionIds())
    if (ids.size < 2) {
      this.setStatus(t('designArrangeNeedTwo'))
      return
    }
    const items = this.selectables().filter((s) => ids.has(s.id))
    const deltas =
      mode === 'horizontal' || mode === 'vertical'
        ? distributeDeltas(items, mode)
        : alignDeltas(items, mode)
    if (!deltas.size) {
      this.setStatus(t('designArrangeNothing'))
      return
    }
    // Each object moves by its OWN delta, so this cannot use moveSelection —
    // that applies one delta to everything, which is the opposite operation.
    for (const [id, [dx, dy]] of deltas) {
      const sh = this.shapes.find((x) => x.id === id)
      if (sh) {
        sh.x += dx
        sh.y += dy
        continue
      }
      const im = this.images.find((x) => x.id === id)
      if (im) {
        im.x += dx
        im.y += dy
        continue
      }
      const b = this.boxes.find((x) => x.id === id)
      if (b) {
        b.x += dx
        b.y += dy
      }
    }
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.syncOverlay()
    this.setDirty(true)
  }

  /**
   * Combine the selected shapes into one — Illustrator's Pathfinder, boiled
   * down to the four everyone actually reaches for. Only shapes participate
   * (a boolean op on a text box or a placed image is not a meaningful
   * operation); the result replaces every input shape and becomes the new
   * selection, matching how expandSelection/releaseSelected already leave
   * the user pointed at what they just made.
   */
  private applyBoolean(op: BooleanKind) {
    const ids = new Set(this.selectionIds())
    const targets = this.shapes.filter((s) => ids.has(s.id))
    if (targets.length < 2) {
      this.setStatus(t('designArrangeNeedTwo'))
      return
    }
    const result = booleanOp(targets, op)
    if (!result) {
      this.setStatus(t('designBooleanEmpty'))
      return
    }
    result.id = `shape-${++this.shapeIdSeq}`
    this.shapes = this.shapes.filter((s) => !ids.has(s.id))
    this.shapes.push(result)
    this.selectShape(result.id)
    this.renderShapes()
    this.renderLayers()
    this.syncOverlay()
    this.setDirty(true)
  }

  /** Select one object by id, whatever kind it is. */
  /**
   * The single choke point for "select this object".
   *
   * A grouped object never selects alone: touching one member selects every
   * member, which is the entire behaviour of a group at the canvas. Putting it
   * HERE rather than at each call site is what stops a click, a marquee, a
   * layers row and a shift-click from each having their own idea of it.
   */
  private selectAnyById(id: string) {
    // Inside a group, its members are ordinary objects again — selecting one
    // must NOT drag the other eleven along. That is the whole point of having
    // stepped in.
    const g = this.isolated ? null : groupOf(this.groups(), id)
    if (g) {
      this.selectedShapeId = null
      this.selectedImageId = null
      this.selectedId = null
      this.multi = new Set(g.children)
      this.renderShapes()
      this.syncOverlay()
      this.renderLayers()
      return
    }
    if (this.shapes.some((s) => s.id === id)) this.selectShape(id)
    else if (this.images.some((i) => i.id === id)) this.selectImage(id)
    else this.select(id)
  }

  /** This page's groups. Absent until something is actually grouped. */
  private groups() {
    return this.studio.groups[String(this.page)] ?? []
  }

  private setGroups(list: ReturnType<DesignApp['groups']>) {
    const page = String(this.page)
    if (list.length) this.studio.groups[page] = list
    else delete this.studio.groups[page]
  }

  /**
   * Group the selection — Ctrl+G, Illustrator's binding.
   *
   * Nothing MOVES: the flat arrays are untouched and only the side-table
   * changes, so every renderer and exporter carries on unaware. What changes
   * is that the members now select, scale and rotate as one.
   */
  private groupSelection() {
    const ids = this.selectionIds()
    const next = makeGroup(this.groups(), ids, `group-${++this.shapeIdSeq}`, t('designGroupName'))
    if (!next) {
      this.setStatus(t('designGroupNeedsTwo'))
      return
    }
    this.setGroups(next)
    this.multi = new Set(resolveSelection(next, ids))
    this.selectedShapeId = null
    this.selectedImageId = null
    this.selectedId = null
    this.renderShapes()
    this.syncOverlay()
    this.renderLayers()
    this.setDirty(true)
    this.setStatus(t('designGroupDone').replace('{n}', String(this.multi.size)))
  }

  /** Break the selection's groups apart — Ctrl+Shift+G. */
  private ungroupSelection() {
    const ids = this.selectionIds()
    const next = ungroup(this.groups(), ids)
    if (!next) {
      this.setStatus(t('designUngroupNone'))
      return
    }
    this.setGroups(next)
    // The group you were inside no longer exists; staying "inside" it would
    // leave every other object dimmed with no way back but Escape.
    if (this.isolated && !this.groups().some((g) => g.id === this.isolated)) this.exitIsolation()
    this.renderLayers()
    this.setDirty(true)
    this.setStatus(t('designUngroupDone'))
  }

  /**
   * Drop group members that no longer exist.
   *
   * Deleting artwork does not go through the group table, so without this a
   * group slowly fills with the ids of things that are gone — and selecting
   * one of its survivors would keep dragging a phantom along.
   */
  private pruneGroupsNow() {
    const live = new Set<string>([
      ...this.shapes.map((x) => x.id),
      ...this.images.map((x) => x.id),
      ...this.boxes.map((x) => x.id)
    ])
    const before = this.groups()
    if (!before.length) return
    const after = pruneGroups(before, live)
    if (after.length !== before.length || after.some((g, i) => g !== before[i])) this.setGroups(after)
  }

  /**
   * Drop motions whose objects are gone.
   *
   * Same reason as the group prune: deleting artwork does not go through the
   * motion table, and an interaction left pointing at nothing would export a
   * CSS rule that matches nothing.
   */
  private pruneMotionNow() {
    const page = String(this.page)
    const list = this.studio.interactions[page]
    if (!list?.length) return
    const live = new Set<string>([
      ...this.shapes.map((x) => x.id),
      ...this.images.map((x) => x.id),
      ...this.boxes.map((x) => x.id)
    ])
    const next = pruneInteractions(list, live)
    if (next.length === list.length) return
    if (next.length) this.studio.interactions[page] = next
    else delete this.studio.interactions[page]
    this.motionPanel?.refresh()
  }

  private clearMulti() {
    if (!this.multi.size) return
    this.multi.clear()
    this.renderShapes()
    this.syncOverlay()
  }

  /** The rubber band itself, drawn in the shape layer's pt space. */
  private drawMarquee(band: Box) {
    const layer = this.shapeLayer
    if (!layer) return
    if (!this.marqueeEl) {
      this.marqueeEl = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      this.marqueeEl.setAttribute('class', 'dz-marquee')
      layer.append(this.marqueeEl)
    }
    this.marqueeEl.setAttribute('x', String(band.x))
    this.marqueeEl.setAttribute('y', String(band.y))
    this.marqueeEl.setAttribute('width', String(band.w))
    this.marqueeEl.setAttribute('height', String(band.h))
  }

  /** Drag the whole multi-selection. */
  private beginMultiDrag(e: PointerEvent) {
    const page = this.pageEl
    if (!page || !this.multi.size) return
    e.preventDefault()
    e.stopPropagation()
    const k = this.pxPerPt()
    let lastX = e.clientX
    let lastY = e.clientY
    const move = (ev: PointerEvent) => {
      // Deltas are applied INCREMENTALLY rather than from the gesture start,
      // because moveSelection mutates in place — recomputing from the origin
      // would apply the whole offset again on every frame.
      moveSelection(this.multi, this.shapes, this.images, this.boxes, (ev.clientX - lastX) / k, (ev.clientY - lastY) / k)
      lastX = ev.clientX
      lastY = ev.clientY
      this.renderShapes()
      this.renderImages()
      this.renderBoxes()
      this.syncOverlay()
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      this.renderLayers()
      this.setDirty(true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** Delete everything in a multi-selection. */
  private removeMulti() {
    if (!this.multi.size) return
    this.shapes = this.shapes.filter((s) => !this.multi.has(s.id))
    for (const i of this.images) if (this.multi.has(i.id)) this.bitmaps.delete(i.id)
    this.images = this.images.filter((i) => !this.multi.has(i.id))
    this.boxes = this.boxes.filter((b) => !this.multi.has(b.id))
    this.multi.clear()
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.syncOverlay()
    this.setDirty(true)
  }

  // ─── the selection overlay ────────────────────────────────────────────────

  /** The object the grips are currently driving, or null. */
  private overlayTarget(): { box: Box; rotation: number; cropable: boolean } | null {
    // A multi-selection is framed by the union of its members' ROTATED bounds
    // — an unrotated union would draw a frame that visibly excludes artwork
    // the user can see is selected. It offers no rotation or crop: those are
    // per-object operations with no single sensible group meaning yet.
    if (this.multi.size) {
      const box = unionBox(this.selectables().filter((s) => this.multi.has(s.id)))
      return box ? { box, rotation: 0, cropable: false } : null
    }
    const img = this.selectedImage()
    if (img) {
      return {
        box: { x: img.x, y: img.y, w: img.w, h: img.h },
        rotation: img.rotation ?? 0,
        cropable: true
      }
    }
    const s = this.selectedShape()
    if (s) return { box: shapeBBox(s), rotation: s.rotation ?? 0, cropable: false }
    return null
  }

  /** Push the current selection into the overlay (or clear it). */
  private syncOverlay() {
    // Shown from ONE object, because z-order applies to a single object too;
    // the align buttons say so themselves when pressed with fewer than two.
    const bar = this.controls.alignBar as HTMLElement | undefined
    if (bar) bar.hidden = this.selectionIds().length < 1
    this.syncToolbar()
    this.renderInspector()
    this.syncLayerTargets()
    // Node editing is bound to ONE path; any selection change ends it, or the
    // grips would describe geometry that is no longer selected.
    if (this.nodeEditor?.editing && this.selectedShape()?.kind !== 'path') {
      this.nodeEditor.close()
      ;(this.controls.nodes as HTMLElement | undefined)?.classList.remove('active')
    }
    if (this.nodeEditor?.editing) return
    const t = this.overlayTarget()
    if (!t?.cropable && this.overlay?.isCropMode()) {
      this.overlay.setCropMode(false)
      ;(this.controls.crop as HTMLElement | undefined)?.classList.remove('active')
    }
    if (!t) {
      this.overlay?.show(null)
      return
    }
    const img = this.selectedImage()
    this.overlay?.show({
      box: t.box,
      rotation: t.rotation,
      cropable: t.cropable,
      ...(img?.crop ? { crop: img.crop } : {})
    })
  }

  /**
   * Edges and centres worth snapping to: the page, and every OTHER object on
   * it. The selected object is excluded — snapping a thing to itself would
   * pin it in place the moment the drag started.
   */
  private snapTargets(): { x: number[]; y: number[] } {
    const xs: number[] = []
    const ys: number[] = []
    if (this.pageInfo) {
      xs.push(0, this.pageInfo.widthPt / 2, this.pageInfo.widthPt)
      ys.push(0, this.pageInfo.heightPt / 2, this.pageInfo.heightPt)
    }
    const push = (b: Box) => {
      xs.push(b.x, b.x + b.w / 2, b.x + b.w)
      ys.push(b.y, b.y + b.h / 2, b.y + b.h)
    }
    for (const s of this.shapes) {
      if (s.id === this.selectedShapeId) continue
      push(rotatedAABB(shapeBBox(s), s.rotation ?? 0))
    }
    for (const i of this.images) {
      if (i.id === this.selectedImageId) continue
      push(rotatedAABB({ x: i.x, y: i.y, w: i.w, h: i.h }, i.rotation ?? 0))
    }
    return { x: xs, y: ys }
  }

  /**
   * The selection's geometry when a group gesture began.
   *
   * Every frame recomputes from THIS, never from the frame before it. Applying
   * a scale incrementally accumulates rounding into visible drift, and applying
   * a rotation incrementally compounds its own error until the group visibly
   * skews — the same reason the single-object drag keeps a startBox.
   */
  private groupStart: {
    ids: string
    box: Box
    shapes: Array<{ ref: Shape; snap: Shape }>
    images: Array<{ ref: PlacedImage; snap: PlacedImage }>
    boxes: Array<{ ref: TextBox; snap: TextBox }>
  } | null = null

  /**
   * Snapshot the selection, or return the one already taken for this gesture.
   *
   * Re-taken when the selection changes so a stale snapshot cannot resurrect
   * objects that are no longer selected.
   */
  private groupSnapshot(): NonNullable<DesignApp['groupStart']> | null {
    const ids = [...this.multi].sort().join(',')
    if (this.groupStart?.ids === ids) return this.groupStart
    const box = unionBox(this.selectables().filter((s) => this.multi.has(s.id)))
    if (!box) return null
    this.groupStart = {
      ids,
      box,
      shapes: this.shapes.filter((sh) => this.multi.has(sh.id)).map((ref) => ({ ref, snap: { ...ref } })),
      images: this.images.filter((im) => this.multi.has(im.id)).map((ref) => ({ ref, snap: { ...ref } })),
      boxes: this.boxes.filter((b) => this.multi.has(b.id)).map((ref) => ({ ref, snap: { ...ref } }))
    }
    return this.groupStart
  }

  /**
   * Scale a whole selection.
   *
   * Without this the eight grips around a multi-selection were decoration:
   * applyOverlayResize only knew how to move ONE object, so dragging them did
   * nothing at all. An icon arrives as several separate paths, which is
   * exactly why "the icon cannot be enlarged".
   */
  private resizeGroup(to: Box) {
    const g = this.groupSnapshot()
    if (!g) return
    const sx = g.box.w > 0 ? to.w / g.box.w : 1
    const sy = g.box.h > 0 ? to.h / g.box.h : 1
    const map = (b: Box): Box => scaleInGroup(b, g.box, to)
    for (const { ref, snap } of g.shapes) {
      // The UNROTATED box is what gets mapped: a non-uniform scale of a rotated
      // object needs a shear, which no shape here can express. Hold Shift for a
      // uniform scale and the result is exact for rotated members too.
      const snapBox = shapeBBox(snap)
      Object.assign(ref, applyBoxToShape(snap, map(snapBox)))
      // Strokes ride the resize with the shape — from the SNAPSHOT, so a long
      // drag cannot accumulate drift.
      if (this.scaleStrokes && snap.stroke) {
        ref.strokeWidth = Math.min(300, Math.max(0.1, snap.strokeWidth * strokeScaleFactor(snapBox, shapeBBox(ref))))
      }
    }
    for (const { ref, snap } of g.images) {
      const nb = map({ x: snap.x, y: snap.y, w: snap.w, h: snap.h })
      ref.x = nb.x
      ref.y = nb.y
      ref.w = Math.max(1, nb.w)
      ref.h = Math.max(1, nb.h)
    }
    // Text cannot be stretched: there is no per-axis transform on a text box,
    // so the SMALLER factor scales the type. Using the larger one would push
    // the words outside the frame the user just drew.
    const f = Math.min(Math.abs(sx), Math.abs(sy))
    for (const { ref, snap } of g.boxes) {
      ref.x = to.x + (snap.x - g.box.x) * sx
      ref.y = to.y + (snap.y - g.box.y) * sy
      ref.width = snap.width * sx
      ref.sizePt = Math.min(200, Math.max(6, snap.sizePt * f))
    }
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
  }

  /** Turn a whole selection about its own centre. */
  private rotateGroup(deg: number) {
    const g = this.groupSnapshot()
    if (!g) return
    const [gcx, gcy] = boxCenter(g.box)
    // Each member ORBITS the group centre and spins by the same angle. Doing
    // only the second half rotates every object in place and the arrangement
    // never turns; doing only the first slides them round without facing the
    // new direction.
    const place = (b: Box): Box => orbitInGroup(b, [gcx, gcy], deg)
    const spin = (base: number | undefined): number => spinInGroup(base, deg)
    for (const { ref, snap } of g.shapes) {
      Object.assign(ref, applyBoxToShape(snap, place(shapeBBox(snap))))
      const r = spin(snap.rotation)
      if (r) ref.rotation = r
      else delete ref.rotation
    }
    for (const { ref, snap } of g.images) {
      const nb = place({ x: snap.x, y: snap.y, w: snap.w, h: snap.h })
      ref.x = nb.x
      ref.y = nb.y
      const r = spin(snap.rotation)
      if (r) ref.rotation = r
      else delete ref.rotation
    }
    // A text box has no rotation of its own, so it can only be carried round.
    for (const { ref, snap } of g.boxes) {
      const [nx, ny] = rotatePoint(snap.x, snap.y, gcx, gcy, deg)
      ref.x = nx
      ref.y = ny
    }
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
  }

  private applyOverlayResize(box: Box) {
    if (this.multi.size) {
      this.resizeGroup(box)
      return
    }
    const img = this.selectedImage()
    if (img) {
      img.x = box.x
      img.y = box.y
      img.w = Math.max(1, box.w)
      img.h = Math.max(1, box.h)
      this.renderImages()
      return
    }
    const s = this.selectedShape()
    if (!s) return
    // The factor is measured against the box THIS FRAME started from: the
    // gesture recomputes from its own start, so the per-frame ratios multiply
    // out to exactly the total.
    const prev = shapeBBox(s)
    // applyBoxToShape knows that a line's (w,h) is a SIGNED delta and that a
    // path's geometry lives in `d` — assigning the box directly would flip one
    // and leave the other at its old size.
    Object.assign(s, applyBoxToShape(s, box))
    if (this.scaleStrokes && s.stroke) {
      s.strokeWidth = Math.min(300, Math.max(0.1, s.strokeWidth * strokeScaleFactor(prev, shapeBBox(s))))
    }
    this.renderShapes()
  }

  /**
   * Drag the SELECTION by its own body.
   *
   * Deliberately not routed through applyOverlayResize: that rebuilds a path's
   * `d` every frame through the transform kernel, and a thousand identity
   * round-trips at three decimals over one long drag is a slow way to lose
   * geometry. A move only ever changes x and y.
   */
  private applyOverlayMove(box: Box) {
    if (this.multi.size) {
      // The group path already recomputes from a gesture-start snapshot, so a
      // pure translation through it carries no drift either.
      this.resizeGroup(box)
      return
    }
    const img = this.selectedImage()
    if (img) {
      img.x = box.x
      img.y = box.y
      this.renderImages()
      return
    }
    const s = this.selectedShape()
    if (s) {
      // A line's (x, y) is its FIRST ENDPOINT, not its bounding-box origin, so
      // the new box has to be applied as a delta rather than assigned.
      const b = shapeBBox(s)
      s.x += box.x - b.x
      s.y += box.y - b.y
      this.renderShapes()
      return
    }
    const tb = this.selectedBox()
    if (tb) {
      // …and a text box's x is its ANCHOR, which for a right-aligned box is
      // its right edge. Same reason, same fix.
      const measured = this.selectables().find((it) => it.id === tb.id)
      if (!measured) return
      tb.x += box.x - measured.box.x
      tb.y += box.y - measured.box.y
      this.renderBoxes()
    }
  }

  /**
   * Shift+click landed on the move plate, which covers the artwork.
   *
   * Hit-tested against our own model rather than the DOM: every object's box
   * is already known here, and the topmost one wins because that is what the
   * user can see.
   */
  /**
   * Grabbing a group member: select the whole group and drag that instead.
   *
   * Returns true when it took over, so each object's own drag can bail out.
   * Inside isolation it never takes over — the members are ordinary objects
   * there, which is the point of having stepped in.
   */
  private selectWholeGroup(e: PointerEvent, id: string): boolean {
    if (this.isolated) return false
    const g = groupOf(this.groups(), id)
    if (!g) return false
    e.preventDefault()
    e.stopPropagation()
    this.selectAnyById(id)
    this.beginMultiDrag(e)
    return true
  }

  /** The topmost object under a mouse event, by our own boxes. */
  private objectAt(e: MouseEvent): string | undefined {
    if (!this.pageEl) return undefined
    const r = this.pageEl.getBoundingClientRect()
    const k = this.pxPerPt()
    const x = (e.clientX - r.left) / k
    const y = (e.clientY - r.top) / k
    return [...this.selectables()]
      .reverse()
      .find((it) => x >= it.box.x && x <= it.box.x + it.box.w && y >= it.box.y && y <= it.box.y + it.box.h)?.id
  }

  private shiftPickAt(x: number, y: number) {
    const hit = [...this.selectables()]
      .reverse()
      .find((it) => x >= it.box.x && x <= it.box.x + it.box.w && y >= it.box.y && y <= it.box.y + it.box.h)
    if (hit) this.toggleInSelection(hit.id)
  }

  private applyOverlayRotation(deg: number) {
    if (this.multi.size) {
      this.rotateGroup(deg)
      return
    }
    const img = this.selectedImage()
    if (img) {
      if (deg) img.rotation = deg
      else delete img.rotation
      this.renderImages()
      return
    }
    const s = this.selectedShape()
    if (!s) return
    if (deg) s.rotation = deg
    else delete s.rotation
    this.renderShapes()
  }

  // ─── node editing, region release, stroke outlining (M2) ─────────────────

  /**
   * Live geometry from the node editor.
   *
   * The path's `d` is LOCAL to the shape, so an edit that moves a node outside
   * the old bounds must also move the shape's origin and resize its box —
   * otherwise the selection frame and the hit test drift away from the artwork
   * the user can see.
   */
  private applyNodeEdit(d: string) {
    const s = this.selectedShape()
    if (!s || s.kind !== 'path') return
    const b = pathBBox(d)
    if (!b) return
    if (b.x || b.y) {
      // rebase so `d` starts at the shape's own origin again
      const rebased = normalize(d)
      s.x += b.x
      s.y += b.y
      s.d = shiftPathD(rebased ?? d, -b.x, -b.y)
      this.nodeEditor?.open(s.d, s.x, s.y)
    } else {
      s.d = d
    }
    s.w = b.w
    s.h = b.h
    this.renderShapes()
    this.syncOverlay()
  }

  /** Enter or leave node-edit mode on the selected path. */
  private toggleNodeEdit() {
    const ed = this.nodeEditor
    if (!ed) return
    if (ed.editing) {
      ed.close()
      ;(this.controls.nodes as HTMLElement | undefined)?.classList.remove('active')
      this.setStatus('')
      this.syncOverlay()
      return
    }
    const s = this.selectedShape()
    if (!s || s.kind !== 'path' || !s.d) {
      this.setStatus(t('designNodeNeedsPath'))
      return
    }
    // Node editing and the resize frame compete for the same pixels, so the
    // frame stands down while nodes are being dragged.
    this.overlay?.show(null)
    ed.open(s.d, s.x, s.y)
    ;(this.controls.nodes as HTMLElement | undefined)?.classList.add('active')
    this.setStatus(t('designNodeHint'))
  }

  /**
   * Release a traced path into one shape per region, so a single petal can be
   * recoloured. Holes stay attached to their ring — see compound.ts for why
   * splitting them out would turn a donut into a disc.
   */
  private releaseSelected() {
    const s = this.selectedShape()
    if (!s || s.kind !== 'path') {
      this.setStatus(t('designNodeNeedsPath'))
      return
    }
    const parts = releaseCompound(s, `shape-${++this.shapeIdSeq}`)
    if (parts.length < 2) {
      this.setStatus(t('designReleaseNone'))
      return
    }
    const at = this.shapes.indexOf(s)
    this.shapes.splice(at, 1, ...parts)
    this.shapeIdSeq += parts.length
    this.selectShape(parts[0].id)
    this.renderShapes()
    this.renderLayers()
    this.setDirty(true)
    this.setStatus(t('designReleaseDone').replace('{n}', String(parts.length)))
  }

  /**
   * Expand — Illustrator's, in our vocabulary: turn what is DRAWN as a stroke
   * into filled artwork that can be recoloured, node-edited and booleaned.
   *
   * Three things it does that the old single-path version did not:
   *  - it works on the WHOLE selection, which is the only useful scope when an
   *    icon arrives as several separate runs;
   *  - it works on every KIND, because "outline this stroke" has to mean the
   *    same for a drawn rectangle as for a traced curve — each is converted to
   *    path data first;
   *  - a shape with BOTH a fill and a stroke expands into TWO objects, the
   *    fill and the outlined stroke, exactly as Illustrator does. Merging them
   *    would destroy the ability to recolour either one separately.
   *
   * `appearance` is Expand Appearance: the dash pattern is baked into real
   * geometry FIRST. A dash is a rendering instruction — outlining a dashed
   * path without baking it produces the outline of the whole unbroken run and
   * the dashes silently vanish.
   */
  private expandSelection(appearance = false) {
    const ids = new Set(this.selectionIds())
    const targets = this.shapes.filter((sh) => ids.has(sh.id))
    if (!targets.length) {
      this.setStatus(t('designOutlineFailed'))
      return
    }
    const added: Shape[] = []
    let changed = 0
    for (const s of targets) {
      const origin = shapeBBox(s)
      const d = shapeToPathD(s)
      if (!d) continue
      const hasStroke = !!s.stroke && s.strokeWidth > 0
      // A line IS its stroke: it has no fill to keep, so it becomes the
      // outline outright rather than splitting in two.
      const strokedOnly = s.kind === 'line' || s.kind === 'arrow' || !(s.fill || s.gradient)
      let outlined: string | null = null
      if (hasStroke) {
        const source = appearance && s.dash?.length ? (dashPathD(d, s.dash) ?? d) : d
        outlined = outlineStroke(source, s.strokeWidth, { cap: 'round', join: 'round' })
      }
      if (!outlined && s.kind === 'path' && !s.radius) continue
      if (outlined && !strokedOnly) {
        // fill and stroke both present: the stroke becomes its own object,
        // stacked directly above the fill it was drawn around.
        const extra: Shape = {
          id: `shape-${++this.shapeIdSeq}`,
          kind: 'path',
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          fill: s.stroke,
          stroke: '',
          strokeWidth: 0,
          d: ''
        }
        if (this.setPathGeometry(extra, origin.x, origin.y, outlined)) added.push(extra)
        this.setPathGeometry(s, origin.x, origin.y, d)
        s.stroke = ''
        s.strokeWidth = 0
        changed++
      } else if (outlined) {
        const fill = s.fill || s.stroke
        if (!this.setPathGeometry(s, origin.x, origin.y, outlined)) continue
        s.fill = fill
        s.stroke = ''
        s.strokeWidth = 0
        changed++
      } else {
        // No stroke to outline — the kind conversion is still the useful half
        // of Expand: a rounded rectangle becomes editable path geometry.
        if (!this.setPathGeometry(s, origin.x, origin.y, d)) continue
        changed++
      }
      // Both are now BAKED INTO the geometry; leaving them set would apply
      // them a second time on top of the artwork they already produced.
      delete s.radius
      if (appearance) delete s.dash
    }
    if (!changed) {
      this.setStatus(t('designOutlineFailed'))
      return
    }
    this.shapes.push(...added)
    this.renderShapes()
    this.renderLayers()
    this.syncOverlay()
    this.setDirty(true)
    this.setStatus(
      t(appearance ? 'designExpandAppearanceDone' : 'designExpandDone').replace('{n}', String(changed))
    )
  }

  /**
   * Rewrite a shape as path geometry.
   *
   * `d` is LOCAL to (absX, absY) — the shape's bounding-box origin BEFORE the
   * change, which is not the same as its x/y for a line, whose x/y is its
   * first endpoint. The new geometry is rebased onto its own origin so the
   * shape keeps the app-wide contract that a path's `d` starts at 0,0.
   */
  private setPathGeometry(s: Shape, absX: number, absY: number, d: string): boolean {
    const b = pathBBox(d)
    if (!b) return false
    const shifted = shiftPathD(d, -b.x, -b.y)
    if (!shifted) return false
    s.kind = 'path'
    s.x = absX + b.x
    s.y = absY + b.y
    s.w = Math.max(b.w, 0.01)
    s.h = Math.max(b.h, 0.01)
    s.d = shifted
    return true
  }

  // ─── MCP: where a tool call meets the open document ───────────────────────

  /**
   * The narrow view of the document the tool layer is allowed to see.
   *
   * Public because the MCP listener is registered at BOOT (src/main.ts), not
   * here: the app starts in sheet mode and this module is imported lazily, so
   * a bridge installed at mount() would leave every tool call unanswered until
   * the user happened to open the design page — which is exactly the hang this
   * moved to fix.
   */
  documentView(): DocumentView {
    const api = window.exelmj
    return {
      handoff: () => this.handoffInput(),
      placeComponent: (componentId, page, x, y) => this.placeComponentAt(componentId, page, x, y),
      markDirty: () => this.setDirty(true),
      // null in a plain browser tab (the dev preview), where there is no
      // preload bridge and therefore no native view to drive.
      browser: api?.studioBrowserOpen
        ? {
            open: async (url) => (await api.studioBrowserOpen(url)) ?? { ok: false },
            setDevice: async (device, opts) =>
              (await api.studioBrowserDevice(device, opts)) ?? { ok: false },
            screenshot: async () => (await api.studioBrowserShot()) ?? { ok: false },
            lastCapture: () => this.lastCapture,
            importCapture: (page, x, y) => this.importLastCapture(page, x, y)
          }
        : null
    }
  }

  /** The whole open design, in the shape the handoff and the tools expect. */
  private handoffInput(): HandoffInput | null {
    if (!this.filePath && !this.boxes.length && !this.shapes.length && !this.images.length) return null
    // The live page is written back first, or a tool would describe the state
    // as it was when the artboard was last switched.
    this.allPages[String(this.page)] = this.boxes
    this.allShapes[String(this.page)] = this.shapes
    this.allImages[String(this.page)] = this.images
    return {
      name: this.filePath ? basename(this.filePath) : t('designNewBlankShort'),
      writer: APP_VERSION,
      // Passed in rather than read from the clock inside the builder, so two
      // exports of an unchanged document differ only where the document did.
      generatedAt: new Date().toISOString(),
      pages: this.allPages,
      shapes: this.allShapes,
      images: this.allImages,
      studio: this.studio,
      // The HTML export cannot derive the paper size from the objects: shapes
      // say where things are, not how big the page is, and a page emitted at
      // the size of its contents crops every design that has margins.
      pageSize: this.pageInfo
        ? { [String(this.page)]: { widthPt: this.pageInfo.widthPt, heightPt: this.pageInfo.heightPt } }
        : {},
      dir: getLang() === 'ar' ? 'rtl' : 'ltr',
      lang: getLang()
    }
  }

  /** Place a component instance and return its id, or null when it cannot. */
  private placeComponentAt(componentId: string, page: string, x: number, y: number): string | null {
    if (!this.studio.components.some((c) => c.id === componentId)) return null
    const id = `inst-${++this.instanceSeq}`
    const list = this.studio.instances[page] ?? []
    list.push({ id, defId: componentId, x, y })
    this.studio.instances[page] = list
    // Only the CURRENT page can be drawn right now; another page's instance is
    // stored and appears when the user navigates to it.
    if (page === String(this.page)) this.renderLayers()
    return id
  }

  /**
   * Open or close the mini-browser.
   *
   * The native view paints ABOVE all renderer DOM, so it MUST be hidden
   * whenever the panel is not showing — otherwise it keeps covering whatever
   * is now in that part of the window.
   */
  private async toggleBrowser() {
    await this.openStudioTab(this.tab === 'browser' ? null : 'browser')
  }

  /**
   * An element captured from the embedded browser.
   *
   * Recorded as a CaptureRecord with its provenance and everything we could
   * not reproduce, so the handoff can say what is uncertain rather than
   * presenting a guess as a measurement.
   */
  /** The most recent capture, so picker_pick can hand it to Claude. */
  private lastCapture: Record<string, unknown> | null = null

  /**
   * Turn the last capture into objects on an artboard.
   *
   * The element's own box becomes a background rectangle and every CHILD that
   * carries text becomes a text box at its measured position. That is the
   * whole reason the guest preload exports per-node geometry: without it there
   * is nothing to place children AT, and an importer has to re-run layout to
   * recover boxes that were never recorded.
   */
  private importLastCapture(page: string, x: number, y: number): { ok: boolean; detail: string } {
    const cap = this.lastCapture
    if (!cap) return { ok: false, detail: 'Nothing has been picked yet.' }
    // The conversion itself is pure and lives in src/studio/captureImport.ts,
    // where the px->pt rule and the never-invent rule are unit-tested. This
    // method only owns the ids and the rendering.
    const result = importCapture(cap as Capture, {
      x,
      y,
      shapeId: () => `shape-${++this.shapeIdSeq}`,
      boxId: () => `box-${++this.boxIdSeq}`
    })
    if (!result.shapes.length && !result.boxes.length) {
      return { ok: false, detail: result.degraded.join(' ') || 'Nothing could be imported.' }
    }
    const shapes = [...(this.allShapes[page] ?? []), ...result.shapes]
    const boxes = [...(this.allPages[page] ?? []), ...result.boxes]
    this.allShapes[page] = shapes
    this.allPages[page] = boxes
    if (page === String(this.page)) {
      this.shapes = shapes
      this.boxes = boxes
      this.renderShapes()
      this.renderBoxes()
      this.renderLayers()
    }
    // Whatever could not be reproduced is recorded on the capture, so the
    // handoff states the uncertainty instead of presenting a guess.
    const record = this.studio.captures.find((c) => c.url === String(cap.url ?? ''))
    if (record) record.degraded.push(...result.degraded)
    this.setDirty(true)
    const n = result.shapes.length + result.boxes.length
    return {
      ok: true,
      detail: `imported ${n} object(s)${result.degraded.length ? ` — ${result.degraded.join(' ')}` : ''}`
    }
  }

  private onElementPicked(capture: Record<string, unknown>) {
    this.lastCapture = capture
    const box = (capture.box ?? {}) as Record<string, number>
    const degraded: string[] = []
    if (!Array.isArray(capture.children) || !capture.children.length) {
      degraded.push('No child geometry was captured — inner layout is unknown.')
    }
    const styles = (capture.styles ?? {}) as Record<string, string>
    if (styles['background-image'] && styles['background-image'] !== 'none') {
      degraded.push('A background image was not downloaded; only its CSS is recorded.')
    }
    let host = ''
    try {
      host = new URL(String(capture.url ?? '')).host
    } catch {
      /* a studio:// preview has no meaningful host */
    }
    this.studio.captures.push({
      id: `cap-${this.studio.captures.length + 1}`,
      url: String(capture.url ?? ''),
      host,
      capturedAt: new Date().toISOString(),
      degraded
    })
    // px -> pt: the canvas measures in points, and mixing the two is the one
    // error that reads as a design choice rather than a bug.
    const toPt = (v: number): number => Math.round(v * 0.75 * 100) / 100
    const w = toPt(box.wPx ?? 0)
    const h = toPt(box.hPx ?? 0)
    if (w > 0 && h > 0) {
      this.studio.components.push({
        id: `cap-def-${this.studio.components.length + 1}`,
        name: String(capture.tag ?? 'element'),
        type: String(capture.role ?? capture.tag ?? 'element'),
        source: String(capture.url ?? ''),
        content: {
          boxes: [],
          images: [],
          shapes: [
            {
              id: 'bg',
              kind: 'rect',
              x: 0,
              y: 0,
              w,
              h,
              fill: cssColorToHex(styles['background-color'] ?? '') || '#ffffff',
              stroke: '',
              strokeWidth: 1
            }
          ]
        }
      })
    }
    this.setDirty(true)
  }

  /**
   * The Studio dock shows ONE tab at a time.
   *
   * They cannot merely share the dock: the browser tab hosts a NATIVE view
   * that paints above all renderer DOM, so leaving it mounted while another
   * tab is showing would cover that tab with a web page. Every switch away
   * from `browser` therefore hides the native view, not just its container.
   *
   * Passing null closes the dock.
   */
  private async openStudioTab(tab: StudioTab | null) {
    const el = this.studioEl
    if (!el) return
    // Leaving the browser tab MUST detach the native view first.
    if (this.tab === 'browser' && tab !== 'browser') await this.browserPanel?.hide()
    this.tab = tab
    el.hidden = tab === null
    for (const [key, control] of [
      ['colors', this.controls.studio],
      ['icons', this.controls.icons],
      ['templates', this.controls.templates],
      ['layout', this.controls.layout],
      ['motion', this.controls.motion],
      ['browser', this.controls.browser]
    ] as const) {
      ;(control as HTMLElement | undefined)?.classList.toggle('active', tab === key)
    }
    for (const [key, host] of Object.entries(this.tabHosts)) {
      host.hidden = key !== tab
    }
    if (tab === 'colors') {
      this.colorPanel ??= new ColorPanel(this.tabHosts.colors, {
        tokens: () => this.studio.tokens,
        onChange: () => this.setDirty(true),
        selectedImagePixels: () => this.selectedImagePixels(),
        applyToSelection: (hex) => this.applyColorToSelection(hex),
        saveFile: (name, bytes) => void this.saveStudioFile(name, bytes)
      })
    }
    if (tab === 'icons') {
      this.iconPanel ??= new IconPanel(this.tabHosts.icons, {
        iconPaths: () => this.shapes.filter((sh) => sh.kind === 'path' && sh.d),
        updatePathD: (id, d) => {
          const sh = this.shapes.find((x) => x.id === id)
          if (!sh) return
          sh.d = d
          this.renderShapes()
          this.setDirty(true)
        },
        makeIconArtboard: (preset) => this.makeIconArtboard(preset),
        currentPreset: () => {
          const kind = this.studio.pageKind[String(this.page)]
          return kind?.kind === 'icon' ? presetById(kind.preset) : null
        },
        saveFile: (name, bytes) => void this.saveStudioFile(name, bytes),
        setStatus: (m) => this.setStatus(m),
        showGuides: (guides, live) => {
          this.iconGuides = guides
          this.iconLive = live
          this.renderShapes()
        },
        insertIcon: (name, paths, grid) => this.insertLibraryIcon(name, paths, grid)
      })
      this.iconPanel.refresh()
    } else {
      // Guides belong to the icon tab; leaving them drawn under another tab
      // would look like artwork the user cannot select or delete.
      if (this.iconGuides.length || this.iconLive) {
        this.iconGuides = []
        this.iconLive = null
        this.renderShapes()
      }
    }
    if (tab === 'motion') {
      this.motionPanel ??= new MotionPanel(this.tabHosts.motion, {
        objects: () => {
          const all = [
            // Groups first among equals: an ICON arrives as a group, and the
            // icon is what motion is usually for.
            ...this.groups().map((g) => ({
              id: g.id,
              label: g.name || t('designGroupName')
            })),
            ...this.shapes.map((sh) => ({ id: sh.id, label: t(`designShapeName_${sh.kind}`) })),
            ...this.images.map((im) => ({ id: im.id, label: t('designImageName') })),
            ...this.boxes.map((b) => ({
              id: b.id,
              label: b.text.trim().slice(0, 18) || t('designLayerEmptyText')
            }))
          ]
          // The selected object first, so a preset lands on the thing the
          // user is looking at rather than on whatever sorts first.
          const sel = new Set(this.selectionIds())
          const selGroup = this.groups().find((g) => g.children.some((c) => sel.has(c)))
          const first = selGroup?.id ?? this.selectionIds()[0]
          if (first) all.sort((a, b) => (a.id === first ? -1 : b.id === first ? 1 : 0))
          return all
        },
        memberMap: () =>
          Object.fromEntries(this.groups().map((g) => [g.id, g.children])),
        interactions: () => this.studio.interactions[String(this.page)] ?? [],
        save: (list) => {
          const page = String(this.page)
          if (list.length) this.studio.interactions[page] = list
          else delete this.studio.interactions[page]
          this.setDirty(true)
        },
        preview: (i) => this.previewMotion(i),
        highlight: (ids) => {
          this.motionHighlight = new Set(ids)
          this.renderShapes()
          this.renderImages()
        },
        setStatus: (m) => this.setStatus(m),
        nextId: () => `motion-${++this.shapeIdSeq}`
      })
      this.motionPanel.refresh()
    } else if (this.motionHighlight.size) {
      // The highlight belongs to the motion tab; leaving it drawn under
      // another tab marks objects for a reason the user can no longer see.
      this.motionHighlight.clear()
      this.renderShapes()
      this.renderImages()
    }
    if (tab === 'templates') {
      this.templatePanel ??= new TemplatePanel(this.tabHosts.templates, {
        appVersion: APP_VERSION,
        templates: () => this.studio.components,
        hasSelection: () => !!(this.selectedShapeId || this.selectedImageId || this.selectedId),
        saveSelection: (name) => this.saveSelectionAsTemplate(name),
        place: (defId) => this.placeTemplate(defId),
        remove: (defId) => this.removeTemplate(defId),
        add: (def) => {
          this.studio.components.push(def)
          this.setDirty(true)
        },
        saveFile: (n, b) => void this.saveStudioFile(n, b),
        openFile: () => this.openTemplateFile(),
        setStatus: (m) => this.setStatus(m)
      })
      this.templatePanel.refresh()
    }
    if (tab === 'layout') {
      this.layoutPanel ??= new LayoutPanel(this.tabHosts.layout, {
        frames: () => this.studio.frames[String(this.page)] ?? [],
        selectedFrame: () =>
          (this.studio.frames[String(this.page)] ?? []).find((f) => f.id === this.selectedFrameId) ?? null,
        selectFrame: (id) => {
          this.selectedFrameId = id
          this.renderShapes()
        },
        wrapSelection: () => this.wrapSelectionInFrame(),
        applyLayout: (frame) => this.applyFrameLayout(frame),
        unwrap: (id) => this.unwrapFrame(id),
        setStatus: (m) => this.setStatus(m)
      })
      this.layoutPanel.refresh()
    }
    if (tab === 'browser') {
      this.browserPanel ??= new BrowserPanel(this.tabHosts.browser, {
        onPicked: (capture) => this.onElementPicked(capture),
        pickProjectFolder: () => this.pickProjectFolder(),
        importLast: () => this.importLastCapture(String(this.page), 40, 40),
        setStatus: (m) => this.setStatus(m)
      })
      await this.browserPanel.show()
    }
  }

  private toggleStudio() {
    void this.openStudioTab(this.tab === 'colors' ? null : 'colors')
  }

  private async toggleIcons() {
    await this.openStudioTab(this.tab === 'icons' ? null : 'icons')
  }

  // ─── templates ────────────────────────────────────────────────────────────

  /** Everything currently selected, as a template-shaped selection. */
  private currentSelection() {
    const shape = this.selectedShape()
    const image = this.selectedImage()
    const box = this.selectedBox()
    return {
      boxes: box ? [box as unknown as Record<string, unknown>] : [],
      shapes: shape ? [shape] : [],
      images: image ? [image] : []
    }
  }

  private saveSelectionAsTemplate(name: string): ComponentDef | null {
    const sel = this.currentSelection()
    if (!sel.boxes.length && !sel.shapes.length && !sel.images.length) return null
    const def = defFromSelection(`def-${this.studio.components.length + 1}`, name, 'template', sel)
    this.studio.components.push(def)
    this.setDirty(true)
    return def
  }

  /**
   * Place a template.
   *
   * The instance is recorded in the side-table AND expanded into real objects
   * now, so it can be edited immediately. The record is what lets the handoff
   * report "this is one component used N times" rather than N unrelated copies.
   */
  private placeTemplate(defId: string): boolean {
    const def = this.studio.components.find((d) => d.id === defId)
    if (!def) return false
    const page = String(this.page)
    const inst = { id: `inst-${++this.instanceSeq}`, defId, x: 40, y: 40 }
    const list = this.studio.instances[page] ?? []
    list.push(inst)
    this.studio.instances[page] = list

    const e = expandInstance(inst, def)
    for (const b of e.boxes) this.boxes.push(b as unknown as TextBox)
    for (const sh of e.shapes) this.shapes.push(sh)
    for (const im of e.images) this.images.push(im)
    void this.ensureBitmaps().then(() => this.renderImages())
    this.renderBoxes()
    this.renderShapes()
    this.renderLayers()
    this.setDirty(true)
    return true
  }

  /**
   * Delete a definition and every instance of it.
   *
   * The already-expanded OBJECTS stay: they are ordinary shapes now, and
   * silently deleting artwork the user can see because a definition went away
   * would be the worst possible reading of "remove template".
   */
  private removeTemplate(defId: string): number {
    this.studio.components = this.studio.components.filter((d) => d.id !== defId)
    let n = 0
    for (const [page, list] of Object.entries(this.studio.instances)) {
      const kept = list.filter((i) => i.defId !== defId)
      n += list.length - kept.length
      if (kept.length) this.studio.instances[page] = kept
      else delete this.studio.instances[page]
    }
    this.setDirty(true)
    return n
  }

  private async openTemplateFile(): Promise<string | null> {
    const res = await window.exelmj?.openFile?.().catch(() => null)
    if (!res) return null
    return new TextDecoder('utf-8').decode(res.bytes)
  }

  // ─── auto-layout frames ───────────────────────────────────────────────────

  /**
   * Wrap what is selected into a frame.
   *
   * A frame needs at least two children to be doing anything, so a single
   * selection is refused rather than producing a frame that looks broken.
   */
  private wrapSelectionInFrame(): Frame | null {
    const ids: string[] = []
    if (this.selectedShapeId) ids.push(this.selectedShapeId)
    if (this.selectedImageId) ids.push(this.selectedImageId)
    if (this.selectedId) ids.push(this.selectedId)
    // One selected object plus everything else on the artboard is not a
    // selection; require a real multi-selection or fall back to the whole page.
    const members = ids.length > 1 ? ids : this.shapes.map((sh) => sh.id)
    if (members.length < 2) return null

    const boxes = members.map((id) => this.memberBox(id)).filter((b): b is Box => !!b)
    if (boxes.length < 2) return null
    const x = Math.min(...boxes.map((b) => b.x))
    const y = Math.min(...boxes.map((b) => b.y))
    const right = Math.max(...boxes.map((b) => b.x + b.w))
    const bottom = Math.max(...boxes.map((b) => b.y + b.h))

    const frame: Frame = {
      id: `frame-${++this.frameSeq}`,
      x,
      y,
      w: right - x,
      h: bottom - y,
      children: members,
      layout: {
        direction: 'row',
        gap: 8,
        padding: [0, 0, 0, 0],
        align: 'start',
        justify: 'start',
        wrap: false,
        // RTL by default, matching the app: a row of Arabic UI reads right to
        // left, and defaulting to ltr would mean every frame needs fixing.
        dir: getLang() === 'ar' ? 'rtl' : 'ltr'
      }
    }
    const page = String(this.page)
    this.studio.frames[page] = [...(this.studio.frames[page] ?? []), frame]
    this.applyFrameLayout(frame)
    return frame
  }

  /** The box of a frame member, whatever kind of object it is. */
  private memberBox(id: string): Box | null {
    const sh = this.shapes.find((x) => x.id === id)
    if (sh) return shapeBBox(sh)
    const im = this.images.find((x) => x.id === id)
    if (im) return { x: im.x, y: im.y, w: im.w, h: im.h }
    const b = this.boxes.find((x) => x.id === id)
    if (b) return { x: b.x, y: b.y, w: b.width || b.sizePt * 6, h: b.sizePt * 1.4 }
    return null
  }

  /**
   * Run the layout engine and write the result back as ABSOLUTE points.
   *
   * This is why frames need no exporter support: after this call the flat
   * arrays hold plain coordinates, and PDF/SVG/PNG/Word all keep working with
   * no knowledge that a frame exists.
   */
  private applyFrameLayout(frame: Frame) {
    const children: LayoutChild[] = []
    for (const id of frame.children) {
      const b = this.memberBox(id)
      if (b) children.push({ id, w: b.w, h: b.h })
    }
    if (!children.length) return
    const result = layoutFrame(frame, children)
    frame.w = result.frame.w
    frame.h = result.frame.h
    for (const laid of result.children) {
      const sh = this.shapes.find((x) => x.id === laid.id)
      if (sh) {
        Object.assign(sh, applyBoxToShape(sh, { x: frame.x + laid.x, y: frame.y + laid.y, w: laid.w, h: laid.h }))
        continue
      }
      const im = this.images.find((x) => x.id === laid.id)
      if (im) {
        im.x = frame.x + laid.x
        im.y = frame.y + laid.y
        im.w = laid.w
        im.h = laid.h
        continue
      }
      const b = this.boxes.find((x) => x.id === laid.id)
      if (b) {
        b.x = frame.x + laid.x
        b.y = frame.y + laid.y
      }
    }
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.setDirty(true)
  }

  /** Dissolve a frame. Its children keep exactly where the layout put them. */
  private unwrapFrame(id: string) {
    const page = String(this.page)
    const list = (this.studio.frames[page] ?? []).filter((f) => f.id !== id)
    if (list.length) this.studio.frames[page] = list
    else delete this.studio.frames[page]
    if (this.selectedFrameId === id) this.selectedFrameId = null
    this.renderShapes()
    this.setDirty(true)
  }

  /** Ask for a folder to serve. Falls back to the file picker's directory when
   * the app has no folder dialog — choosing any file inside it is the same
   * intent expressed differently. */
  private async pickProjectFolder(): Promise<string | null> {
    const res = await window.exelmj?.openFile?.().catch(() => null)
    if (!res?.path) return null
    const at = Math.max(res.path.lastIndexOf('\\'), res.path.lastIndexOf('/'))
    return at > 0 ? res.path.slice(0, at) : null
  }

  // ─── delivery ─────────────────────────────────────────────────────────────

  /** The whole design as a self-describing ZIP. */
  private async exportBundle() {
    const doc = this.handoffInput()
    if (!doc) {
      this.setStatus(t('studioExportEmpty'))
      return
    }
    this.setStatus(t('studioExportWorking'))
    try {
      const bytes = await toZip(doc)
      await this.saveStudioFile(`${stripExt(doc.name)}-handoff.zip`, bytes)
      this.setStatus(t('studioExportDone'))
    } catch (e) {
      this.setStatus(`${t('studioExportFailed')}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /** Just the Markdown spec, for pasting straight into a conversation. */
  private async exportHandoffMd() {
    const doc = this.handoffInput()
    if (!doc) {
      this.setStatus(t('studioExportEmpty'))
      return
    }
    await this.saveStudioFile(
      `${stripExt(doc.name)}-handoff.md`,
      new TextEncoder().encode(toMarkdown(doc))
    )
    this.setStatus(t('studioExportDone'))
  }

  /** Make the current artboard an icon canvas of this preset. */
  private makeIconArtboard(preset: IconPreset) {
    this.studio.pageKind[String(this.page)] = {
      kind: 'icon',
      grid: preset.grid,
      preset: preset.id
    }
    this.studio.icons[String(this.page)] = {
      grid: preset.grid,
      preset: preset.id,
      strokeWidth: preset.strokeWidth,
      targets: preset.sizes
    }
    this.setDirty(true)
    this.setStatus(t('studioIconArtboard').replace('{grid}', String(preset.grid)))
  }

  /**
   * Drop a library icon onto the artboard.
   *
   * The library is drawn on its OWN grid, so the paths are scaled to whatever
   * grid this artboard uses — inserting a 24-grid glyph onto a 16-grid canvas
   * without scaling would put most of it outside the page.
   */
  private insertLibraryIcon(name: string, paths: Array<{ d: string; strokeWidth: number }>, grid: number) {
    const kind = this.studio.pageKind[String(this.page)]
    const target = kind?.kind === 'icon' ? kind.grid : grid
    const k = target / grid
    // An icon arrives as SEVERAL runs, and each stays its OWN object — then
    // they are GROUPED.
    //
    // Merging them into one path was the wrong answer to the right problem: it
    // made the icon draggable as a unit, but it also welded details that have
    // gaps between them into geometry that then had to be cut apart again. A
    // group gives the same single-object handling AND keeps every run
    // separately selectable, recolourable and movable once you step inside it.
    // Two passes: gather the runs first, THEN place them. Placement needs the
    // union of all of them — the icon lands with its CENTRE on the artboard's
    // centre, not with the grid's origin in the page corner, which put every
    // icon in the top corner at thumbnail size and made it look lost.
    const runs: Array<{ d: string; x: number; y: number; w: number; h: number; strokeWidth: number }> = []
    for (const p of paths) {
      const scaled = k === 1 ? normalize(p.d) : transformPathD(p.d, { x: 0, y: 0, w: grid, h: grid }, { x: 0, y: 0, w: target, h: target })
      if (!scaled) continue
      const b = pathBBox(scaled)
      if (!b) continue
      runs.push({
        d: shiftPathD(scaled, -b.x, -b.y),
        x: b.x,
        y: b.y,
        w: Math.max(b.w, 0.01),
        h: Math.max(b.h, 0.01),
        strokeWidth: p.strokeWidth * k
      })
    }
    let dx = 0
    let dy = 0
    // An ICON CANVAS keeps the grid placement — there the grid position IS the
    // point. An ordinary page centres.
    if (kind?.kind !== 'icon' && this.pageInfo && runs.length) {
      const minX = Math.min(...runs.map((r) => r.x))
      const minY = Math.min(...runs.map((r) => r.y))
      const maxX = Math.max(...runs.map((r) => r.x + r.w))
      const maxY = Math.max(...runs.map((r) => r.y + r.h))
      dx = this.pageInfo.widthPt / 2 - (minX + maxX) / 2
      dy = this.pageInfo.heightPt / 2 - (minY + maxY) / 2
    }
    const ids: string[] = []
    for (const r of runs) {
      const id = `shape-${++this.shapeIdSeq}`
      this.shapes.push({
        id,
        kind: 'path',
        x: r.x + dx,
        y: r.y + dy,
        w: r.w,
        h: r.h,
        // A library icon is a STROKE, not a fill: it is drawn as outlines with
        // currentColor, and filling it would blot the glyph solid.
        fill: '',
        stroke: '#111111',
        strokeWidth: r.strokeWidth,
        d: r.d
      })
      ids.push(id)
    }
    if (ids.length > 1) {
      const next = makeGroup(this.groups(), ids, `group-${++this.shapeIdSeq}`, name)
      if (next) this.setGroups(next)
    }
    this.renderShapes()
    this.renderLayers()
    if (ids.length) this.selectAnyById(ids[0])
    this.setDirty(true)
    this.setStatus(t('studioIconInserted').replace('{name}', name))
  }

  /**
   * Pixels of the selected image, for extract-from-image.
   *
   * The bitmap is already decoded and cached (ensureBitmaps), so this only
   * has to rasterise it once into a scratch canvas — no re-decode, no file IO.
   */
  private selectedImagePixels(): { data: Uint8ClampedArray; w: number; h: number } | null {
    const img = this.selectedImage()
    const bm = img ? this.bitmaps.get(img.id) : null
    if (!img || !bm) return null
    const w = Math.max(1, Math.min(400, img.naturalW))
    const h = Math.max(1, Math.round((w / Math.max(1, img.naturalW)) * img.naturalH))
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(bm, 0, 0, w, h)
    try {
      return { data: ctx.getImageData(0, 0, w, h).data, w, h }
    } catch {
      // a tainted canvas cannot be read; say nothing rather than a wrong palette
      return null
    }
  }

  /** Paint the picked colour onto whatever is selected. */
  private applyColorToSelection(hex: string) {
    const s = this.selectedShape()
    if (s) {
      if (s.fill) s.fill = hex
      else s.stroke = hex
      this.renderShapes()
      this.setDirty(true)
      return
    }
    const box = this.selectedBox()
    if (box) {
      this.updateSelected({ color: hex })
    }
  }

  private async saveStudioFile(name: string, bytes: Uint8Array) {
    const api = window.exelmj
    if (!api?.saveFileAs) return
    // 'data' keeps the suggested extension instead of forcing a document type —
    // without it the dialog fell back to the xlsx filter and offered a token
    // file as a spreadsheet.
    await api.saveFileAs(bytes, name, 'data').catch(() => undefined)
  }

  /** Crop mode only means anything with an image selected. */
  private toggleCrop() {
    if (!this.overlay) return
    const img = this.selectedImage()
    if (!img) {
      this.setStatus(t('designCropNeedsImage'))
      return
    }
    const on = !this.overlay.isCropMode()
    this.overlay.setCropMode(on)
    ;(this.controls.crop as HTMLElement | undefined)?.classList.toggle('active', on)
    this.setStatus(on ? t('designCropHint') : '')
  }

  private applyOverlayCrop(crop: { l: number; t: number; r: number; b: number }) {
    const img = this.selectedImage()
    if (!img) return
    img.crop = crop
    this.renderImages()
  }

  private selectShape(id: string | null) {
    if (id && this.multi.size) this.clearMulti()
    this.selectedShapeId = id
    if (id) this.select(null)
    for (const el of this.shapeLayer?.querySelectorAll('[data-shape]') ?? []) {
      el.classList.toggle('selected', (el as SVGElement).dataset.shape === id)
    }
    const s = this.selectedShape()
    if (s) {
      const fill = this.controls.shape_fill as HTMLInputElement | undefined
      const stroke = this.controls.shape_stroke as HTMLInputElement | undefined
      if (fill && s.fill) fill.value = s.fill
      if (stroke && s.stroke) stroke.value = s.stroke
    }
    for (const row of this.layersEl?.querySelectorAll('.dz-layer') ?? []) {
      row.classList.toggle('selected', (row as HTMLElement).dataset.shape === id)
    }
    this.syncOverlay()
  }

  private removeShape(id: string) {
    this.shapes = this.shapes.filter((s) => s.id !== id)
    if (this.selectedShapeId === id) this.selectedShapeId = null
    this.multi.delete(id)
    this.pruneGroupsNow()
    this.pruneMotionNow()
    this.renderShapes()
    this.renderLayers()
    this.setDirty(true)
  }

  private renderShapes() {
    const layer = this.shapeLayer
    if (!layer || !this.pageInfo) return
    const pxPerPt = this.pxPerPt()
    layer.setAttribute('width', String(this.pageInfo.widthPt * pxPerPt))
    layer.setAttribute('height', String(this.pageInfo.heightPt * pxPerPt))
    layer.setAttribute('viewBox', `0 0 ${this.pageInfo.widthPt} ${this.pageInfo.heightPt}`)
    layer.innerHTML = ''
    const NS = 'http://www.w3.org/2000/svg'
    // Auto-layout frames are drawn as NON-PRINTING outlines, first of all, so
    // artwork sits on top. Without them a frame is invisible and the layout
    // panel reads as though it did nothing.
    for (const f of this.studio.frames[String(this.page)] ?? []) {
      const box = document.createElementNS(NS, 'rect')
      box.setAttribute('x', String(f.x))
      box.setAttribute('y', String(f.y))
      box.setAttribute('width', String(Math.max(0, f.w)))
      box.setAttribute('height', String(Math.max(0, f.h)))
      box.setAttribute(
        'class',
        `dz-frameguide${f.id === this.selectedFrameId ? ' selected' : ''}`
      )
      layer.append(box)
    }
    // Icon guides are NON-PRINTING and are drawn FIRST so artwork sits on top
    // of them. They carry no data-shape attribute, so nothing can select,
    // move, delete or export them — a guide that behaves like a shape is a
    // guide the user will accidentally ship.
    if (this.iconLive) {
      const live = document.createElementNS(NS, 'rect')
      live.setAttribute('x', String(this.iconLive.x))
      live.setAttribute('y', String(this.iconLive.y))
      live.setAttribute('width', String(this.iconLive.w))
      live.setAttribute('height', String(this.iconLive.h))
      live.setAttribute('class', 'dz-iconguide dz-iconlive')
      layer.append(live)
    }
    for (const g of this.iconGuides) {
      const node = document.createElementNS(NS, g.ellipse ? 'ellipse' : 'rect')
      if (g.ellipse) {
        node.setAttribute('cx', String(g.x + g.w / 2))
        node.setAttribute('cy', String(g.y + g.h / 2))
        node.setAttribute('rx', String(g.w / 2))
        node.setAttribute('ry', String(g.h / 2))
      } else {
        node.setAttribute('x', String(g.x))
        node.setAttribute('y', String(g.y))
        node.setAttribute('width', String(g.w))
        node.setAttribute('height', String(g.h))
        if (g.radius > 0) {
          node.setAttribute('rx', String(g.radius))
          node.setAttribute('ry', String(g.radius))
        }
      }
      node.setAttribute('class', 'dz-iconguide')
      layer.append(node)
    }
    for (const s of this.shapes) {
      const b = shapeBBox(s)
      let node: SVGElement
      if (s.kind === 'rect') {
        node = document.createElementNS(NS, 'rect')
        node.setAttribute('x', String(b.x))
        node.setAttribute('y', String(b.y))
        node.setAttribute('width', String(b.w))
        node.setAttribute('height', String(b.h))
      } else if (s.kind === 'ellipse') {
        node = document.createElementNS(NS, 'ellipse')
        node.setAttribute('cx', String(b.x + b.w / 2))
        node.setAttribute('cy', String(b.y + b.h / 2))
        node.setAttribute('rx', String(b.w / 2))
        node.setAttribute('ry', String(b.h / 2))
      } else if (s.kind === 'path') {
        node = document.createElementNS(NS, 'path')
        node.setAttribute('d', s.d ?? '')
        node.setAttribute('fill-rule', 'evenodd')
        // The fill/stroke decision is shapePaint()'s — pure, and unit-tested
        // for the case that used to be wrong: a path carrying BOTH painted
        // only its fill, so recolouring a traced outline did nothing visible.
        const paint = shapePaint(s)
        if (paint.fill === 'gradient' && s.gradient) {
          // userSpaceOnUse in the path's own local coordinates, which the
          // translate above then moves with the shape
          let defs = layer.querySelector('defs')
          if (!defs) {
            defs = document.createElementNS(NS, 'defs')
            layer.prepend(defs)
          }
          const id = `dzgrad-${s.id}`
          const lg = document.createElementNS(NS, 'linearGradient')
          lg.setAttribute('id', id)
          lg.setAttribute('gradientUnits', 'userSpaceOnUse')
          lg.setAttribute('x1', String(s.gradient.x1))
          lg.setAttribute('y1', String(s.gradient.y1))
          lg.setAttribute('x2', String(s.gradient.x2))
          lg.setAttribute('y2', String(s.gradient.y2))
          for (const [offset, color] of [
            ['0', s.gradient.from],
            ['1', s.gradient.to]
          ]) {
            const stop = document.createElementNS(NS, 'stop')
            stop.setAttribute('offset', offset)
            stop.setAttribute('stop-color', color)
            lg.append(stop)
          }
          defs.append(lg)
          node.setAttribute('fill', `url(#${id})`)
        } else {
          node.setAttribute('fill', paint.fill)
        }
        if (paint.stroke) {
          node.setAttribute('stroke', paint.stroke)
          node.setAttribute('stroke-width', String(s.strokeWidth))
          node.setAttribute('stroke-linecap', 'round')
          node.setAttribute('stroke-linejoin', 'round')
        }
      } else {
        node = document.createElementNS(NS, 'g')
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('x1', String(s.x))
        line.setAttribute('y1', String(s.y))
        line.setAttribute('x2', String(s.x + s.w))
        line.setAttribute('y2', String(s.y + s.h))
        line.setAttribute('stroke', s.stroke || '#000')
        line.setAttribute('stroke-width', String(s.strokeWidth))
        line.setAttribute('stroke-linecap', 'round')
        node.append(line)
        if (s.kind === 'arrow') {
          const { tip, barbs } = arrowHead(s)
          const head = document.createElementNS(NS, 'polygon')
          head.setAttribute(
            'points',
            `${barbs[0][0]},${barbs[0][1]} ${tip[0]},${tip[1]} ${barbs[1][0]},${barbs[1][1]}`
          )
          head.setAttribute('fill', s.stroke || '#000')
          node.append(head)
        }
      }
      if (s.kind === 'rect' || s.kind === 'ellipse') {
        const paint = shapePaint(s)
        node.setAttribute('fill', paint.fill)
        node.setAttribute('stroke', paint.stroke ?? 'none')
        node.setAttribute('stroke-width', String(s.strokeWidth))
      }
      node.setAttribute(
        'class',
        `dz-shape${s.id === this.selectedShapeId ? ' selected' : ''}${this.multi.has(s.id) ? ' in-group' : ''}${this.isDimmed(s.id) ? ' dimmed' : ''}${this.motionHighlight.has(s.id) ? ' motion-lit' : ''}`
      )
      // ONE transform attribute carrying BOTH jobs — see shapeTransform(),
      // which is where the rotate-clobbers-translate bug lived.
      const tf = shapeTransform(s)
      if (tf) node.setAttribute('transform', tf)
      if (s.opacity !== undefined && s.opacity < 1) node.setAttribute('opacity', String(Math.max(0, s.opacity)))
      if (s.dash?.length) node.setAttribute('stroke-dasharray', s.dash.join(' '))
      // The shadow is drawn HERE as well as in the canvas exporter; until now
      // only the exporter knew about it, so switching it on changed the saved
      // file and nothing on screen.
      if (s.shadow) node.setAttribute('filter', `url(#${this.shadowFilter(layer, s)})`)
      if (s.kind === 'rect' && s.radius) {
        // SVG <rect> has one rx/ry pair, so a per-corner radius degrades to the
        // largest of the four rather than silently rendering square here while
        // the canvas exporter rounds it.
        const r = Math.max(...s.radius)
        if (r > 0) {
          node.setAttribute('rx', String(r))
          node.setAttribute('ry', String(r))
        }
      }
      ;(node as SVGElement).dataset.shape = s.id
      node.addEventListener('pointerdown', (ev) => this.beginShapeDrag(ev as PointerEvent, s))
      layer.append(node)
    }
  }

  /**
   * A <filter> for one shape's drop shadow, parked in the layer's <defs>.
   *
   * An SVG filter rather than a CSS `drop-shadow`: CSS filter lengths are CSS
   * PIXELS while this layer's user space is PDF POINTS, so a css shadow would
   * drift with the zoom and stop matching what the exporter draws.
   *
   * stdDeviation is HALF the blur because that is canvas's own definition of
   * shadowBlur, and shapes.ts paints the exported copy through canvas — the
   * two have to agree or the PDF does not look like the screen.
   */
  private shadowFilter(layer: SVGElement, s: Shape): string {
    const sh = s.shadow
    const NS = 'http://www.w3.org/2000/svg'
    const id = `dzshadow-${s.id}`
    const region = shadowRegion(s)
    if (!sh || !region) return id
    let defs = layer.querySelector('defs')
    if (!defs) {
      defs = document.createElementNS(NS, 'defs')
      layer.prepend(defs)
    }
    const f = document.createElementNS(NS, 'filter')
    f.setAttribute('id', id)
    f.setAttribute('filterUnits', 'userSpaceOnUse')
    f.setAttribute('x', String(region.x))
    f.setAttribute('y', String(region.y))
    f.setAttribute('width', String(region.w))
    f.setAttribute('height', String(region.h))
    const drop = document.createElementNS(NS, 'feDropShadow')
    drop.setAttribute('dx', String(sh.dx))
    drop.setAttribute('dy', String(sh.dy))
    drop.setAttribute('stdDeviation', String(region.stdDeviation))
    drop.setAttribute('flood-color', sh.color)
    drop.setAttribute('flood-opacity', String(sh.alpha))
    f.append(drop)
    defs.append(f)
    return id
  }

  /** Move a shape by dragging it — the select tool's job. */
  private beginShapeDrag(e: PointerEvent, s: Shape) {
    if (this.tool !== 'select' || !this.pageEl) return
    // Grabbing a MEMBER of a multi-selection drags the whole group — dropping
    // to a single selection here would silently discard the selection the user
    // just made with the marquee.
    // Shift+click adds or removes one object, the way every editor does it.
    if (e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      this.toggleInSelection(s.id)
      return
    }
    if (this.multi.has(s.id)) {
      this.beginMultiDrag(e)
      return
    }
    // A GROUP MEMBER is not draggable on its own. Clicking one selects the
    // whole group and the whole group is what moves — otherwise the group
    // exists in the layers panel and nowhere else, which is exactly what the
    // owner saw: "the group is already broken apart".
    if (this.selectWholeGroup(e, s.id)) return
    this.clearMulti()
    e.preventDefault()
    e.stopPropagation()
    this.selectShape(s.id)
    const pxPerPt = this.pxPerPt()
    const startX = e.clientX
    const startY = e.clientY
    const origX = s.x
    const origY = s.y
    const target = e.currentTarget as SVGElement
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      s.x = origX + (ev.clientX - startX) / pxPerPt
      s.y = origY + (ev.clientY - startY) / pxPerPt
      // Smart guides: snap the box's edges AND centre to the page and to every
      // other object, then draw the line that was matched. Ctrl suspends it,
      // because a designer sometimes means the position they are pointing at.
      if (!ev.ctrlKey) {
        const targets = this.snapTargets()
        const b = shapeBBox(s)
        const { box, guides } = snapBox(b, targets.x, targets.y, 4 / pxPerPt)
        s.x += box.x - b.x
        s.y += box.y - b.y
        this.showSnapGuides(guides)
      } else {
        this.showSnapGuides({ x: null, y: null })
      }
      this.renderShapes()
    }
    const up = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId)
      } catch {
        /* the node was replaced by a re-render */
      }
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      this.showSnapGuides({ x: null, y: null })
      this.setDirty(true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /**
   * Draw the alignment lines a snap matched.
   *
   * Kept in the OVERLAY layer rather than the shape layer so a re-render of
   * the shapes mid-drag cannot wipe them — which is exactly what happens when
   * a guide is appended to the layer being redrawn on every pointermove.
   */
  private showSnapGuides(guides: { x: number | null; y: number | null }) {
    const layer = this.shapeLayer
    if (!layer) return
    for (const el of layer.querySelectorAll('.dz-snapguide')) el.remove()
    if (!this.pageInfo) return
    const NS = 'http://www.w3.org/2000/svg'
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      const l = document.createElementNS(NS, 'line')
      l.setAttribute('x1', String(x1))
      l.setAttribute('y1', String(y1))
      l.setAttribute('x2', String(x2))
      l.setAttribute('y2', String(y2))
      l.setAttribute('class', 'dz-snapguide')
      layer.append(l)
    }
    if (guides.x !== null) line(guides.x, 0, guides.x, this.pageInfo.heightPt)
    if (guides.y !== null) line(0, guides.y, this.pageInfo.widthPt, guides.y)
  }

  /** Eyedropper: take the exact color under the cursor from the artwork. */
  private pickColorAt(e: PointerEvent) {
    const canvas = this.bgCanvas
    if (!canvas || !this.pageEl || !this.pageInfo) return
    const rect = this.pageEl.getBoundingClientRect()
    const k = canvas.width / this.pageInfo.widthPt
    const pxPerPt = this.pxPerPt()
    const x = Math.round(((e.clientX - rect.left) / pxPerPt) * k)
    const y = Math.round(((e.clientY - rect.top) / pxPerPt) * k)
    try {
      const d = canvas.getContext('2d')?.getImageData(x, y, 1, 1).data
      if (!d) return
      const hex = `#${[d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`
      if (this.pickForTrace) {
        // the pick names a background to knock out, not a fill to paint with
        this.pickForTrace = false
        this.traceOpts.dropColors.push([d[0], d[1], d[2]])
        this.refreshTracePicks()
        this.setStatus(`${t('designTracePicked')} ${hex}`)
        this.setTool('select')
        return
      }
      // The pick lands on whichever swatch is IN FRONT, the same rule the
      // colour controls follow — an eyedropper that always painted the fill
      // would make the stroke box a decoration.
      const key = this.activeSwatch
      this.shapeStyle[key] = hex
      // One path for applying a colour: it covers every selected shape and
      // text box, and it drops the gradient that would otherwise outrank the
      // fill and hide the change.
      this.applyStyleToSelection(key, hex)
      this.syncSwatch()
      this.setStatus(`${t('designPickedColor')} ${hex}`)
    } catch {
      /* tainted canvas — never happens for our own render */
    }
    this.setTool('select')
  }

  /**
   * Layers panel: every element the app controls on this artboard — the user's
   * own text boxes (selectable / editable / deletable) and, once the file's
   * text has been scanned, the artwork's own runs (clicking one turns it into
   * an editable box, exactly like clicking its hotspot on the page).
   */
  /**
   * The layers panel, laid out the way Illustrator's is.
   *
   * Three things it does that the old one did not, all of them things the
   * owner asked for by pointing at Illustrator:
   *
   *  - SELECTION IS THE CIRCLE. Clicking the row highlights it in the panel
   *    and nothing else; clicking the target circle on the right selects the
   *    artwork. Keeping them apart is what makes the row itself safe to press
   *    for dragging and safe to press by accident.
   *  - ROWS DRAG TO REORDER, which is what a layers panel is for. A row can
   *    only be dropped among its OWN kind: the canvas paints shapes, then
   *    images, then text, and no drag can reorder across those bands.
   *  - THE TRASH IS AT THE BOTTOM and deletes what is selected, instead of a
   *    per-row ✕ that could only ever delete one thing.
   *
   * Groups appear as one row with a disclosure arrow. Because a group is a
   * side-table record and not a container, the members are still listed in
   * their own paint order underneath — nothing has moved.
   */
  private renderLayers() {
    const panel = this.layersListEl
    if (!panel) return
    panel.innerHTML = ''

    const head = document.createElement('div')
    head.className = 'dz-layers-head'
    head.textContent = t('designLayers')
    panel.append(head)

    this.renderLayersFooter()

    const preview = (text: string): string => {
      const flat = text.replace(/\s+/g, ' ').trim()
      if (!flat) return t('designLayerEmptyText')
      return flat.length > 26 ? `${flat.slice(0, 26)}…` : flat
    }

    if (!this.boxes.length && !this.shapes.length && !this.images.length && !this.extractedText?.length) {
      const empty = document.createElement('div')
      empty.className = 'dz-layers-empty'
      empty.textContent = t('designLayersEmpty')
      panel.append(empty)
      return
    }

    const list = document.createElement('div')
    list.className = 'dz-layers-list'
    panel.append(list)

    const groups = this.groups()
    const selected = new Set(this.selectionIds())
    /** Groups already given their header row, so members do not repeat it. */
    const opened = new Set<string>()

    /**
     * One row.
     *
     * `kind` is the band it can be dragged within, and `depth` indents a group
     * member so the disclosure above it means something.
     */
    const addRow = (opts: {
      id: string
      kind: 'box' | 'img' | 'shape'
      label: string
      depth: number
      swatch?: HTMLElement
      title?: string
      onEdit?: () => void
    }): HTMLElement => {
      const row = document.createElement('div')
      row.className = `dz-layer${opts.depth ? ' dz-layer-child' : ''}`
      row.dataset[opts.kind === 'box' ? 'box' : opts.kind === 'img' ? 'img' : 'shape'] = opts.id
      row.dataset.kind = opts.kind
      row.dataset.id = opts.id
      row.draggable = true
      if (selected.has(opts.id)) row.classList.add('selected')
      if (opts.title) row.title = opts.title

      if (opts.swatch) row.append(opts.swatch)
      const name = document.createElement('span')
      name.className = 'dz-layer-name'
      name.textContent = opts.label
      row.append(name)

      if (opts.onEdit) {
        const edit = document.createElement('button')
        edit.type = 'button'
        edit.className = 'dz-layer-act'
        edit.textContent = '✎'
        edit.title = t('designLayerEdit')
        edit.addEventListener('click', (e) => {
          e.stopPropagation()
          opts.onEdit?.()
        })
        row.append(edit)
      }

      // THE TARGET CIRCLE. Filled when the object is selected, hollow when it
      // is not — the same読み as Illustrator's, and the only control on the row
      // that touches the canvas selection.
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = `dz-layer-target${selected.has(opts.id) ? ' on' : ''}`
      dot.title = t('designLayerSelectDot')
      dot.addEventListener('click', (e) => {
        e.stopPropagation()
        this.selectAnyById(opts.id)
        this.scrollCanvasTo(opts.id)
      })
      row.append(dot)

      this.wireLayerDrag(row)
      list.append(row)
      return row
    }

    /** The disclosure row a group gets, drawn above its first member. */
    const addGroupRow = (groupId: string, count: number) => {
      const row = document.createElement('div')
      row.className = 'dz-layer dz-layer-group'
      row.dataset.group = groupId
      const arrow = document.createElement('button')
      arrow.type = 'button'
      arrow.className = `dz-layer-arrow${this.openGroups.has(groupId) ? ' open' : ''}`
      arrow.textContent = '›'
      arrow.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.openGroups.has(groupId)) this.openGroups.delete(groupId)
        else this.openGroups.add(groupId)
        this.renderLayers()
      })
      const name = document.createElement('span')
      name.className = 'dz-layer-name'
      name.textContent = `${t('designGroupName')} (${count})`
      const dot = document.createElement('button')
      dot.type = 'button'
      dot.className = `dz-layer-target${this.groupFullySelected(groupId) ? ' on' : ''}`
      dot.title = t('designLayerSelectDot')
      dot.addEventListener('click', (e) => {
        e.stopPropagation()
        const g = groups.find((x) => x.id === groupId)
        if (g?.children.length) this.selectAnyById(g.children[0])
      })
      row.append(arrow, name, dot)
      list.append(row)
    }

    /** Emit a leaf, opening its group header first if this is its first member. */
    const emit = (
      id: string,
      run: (depth: number) => void
    ) => {
      const g = groups.find((x) => x.children.includes(id))
      if (!g) {
        run(0)
        return
      }
      if (!opened.has(g.id)) {
        opened.add(g.id)
        addGroupRow(g.id, g.children.length)
      }
      // A collapsed group hides its members, which is the point of collapsing.
      if (this.openGroups.has(g.id)) run(1)
    }

    // Paint order, top of the stack first: text over images over shapes.
    for (const box of [...this.boxes].reverse()) {
      emit(box.id, (depth) => {
        const swatch = document.createElement('span')
        swatch.className = 'dz-layer-dot'
        swatch.style.background = box.color
        addRow({
          id: box.id,
          kind: 'box',
          depth,
          label: preview(box.text),
          swatch,
          title: box.cover ? t('designLayerReplaced') : undefined,
          onEdit: () => {
            this.select(box.id)
            this.focusBoxText(box.id)
          }
        })
      })
    }

    for (const im of [...this.images].reverse()) {
      emit(im.id, (depth) => {
        const thumb = document.createElement('img')
        thumb.className = 'dz-layer-thumb'
        thumb.src = im.src
        addRow({
          id: im.id,
          kind: 'img',
          depth,
          label: `${t('designImageName')} ${Math.round(im.w)}×${Math.round(im.h)}`,
          swatch: thumb
        })
      })
    }

    for (const sh of [...this.shapes].reverse()) {
      emit(sh.id, (depth) => {
        const dot = document.createElement('span')
        dot.className = 'dz-layer-dot'
        dot.style.background = sh.fill || sh.stroke || '#888'
        addRow({
          id: sh.id,
          kind: 'shape',
          depth,
          label: t(`designShapeName_${sh.kind}`),
          swatch: dot
        })
      })
    }

    const runs = this.extractedText ?? []
    if (runs.length) {
      const sec = document.createElement('div')
      sec.className = 'dz-layers-sec'
      sec.textContent = t('designLayersOriginal')
      list.append(sec)
      for (const item of runs) {
        if (!item.text.trim()) continue
        const row = document.createElement('div')
        row.className = 'dz-layer dz-layer-orig'
        const name = document.createElement('span')
        name.className = 'dz-layer-name'
        name.textContent = preview(item.text)
        row.append(name)
        row.title = t('designEditOriginalHint')
        row.addEventListener('click', () => this.seedBoxFromItem(item))
        list.append(row)
      }
    }
  }

  /**
   * Repaint the target circles WITHOUT rebuilding the panel.
   *
   * Selection changes on every pointermove of a group drag. Re-rendering the
   * whole list that often would rebuild dozens of rows per frame and kill the
   * drag; toggling two classes per row costs nothing.
   */
  private syncLayerTargets() {
    const host = this.layersListEl
    if (!host) return
    const sel = new Set(this.selectionIds())
    for (const row of host.querySelectorAll<HTMLElement>('.dz-layer')) {
      const id = row.dataset.id
      const groupId = row.dataset.group
      const on = groupId ? this.groupFullySelected(groupId) : !!id && sel.has(id)
      row.classList.toggle('selected', on && !groupId)
      row.querySelector('.dz-layer-target')?.classList.toggle('on', on)
    }
    this.renderLayersFooter()
  }

  /** Is every member of this group in the current selection? */
  private groupFullySelected(groupId: string): boolean {
    const g = this.groups().find((x) => x.id === groupId)
    if (!g) return false
    const sel = new Set(this.selectionIds())
    return g.children.every((c) => sel.has(c))
  }

  /** Bring an object into view on the canvas after picking it in the panel. */
  private scrollCanvasTo(id: string) {
    const sel = `[data-shape="${id}"], [data-box="${id}"], [data-img="${id}"]`
    this.pageEl?.querySelector(sel)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  /**
   * Drag-to-reorder, within one band.
   *
   * The canvas paints shapes, then images, then text boxes — three separate
   * arrays, three separate z-stacks. A row can therefore only be dropped among
   * its own kind; a cross-band drop has no meaning to express, so it is
   * refused outright rather than silently landing somewhere arbitrary.
   */
  private wireLayerDrag(row: HTMLElement) {
    row.addEventListener('dragstart', (e) => {
      const dt = (e as DragEvent).dataTransfer
      if (!dt) return
      dt.effectAllowed = 'move'
      // Firefox refuses to start a drag with no payload set.
      dt.setData('text/plain', `${row.dataset.kind}:${row.dataset.id}`)
      this.layerDrag = { kind: String(row.dataset.kind), id: String(row.dataset.id) }
      row.classList.add('dragging')
    })
    row.addEventListener('dragend', () => {
      this.layerDrag = null
      for (const el of this.layersListEl?.querySelectorAll('.dz-layer') ?? []) {
        el.classList.remove('dragging', 'drop-before', 'drop-after')
      }
    })
    row.addEventListener('dragover', (e) => {
      const d = this.layerDrag
      if (!d || d.kind !== row.dataset.kind || d.id === row.dataset.id) return
      e.preventDefault()
      const r = row.getBoundingClientRect()
      const after = (e as DragEvent).clientY > r.top + r.height / 2
      row.classList.toggle('drop-before', !after)
      row.classList.toggle('drop-after', after)
    })
    row.addEventListener('dragleave', () => {
      row.classList.remove('drop-before', 'drop-after')
    })
    row.addEventListener('drop', (e) => {
      const d = this.layerDrag
      row.classList.remove('drop-before', 'drop-after')
      if (!d || d.kind !== row.dataset.kind || d.id === row.dataset.id) return
      e.preventDefault()
      const r = row.getBoundingClientRect()
      const after = (e as DragEvent).clientY > r.top + r.height / 2
      this.moveLayer(d.kind, d.id, String(row.dataset.id), after)
    })
  }

  /**
   * Reorder one object relative to another in the same array.
   *
   * The PANEL is drawn top-of-stack first, so a row dropped BELOW another has
   * to land EARLIER in the array. Getting that inversion wrong is the classic
   * layers-panel bug: every drag moves the object the opposite way.
   */
  private moveLayer(kind: string, id: string, targetId: string, after: boolean) {
    const list: Array<{ id: string }> =
      kind === 'shape' ? this.shapes : kind === 'img' ? this.images : this.boxes
    const from = list.findIndex((x) => x.id === id)
    if (from < 0) return
    const [moved] = list.splice(from, 1)
    const to = list.findIndex((x) => x.id === targetId)
    if (to < 0) {
      list.splice(from, 0, moved)
      return
    }
    // "after" in the panel means lower in the stack, which is a smaller index.
    list.splice(after ? to : to + 1, 0, moved)
    this.renderShapes()
    this.renderImages()
    this.renderBoxes()
    this.renderLayers()
    this.setDirty(true)
  }

  /**
   * The panel's footer: the count, group / ungroup, and the trash.
   *
   * The trash deletes THE SELECTION rather than one row, which is why the
   * per-row ✕ is gone: a delete button on every row can only ever remove one
   * object, and the user who just selected nine wants all nine.
   */
  private renderLayersFooter() {
    const host = this.layersFootEl
    if (!host) return
    host.innerHTML = ''
    const count = this.boxes.length + this.images.length + this.shapes.length
    const label = document.createElement('span')
    label.className = 'dz-layers-count'
    label.textContent = t('designLayersCount').replace('{n}', String(count))
    host.append(label)

    const act = (glyph: string, title: string, run: () => void, disabled: boolean): HTMLElement => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'dz-layers-act'
      b.textContent = glyph
      b.title = title
      b.disabled = disabled
      b.addEventListener('click', run)
      host.append(b)
      return b
    }

    const sel = this.selectionIds()
    act('⊞', `${t('designGroup')} (Ctrl+G)`, () => this.groupSelection(), sel.length < 2)
    act(
      '⊟',
      `${t('designUngroup')} (Ctrl+Shift+G)`,
      () => this.ungroupSelection(),
      !sel.some((id) => groupOf(this.groups(), id))
    )
    const trash = act('🗑', t('designLayerDeleteSel'), () => this.deleteSelection(), !sel.length)
    trash.classList.add('dz-layers-trash')
  }

  /** Delete everything selected — one object or nine. */
  private deleteSelection() {
    const ids = this.selectionIds()
    if (!ids.length) return
    for (const id of ids) {
      if (this.shapes.some((x) => x.id === id)) this.removeShape(id)
      else if (this.images.some((x) => x.id === id)) this.removeImage(id)
      else this.removeBox(id)
    }
    this.multi.clear()
    this.selectedShapeId = null
    this.selectedImageId = null
    this.selectedId = null
    this.syncOverlay()
    this.renderLayers()
  }

  // ─── zoom, artboard navigation, and the file's own text ──────────────────

  private async setZoom(z: number) {
    this.zoom = Math.max(0.1, Math.min(8, z))
    // A PDF and a raster page are RE-RASTERISED at the new zoom — scaling the
    // existing bitmap up would show the old resolution enlarged. Everything
    // else only has to restate its CSS size and redraw the overlays.
    if (this.kind === 'pdf') {
      await this.renderPdfPage()
    } else if (this.kind === 'raster') {
      await this.renderRasterPage()
    } else if (this.pageEl && this.pageInfo) {
      this.pageEl.style.width = `${this.pageInfo.cssWidth * this.zoom}px`
      this.pageEl.style.height = `${this.pageInfo.cssHeight * this.zoom}px`
      this.renderBoxes()
      this.renderShapes()
      this.renderImages()
    }
    const label = this.controls.zoomLabel as HTMLElement | undefined
    if (label) label.textContent = `${Math.round(this.zoom * 100)}%`
  }

  /**
   * Switch artboard.
   *
   * The current page's boxes, shapes and images are PARKED in the per-page
   * maps first. Skipping that was the v1 bug that made artboard navigation
   * silently destroy the other artboards' work.
   */
  private async gotoPage(page: number) {
    if (!this.artwork || page < 1 || page > this.artwork.pages) return
    this.allPages[String(this.page)] = this.boxes
    this.allShapes[String(this.page)] = this.shapes
    this.allImages[String(this.page)] = this.images
    this.page = page
    // Groups are PER PAGE, so an isolation that survived the switch would
    // point at a group this artboard does not have.
    this.isolated = null
    this.renderCrumbs()
    this.boxes = this.allPages[String(page)] ?? []
    this.shapes = this.allShapes[String(page)] ?? []
    this.images = this.allImages[String(page)] ?? []
    this.selectedShapeId = null
    this.selectedImageId = null
    await this.ensureBitmaps()
    await this.renderPdfPage()
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
  }

  /**
   * Draw a clickable hotspot over every run of text the FILE itself contains,
   * so the user can retype it in place.
   *
   * Only PDF-backed artwork carries extractable runs: an SVG's text is already
   * live DOM and a raster has none at all, so each says so rather than showing
   * an empty layer.
   */
  private async showTextHotspots() {
    if (this.kind !== 'pdf' || !this.artwork || !this.pageEl || !this.pageInfo) {
      if (this.kind === 'svg') this.setStatus(t('designSvgHint'))
      else if (this.kind === 'raster') this.setStatus(t('designRasterNoText'))
      return
    }
    // Illustrator's own extraction, when it ran, is better than pdf.js's and
    // must not be overwritten by a second scan.
    if (!this.extractedText && !this.usingIllustrator) {
      this.setStatus(t('designScanningText'))
      this.extractedText = await this.artwork.extractText(this.page).catch(() => [])
    }
    if (!this.extractedText) return
    this.renderLayers()
    this.hideTextHotspots()
    const layer = document.createElement('div')
    layer.className = 'dz-hotspots'
    const k = this.pxPerPt()
    for (const item of this.extractedText) {
      const spot = document.createElement('div')
      spot.className = 'dz-hotspot'
      spot.title = t('designEditOriginalHint')
      // 2pt of slack all round: a run's reported box hugs the glyphs, and a
      // hotspot that tight is hard to hit.
      Object.assign(spot.style, {
        left: `${(item.x - 2) * k}px`,
        top: `${(item.y - 2) * k}px`,
        width: `${(item.width + 4) * k}px`,
        height: `${(item.size * 1.3 + 4) * k}px`
      })
      spot.addEventListener('click', (e) => {
        e.stopPropagation()
        this.seedBoxFromItem(item)
      })
      layer.append(spot)
    }
    this.pageEl.append(layer)
    this.hotspotLayer = layer
    this.setStatus(
      this.extractedText.length
        ? `${t('designEditOriginalHint')} ${t('designDragCoverHint')}`
        : t('designNoTextFound')
    )
  }

  private hideTextHotspots() {
    this.hotspotLayer?.remove()
    this.hotspotLayer = null
  }

  private focusBoxText(id: string) {
    this.boxLayer?.querySelector<HTMLElement>(`[data-box="${id}"] .dz-text`)?.focus()
  }

  /**
   * The patch that hides the artwork's own run so a retyped box replaces it.
   *
   * buildCoverPatch reconstructs the background behind the run — a flat colour
   * when the area is uniform, a rebuilt gradient PNG when it is not. Falling
   * back to white is deliberate: a wrong patch is visible, a missing one
   * leaves the old text showing through the new.
   */
  private makeCover(x: number, y: number, w: number, h: number): NonNullable<TextBox['cover']> {
    const canvas = this.bgCanvas
    if (!canvas || !this.pageInfo) return { x, y, w, h, bg: '#ffffff' }
    const k = canvas.width / this.pageInfo.widthPt
    const patch = buildCoverPatch(canvas, { x: x * k, y: y * k, w: w * k, h: h * k })
    return { x, y, w, h, bg: patch.bg, ...(patch.img ? { img: patch.img } : {}) }
  }

  /**
   * Paint one cover patch onto an export canvas.
   *
   * The rebuilt-background PNG is tried first and the flat colour is the
   * fallback — including when the PNG fails to decode, because an export that
   * throws here would lose the whole document over one bad patch.
   */
  private async paintCover(
    ctx: CanvasRenderingContext2D,
    cover: NonNullable<TextBox['cover']>,
    k: number
  ) {
    const x = cover.x * k
    const y = cover.y * k
    const w = cover.w * k
    const h = cover.h * k
    if (cover.img) {
      try {
        const img = new Image()
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('patch decode failed'))
          img.src = cover.img as string
        })
        ctx.drawImage(img, x, y, w, h)
        return
      } catch {
        /* fall through to the flat fill */
      }
    }
    ctx.fillStyle = cover.bg
    ctx.fillRect(x, y, w, h)
  }

  /**
   * The colour of the page immediately AROUND a run.
   *
   * Sampled on a ring rather than inside the run, and reduced by MEDIAN rather
   * than by average: a mean is dragged toward the ink by any pixel that clips
   * a glyph, while a median ignores a minority of outliers entirely.
   */
  private sampleBackground(item: ExtractedText): string {
    try {
      const canvas = this.bgCanvas
      if (!canvas || !this.pageInfo) return '#ffffff'
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return '#ffffff'
      const k = canvas.width / this.pageInfo.widthPt
      const x0 = Math.max(0, Math.floor((item.x - 4) * k))
      const y0 = Math.max(0, Math.floor((item.y - 4) * k))
      const x1 = Math.min(canvas.width - 1, Math.ceil((item.x + item.width + 4) * k))
      const y1 = Math.min(canvas.height - 1, Math.ceil((item.y + item.size * 1.3 + 4) * k))
      const rs: number[] = []
      const gs: number[] = []
      const bs: number[] = []
      const take = (px: number, py: number) => {
        const d = ctx.getImageData(px, py, 1, 1).data
        rs.push(d[0])
        gs.push(d[1])
        bs.push(d[2])
      }
      const STEPS = 7
      for (let i = 0; i <= STEPS; i++) {
        const px = x0 + ((x1 - x0) * i) / STEPS
        take(Math.round(px), y0)
        take(Math.round(px), y1)
      }
      for (let i = 1; i < STEPS; i++) {
        const py = y0 + ((y1 - y0) * i) / STEPS
        take(x0, Math.round(py))
        take(x1, Math.round(py))
      }
      const median = (v: number[]): number => v.sort((a, b) => a - b)[Math.floor(v.length / 2)]
      const hex = (v: number): string => v.toString(16).padStart(2, '0')
      return `#${hex(median(rs))}${hex(median(gs))}${hex(median(bs))}`
    } catch {
      /* a tainted canvas cannot be sampled — white is the safe answer */
      return '#ffffff'
    }
  }

  /**
   * Export the design as a Word document.
   *
   * The page is rendered to a canvas, the file's OWN text is wiped out of that
   * raster, the user's covers/images/shapes are painted on, and the result
   * becomes the document's background picture with real text boxes on top.
   * That is what makes the text editable in Word without redrawing the design.
   */
  private async exportWord() {
    if (!window.exelmj || !this.pageInfo) return
    if (this.kind !== 'pdf' || !this.artwork) {
      alert(t('designWordOnlyAi'))
      return
    }
    try {
      this.setStatus(t('designScanningText'))
      const runs = this.extractedText ?? (await this.artwork.extractText(this.page).catch(() => []))
      this.extractedText = runs
      // The ink colour is sampled BEFORE the runs are wiped from the raster.
      const inks = runs.map((r) => this.sampleInk(r))
      const canvas = document.createElement('canvas')
      await this.artwork.render(this.page, canvas, 2)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no ctx')
      const k = canvas.width / this.pageInfo.widthPt
      for (const r of runs) {
        wipeRect(ctx, canvas, {
          x: (r.x - 2) * k,
          y: (r.y - 2) * k,
          w: (r.width + 4) * k,
          h: (r.size * 1.3 + 4) * k
        })
      }
      for (const b of this.boxes) if (b.cover) await this.paintCover(ctx, b.cover, k)
      for (const im of this.images) {
        const bitmap = this.bitmaps.get(im.id)
        if (bitmap) paintImage(ctx, im, bitmap, k)
      }
      for (const sh of this.shapes) paintShape(ctx, sh, k)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('png encode failed')
      const png = new Uint8Array(await blob.arrayBuffer())
      const docx = await buildDesignWord({
        pageWidthPt: this.pageInfo.widthPt,
        pageHeightPt: this.pageInfo.heightPt,
        backgroundPng: png,
        runs: runs.map((r, i) => ({
          text: r.text,
          dir: r.dir,
          x: r.x,
          y: r.y,
          width: r.width,
          size: r.size,
          color: inks[i]
        })),
        boxes: this.boxes
      })
      const name = this.filePath
        ? `${basename(this.filePath).replace(/\.[^.]+$/, '')}.docx`
        : 'design.docx'
      await window.exelmj.saveFileAs(docx, name, 'docx')
      this.setStatus('')
    } catch (err) {
      console.warn('[design] word export failed', err)
      alert(t('designExportFailed'))
    }
  }

  /**
   * Ask Illustrator itself for the file's text.
   *
   * pdf.js reads the PDF-compatible stream inside an .ai file, which loses the
   * live text of anything Illustrator did not flatten. When Illustrator is
   * installed its own answer is authoritative, so `usingIllustrator` then locks
   * out the pdf.js scan that would otherwise overwrite it.
   */
  private async extractViaIllustrator() {
    if (!window.exelmj?.illustratorExtract || !this.filePath || this.kind !== 'pdf') {
      alert(t('designAiOnlyAi'))
      return
    }
    const btn = this.controls.aiBridge as HTMLButtonElement | undefined
    if (btn) btn.disabled = true
    this.setStatus(t('designAiWorking'))
    try {
      const res = await window.exelmj.illustratorExtract(this.filePath)
      if (!res?.ok || !res.runs?.length) {
        this.setStatus('')
        alert(res?.error === 'NOT_INSTALLED' ? t('designAiMissing') : t('designAiFailed'))
        return
      }
      this.extractedText = res.runs.map((r) => ({
        text: r.text,
        dir: r.dir === 'rtl' ? ('rtl' as const) : ('ltr' as const),
        x: r.x,
        y: r.y,
        width: r.width,
        size: r.size,
        // Illustrator reports the box, not the baseline; 0.8em down from the
        // top is where a baseline sits for the fonts this sees.
        baselineTop: r.y + r.size * 0.8,
        color: r.color,
        font: r.font
      }))
      this.usingIllustrator = true
      this.editOriginalMode = true
      ;(this.controls.editOrig as HTMLElement | undefined)?.classList.add('active')
      await this.showTextHotspots()
      this.setStatus(`${t('designAiDone')} (${res.runs.length}) — ${t('designEditOriginalHint')}`)
    } catch (err) {
      console.warn('[design] illustrator bridge failed', err)
      this.setStatus('')
      alert(t('designAiFailed'))
    } finally {
      if (btn) btn.disabled = false
    }
  }

  /**
   * The ink color of the run: the sampled pixel most DIFFERENT from the
   * background — works for dark-on-light AND light-on-dark (white banner
   * headings were coming back as the banner color when we took the darkest).
   */
  private sampleInk(item: ExtractedText, bgHex?: string): string {
    try {
      const canvas = this.bgCanvas
      if (!canvas || !this.pageInfo) return '#111111'
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return '#111111'
      const bg = bgHex ?? this.sampleBackground(item)
      const bgV = parseInt(bg.slice(1), 16)
      const bgR = (bgV >> 16) & 0xff
      const bgG = (bgV >> 8) & 0xff
      const bgB = bgV & 0xff
      const pxPerPtCanvas = canvas.width / this.pageInfo.widthPt
      const x0 = Math.max(0, Math.floor(item.x * pxPerPtCanvas))
      const y0 = Math.max(0, Math.floor(item.y * pxPerPtCanvas))
      const w = Math.max(1, Math.min(canvas.width - x0, Math.ceil(item.width * pxPerPtCanvas)))
      const h = Math.max(1, Math.min(canvas.height - y0, Math.ceil(item.size * 1.2 * pxPerPtCanvas)))
      const data = ctx.getImageData(x0, y0, w, h).data
      let best = [17, 17, 17]
      let bestDist = -1
      for (let i = 0; i < data.length; i += 4) {
        const dr = data[i] - bgR
        const dg = data[i + 1] - bgG
        const db = data[i + 2] - bgB
        const dist = dr * dr + dg * dg + db * db
        if (dist > bestDist) {
          bestDist = dist
          best = [data[i], data[i + 1], data[i + 2]]
        }
      }
      const hex = (v: number) => v.toString(16).padStart(2, '0')
      return `#${hex(best[0])}${hex(best[1])}${hex(best[2])}`
    } catch {
      return '#111111'
    }
  }

  private seedBoxFromItem(item: ExtractedText) {
    // this run may already have been replaced — clicking its hotspot (or its
    // row in the layers panel) again must return to THAT box, not stack a
    // second one on the same spot
    const already = boxCoveringRun(this.boxes, item)
    if (already) {
      this.select(already.id)
      this.focusBoxText(already.id)
      return
    }
    const bg = this.sampleBackground(item)
    // Illustrator reports the true fill color; sampling is the fallback
    const ink = item.color && /^#[0-9a-fA-F]{6}$/.test(item.color) ? item.color : this.sampleInk(item, bg)
    const box = newBox(`box-${++this.boxIdSeq}`, 0, 0, item.dir === 'rtl')
    box.text = item.text
    box.sizePt = Math.round(item.size * 10) / 10
    box.color = ink
    if (item.font) {
      // the weight lives in the font NAME (e.g. "Cairo-Bold") — only the
      // Illustrator bridge supplies it; pdf.js leaves item.font undefined
      box.bold = /(bold|black|heavy|semibold|demibold)/i.test(item.font)
      const family = item.font
        .replace(/-(Regular|Bold|Light|Medium|Black|SemiBold|DemiBold|Heavy|Italic)$/i, '')
        .replace(/MT$/, '')
        .trim()
      if (family) box.font = family
    }
    // anchor exactly where the original sat: baselineTop − 1.02·size = box top
    box.y = item.baselineTop - box.sizePt * 1.02
    box.align = item.dir === 'rtl' ? 'right' : 'left'
    box.x = item.dir === 'rtl' ? item.x + item.width : item.x
    box.cover = this.makeCover(item.x - 2, item.y - 2, item.width + 4, item.size * 1.3 + 4)
    this.boxes.push(box)
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    this.select(box.id)
    this.setDirty(true)
    const el = this.boxLayer?.querySelector<HTMLElement>(`[data-box="${box.id}"] .dz-text`)
    el?.focus()
  }

  /**
   * Fallback for text the detector cannot see (outlined/curved text, text
   * inside images — typical for styled COLORED headings): while the edit tool
   * is active, DRAG a rectangle over the old text; it gets patched with the
   * sampled background color and an editable box opens on top.
   */
  private beginCoverDrag(e: PointerEvent) {
    if (!this.pageEl || !this.pageInfo) return
    if ((e.target as HTMLElement).closest('.dz-box, .dz-hotspot')) return
    const pageRect = this.pageEl.getBoundingClientRect()
    const pxPerPt = this.pxPerPt()
    const startX = e.clientX
    const startY = e.clientY
    const rubber = document.createElement('div')
    rubber.className = 'dz-rubber'
    this.pageEl.append(rubber)
    this.dragRect = rubber
    const update = (ev: PointerEvent) => {
      const x = Math.min(startX, ev.clientX) - pageRect.left
      const y = Math.min(startY, ev.clientY) - pageRect.top
      const w = Math.abs(ev.clientX - startX)
      const h = Math.abs(ev.clientY - startY)
      Object.assign(rubber.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` })
    }
    update(e)
    const move = (ev: PointerEvent) => update(ev)
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      rubber.remove()
      this.dragRect = null
      const wPx = Math.abs(ev.clientX - startX)
      const hPx = Math.abs(ev.clientY - startY)
      if (wPx < 8 || hPx < 6) return // a click, not a drag — ignore
      const xPt = (Math.min(startX, ev.clientX) - pageRect.left) / pxPerPt
      const yPt = (Math.min(startY, ev.clientY) - pageRect.top) / pxPerPt
      const wPt = wPx / pxPerPt
      const hPt = hPx / pxPerPt
      this.createManualCover(xPt, yPt, wPt, hPt)
    }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', up)
  }

  private createManualCover(xPt: number, yPt: number, wPt: number, hPt: number) {
    const fake: ExtractedText = {
      text: '',
      dir: 'rtl',
      x: xPt,
      y: yPt,
      width: wPt,
      size: Math.max(6, hPt / 1.3),
      baselineTop: yPt + hPt * 0.8
    }
    const bg = this.sampleBackground(fake)
    const ink = this.sampleInk(fake, bg)
    const rtl = getLang() === 'ar'
    const box = newBox(`box-${++this.boxIdSeq}`, 0, 0, rtl)
    box.sizePt = Math.round(Math.min(72, Math.max(7, hPt * 0.62)) * 10) / 10
    box.color = ink
    box.align = rtl ? 'right' : 'left'
    box.x = rtl ? xPt + wPt - 2 : xPt + 2
    box.y = yPt + (hPt - box.sizePt * 1.35) / 2
    box.cover = this.makeCover(xPt, yPt, wPt, hPt)
    this.boxes.push(box)
    this.renderBoxes()
    this.renderShapes()
    this.renderImages()
    this.select(box.id)
    this.setDirty(true)
    const el = this.boxLayer?.querySelector<HTMLElement>(`[data-box="${box.id}"] .dz-text`)
    el?.focus()
  }

  // ---------------- persistence ----------------
  private setDirty(dirty: boolean) {
    // Every mutation in this file ends in setDirty(true), which makes it the
    // ONE choke point where history can be captured — the state BEFORE the
    // mutation is whatever we serialized last time.
    if (dirty && !this.restoring) {
      const now = this.captureState()
      if (now !== this.lastState) {
        this.undoStack.push(this.lastState)
        if (this.undoStack.length > 40) this.undoStack.shift()
        this.redoStack.length = 0
        this.lastState = now
      }
    } else if (!dirty) {
      // open/save baseline — history survives a save, like any editor
      this.lastState = this.captureState()
    }
    this.dirty = dirty
    reportDesignDirty(dirty)
    this.updateTitle()
  }

  private captureState(): string {
    return JSON.stringify({
      boxes: this.boxes,
      shapes: this.shapes,
      images: this.images,
      // v4: without this an undo past a token or frame edit would restore the
      // old geometry while leaving the new design system in place
      studio: this.studio
    })
  }

  async undo() {
    if (!this.undoStack.length) return
    this.redoStack.push(this.captureState())
    await this.applyState(this.undoStack.pop() as string)
  }

  async redo() {
    if (!this.redoStack.length) return
    this.undoStack.push(this.captureState())
    await this.applyState(this.redoStack.pop() as string)
  }

  private async applyState(state: string) {
    this.restoring = true
    try {
      const s = JSON.parse(state) as {
        boxes: TextBox[]
        shapes: Shape[]
        images: PlacedImage[]
        studio?: StudioDoc
      }
      this.boxes = s.boxes
      this.shapes = s.shapes
      this.images = s.images
      this.studio = s.studio ?? emptyStudioDoc()
      this.selectedId = null
      this.selectedShapeId = null
      this.selectedImageId = null
      // The multi-selection holds IDS, and an undo can remove the objects they
      // name — leaving the overlay measuring a frame around nothing.
      this.multi.clear()
      this.overlay?.show(null)
      await this.ensureBitmaps()
      this.renderBoxes()
      this.renderShapes()
      this.renderImages()
      this.renderLayers()
      this.lastState = state
      this.setDirty(true) // restoring flag keeps this off the history
    } finally {
      this.restoring = false
    }
  }

  updateTitle() {
    const name = this.filePath ? basename(this.filePath) : t('designTitle')
    document.title = `${this.dirty ? '* ' : ''}${name} — ${t('appName')}`
  }

  private async loadSidecar() {
    if (!this.filePath || !window.exelmj?.readFileSilent) return
    const res = await window.exelmj.readFileSilent(sidecarPathFor(this.filePath)).catch(() => null)
    if (!res) return
    const project = parseProject(new TextDecoder('utf-8').decode(res.bytes))
    if (!project) return
    this.allPages = project.pages
    this.boxes = this.allPages[String(this.page)] ?? []
    this.allShapes = project.shapes
    this.shapes = this.allShapes[String(this.page)] ?? []
    this.allImages = project.images
    this.images = this.allImages[String(this.page)] ?? []
    this.studio = project.studio ?? emptyStudioDoc()
    this.imageIdSeq = maxIdSuffix(Object.values(project.images).flat().map((im) => im.id))
    await this.ensureBitmaps()
    this.renderImages()
    // ids continue after the highest existing suffix — boxes.length collided
    // after deletions and made one Delete remove two boxes (review finding)
    this.boxIdSeq = maxBoxId(project.pages)
    this.shapeIdSeq = maxIdSuffix(Object.values(project.shapes).flat().map((sh) => sh.id))
    this.renderShapes()
  }

  /** Save = boxes to the sidecar (and for SVG, the edited SVG itself). */
  async save(): Promise<boolean> {
    if (!this.filePath || !window.exelmj?.writeFileSilent) return false
    try {
      this.allPages[String(this.page)] = this.boxes
      this.allShapes[String(this.page)] = this.shapes
      this.allImages[String(this.page)] = this.images
      const json = serializeProject(
        basename(this.filePath),
        this.allPages,
        this.allShapes,
        this.allImages,
        // serializeProject drops this (and stays on version 3) when it is empty
        isEmptyStudioDoc(this.studio) ? undefined : this.studio
      )
      const wrote = await window.exelmj.writeFileSilent(
        sidecarPathFor(this.filePath),
        new TextEncoder().encode(json)
      )
      if (!wrote) {
        alert(t('designSaveFailed'))
        return false
      }
      if (this.kind === 'svg' && this.svgRoot) {
        const xml = serializeSvg(this.svgRoot, this.svgOriginalAttrs ?? undefined)
        const ok = await window.exelmj.saveFile(this.filePath, new TextEncoder().encode(xml))
        if (!ok) {
          alert(t('designSaveFailed'))
          return false
        }
      }
      this.setDirty(false)
      return true
    } catch (err) {
      console.warn('[design] save failed', err)
      alert(t('designSaveFailed'))
      return false
    }
  }

  async saveThenClose() {
    const ok = await this.save()
    if (ok) window.exelmj?.requestClose()
  }

  // ---------------- exports ----------------
  /** Windows TTF files for the design font choices; unknown → Arial. */
  private static FONT_FILES: Record<string, { r: string; b: string }> = {
    Arial: { r: 'arial.ttf', b: 'arialbd.ttf' },
    Tahoma: { r: 'tahoma.ttf', b: 'tahomabd.ttf' },
    'Segoe UI': { r: 'segoeui.ttf', b: 'segoeuib.ttf' },
    Calibri: { r: 'calibri.ttf', b: 'calibrib.ttf' },
    'Sakkal Majalla': { r: 'majalla.ttf', b: 'majallab.ttf' },
    'Traditional Arabic': { r: 'trado.ttf', b: 'tradbdo.ttf' },
    'Simplified Arabic': { r: 'simpo.ttf', b: 'simpbdo.ttf' }
  }

  private async fontBytes(family: string, bold: boolean): Promise<Uint8Array | null> {
    if (!window.exelmj?.readFileSilent) return null
    const entry = DesignApp.FONT_FILES[family] ?? DesignApp.FONT_FILES.Arial
    const file = bold ? entry.b : entry.r
    const res = await window.exelmj.readFileSilent(`C:\\Windows\\Fonts\\${file}`).catch(() => null)
    return res?.bytes ?? null
  }

  /** Rasterize the mounted SVG for PDF export backgrounds (~150dpi). */
  /** The page's own pixels, for the PDF/Word exporters. */
  private async rasterAsPng(): Promise<Uint8Array | null> {
    const canvas = this.bgCanvas
    if (!canvas) return null
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  }

  private async svgAsPng(): Promise<Uint8Array | null> {
    if (!this.svgRoot || !this.pageInfo) return null
    const xml = serializeSvg(this.svgRoot, this.svgOriginalAttrs ?? undefined)
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('svg raster failed'))
        img.src = url
      })
      const scale = 2
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(this.pageInfo.widthPt * scale)
      canvas.height = Math.round(this.pageInfo.heightPt * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      return blob ? new Uint8Array(await blob.arrayBuffer()) : null
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  async exportPdf() {
    if (!window.exelmj || !this.pageInfo) return
    try {
      let artwork: Uint8Array | null = null
      if (this.kind === 'pdf' && this.artworkBytes) artwork = this.artworkBytes
      // SVG designs: the artwork itself goes in as a full-page raster —
      // exporting labels on a blank page lost the logo (review finding)
      const backgroundPng =
        this.kind === 'svg' ? await this.svgAsPng() : this.kind === 'raster' ? await this.rasterAsPng() : null
      // The document's colour mode, stated once before anything is written: a
      // CMYK document records ink percentages, which is what a print shop
      // expects, and an RGB one records light.
      setPdfColorMode(this.setup.colorMode)
      const bytes = await exportOverlayPdf({
        artwork,
        backgroundPng,
        pageIndex: this.page - 1,
        pageSizePt: { width: this.pageInfo.widthPt, height: this.pageInfo.heightPt },
        boxes: this.boxes,
        shapes: this.shapes,
        images: await this.imagesForExport(),
        getFont: (family, bold) => this.fontBytes(family, bold)
      })
      const suggested = this.filePath
        ? `${basename(this.filePath).replace(/\.[^.]+$/, '')}-معدل.pdf`
        : 'design.pdf'
      await window.exelmj.saveFileAs(bytes, suggested, 'pdf')
    } catch (err) {
      console.warn('[design] export pdf failed', err)
      alert(t('designExportFailed'))
    }
  }

  async exportPng() {
    if (!window.exelmj || !this.pageEl || !this.pageInfo) return
    try {
      // The document's OWN resolution, not a constant: a 300dpi print page
      // exported at 144 is the blurry file the dialog exists to prevent.
      const pxPerPt = Math.max(1, this.setup.dpi / 72)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(this.pageInfo.widthPt * pxPerPt)
      canvas.height = Math.round(this.pageInfo.heightPt * pxPerPt)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('no ctx')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      if (this.kind === 'pdf' && this.artwork) {
        const bg = document.createElement('canvas')
        await this.artwork.render(this.page, bg, pxPerPt)
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height)
      } else if (this.kind === 'svg' && this.svgRoot) {
        const xml = serializeSvg(this.svgRoot, this.svgOriginalAttrs ?? undefined)
        const img = new Image()
        const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }))
        try {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('svg raster failed'))
            img.src = url
          })
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        } finally {
          URL.revokeObjectURL(url)
        }
      }
      // patches first, then text — canvas fillText shapes Arabic natively
      for (const box of this.boxes) {
        if (!box.cover) continue
        await this.paintCover(ctx, box.cover, pxPerPt)
      }
      for (const im of this.images) {
        const bm = this.bitmaps.get(im.id)
        if (bm) paintImage(ctx, im, bm, pxPerPt)
      }
      for (const sh of this.shapes) paintShape(ctx, sh, pxPerPt)
      for (const box of this.boxes) {
        if (!box.text.trim()) continue
        ctx.fillStyle = box.color
        ctx.font = `${box.bold ? '700 ' : ''}${box.sizePt * pxPerPt}px '${box.font}', 'Segoe UI', Tahoma, sans-serif`
        ctx.textAlign = box.align === 'right' ? 'right' : box.align === 'center' ? 'center' : 'left'
        ctx.textBaseline = 'top'
        const lines = box.text.replace(/\r/g, '').split('\n')
        lines.forEach((line, i) => {
          ctx.fillText(line, box.x * pxPerPt, (box.y + i * box.sizePt * 1.35) * pxPerPt)
        })
      }
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('png encode failed')
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const suggested = this.filePath
        ? `${basename(this.filePath).replace(/\.[^.]+$/, '')}.png`
        : 'design.png'
      await window.exelmj.saveFileAs(bytes, suggested, 'png')
    } catch (err) {
      console.warn('[design] export png failed', err)
      alert(t('designExportFailed'))
    }
  }
}

/** Drop the extension so "poster.ai" becomes "poster-handoff.zip". */
function stripExt(name: string): string {
  return name.replace(/\.[^.\/]+$/, '') || name
}

/** Three decimals, matching the path kernel's precision. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}


/**
 * The modern skin — Apple's design language, in overrides.
 *
 * The grammar, not the logo: one accent, near-black ink on near-white
 * surfaces, hairline borders instead of grey ones, frosted chrome that lets
 * the canvas glow through, controls with real corner radii, and panels that
 * ARRIVE (a small rise and fade through @starting-style — our own motion
 * compiler's technique, eaten at home) rather than pop into place. Reduced
 * motion turns the arrivals off wholesale.
 */
const SKIN_CSS = `
:root {
  --exl-accent: #0a84ff;
  --exl-accent-down: #0060df;
  --exl-ink: #1d1d1f;
  --exl-ink-2: #6e6e73;
  --exl-hair: rgba(0, 0, 0, 0.1);
  --exl-fill: rgba(0, 0, 0, 0.045);
  --exl-fill-2: rgba(0, 0, 0, 0.08);
  --exl-panel: rgba(255, 255, 255, 0.82);
  --exl-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* ── the chrome ─────────────────────────────────────────────────────────── */
#exelmj-design-toolbar {
  background: var(--exl-panel);
  backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid var(--exl-hair);
  gap: 3px;
  padding-block: 7px;
  color: var(--exl-ink);
}
#exelmj-design-status {
  background: var(--exl-panel);
  backdrop-filter: saturate(180%) blur(20px);
  border-top: 1px solid var(--exl-hair);
  color: var(--exl-ink-2);
}
#exelmj-design-stage { background: #f5f5f7; }
#exelmj-design-layers {
  background: rgba(250, 250, 252, 0.92);
  border-inline-start: 1px solid var(--exl-hair);
}
#exelmj-design-studio { border-inline-end: 1px solid var(--exl-hair); background: rgba(250, 250, 252, 0.92); }
.dz-page, .dz-pagewrap { box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 12px 40px rgba(0,0,0,0.1); border-radius: 2px; }

/* ── buttons: quiet until touched, pressed means pressed ────────────────── */
.dz-btn {
  height: 30px;
  border-radius: 8px;
  border-color: transparent;
  color: var(--exl-ink);
  transition: background-color 0.15s ease, transform 0.12s ease, opacity 0.15s ease;
}
.dz-btn:hover { background: var(--exl-fill); border-color: transparent; }
.dz-btn:active { transform: scale(0.96); background: var(--exl-fill-2); }
.dz-btn.active { background: var(--exl-accent); border-color: var(--exl-accent); color: #fff; }
.dz-btn:disabled { opacity: 0.28; }
.dz-btn:disabled:hover { background: transparent; }
.dz-btn svg { width: 16px; height: 16px; }
.dz-sep { width: 1px; height: 18px; background: var(--exl-hair); margin: 0 5px; }

/* ── the tool palette: a floating card, active tool a filled blue tile ──── */
#exelmj-design-tools {
  background: var(--exl-panel);
  backdrop-filter: saturate(180%) blur(20px);
  border-inline-start: 1px solid var(--exl-hair);
  padding: 10px 8px;
}
.dz-tool-grid { gap: 4px; }
.dz-tool {
  width: 34px; height: 34px;
  border-radius: 9px;
  border: 0;
  color: var(--exl-ink);
  transition: background-color 0.15s ease, color 0.15s ease, transform 0.12s ease;
}
.dz-tool:hover { background: var(--exl-fill); }
.dz-tool:active { transform: scale(0.94); }
.dz-tool.active { background: var(--exl-accent); color: #fff; box-shadow: 0 2px 8px rgba(10, 132, 255, 0.4); }

/* ── the studio tabs: an iOS segmented control ──────────────────────────── */
.dz-studio-tabs {
  border-radius: 9px;
  background: var(--exl-fill);
  padding: 2px;
  gap: 2px;
}
.dz-studio-tab-btn {
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--exl-ink);
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}
.dz-studio-tab-btn:hover { background: var(--exl-fill); }
.dz-studio-tab-btn.active {
  background: #fff;
  color: var(--exl-ink);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16);
  font-weight: 600;
}

/* ── panels, menus, dialogs: one surface language ───────────────────────── */
.dz-trace-panel, .dz-menu, .dz-modal {
  border-radius: 13px;
  border: 1px solid var(--exl-hair);
  background: var(--exl-panel);
  backdrop-filter: saturate(180%) blur(24px);
  box-shadow: var(--exl-shadow);
  color: var(--exl-ink);
}
.dz-trace-head, .dz-modal-head { background: transparent; border-bottom: 1px solid var(--exl-hair); border-radius: 13px 13px 0 0; }
.dz-trace-foot, .dz-modal-foot { background: transparent; border-top: 1px solid var(--exl-hair); border-radius: 0 0 13px 13px; }
.dz-menu-item { border-radius: 6px; }
.dz-menu-item:hover:not(:disabled) { background: var(--exl-accent); color: #fff; }
.dz-menu-item:hover:not(:disabled) .dz-menu-key { color: rgba(255, 255, 255, 0.75); }
.dz-mo-card, .dz-mo-change, .dz-modal-preset, .dz-empty-btn { border-radius: 10px; border-color: var(--exl-hair); }
.dz-mo-card.open { border-color: var(--exl-accent); box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.12); }
.dz-inspector { background: transparent; }

/* primary actions carry the one accent, everywhere the same */
.dz-trace-run, .dz-modal-btn.primary, .dz-empty-btn.primary {
  background: var(--exl-accent);
  border-color: var(--exl-accent);
  border-radius: 8px;
}
.dz-trace-run:hover, .dz-modal-btn.primary:hover, .dz-empty-btn.primary:hover { background: var(--exl-accent-down); }
.dz-modal-btn, .dz-trace-btn, .dz-mo-preset, .dz-mo-act, .dz-swatch-act, .dz-layers-act { border-radius: 8px; }
.dz-mo-preset:hover, .dz-trace-mode:hover, .dz-trace-eyedrop:hover {
  border-color: var(--exl-accent); color: var(--exl-accent); background: rgba(10, 132, 255, 0.08);
}
.dz-crumbs { background: rgba(10, 132, 255, 0.08); border-bottom: 1px solid rgba(10, 132, 255, 0.2); }
.dz-crumb, .dz-crumb-back { color: var(--exl-accent); border-color: rgba(10, 132, 255, 0.35); }
.dz-crumb-back:hover { background: var(--exl-accent); }
.dz-layer.selected { background: rgba(10, 132, 255, 0.1); }
.dz-layer-target.on { background: var(--exl-accent); border-color: var(--exl-accent); }

/* ── how things ARRIVE: a small rise and fade, nothing more ─────────────── */
@media (prefers-reduced-motion: no-preference) {
  .dz-trace-panel, .dz-menu, .dz-modal, .dz-modal-wrap, .dz-studio-tab, .dz-empty, .dz-crumbs, .dz-inspector {
    transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0, 0, 0.2, 1);
  }
  @starting-style {
    .dz-trace-panel, .dz-menu, .dz-modal, .dz-studio-tab, .dz-empty, .dz-crumbs, .dz-inspector {
      opacity: 0;
      transform: translateY(8px);
    }
    .dz-modal-wrap { opacity: 0; }
  }
  .dz-btn, .dz-tool, .dz-mo-preset, .dz-modal-preset, .dz-empty-btn, .dz-studio-tab-btn {
    transition: background-color 0.15s ease, color 0.15s ease, transform 0.12s ease,
      border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  }
}
`

function injectCss() {
  if (document.getElementById('exelmj-design-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-design-style'
  // The SKIN rides in its own sheet APPENDED AFTER the base one, so it wins
  // every cascade tie without touching the hundreds of base rules — restyling
  // by override is what keeps the visual pass reviewable apart from the
  // behavioural code it sits on.
  const skin = document.createElement('style')
  skin.id = 'exelmj-design-skin'
  skin.textContent = SKIN_CSS
  document.head.append(style)
  document.head.append(skin)
  style.textContent = `
#design-app { display: none; flex-direction: column; }
#design-app.visible { display: flex; }
#exelmj-design-toolbar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
  padding: 6px 10px; padding-inline-start: 272px;
  background: #fff; border-bottom: 1px solid #e1dfdd; user-select: none;
}
/* Controls that belong together must WRAP together. The bar wraps, and the
   zoom trio was landing with its minus on one row and its plus on another. */
.dz-btn-group { display: inline-flex; align-items: center; gap: 2px; flex: none; }
/* A disabled control has to LOOK disabled, or pressing it and getting nothing
   reads as the app being broken rather than as the button not applying. */
.dz-btn:disabled { opacity: 0.35; cursor: default; }
.dz-btn:disabled:hover { background: transparent; border-color: transparent; }
.dz-btn {
  display: inline-flex; align-items: center; gap: 5px; height: 30px; min-width: 30px;
  padding: 0 8px; border: 1px solid transparent; border-radius: 4px; background: transparent;
  cursor: pointer; color: #1f2937; font: 12px 'Segoe UI', Tahoma, sans-serif;
}
.dz-btn:hover { background: #f5f5f5; }
.dz-btn.active { background: #edf3fb; border-color: #a9c8ee; color: #185abd; }
.dz-btn svg { width: 20px; height: 20px; }
.dz-sep { width: 1px; height: 22px; background: #e1dfdd; margin: 0 4px; }
.dz-font { width: 130px; height: 28px; border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; }
.dz-size { width: 56px; height: 28px; border: 1px solid #d1cfcd; border-radius: 4px; padding: 0 4px; }
.dz-page { font: 12px 'Segoe UI', Tahoma; color: #475467; min-width: 40px; text-align: center; }
#exelmj-design-main { flex: 1; display: flex; min-height: 0; }
/* Two columns, Illustrator-style: a 10-tool palette in one column is a
   scrolling strip, and the eye reads a 5x2 block far faster. */
#exelmj-design-tools {
  width: 76px; flex: none; display: flex; flex-direction: column; align-items: center;
  gap: 6px; padding: 6px 0; background: #fff; border-inline-end: 1px solid #e1dfdd;
  user-select: none;
}
.dz-tool-grid { display: grid; grid-template-columns: repeat(2, 32px); gap: 2px; }
/* THE SWATCH: a filled square with an outlined square overlapping it. The one
   IN FRONT is the one the colour controls edit. */
.dz-swatch { position: relative; width: 52px; height: 52px; }
.dz-swatch-box {
  position: absolute; width: 30px; height: 30px; padding: 0; cursor: pointer;
  border: 1px solid rgba(0,0,0,0.45); background: #fff; border-radius: 2px;
}
.dz-swatch-stroke { inset-inline-end: 0; bottom: 0; }
.dz-swatch-fill { inset-inline-start: 0; top: 0; }
.dz-swatch-box.active { z-index: 2; border-color: #185abd; box-shadow: 0 0 0 1px #185abd; }
.dz-swatch-chip { position: absolute; inset: 3px; border-radius: 1px; }
/* The stroke box shows a RING, not a solid: that is what "stroke" means. */
.dz-swatch-stroke .dz-swatch-chip {
  box-shadow: inset 0 0 0 5px currentColor; background: transparent !important;
}
.dz-swatch-stroke { color: #0f172a; }
/* "None" is the diagonal slash every vector tool uses; a white chip would read
   as white paint. */
.dz-swatch-chip.none {
  background:
    linear-gradient(to bottom right, transparent 46%, #d92d20 46%, #d92d20 54%, transparent 54%),
    #fff !important;
}
.dz-swatch-input {
  position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none;
}
.dz-swatch-actions { display: flex; gap: 3px; }
.dz-swatch-act {
  width: 24px; height: 22px; font-size: 12px; line-height: 1; cursor: pointer;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.15)); border-radius: 3px; background: #fff;
}
.dz-swatch-act:hover { border-color: #185abd; color: #185abd; }
/* The appearance inspector, docked under the layers list. */
.dz-inspector {
  flex: none; max-height: 46%; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: 6px;
  padding: 8px 12px 12px; border-top: 1px solid #e1dfdd; background: #fafafa;
}
.dz-inspector[hidden] { display: none; }
.dz-insp-head {
  font-weight: 600; color: #1f2937; font-size: 12px; padding-bottom: 2px;
}
.dz-insp-row { display: flex; align-items: center; gap: 8px; }
/* One line, always: a label that wraps makes its row twice as tall as the
   ones around it, and a column of rows at two different heights reads as a
   mistake even when every value in it is right. */
.dz-insp-row > label {
  font-size: 11px; color: #4b5563; flex: 1 1 auto; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
/* Same flexbox trap as the motion panel: without min-width the range input
   refused to shrink and the inspector overflowed by a hundred pixels, which
   is what put a horizontal scrollbar under the layers list. */
.dz-insp-row input[type=range] { flex: 0 1 84px; min-width: 0; }
.dz-insp-num { flex: 0 1 56px; min-width: 0; font-size: 11px; padding: 2px 4px; }
/* Numbers read LTR even inside the Arabic panel. */
.dz-insp-val { font-size: 10px; color: #6b7280; font-family: monospace; flex: 0 0 30px; text-align: end; }
/* The shadow's own controls are indented so they read as belonging to the
   switch above them rather than as four more independent properties. */
.dz-insp-sub { padding-inline-start: 12px; border-inline-start: 2px solid #e5e7eb; }
.dz-tool {
  width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent; border-radius: 5px; background: transparent;
  color: #1f2937; cursor: pointer; padding: 0;
}
.dz-tool svg { width: 20px; height: 20px; }
.dz-tool:hover { background: #f5f5f5; }
.dz-tool.active { background: #edf3fb; border-color: #a9c8ee; color: #185abd; }
.dz-tool-sep { width: 26px; height: 1px; background: #e1dfdd; margin: 5px 0; }
.dz-tool-color { width: 30px; height: 26px; display: block; cursor: pointer; }
.dz-tool-color input {
  width: 100%; height: 100%; padding: 0; border: 1px solid #d1cfcd; border-radius: 4px;
  background: #fff; cursor: pointer;
}
.dz-trace-preview {
  position: absolute; pointer-events: none; z-index: 30;
  outline: 1px dashed rgba(24,90,189,0.55); outline-offset: 0;
  background: #fff;
}
/* ─── Image Trace panel ───────────────────────────────────────────────────
   Illustrator's layout in a LIGHT panel: head, quick strip, the three choices
   that matter, an Advanced fold, what to create, info, and the trace button
   pinned to the bottom so it never scrolls out of reach. */
.dz-trace-panel {
  /* physically beside the tool palette, which is pinned to the right edge in
     both UI directions — a logical inset would fling it across the window */
  position: absolute; top: 78px; right: 56px; width: 268px; z-index: 40;
  max-height: calc(100% - 120px); display: flex; flex-direction: column;
  background: #fff; border: 1px solid #d1cfcd; border-radius: 6px;
  box-shadow: 0 8px 28px rgba(16,24,40,0.22);
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #1f2937;
}
.dz-trace-head {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: 600; padding: 9px 12px; border-bottom: 1px solid #e6e4e2;
  background: #f6f6f5; border-radius: 6px 6px 0 0;
}
.dz-trace-x {
  border: 0; background: none; font-size: 17px; line-height: 1; cursor: pointer;
  color: #6b7280; padding: 0 2px;
}
.dz-trace-x:hover { color: #1f2937; }
/* The body scrolls; the footer does not. */
.dz-trace-body { flex: 1 1 auto; overflow-y: auto; padding: 10px 12px; }
.dz-trace-strip {
  display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;
  padding-bottom: 10px; margin-bottom: 8px; border-bottom: 1px solid #eceaea;
}
.dz-trace-mode {
  height: 28px; padding: 0; cursor: pointer; color: #374151;
  border: 1px solid #d8d6d4; border-radius: 4px; background: #fff;
  display: flex; align-items: center; justify-content: center;
}
.dz-trace-mode svg { width: 17px; height: 17px; }
.dz-trace-mode:hover { border-color: #185abd; color: #185abd; background: #f2f7fd; }
.dz-trace-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px; margin-bottom: 8px;
}
.dz-trace-row > span { color: #4b5563; }
.dz-trace-row select { flex: 0 0 140px; height: 24px; border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; }
.dz-trace-val {
  width: 58px; height: 22px; border: 1px solid #d1cfcd; border-radius: 4px;
  text-align: center; font: 11px 'Segoe UI', Tahoma, sans-serif;
}
/* A slider carries its own name, its typed value and Illustrator's two end
   captions — the captions are what tell you which way the knob runs. */
.dz-trace-slide { margin-bottom: 10px; }
.dz-trace-slide-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px; }
.dz-trace-slide-top > span { color: #4b5563; }
.dz-trace-slide input[type="range"] { width: 100%; margin: 0; }
.dz-trace-ends { display: flex; justify-content: space-between; font-size: 10px; color: #9ca3af; }
.dz-trace-check { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; cursor: pointer; }
.dz-trace-check > span { color: #4b5563; }
.dz-trace-sec {
  font-weight: 600; color: #1f2937; margin: 10px 0 6px;
  padding-top: 8px; border-top: 1px solid #eceaea;
}
.dz-trace-adv { margin: 2px 0 8px; }
.dz-trace-adv > summary { cursor: pointer; color: #185abd; margin-bottom: 8px; user-select: none; }
.dz-trace-colors { display: flex; align-items: center; gap: 6px; }
.dz-trace-colors label { color: #6b7280; font-size: 11px; }
.dz-trace-pickrow {
  display: flex; align-items: center; justify-content: space-between;
  margin: 8px 0 6px; color: #4b5563;
}
.dz-trace-eyedrop {
  width: 26px; height: 24px; padding: 0; cursor: pointer; color: #374151;
  border: 1px solid #d8d6d4; border-radius: 4px; background: #fff;
  display: flex; align-items: center; justify-content: center;
}
.dz-trace-eyedrop svg { width: 15px; height: 15px; }
.dz-trace-eyedrop:hover { border-color: #185abd; color: #185abd; }
/* Info reads LTR: they are counts, and mirroring digits helps nobody. */
.dz-trace-info {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; direction: ltr;
  margin-top: 10px; padding-top: 8px; border-top: 1px solid #eceaea; text-align: center;
}
.dz-trace-info b { display: block; font-size: 12px; color: #1f2937; }
.dz-trace-info span { font-size: 10px; color: #9ca3af; }
.dz-trace-foot {
  flex: none; display: flex; align-items: center; gap: 10px;
  padding: 9px 12px; border-top: 1px solid #e6e4e2; background: #f6f6f5;
  border-radius: 0 0 6px 6px;
}
.dz-trace-foot .dz-trace-check { margin: 0; flex: 1 1 auto; }
.dz-trace-btn {
  height: 28px; border: 1px solid #d1cfcd;
  border-radius: 4px; background: #fff; cursor: pointer; color: #1f2937;
  font: 12px 'Segoe UI', Tahoma, sans-serif;
}
.dz-trace-btn:hover { background: #f5f5f5; }
.dz-trace-run { flex: 0 0 96px; background: #185abd; border-color: #185abd; color: #fff; }
.dz-trace-run:hover { background: #1450a8; }
.dz-trace-run:hover { background: #164e9e; }
.dz-trace-picks { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; min-height: 18px; }
.dz-trace-chip { width: 18px; height: 18px; border: 1px solid rgba(0,0,0,0.25); border-radius: 3px; cursor: pointer; padding: 0; }
.dz-trace-hint { color: #8a8886; }
.dz-imglayer { position: absolute; inset: 0; pointer-events: none; }
.dz-img { position: absolute; pointer-events: auto; cursor: move; }
/* the crop is a clip on the INNER frame so the outer one stays the object's
   true box — which is what the shared handle overlay measures against */
.dz-img-clip { position: absolute; inset: 0; overflow: hidden; }
.dz-img img { display: block; width: 100%; height: 100%; object-fit: fill; user-select: none; }
.dz-img.selected { outline: 1px dashed #185abd; outline-offset: 1px; }
/* ─── selection overlay (handles.ts) ─────────────────────────────────────── */
/* Sits above every layer and is click-through EXCEPT on the grips themselves,
   so clicking inside the frame still reaches the object underneath. */
.dz-handles {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; overflow: visible; z-index: 6;
}
.dz-handles .dz-frame {
  fill: none; stroke: #185abd; stroke-width: 1; vector-effect: non-scaling-stroke;
  stroke-dasharray: 3 2;
}
.dz-handles .dz-grip {
  fill: #fff; stroke: #185abd; stroke-width: 1.25;
  vector-effect: non-scaling-stroke; pointer-events: auto;
}
.dz-handles .dz-grip-rotate { fill: #185abd; stroke: #fff; }
/* THE ROTATION BAND: a ring just outside the box, invisible but live.
   Filled TRANSPARENT rather than "none" — none is not painted, and an
   unpainted region takes no pointer events, which is the whole point. Its
   middle is an evenodd hole, so a click inside the box still reaches the
   move plate underneath. */
.dz-handles .dz-rotband { fill: transparent; stroke: none; pointer-events: auto; }
.dz-handles .dz-grip-crop { fill: #185abd; stroke: #fff; }
.dz-handles .dz-grip:hover { fill: #185abd; stroke: #fff; }
/* Guides are drawn under the grips and must never intercept the pointer. */
.dz-guides { pointer-events: none; }
.dz-handles .dz-guide {
  stroke: #e5308a; stroke-width: 1; vector-effect: non-scaling-stroke; opacity: 0.9;
}
/* ─── Studio dock (colour panel, and the tool groups that join it) ───────── */
#exelmj-design-studio { overflow-x: hidden; }
#exelmj-design-studio {
  width: 288px; flex: none; overflow-y: auto; padding: 12px;
  border-inline-end: 1px solid var(--dz-border, rgba(0,0,0,0.12));
  background: var(--dz-panel, #fafafa);
}
#exelmj-design-studio[hidden] { display: none; }
/* One tab at a time. The browser tab must fill the dock so its hole — the
   rectangle the native view is told to occupy — is as large as possible. */
.dz-studio-tab { height: 100%; }
.dz-studio-tab[hidden] { display: none; }
/* ─── the colour panel ────────────────────────────────────────────────────
   One vertical rhythm, one type scale, one set of controls. What made the old
   panel read as a pile was that every block invented its own. */
.dz-colorpanel {
  display: flex; flex-direction: column; gap: 0;
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #1f2937;
}
/* THE HEAD: what the panel is currently about, big enough to judge. */
.dz-cp-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.dz-cp-preview {
  flex: none; width: 46px; height: 46px; border-radius: 8px;
  border: 1px solid rgba(0,0,0,0.18);
  /* an inner highlight keeps a very light colour from dissolving into the panel */
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.5);
}
.dz-cp-headtext { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.dz-cp-hex {
  width: 100%; font-family: ui-monospace, Consolas, monospace; font-size: 14px;
  font-weight: 600; letter-spacing: 0.5px; padding: 4px 8px; color: #1f2937;
  border: 1px solid #d8d6d4; border-radius: 5px; background: #fff;
}
.dz-cp-hex:focus { outline: none; border-color: #185abd; box-shadow: 0 0 0 2px rgba(24,90,189,0.15); }
.dz-cp-num { font-family: ui-monospace, Consolas, monospace; font-size: 10px; color: #9ca3af; }
.dz-cp-applyrow { display: flex; gap: 6px; margin-bottom: 4px; }
.dz-cp-applyrow .dz-btn { flex: 1 1 0; }
/* Section headings are what turn a column of widgets into a readable tool. */
.dz-cp-sec {
  font-size: 11px; font-weight: 600; color: #6b7280; letter-spacing: 0.2px;
  margin: 14px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #eceaea;
}
.dz-cp-note { font-size: 10px; color: #9ca3af; line-height: 1.5; margin-top: 4px; }
.dz-cp-plane {
  display: block; width: 100%; height: auto; border-radius: 6px; cursor: crosshair;
  border: 1px solid #d8d6d4;
}
.dz-cp-hue {
  display: block; width: 100%; height: 16px; margin-top: 8px;
  border-radius: 5px; cursor: crosshair; border: 1px solid #d8d6d4;
}
.dz-cp-row { display: flex; gap: 6px; align-items: center; }
.dz-cp-sev { flex: 1; min-width: 0; }
.dz-cp-sev:disabled { opacity: 0.35; }
.dz-select {
  flex: 0 0 auto; height: 26px; padding: 0 6px; font: inherit; color: inherit;
  border: 1px solid #d8d6d4; border-radius: 5px; background: #fff;
}
/* CONTRAST: the colour shown ON the background, at real text size. A ratio on
   its own is a number the user has to go and look up. */
.dz-cp-readout { display: flex; flex-direction: column; gap: 8px; }
.dz-cp-sample {
  padding: 12px 10px; border-radius: 6px; border: 1px solid #e1dfdd;
  font-size: 14px; font-weight: 600; text-align: center;
}
.dz-cp-verdict { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dz-cp-says { font-size: 11px; color: #4b5563; }
.dz-cp-badge {
  padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;
  color: #fff; font-family: ui-monospace, Consolas, monospace;
}
.dz-cp-badge.aaa { background: #15803d; }
.dz-cp-badge.aa { background: #a16207; }
.dz-cp-badge.fail { background: #b91c1c; }
.dz-cp-against { display: flex; align-items: center; gap: 6px; }
.dz-cp-against > span { font-size: 11px; color: #6b7280; }
.dz-cp-bg {
  width: 20px; height: 20px; padding: 0; cursor: pointer; border-radius: 4px;
  border: 1px solid rgba(0,0,0,0.2);
}
.dz-cp-bg.on { border-color: #185abd; box-shadow: 0 0 0 2px rgba(24,90,189,0.25); }
.dz-cp-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
.dz-cp-actions .dz-btn { flex: 1 1 auto; }
/* The scale reads as ONE object — a continuous strip, not eleven buttons. */
.dz-cp-scale {
  display: flex; border-radius: 6px; overflow: hidden; border: 1px solid #d8d6d4;
}
.dz-cp-step {
  flex: 1 1 0; height: 34px; border: 0; padding: 0; cursor: pointer;
  font: 600 9px ui-monospace, Consolas, monospace;
}
.dz-cp-step:hover { outline: 2px solid #185abd; outline-offset: -2px; z-index: 1; }
.dz-cp-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr)); gap: 5px; }
.dz-cp-chip {
  height: 28px; padding: 0; cursor: pointer; border-radius: 5px;
  border: 1px solid rgba(0,0,0,0.15);
}
.dz-cp-chip:hover { border-color: #185abd; box-shadow: 0 0 0 2px rgba(24,90,189,0.2); }
/* The shared STUDIO button.
   Scoped to the dock: the toolbar's .dz-btn is a transparent 30px icon button
   and must keep being one — a bare .dz-btn rule down here would silently
   restyle the whole top bar. */
#exelmj-design-studio .dz-btn {
  display: inline-flex; align-items: center; justify-content: center;
  height: 26px; padding: 0 10px; cursor: pointer; color: #1f2937;
  border: 1px solid #d8d6d4; border-radius: 5px; background: #fff;
  font: 12px 'Segoe UI', Tahoma, sans-serif; white-space: nowrap;
}
#exelmj-design-studio .dz-btn:hover:not(:disabled) { border-color: #185abd; color: #185abd; background: #f5f9ff; }
#exelmj-design-studio .dz-btn:disabled { opacity: 0.4; cursor: default; }
#exelmj-design-studio .dz-btn.active { border-color: #185abd; color: #185abd; background: #eef4fd; }
#exelmj-design-studio .dz-btn-primary { background: #185abd; border-color: #185abd; color: #fff; font-weight: 600; }
#exelmj-design-studio .dz-btn-primary:hover:not(:disabled) { background: #1450a8; border-color: #1450a8; color: #fff; }
.dz-cp-chip {
  height: 24px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.15);
  padding: 0; cursor: pointer;
}
/* ─── templates & layout panels ──────────────────────────────────────────── */
.dz-tpl-list { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; }
.dz-tpl-row { display: flex; gap: 3px; align-items: stretch; }
.dz-tpl-name {
  flex: 1; min-width: 0; display: flex; justify-content: space-between; align-items: center;
  gap: 6px; padding: 4px 7px; font-size: 11px; cursor: pointer; text-align: start;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.12)); border-radius: 3px; background: #fff;
}
.dz-tpl-name.selected { border-color: #185abd; background: rgba(24,90,189,0.07); }
.dz-tpl-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* The size is machine text and reads LTR even in the Arabic panel. */
.dz-tpl-name small { flex: none; opacity: 0.55; font-family: monospace; font-size: 9px; }
.dz-tpl-act {
  flex: none; width: 22px; cursor: pointer; font-size: 12px; line-height: 1;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.12)); border-radius: 3px; background: #fff;
}
.dz-tpl-act:hover { border-color: #b3261e; color: #b3261e; }
.dz-lay-body { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
.dz-lay-field { display: flex; flex-direction: column; gap: 3px; }
.dz-lay-field > label { font-size: 10px; opacity: 0.65; }
.dz-lay-pills { display: flex; gap: 3px; flex-wrap: wrap; }
.dz-lay-pill {
  padding: 2px 7px; font-size: 10px; cursor: pointer; border-radius: 10px;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.15)); background: #fff;
}
.dz-lay-pill.active { background: #185abd; color: #fff; border-color: #185abd; }
.dz-lay-num { width: 70px; font-size: 11px; padding: 2px 4px; }
/* ─── icon panel (iconPanel.ts) ──────────────────────────────────────────── */
/* Guides are non-printing and must never intercept the pointer: a guide the
   user can grab is a guide they will move, then wonder why the icon drifted. */
.dz-iconguide {
  fill: none; stroke: #e5308a; stroke-width: 0.5; stroke-dasharray: 1 1;
  opacity: 0.55; pointer-events: none; vector-effect: non-scaling-stroke;
}
.dz-iconlive { stroke: #185abd; stroke-dasharray: 2 1.5; opacity: 0.7; }
/* A frame outline is a GUIDE: non-printing, and never a pointer target — a
   frame the user can grab is a frame they will drag away from its children. */
.dz-frameguide {
  fill: none; stroke: #7a4fd6; stroke-width: 1; stroke-dasharray: 4 2;
  opacity: 0.5; pointer-events: none; vector-effect: non-scaling-stroke;
}
.dz-frameguide.selected { opacity: 1; stroke-width: 1.5; }
/* The rubber band. Non-interactive: it must never swallow the pointerup that
   ends the very drag drawing it. */
/* The Studio tabs, as one segmented control. */
.dz-alignbar { display: inline-flex; gap: 2px; margin-inline-start: 6px; }
.dz-alignbar[hidden] { display: none; }
.dz-align-btn {
  width: 28px; height: 30px; font-size: 14px; line-height: 1; cursor: pointer;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.15)); border-radius: 4px; background: #fff;
}
.dz-align-btn:hover { border-color: #185abd; color: #185abd; }
.dz-studio-tabs {
  display: inline-flex; margin-inline-start: 6px; border-radius: 6px; overflow: hidden;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.18));
}
.dz-studio-tab-btn {
  padding: 0 10px; height: 30px; font: 12px 'Segoe UI', Tahoma, sans-serif;
  border: 0; border-inline-start: 1px solid var(--dz-border, rgba(0,0,0,0.12));
  background: #fff; color: #1f2937; cursor: pointer; white-space: nowrap;
}
.dz-studio-tab-btn:first-child { border-inline-start: 0; }
.dz-studio-tab-btn:hover { background: #f3f4f6; }
.dz-studio-tab-btn.active { background: #185abd; color: #fff; }
/* Snap guides: drawn while dragging, gone the moment the drag ends. */
.dz-snapguide {
  stroke: #e5308a; stroke-width: 1; vector-effect: non-scaling-stroke;
  pointer-events: none; opacity: 0.9;
}
/* The pen tool takes a crosshair: the arrow points at things, the crosshair
   places them, and mixing the two is how a click lands in the wrong spot. */
#exelmj-design-stage.dz-pen-mode .dz-page, #exelmj-design-stage.dz-pen-mode .dz-shape {
  cursor: crosshair;
}
.dz-insp-color {
  flex: 0 0 32px; height: 20px; padding: 0; border: 1px solid #d1d5db;
  border-radius: 3px; background: #fff; cursor: pointer;
}
/* The pen's in-progress path: a GUIDE, not artwork — it must never be
   selectable, and it disappears the moment the path is committed. */
.dz-pen {
  fill: none; stroke: #185abd; stroke-width: 1; stroke-dasharray: 4 2;
  vector-effect: non-scaling-stroke; pointer-events: none;
}
.dz-pen-dot { fill: #fff; stroke: #185abd; stroke-width: 1.2; vector-effect: non-scaling-stroke; pointer-events: none; }
.dz-pen-dot.first { fill: #185abd; }
.dz-marquee {
  fill: rgba(24,90,189,0.10); stroke: #185abd; stroke-width: 1;
  stroke-dasharray: 3 2; vector-effect: non-scaling-stroke; pointer-events: none;
}
/* Members of a multi-selection are marked individually AS WELL AS framed by
   the union box — the frame alone does not say WHICH objects inside it are
   part of the group. */
.dz-shape.in-group { outline: 1px dashed #185abd; outline-offset: 1px; }
.dz-img.in-group { outline: 1px dashed #185abd; outline-offset: 1px; }
.dz-icon-strip {
  display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap;
  margin-top: 8px; padding: 8px; border-radius: 4px;
  background: repeating-conic-gradient(#f0f0f0 0% 25%, #fff 0% 50%) 50% / 8px 8px;
}
.dz-icon-cell { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.dz-icon-cell span { font-size: 9px; opacity: 0.6; font-family: monospace; }
.dz-icon-empty { font-size: 11px; opacity: 0.6; padding: 12px; text-align: center; }
.dz-icon-report { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; }
.dz-icon-light {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px;
  align-self: flex-start; color: #fff;
}
.dz-icon-light.ok { background: #1b7f3b; }
.dz-icon-light.warn { background: #b06a00; }
.dz-icon-note { font-size: 10px; opacity: 0.7; line-height: 1.4; }
.dz-icon-library {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 3px; margin-top: 6px; max-height: 200px; overflow-y: auto;
}
.dz-icon-tile {
  display: flex; align-items: center; justify-content: center;
  height: 28px; padding: 0; cursor: pointer; color: #333;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.12)); border-radius: 3px; background: #fff;
}
.dz-icon-tile:hover { border-color: #185abd; color: #185abd; }
/* ─── mini-browser (browserPanel.ts) ─────────────────────────────────────── */
/* The native WebContentsView paints ABOVE all renderer DOM, so .dz-bw-hole is
   a HOLE, not a container: nothing may be drawn inside it, and every control
   lives outside its rectangle. */
.dz-browser { display: flex; flex-direction: column; gap: 6px; height: 100%; }
.dz-bw-bar { display: flex; gap: 4px; }
.dz-bw-url {
  flex: 1; min-width: 0; font-family: monospace; font-size: 11px; padding: 3px 5px;
}
.dz-bw-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.dz-bw-pill {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 12px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--dz-border, rgba(0,0,0,0.18)); background: #fff;
}
.dz-bw-pill.active { background: #185abd; color: #fff; border-color: #185abd; }
.dz-bw-pills .dz-btn[disabled] { opacity: 0.45; pointer-events: none; }
.dz-bw-hole {
  flex: 1; min-height: 220px; border-radius: 4px;
  border: 1px dashed var(--dz-border, rgba(0,0,0,0.22));
  display: flex; align-items: center; justify-content: center;
  text-align: center; padding: 8px; font-size: 11px; opacity: 0.6;
}
/* ─── node editor (nodeEdit.ts) ──────────────────────────────────────────── */
.dz-nodes {
  position: absolute; inset: 0; width: 100%; height: 100%;
  pointer-events: none; overflow: visible; z-index: 7;
}
/* A curve anchor is round and a corner square — the grip's SHAPE tells the
   user what the segment is before they touch it. */
.dz-nodes .dz-node {
  fill: #fff; stroke: #185abd; stroke-width: 1.25;
  vector-effect: non-scaling-stroke; pointer-events: auto; cursor: pointer;
}
.dz-nodes .dz-node.selected, .dz-nodes .dz-node:hover { fill: #185abd; stroke: #fff; }
.dz-nodes .dz-node-control {
  fill: #e5308a; stroke: #fff; stroke-width: 1;
  vector-effect: non-scaling-stroke; pointer-events: auto; cursor: pointer;
}
.dz-nodes .dz-node-tether {
  stroke: #e5308a; stroke-width: 1; stroke-dasharray: 2 2;
  vector-effect: non-scaling-stroke; opacity: 0.7;
}
.dz-layer-thumb {
  width: 18px; height: 18px; flex: none; object-fit: cover;
  border: 1px solid rgba(0,0,0,0.2); border-radius: 2px; background: #fff;
}
/* shapes paint under the text boxes; only the shapes themselves take clicks */
.dz-shapelayer { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
/* Same rule for the artwork itself: the selection tool points, it does not
   show a move glyph. */
.dz-shape { pointer-events: auto; cursor: default; }
/* The selection affordance is the handle overlay (handles.ts), NOT a css
   filter. A css filter here overrides the shape's own drop-shadow attribute,
   and a stroke-dasharray override flattens a dashed stroke the instant it is
   selected — both are css beating a presentation attribute. */
.dz-shape.selected { outline: none; paint-order: stroke; }
#exelmj-design-stage { flex: 1; overflow: auto; background: #e8eaed; position: relative; }
#exelmj-design-layers {
  width: 232px; flex: none; overflow: hidden; background: #fff; user-select: none;
  border-inline-start: 1px solid #e1dfdd; font: 12px 'Segoe UI', Tahoma, sans-serif;
  display: flex; flex-direction: column;
}
/* The list takes the slack and scrolls; the inspector and the footer keep
   their own height so they stay visible however long the list gets. */
.dz-layers-scroll { flex: 1 1 auto; overflow: auto; min-height: 0; }
/* The move plate: the selected object's own box, transparent, drag-to-move.
   Filled TRANSPARENT rather than "none" — none is not paintable and so takes
   no pointer events, which is the whole point of the plate.

   The cursor stays the ARROW. A four-way move cursor is what a window title
   bar uses; a vector editor's selection tool keeps pointing, and swapping the
   pointer for a move glyph over every selected object is a change of tool the
   user did not make. */
.dz-handles .dz-move { fill: transparent; stroke: none; pointer-events: auto; cursor: default; }
/* The empty canvas says what to do, instead of leaving one sentence in the
   status bar at the bottom of the window where nobody looks. */
.dz-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 18px; pointer-events: none;
  font: 13px 'Segoe UI', Tahoma, sans-serif; color: #6b7280;
}
.dz-empty-title { font-size: 15px; color: #4b5563; }
.dz-empty-actions { display: flex; gap: 12px; pointer-events: auto; }
.dz-empty-btn {
  display: flex; flex-direction: column; gap: 3px; min-width: 168px;
  padding: 14px 18px; cursor: pointer; text-align: center; font: inherit;
  border: 1px solid #d8d6d4; border-radius: 8px; background: #fff; color: #1f2937;
}
.dz-empty-btn b { font-size: 14px; }
.dz-empty-btn span { font-size: 11px; color: #9ca3af; }
.dz-empty-btn:hover { border-color: #185abd; background: #f6faff; }
.dz-empty-btn.primary { border-color: #185abd; background: #185abd; color: #fff; }
.dz-empty-btn.primary span { color: rgba(255,255,255,0.8); }
.dz-empty-btn.primary:hover { background: #1450a8; }
/* ─── modal dialogs (new document) ────────────────────────────────────────
   Fixed to the viewport and centred: the canvas behind it scrolls, and a
   dialog that travelled with the scroll would be a dialog you could lose. */
.dz-modal-wrap {
  position: fixed; inset: 0; z-index: 120; display: flex;
  align-items: center; justify-content: center; background: rgba(16,24,40,0.35);
}
.dz-modal {
  width: 460px; max-width: calc(100vw - 32px); max-height: calc(100vh - 64px);
  display: flex; flex-direction: column;
  background: #fff; border-radius: 8px; box-shadow: 0 20px 50px rgba(16,24,40,0.35);
  font: 13px 'Segoe UI', Tahoma, sans-serif; color: #1f2937;
}
.dz-modal-head {
  padding: 14px 18px; font-weight: 600; font-size: 15px;
  border-bottom: 1px solid #eceaea;
}
.dz-modal-body { flex: 1 1 auto; overflow-y: auto; padding: 14px 18px; }
.dz-modal-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; margin-bottom: 10px;
}
.dz-modal-row > span { color: #4b5563; }
.dz-modal-row select { flex: 0 0 200px; height: 28px; border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; }
.dz-modal-num {
  flex: 0 0 200px; height: 28px; padding: 0 8px; text-align: start;
  border: 1px solid #d1cfcd; border-radius: 4px;
}
/* The presets read as cards, not as a dropdown: their whole value is that you
   can see the sizes side by side. */
.dz-modal-presets {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;
  margin-bottom: 16px; padding-bottom: 14px; border-bottom: 1px solid #eceaea;
}
.dz-modal-preset {
  display: flex; flex-direction: column; gap: 2px; padding: 8px 6px;
  border: 1px solid #d8d6d4; border-radius: 5px; background: #fff;
  cursor: pointer; text-align: center; color: #1f2937; font: inherit;
}
.dz-modal-preset b { font-size: 12px; }
.dz-modal-preset span { font-size: 10px; color: #9ca3af; }
.dz-modal-preset:hover { border-color: #185abd; background: #f2f7fd; }
.dz-modal-preset.active { border-color: #185abd; background: #eef4fd; box-shadow: inset 0 0 0 1px #185abd; }
.dz-modal-seg { flex: 0 0 200px; display: flex; }
.dz-modal-segbtn {
  flex: 1 1 0; height: 28px; cursor: pointer; font: inherit; color: #4b5563;
  border: 1px solid #d1cfcd; background: #fff;
}
.dz-modal-segbtn:first-child { border-radius: 0 4px 4px 0; }
.dz-modal-segbtn:last-child { border-radius: 4px 0 0 4px; }
.dz-modal-segbtn.active { background: #185abd; border-color: #185abd; color: #fff; }
/* The pixel count the controls above hide, and the number that decides whether
   an export comes out sharp or enormous. */
.dz-modal-note {
  margin-top: 12px; padding: 8px 10px; border-radius: 5px; background: #f6f6f5;
  color: #6b7280; font-family: monospace; font-size: 11px; text-align: center;
}
.dz-modal-foot {
  flex: none; display: flex; justify-content: flex-start; gap: 8px;
  padding: 12px 18px; border-top: 1px solid #eceaea;
}
.dz-modal-btn {
  height: 30px; padding: 0 18px; cursor: pointer; font: inherit;
  border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; color: #1f2937;
}
.dz-modal-btn:hover { background: #f5f5f5; }
.dz-modal-btn.primary { background: #185abd; border-color: #185abd; color: #fff; }
.dz-modal-btn.primary:hover { background: #1450a8; }
/* ─── isolation mode ──────────────────────────────────────────────────────
   Everything outside the group you stepped into fades back and stops taking
   clicks: there is then nothing to hit by mistake, which is the entire point
   of stepping in. */
.dz-shape.dimmed, .dz-img.dimmed, .dz-box.dimmed {
  opacity: 0.22; pointer-events: none;
}
#exelmj-design-canvas { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.dz-crumbs {
  flex: none; display: flex; align-items: center; gap: 6px;
  padding: 5px 10px; background: #eef4fd; border-bottom: 1px solid #cfe0f7;
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #1f2937; user-select: none;
}
.dz-crumbs[hidden] { display: none; }
.dz-crumb-back {
  width: 22px; height: 22px; padding: 0; cursor: pointer; font-size: 16px; line-height: 1;
  border: 1px solid #a9c8ee; border-radius: 4px; background: #fff; color: #185abd;
  /* RTL: the arrow has to point the way "back" actually goes. */
  transform: scaleX(-1);
}
.dz-crumb-back:hover { background: #185abd; color: #fff; }
.dz-crumb { cursor: pointer; color: #185abd; }
.dz-crumb:hover { text-decoration: underline; }
.dz-crumb.current { color: #1f2937; font-weight: 600; cursor: default; }
.dz-crumb.current:hover { text-decoration: none; }
.dz-crumb-sep { color: #9ca3af; transform: scaleX(-1); }
/* ─── the motion panel ────────────────────────────────────────────────────
   Four decisions and no keyboard: which object, what sets it off, what
   changes, and how fast. */
/* The one-click icon motions: a strip of ready presets above the list. */
.dz-mo-presets {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px;
  margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eceaea;
}
.dz-mo-preset {
  height: 26px; padding: 0 4px; cursor: pointer; font: 11px 'Segoe UI', Tahoma, sans-serif;
  border: 1px solid #d8d6d4; border-radius: 4px; background: #fff; color: #374151;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0;
}
.dz-mo-preset:hover { border-color: #185abd; color: #185abd; background: #f2f7fd; }
.dz-mo-card {
  border: 1px solid #e1dfdd; border-radius: 6px; margin-bottom: 6px; background: #fff;
  /* The panel is the width it is; nothing inside may push past it. */
  overflow: hidden;
}
.dz-mo-card.open { border-color: #185abd; }
.dz-mo-bar { display: flex; align-items: center; gap: 4px; padding: 4px 6px; }
.dz-mo-name {
  flex: 1 1 auto; text-align: start; border: 0; background: none; cursor: pointer;
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #1f2937; padding: 3px 2px;
}
.dz-mo-card.open .dz-mo-name { font-weight: 600; color: #185abd; }
.dz-mo-act {
  width: 22px; height: 22px; flex: none; cursor: pointer; font-size: 11px;
  border: 1px solid #d8d6d4; border-radius: 4px; background: #fff; color: #4b5563;
}
.dz-mo-act:hover { border-color: #185abd; color: #185abd; }
.dz-mo-body { padding: 4px 8px 10px; border-top: 1px solid #eceaea; }
.dz-mo-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.dz-mo-row > span:first-child {
  font-size: 11px; color: #4b5563; flex: 1 1 auto; min-width: 0;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.dz-mo-row select { flex: 0 1 128px; min-width: 0; height: 24px; border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; }
.dz-mo-row input[type=color] { flex: 0 1 128px; min-width: 0; height: 24px; padding: 0; border: 1px solid #d1cfcd; border-radius: 4px; }
/* Slider AND number: one finds the value, the other matches a known one.
   A zero min-width on every one of them is not decoration: a flex item
   refuses to shrink below its content's minimum unless it is told it may, and
   a range input's minimum is wide. Without it this row measured 282px inside
   a 255px panel and hung off the left edge of the window. */
.dz-mo-num { flex: 0 1 128px; min-width: 0; display: flex; align-items: center; gap: 4px; }
.dz-mo-num input[type=range] { flex: 1 1 40px; min-width: 0; width: 100%; }
.dz-mo-num input[type=number] { flex: 0 0 46px; min-width: 0; font-size: 11px; padding: 1px 3px; }
.dz-mo-sec {
  font-size: 11px; font-weight: 600; color: #1f2937;
  margin: 10px 0 6px; padding-top: 8px; border-top: 1px solid #eceaea;
}
.dz-mo-change { border: 1px solid #eceaea; border-radius: 5px; padding: 6px; margin-bottom: 6px; background: #fafafa; }
.dz-mo-chtop { display: flex; gap: 4px; margin-bottom: 6px; }
.dz-mo-chtop select { flex: 1 1 auto; height: 24px; border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; }
.dz-mo-from { flex: 0 1 128px; min-width: 0; display: flex; align-items: center; gap: 4px; }
/* A stop between the two ends. Indented under them, because it belongs to the
   run rather than standing beside it as a third equal thing. */
.dz-mo-stop {
  margin: 4px 0 4px 0; padding: 5px 6px; border-radius: 4px;
  background: #fff; border: 1px dashed #d8d6d4;
}
.dz-mo-stophead { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.dz-mo-at { width: 46px; font-size: 11px; padding: 1px 3px; }
.dz-mo-stophead > span { font-size: 11px; color: #9ca3af; flex: 1 1 auto; }
.dz-mo-addstop { width: 100%; justify-content: center; font-size: 11px; margin-top: 2px; }
.dz-mo-stop .dz-mo-num { flex: 1 1 auto; }
.dz-mo-add, .dz-mo-addch { width: 100%; justify-content: center; margin-top: 4px; }
/* The code it produced, shown rather than described — a person who never
   writes CSS still deserves to see that something real came out. */
.dz-mo-code { margin-top: 12px; }
.dz-mo-code > summary { cursor: pointer; color: #185abd; font-size: 11px; }
.dz-mo-code pre {
  max-height: 220px; overflow: auto; margin: 6px 0 0; padding: 8px;
  background: #1f2937; color: #e5e7eb; border-radius: 5px;
  font: 10px/1.5 monospace; white-space: pre-wrap; word-break: break-all;
}
/* What the open motion row touches. */
.dz-shape.motion-lit, .dz-img.motion-lit, .dz-box.motion-lit {
  outline: 2px solid #e5308a; outline-offset: 2px;
}
/* ─── the right-click menu ────────────────────────────────────────────────
   Fixed to the viewport, not the page: the canvas scrolls and the menu must
   not travel with it. */
.dz-menu {
  position: fixed; z-index: 90; min-width: 210px; padding: 4px;
  background: #fff; border: 1px solid #d1cfcd; border-radius: 6px;
  box-shadow: 0 8px 28px rgba(16,24,40,0.22);
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #1f2937;
}
.dz-menu-item {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 5px 10px; border: 0; border-radius: 4px; background: none;
  cursor: pointer; text-align: start; color: inherit; font: inherit;
  position: relative;
}
.dz-menu-item > span:first-child { flex: 1 1 auto; }
.dz-menu-item:hover:not(:disabled) { background: #eef4fd; color: #185abd; }
/* Disabled items stay VISIBLE and in place: a menu whose rows move as the
   selection changes cannot be used from muscle memory. */
.dz-menu-item:disabled { color: #b0aeac; cursor: default; }
.dz-menu-key { flex: none; font-size: 11px; color: #9ca3af; font-family: monospace; }
.dz-menu-item:hover:not(:disabled) .dz-menu-key { color: #6b93cf; }
.dz-menu-arrow { flex: none; color: #9ca3af; transform: rotate(180deg); }
.dz-menu-sep { height: 1px; margin: 4px 6px; background: #eceaea; }
/* A submenu opens on hover and sits beside its parent row. */
.dz-menu-sub { display: none; position: absolute; top: -5px; inset-inline-start: 100%; }
.dz-menu-item:hover > .dz-menu-sub { display: block; }
.dz-menu.flip .dz-menu-sub { inset-inline-start: auto; inset-inline-end: 100%; }
/* ─── the layers panel, Illustrator's shape ───────────────────────────────
   Selection is the TARGET CIRCLE, not the row: the row itself has to stay
   safe to press, because pressing it is how you drag it. */
.dz-layer-target {
  flex: none; width: 13px; height: 13px; padding: 0; cursor: pointer;
  border: 1.5px solid #9ca3af; border-radius: 50%; background: transparent;
  margin-inline-start: 4px;
}
.dz-layer-target:hover { border-color: #185abd; }
/* Filled means "this object is selected", the same reading as Illustrator's. */
.dz-layer-target.on {
  border-color: #185abd;
  box-shadow: inset 0 0 0 2px #fff;
  background: #185abd;
}
.dz-layer-group { background: #f6f6f5; font-weight: 600; }
.dz-layer-child { padding-inline-start: 22px; }
.dz-layer-arrow {
  flex: none; width: 14px; padding: 0; border: 0; background: none; cursor: pointer;
  color: #6b7280; font-size: 13px; line-height: 1; transition: transform 0.12s;
}
/* RTL: the closed arrow points the way the list reads. */
.dz-layer-arrow { transform: rotate(180deg); }
.dz-layer-arrow.open { transform: rotate(90deg); }
.dz-layer[draggable='true'] { cursor: grab; }
.dz-layer.dragging { opacity: 0.45; }
/* The drop line, drawn on the row the pointer is over. */
.dz-layer.drop-before { box-shadow: inset 0 2px 0 #185abd; }
.dz-layer.drop-after { box-shadow: inset 0 -2px 0 #185abd; }
.dz-layers-foot {
  flex: none; display: flex; align-items: center; gap: 4px;
  padding: 6px 10px; border-top: 1px solid #e1dfdd; background: #f6f6f5;
}
.dz-layers-count { flex: 1 1 auto; font-size: 11px; color: #6b7280; }
.dz-layers-act {
  width: 26px; height: 24px; padding: 0; cursor: pointer; font-size: 13px;
  border: 1px solid transparent; border-radius: 4px; background: none; color: #374151;
}
.dz-layers-act:hover:not(:disabled) { border-color: #d1cfcd; background: #fff; }
/* A disabled action still SHOWS: hiding it would make the footer's controls
   move under the pointer as the selection changes. */
.dz-layers-act:disabled { opacity: 0.3; cursor: default; }
.dz-layers-trash:hover:not(:disabled) { border-color: #d92d20; color: #d92d20; }
.dz-layers-head {
  padding: 10px 12px; font-weight: 600; color: #1f2937;
  border-bottom: 1px solid #eceaea;
}
.dz-layers-sec {
  padding: 8px 12px 4px; color: #8a8886; font-size: 11px;
}
.dz-layers-empty { padding: 12px; color: #8a8886; line-height: 1.6; }
.dz-layer {
  display: flex; align-items: center; gap: 6px; padding: 5px 8px 5px 12px;
  cursor: pointer; border-inline-start: 3px solid transparent; color: #1f2937;
}
.dz-layer:hover { background: #f5f5f5; }
.dz-layer.selected { background: #edf3fb; border-inline-start-color: #185abd; color: #185abd; }
.dz-layer-dot {
  width: 10px; height: 10px; flex: none; border-radius: 2px;
  border: 1px solid rgba(0,0,0,0.25);
}
.dz-layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dz-layer-act {
  flex: none; width: 20px; height: 20px; border: 0; border-radius: 3px;
  background: transparent; color: #605e5c; cursor: pointer; line-height: 1;
}
.dz-layer:hover .dz-layer-act { background: #eceaea; }
.dz-layer-act:hover { background: #d7d5d4; color: #1f2937; }
.dz-layer-del:hover { background: #f3d6d6; color: #a4262c; }
.dz-layer-orig { color: #605e5c; font-style: italic; }
.dz-pagewrap {
  position: relative; margin: 24px auto; background: #fff;
  box-shadow: 0 2px 12px rgba(16,24,40,0.25);
}
.dz-bg { position: absolute; inset: 0; }
.dz-svg svg { display: block; width: 100%; height: 100%; }
/* the layer itself must not swallow clicks meant for the artwork (SVG text
   double-click editing) — only the boxes are interactive */
.dz-boxlayer { position: absolute; inset: 0; pointer-events: none; }
.dz-patch { position: absolute; pointer-events: none; border-radius: 1px; }
.dz-hotspots { position: absolute; inset: 0; pointer-events: none; }
.dz-hotspot {
  position: absolute; pointer-events: auto; cursor: pointer; border-radius: 3px;
  outline: 1px dashed rgba(24, 90, 189, 0.55); outline-offset: 1px;
  transition: background 0.1s;
}
.dz-hotspot:hover { background: rgba(24, 90, 189, 0.14); outline-style: solid; }
.dz-rubber {
  position: absolute; z-index: 25; pointer-events: none;
  border: 1.5px dashed #185abd; background: rgba(24, 90, 189, 0.08); border-radius: 2px;
}
.dz-box { position: absolute; min-width: 20px; pointer-events: auto; }
.dz-box .dz-text {
  outline: none; min-width: 30px; min-height: 1em; line-height: 1.35;
  white-space: pre-wrap; cursor: text;
}
.dz-box.selected .dz-text { outline: 1px dashed #185abd; outline-offset: 2px; }
.dz-box .dz-handle {
  position: absolute; top: -14px; inset-inline-start: -4px; width: 26px; height: 12px;
  border-radius: 3px; background: #185abd; opacity: 0; cursor: move;
}
.dz-box:hover .dz-handle, .dz-box.selected .dz-handle { opacity: 0.85; }
.dz-svgedit {
  position: absolute; z-index: 30; border: 1px solid #185abd; border-radius: 3px;
  background: #fff; padding: 2px 4px; resize: both; box-shadow: 0 3px 10px rgba(0,0,0,0.2);
}
#exelmj-design-status {
  padding: 3px 14px; background: #f3f3f3; border-top: 1px solid #e1dfdd;
  font: 12px 'Segoe UI', Tahoma; color: #475467; min-height: 20px;
}
`
}
