// The design overlay model: the text boxes the user lays over an AI/PDF/SVG
// background. Coordinates are PDF POINTS measured from the page's TOP-LEFT
// (screen-like; converted to PDF bottom-up space only at export), so boxes are
// zoom-independent and survive re-opens.
//
// Persistence: a sidecar JSON next to the original file (<file>.exelmj.json),
// schema v2: boxes PER PAGE (artboard) — v1 held a single page and artboard
// navigation silently destroyed the other artboards' texts (review finding).
// The original artwork is NEVER modified.

import { cleanShape, stripDefaultV4, type PageShapes, type Shape } from './shapes'
import { cleanImage, stripDefaultImageV4, type PageImages, type PlacedImage } from './images'
import { cleanStudioDoc, isEmptyStudioDoc, type StudioDoc } from '../studio/model'

export interface TextBox {
  id: string
  /** pt from the page's left edge (right edge when align=right, center when center) */
  x: number
  /** pt from the page's top edge (box's top edge) */
  y: number
  /** wrap width in pt; 0 = auto (single line) */
  width: number
  text: string
  font: string
  sizePt: number
  color: string
  bold: boolean
  align: 'right' | 'center' | 'left'
  /**
   * "Edit original text" patch: a rectangle (absolute pt, top-left origin)
   * covering the artwork's own run so the retyped text visually REPLACES it.
   * Filled with the rebuilt background (img) when the area is not uniform,
   * otherwise with the flat sampled color (bg).
   */
  cover?: {
    x: number
    y: number
    w: number
    h: number
    /** flat fill — exact on a solid background, fallback everywhere else */
    bg: string
    /** PNG data URL rebuilding a gradient background (see inpaint.ts) */
    img?: string
  }
}

export type PageBoxes = Record<string, TextBox[]>

export interface DesignProject {
  /**
   * 3 until the document actually uses a v4 feature. A file that never rotates
   * a shape, never fades one and never opens Studio therefore keeps writing
   * `"version": 3` byte-for-byte — which is what lets v0.3.0 and this build
   * share a folder without either one silently rewriting the other's files.
   */
  version: 3 | 4
  /** basename of the artwork this sidecar belongs to (sanity check) */
  source: string
  pages: PageBoxes
  /** v3: vector shapes per page. v1/v2 sidecars parse to an empty map. */
  shapes: PageShapes
  /** v3: placed images/logos per page (pixels inlined as data URLs). */
  images: PageImages
  /** v4: the design-system side-table (frames, tokens, components, icons). */
  studio?: StudioDoc
}

/**
 * Does anything here need v4 to be read back correctly? Rotation, opacity,
 * corner radii, shadow, dash and the Studio block — everything else in the
 * document is v3 vocabulary.
 *
 * Getting this list wrong is DATA LOSS, not a cosmetic mistake: a document
 * saved as version 3 while carrying a v4 field is opened by v0.3.0, whose
 * cleaner does not know the field and silently drops it.
 */
export function usesV4Features(
  shapes: PageShapes,
  images: PageImages,
  studio?: StudioDoc
): boolean {
  if (!isEmptyStudioDoc(studio)) return true
  for (const list of Object.values(shapes)) {
    for (const s of list) {
      if (s.rotation || s.opacity !== undefined || s.radius || s.shadow || s.dash) return true
    }
  }
  for (const list of Object.values(images)) {
    for (const i of list) {
      if (i.rotation || i.opacity !== undefined) return true
    }
  }
  return false
}

export function sidecarPathFor(artworkPath: string): string {
  return `${artworkPath}.exelmj.json`
}

export function newBox(id: string, x: number, y: number, rtlDefault: boolean): TextBox {
  return {
    id,
    x,
    y,
    width: 0,
    text: '',
    font: 'Arial',
    sizePt: 14,
    color: '#111111',
    bold: false,
    align: rtlDefault ? 'right' : 'left'
  }
}

export function serializeProject(
  source: string,
  pages: PageBoxes,
  shapes: PageShapes = {},
  images: PageImages = {},
  studio?: StudioDoc
): string {
  const cleanPages: PageBoxes = {}
  for (const [page, boxes] of Object.entries(pages)) {
    const clean = boxes
      .filter((b) => b.text.trim().length || b.cover)
      .map((b) => ({
        ...b,
        x: round2(b.x),
        y: round2(b.y),
        width: round2(b.width),
        sizePt: round2(b.sizePt)
      }))
    if (clean.length) cleanPages[page] = clean
  }
  const cleanShapes: PageShapes = {}
  for (const [page, list] of Object.entries(shapes)) {
    const clean = list.map((s) => ({
      ...stripDefaultV4(s),
      x: round2(s.x),
      y: round2(s.y),
      w: round2(s.w),
      h: round2(s.h)
    }))
    if (clean.length) cleanShapes[page] = clean
  }
  const cleanImages: PageImages = {}
  for (const [page, list] of Object.entries(images)) {
    const clean = list.map((i) => ({
      ...stripDefaultImageV4(i),
      x: round2(i.x),
      y: round2(i.y),
      w: round2(i.w),
      h: round2(i.h)
    }))
    if (clean.length) cleanImages[page] = clean
  }
  // The version is DERIVED, never assumed: a document that used no v4 feature
  // writes `3` and stays readable by v0.3.0. Deriving it from the cleaned
  // arrays (not the incoming ones) means a rotation that failed validation
  // cannot silently push the file to v4 either.
  const v4 = usesV4Features(cleanShapes, cleanImages, studio)
  const project: DesignProject = {
    version: v4 ? 4 : 3,
    source,
    pages: cleanPages,
    shapes: cleanShapes,
    images: cleanImages,
    ...(v4 && !isEmptyStudioDoc(studio) ? { studio } : {})
  }
  return JSON.stringify(project, null, 2)
}

export function parseProject(json: string): DesignProject | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    let pagesRaw: Record<string, unknown[]>
    if (
      (raw?.version === 2 || raw?.version === 3 || raw?.version === 4) &&
      raw.pages &&
      typeof raw.pages === 'object'
    ) {
      pagesRaw = raw.pages as Record<string, unknown[]>
    } else if (raw?.version === 1 && Array.isArray(raw.boxes)) {
      // v1 migration: one page's boxes under its page number
      pagesRaw = { [String(Math.max(1, num(raw.page, 1)))]: raw.boxes as unknown[] }
    } else {
      return null
    }
    // v3 added shapes; v1/v2 sidecars simply have none
    const hasV3Payload = raw?.version === 3 || raw?.version === 4
    const shapes: PageShapes = {}
    const shapesRaw = hasV3Payload && raw.shapes && typeof raw.shapes === 'object'
      ? (raw.shapes as Record<string, unknown>)
      : {}
    for (const [page, list] of Object.entries(shapesRaw)) {
      if (!Array.isArray(list)) continue
      const clean = list.map((s, i) => cleanShape(s, i)).filter((s): s is Shape => !!s)
      if (clean.length) shapes[page] = clean
    }
    const images: PageImages = {}
    const imagesRaw = hasV3Payload && raw.images && typeof raw.images === 'object'
      ? (raw.images as Record<string, unknown>)
      : {}
    for (const [page, list] of Object.entries(imagesRaw)) {
      if (!Array.isArray(list)) continue
      const clean = list.map((im, i) => cleanImage(im, i)).filter((im): im is PlacedImage => !!im)
      if (clean.length) images[page] = clean
    }
    const pages: PageBoxes = {}
    for (const [page, list] of Object.entries(pagesRaw)) {
      if (!Array.isArray(list)) continue
      const boxes: TextBox[] = []
      for (const entry of list) {
        const b = entry as Record<string, unknown>
        if (typeof b?.text !== 'string') continue
        boxes.push({
          id: String(b.id ?? `box-${boxes.length + 1}`),
          x: num(b.x, 40),
          y: num(b.y, 40),
          width: Math.max(0, num(b.width, 0)),
          text: b.text,
          font: typeof b.font === 'string' && b.font ? b.font : 'Arial',
          sizePt: Math.min(200, Math.max(6, num(b.sizePt, 14))),
          color: /^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? String(b.color) : '#111111',
          bold: !!b.bold,
          align: b.align === 'center' || b.align === 'left' ? b.align : 'right',
          ...(isCover(b.cover) ? { cover: cleanCover(b.cover as Record<string, unknown>) } : {})
        })
      }
      if (boxes.length) pages[page] = boxes
    }
    const studio = raw?.version === 4 ? cleanStudioDoc(raw.studio) : undefined
    return {
      version: usesV4Features(shapes, images, studio) ? 4 : 3,
      source: String(raw.source ?? ''),
      pages,
      shapes,
      images,
      ...(studio ? { studio } : {})
    }
  } catch {
    return null
  }
}

/** Highest numeric suffix among box ids — the next id seed (review finding:
 * `boxes.length` produced duplicate ids after deletions). */
export function maxBoxId(pages: PageBoxes): number {
  let max = 0
  for (const boxes of Object.values(pages)) {
    for (const b of boxes) {
      const m = /(\d+)$/.exec(b.id)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return max
}

/** Does a cover patch sit over this point (pt, page top-left origin)? Used both
 * to stop a replaced run being seeded twice and to drop its text from the Word
 * export. */
export function coverContains(cover: NonNullable<TextBox['cover']>, x: number, y: number): boolean {
  return x >= cover.x && x <= cover.x + cover.w && y >= cover.y && y <= cover.y + cover.h
}

/** The box already standing in for this run, if the user replaced it before. */
export function boxCoveringRun(
  boxes: TextBox[],
  run: { x: number; y: number; width: number; size: number }
): TextBox | undefined {
  const cx = run.x + run.width / 2
  const cy = run.y + run.size / 2
  return boxes.find((b) => b.cover && coverContains(b.cover, cx, cy))
}

function isCover(v: unknown): boolean {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return Number.isFinite(Number(c.w)) && Number(c.w) > 0 && Number.isFinite(Number(c.h)) && Number(c.h) > 0
}

function cleanCover(c: Record<string, unknown>): NonNullable<TextBox['cover']> {
  const img =
    typeof c.img === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(c.img) ? c.img : undefined
  return {
    x: num(c.x, 0),
    y: num(c.y, 0),
    w: Math.max(1, num(c.w, 1)),
    h: Math.max(1, num(c.h, 1)),
    bg: /^#[0-9a-fA-F]{6}$/.test(String(c.bg)) ? String(c.bg) : '#ffffff',
    ...(img ? { img } : {})
  }
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
