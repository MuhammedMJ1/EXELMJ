// PDF → editable document.
//
// Word can open a PDF and hand back something you can retype; this is the same
// idea for the Documents page. A PDF has no paragraphs — only glyph runs at
// coordinates — so the structure is REBUILT (see ./pdfLayout), and everything
// that makes the page LOOK like itself is carried across with it:
//
//  * every run keeps its point size and font family,
//  * its ink colour is sampled from the rendered page (a PDF's text operators
//    do not carry a colour the text layer can read),
//  * pictures are cropped out of that same render at the boxes the operator
//    list paints them in, so masks, CMYK JPEGs and clipping all come out right
//    without decoding a single image object by hand,
//  * the paper size, orientation and margins are taken from the file, so the
//    rebuilt document breaks lines where the original did.
//
// The run extraction itself is the design mode's (src/design/aiBackground.ts):
// it already merges split Arabic runs, normalises presentation forms and
// reports pt coordinates from the page top.
import { mergeRuns, openArtwork, type ExtractedText, type ImageRect } from '../design/aiBackground'
import {
  bodySize,
  groupLines,
  linePitch,
  pageDirection,
  pageMargins,
  pageToHtml,
  textLeading,
  type PdfImage,
  type PdfRun
} from './pdfLayout'
import type { Margins, Orientation, PaperSize } from './pageSetup'

export interface PdfImportResult {
  html: string
  pages: number
  warnings: string[]
  setup: {
    size: PaperSize
    orientation: Orientation
    margin: Margins
    baseFontPt: number
    baseLineHeight: number
  }
  /** the direction the FILE reads in, which the document adopts */
  direction: 'rtl' | 'ltr'
}

const RENDER_SCALE = 2

/** Full document: every page, separated by a real page break. */
export async function pdfToHtml(bytes: Uint8Array): Promise<PdfImportResult> {
  const doc = await openArtwork(bytes)
  const warnings: string[] = []
  const parts: string[] = []
  let direction: 'rtl' | 'ltr' = 'ltr'
  let setup = {
    size: 'A4' as PaperSize,
    orientation: 'portrait' as Orientation,
    margin: null as Margins | null,
    baseFontPt: 11,
    baseLineHeight: 1.6
  }

  try {
    for (let page = 1; page <= doc.pages; page++) {
      // RAW runs: the ink colour is sampled per run and only then are
      // neighbours merged, so a red phrase never gets glued to the black words
      // beside it (and lose its colour to them).
      const canvas = document.createElement('canvas')
      // RENDER FIRST: pdfjs only resolves a page's font objects once its
      // operator list has run, and those objects carry the family name and the
      // bold/italic flags the runs are described with.
      const info = await doc.render(page, canvas, RENDER_SCALE).catch(() => null)
      const raw = (await doc.extractRuns(page).catch(() => [] as ExtractedText[])) as PdfRun[]
      const box = { widthPt: info?.widthPt ?? 595.28, heightPt: info?.heightPt ?? 841.89 }
      const ctx = info ? canvas.getContext('2d', { willReadFrequently: true }) : null
      const perPt = info && info.widthPt ? canvas.width / info.widthPt : 0

      if (ctx && perPt) paintInk(ctx, raw, perPt)
      const runs = mergeRuns(raw as ExtractedText[], true) as PdfRun[]
      const images = ctx && perPt ? await cropImages(doc, page, ctx, canvas, perPt, box) : []
      // what the page DRAWS: borders are copied from the file, never invented
      const rules = await doc.pageRules(page).catch(() => [])
      if (!images.length && (await hasImages(doc, page))) warnings.push('pdfImagesSkipped')

      const html = pageToHtml(runs, { images, page: box, rules })
      if (!html) {
        warnings.push('pdfEmptyPage')
        continue
      }
      if (page === 1) {
        // The FILE decides the body size and its leading; without this the
        // editor re-typesets a 6pt statement at its own 11pt default and the
        // page stops looking like the original at a glance.
        const lines = groupLines(runs)
        const base = bodySize(lines)
        const pitch = textLeading(lines) || linePitch(lines)
        direction = pageDirection(runs)
        setup = {
          ...paperFor(box),
          margin: pageMargins(runs, images, box),
          baseFontPt: Math.min(72, Math.max(4, Math.round(base * 2) / 2)),
          baseLineHeight:
            pitch && base ? Math.min(2, Math.max(1, Math.round((pitch / base) * 100) / 100)) : 1.6
        }
      }
      if (parts.length) parts.push('<div data-page-break="true"></div>')
      parts.push(html)
    }
  } finally {
    await doc.destroy().catch(() => undefined)
  }

  return {
    html: parts.join('') || '<p></p>',
    pages: doc.pages,
    warnings: [...new Set(warnings)],
    direction,
    setup: {
      size: setup.size,
      orientation: setup.orientation,
      margin: setup.margin ?? { top: 25, bottom: 25, left: 24, right: 24 },
      baseFontPt: setup.baseFontPt,
      baseLineHeight: setup.baseLineHeight
    }
  }
}

/** Closest paper the page setup can express, plus its orientation. */
export function paperFor(box: { widthPt: number; heightPt: number }): {
  size: PaperSize
  orientation: Orientation
} {
  const landscape = box.widthPt > box.heightPt
  const shortSide = Math.min(box.widthPt, box.heightPt)
  // A4 is 595pt wide, US Letter 612pt — the short side tells them apart
  const size: PaperSize = Math.abs(shortSide - 612) < Math.abs(shortSide - 595.28) ? 'Letter' : 'A4'
  return { size, orientation: landscape ? 'landscape' : 'portrait' }
}

/**
 * The text layer carries no colour, so each run's ink is read off the render:
 * the darkest pixel inside the run's box is its letter colour. Sampling on a
 * grid keeps a full page of runs well under a frame.
 */
function paintInk(ctx: CanvasRenderingContext2D, runs: PdfRun[], perPt: number) {
  for (const run of runs) {
    const x = Math.max(0, Math.floor(run.x * perPt))
    const y = Math.max(0, Math.floor((run.baselineTop - run.size * 0.85) * perPt))
    const w = Math.max(1, Math.floor(run.width * perPt))
    const h = Math.max(1, Math.floor(run.size * perPt))
    let data: Uint8ClampedArray
    try {
      data = ctx.getImageData(x, y, Math.min(w, 600), Math.min(h, 120)).data
    } catch {
      continue
    }
    let best = -1
    let bestLum = 255
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (lum < bestLum) {
        bestLum = lum
        best = i
      }
    }
    // a pale "darkest pixel" means the box holds no ink at all
    if (best < 0 || bestLum > 160) continue
    const [r, g, b] = [data[best], data[best + 1], data[best + 2]]
    // Anti-aliasing makes plain black text sample as #11110a and friends. A
    // near-neutral dark pixel IS black — carrying the noise across would put a
    // pointless colour span on every ordinary paragraph.
    if (r < 70 && g < 70 && b < 70 && Math.max(r, g, b) - Math.min(r, g, b) < 26) continue
    run.color = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }
}

async function hasImages(doc: { imageRects(page: number): Promise<ImageRect[]> }, page: number) {
  return (await doc.imageRects(page).catch(() => [] as ImageRect[])).length > 0
}

/** Every painted image box, cut out of the page render as a PNG. */
async function cropImages(
  doc: { imageRects(page: number): Promise<ImageRect[]> },
  page: number,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  perPt: number,
  box: { widthPt: number; heightPt: number }
): Promise<PdfImage[]> {
  const rects = await doc.imageRects(page).catch(() => [] as ImageRect[])
  const pageArea = box.widthPt * box.heightPt
  const out: PdfImage[] = []
  for (const rect of rects) {
    // a wash covering the whole sheet is a background, not a picture
    if (rect.width * rect.height > pageArea * 0.85) continue
    // the same logo painted twice (or a tiled fill) only needs one copy
    if (out.some((other) => Math.abs(other.x - rect.x) < 2 && Math.abs(other.y - rect.y) < 2)) continue
    const sx = Math.max(0, Math.round(rect.x * perPt))
    const sy = Math.max(0, Math.round(rect.y * perPt))
    const sw = Math.min(canvas.width - sx, Math.round(rect.width * perPt))
    const sh = Math.min(canvas.height - sy, Math.round(rect.height * perPt))
    if (sw < 8 || sh < 8) continue
    let slice: ImageData
    try {
      slice = ctx.getImageData(sx, sy, sw, sh)
    } catch {
      continue
    }
    if (isBlank(slice)) continue
    const cut = document.createElement('canvas')
    cut.width = sw
    cut.height = sh
    const cutCtx = cut.getContext('2d')
    if (!cutCtx) continue
    cutCtx.putImageData(slice, 0, 0)
    out.push({
      dataUrl: cut.toDataURL('image/png'),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height
    })
  }
  return out
}

/** A crop with a single colour in it carries no picture. */
function isBlank(image: ImageData): boolean {
  const data = image.data
  const step = Math.max(4, Math.floor(data.length / 4 / 400) * 4)
  let min = 255
  let max = 0
  for (let i = 0; i < data.length; i += step) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (lum < min) min = lum
    if (lum > max) max = lum
  }
  return max - min < 8
}
