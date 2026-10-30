// Illustrator/PDF background rendering for the design mode.
//
// Modern .ai IS a PDF container (since Illustrator 9 the native format embeds
// a complete PDF; Illustrator's private data hides in /AIPrivateData streams
// every renderer ignores). So pdf.js renders .ai directly — each artboard is a
// page. The worker is bundled INLINE (blob worker) because packaged Electron
// loads over file:// where a module worker from a file URL is blocked.
import * as pdfjsLib from 'pdfjs-dist'
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline'
import { normalizeArabicText } from './bidiRuns'

let workerReady = false
function ensureWorker() {
  if (workerReady) return
  workerReady = true
  pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker()
}

export type ArtworkKind = 'pdf' | 'eps-legacy' | 'unknown'

/** The PDF header may sit anywhere in the first 1024 bytes. */
export function sniffArtwork(bytes: Uint8Array): ArtworkKind {
  const head = String.fromCharCode(...bytes.subarray(0, 1024))
  if (head.includes('%PDF-')) return 'pdf'
  if (
    head.startsWith('%!PS-Adobe-') ||
    (bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6)
  ) {
    return 'eps-legacy'
  }
  return 'unknown'
}

export interface ArtworkDoc {
  pages: number
  render(page: number, canvas: HTMLCanvasElement, scale: number): Promise<PageInfo>
  /** the page's own text runs, positioned in pt from the TOP-LEFT. */
  extractText(page: number): Promise<ExtractedText[]>
  /** the same runs before neighbours are merged — colour sampling needs them */
  extractRuns(page: number): Promise<ExtractedText[]>
  /** where the page paints raster images, in pt from the TOP-LEFT. */
  imageRects(page: number): Promise<ImageRect[]>
  /** the lines and boxes the page DRAWS — what makes a table look ruled */
  pageRules(page: number): Promise<PageRule[]>
  /** true when the .ai was saved WITHOUT "Create PDF Compatible File". */
  noPdfContent(): Promise<boolean>
  destroy(): Promise<void>
}

export interface ExtractedText {
  text: string
  dir: 'rtl' | 'ltr'
  /** left edge, pt */
  x: number
  /** top edge, pt (approx: baseline − ascent) */
  y: number
  /** run width, pt */
  width: number
  /** font size, pt */
  size: number
  /** baseline measured from the page TOP, pt (exact placement anchor) */
  baselineTop: number
  /** true fill color — only the Illustrator bridge can supply it */
  color?: string
  /** real font name — only the Illustrator bridge can supply it */
  font?: string
  /** weight/slant from the embedded font's own descriptor */
  bold?: boolean
  italic?: boolean
}

/** A ruling drawn on the page (table border, box outline), pt from the TOP-LEFT. */
export interface PageRule {
  x: number
  y: number
  width: number
  height: number
}

/** A raster image's placement box on the page, pt from the TOP-LEFT. */
export interface ImageRect {
  x: number
  y: number
  width: number
  height: number
}

export interface PageInfo {
  widthPt: number
  heightPt: number
  cssWidth: number
  cssHeight: number
  isA4: boolean
}

const near = (v: number, target: number, eps = 2) => Math.abs(v - target) <= eps

/**
 * The REAL font name (e.g. "Cairo-Bold"). getTextContent() only reports a
 * generic "sans-serif" family, but the loaded font object carries the embedded
 * name — it exists once the page has been rendered, which the design app always
 * does before offering the edit tool. Guarded: an unrendered page simply yields
 * undefined and the caller keeps its defaults.
 */
function pdfFont(page: unknown, id: unknown): { name?: string; bold?: boolean; italic?: boolean } {
  if (typeof id !== 'string' || !id) return {}
  try {
    const objs = (page as { commonObjs?: { has(k: string): boolean; get(k: string): unknown } })
      .commonObjs
    if (!objs?.has(id)) return {}
    const font = objs.get(id) as {
      name?: unknown
      black?: unknown
      bold?: unknown
      italic?: unknown
      fontMatrix?: unknown
    } | null
    if (!font) return {}
    // embedded subsets are prefixed with six caps + '+', e.g. "ABCDEF+Cairo-Bold"
    const name =
      typeof font.name === 'string' && font.name ? font.name.replace(/^[A-Z]{6}\+/, '') : undefined
    // A producer that embeds one family for every weight (Chromium does) leaves
    // nothing in the NAME to read, but pdfjs still carries the descriptor's own
    // bold/italic flags — that is where the weight really lives.
    const flagged = !!font.black || !!font.bold || /bold|black|heavy|semibold/i.test(name ?? '')
    const italic = !!font.italic || /italic|oblique/i.test(name ?? '')
    return { name, bold: flagged, italic }
  } catch {
    return {}
  }
}

/** Same-line neighbours of the same direction (and colour) become one run. */
export function mergeRuns(items: ExtractedText[], sameColour = false): ExtractedText[] {
  items.sort((a, b) => a.baselineTop - b.baselineTop || a.x - b.x)
  const merged: ExtractedText[] = []
  for (const item of items) {
    const prev = merged[merged.length - 1]
    const sameLine = prev && Math.abs(prev.baselineTop - item.baselineTop) < 2
    const gap = prev ? item.x - (prev.x + prev.width) : Infinity
    const joinable =
      prev &&
      sameLine &&
      prev.dir === item.dir &&
      (!sameColour || (prev.color ?? '') === (item.color ?? '')) &&
      (!sameColour || (!!prev.bold === !!item.bold && !!prev.italic === !!item.italic))
    if (joinable && gap > -1 && gap < prev.size * 0.45) {
      // A real word space shows up as a gap the producer never encoded, so
      // the two runs must not be glued together ("یوضحھذا") — anything
      // wider than a hair space is one.
      const spaced =
        gap > prev.size * 0.14 && !/\s$/.test(prev.text) && !/^\s/.test(item.text) ? ' ' : ''
      // visual order: the later-x run comes first logically in RTL
      prev.text =
        prev.dir === 'rtl'
          ? `${item.text}${spaced}${prev.text}`
          : `${prev.text}${spaced}${item.text}`
      prev.width = item.x + item.width - prev.x
      prev.size = Math.max(prev.size, item.size)
      prev.y = Math.min(prev.y, item.y)
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}

export async function openArtwork(bytes: Uint8Array): Promise<ArtworkDoc> {
  ensureWorker()
  const assets = (dir: string) => new URL(`pdfjs/${dir}/`, document.baseURI).href
  const task = pdfjsLib.getDocument({
    // the buffer is transferred to the worker and detached — hand over a copy
    data: bytes.slice(),
    standardFontDataUrl: assets('standard_fonts'),
    wasmUrl: assets('wasm'),
    cMapUrl: assets('cmaps'),
    iccUrl: assets('iccs')
  })
  const doc = await task.promise

  const unmergedRuns = async (pageNum: number): Promise<ExtractedText[]> => {
    const page = await doc.getPage(Math.min(Math.max(1, pageNum), doc.numPages))
    const [, , , y2] = page.view
    const pageH = (y2 - page.view[1]) * page.userUnit
    const tc = await page.getTextContent()
    const items: ExtractedText[] = []
    for (const raw of tc.items) {
      if (!('str' in raw) || !raw.str.trim()) continue
      // transform = [sx, shy, shx, sy, tx, ty] in PDF units, bottom-up origin.
      // Size = magnitude of the y-basis vector, so scaled/rotated text (styled
      // colored headings are often transformed) still measures correctly.
      const [, shy, shx, sy, tx, ty] = raw.transform
      const face = pdfFont(page, raw.fontName)
      const size = Math.hypot(shx, sy) || Math.abs(sy) || 10
      if (size < 1) continue
      // heavily rotated text can't be overlaid meaningfully — skip runs
      // whose baseline deviates more than ~20° from horizontal
      if (Math.abs(shy) > Math.abs(sy) * 0.36) continue
      items.push({
        text: normalizeArabicText(raw.str),
        dir: raw.dir === 'rtl' ? 'rtl' : 'ltr',
        x: tx,
        y: pageH - ty - size * 0.8,
        width: raw.width,
        size,
        baselineTop: pageH - ty,
        font: face.name,
        bold: face.bold,
        italic: face.italic
      })
    }
    page.cleanup()
    return items
  }

  return {
    pages: doc.numPages,

    async render(pageNum, canvas, scale) {
      const page = await doc.getPage(Math.min(Math.max(1, pageNum), doc.numPages))
      const [x1, y1, x2, y2] = page.view
      const widthPt = (x2 - x1) * page.userUnit
      const heightPt = (y2 - y1) * page.userUnit
      const viewport = page.getViewport({ scale })
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      await page.render({
        canvas,
        viewport,
        ...(dpr !== 1 ? { transform: [dpr, 0, 0, dpr, 0, 0] } : {})
      }).promise
      const isA4 =
        (near(widthPt, 595.28) && near(heightPt, 841.89)) ||
        (near(widthPt, 841.89) && near(heightPt, 595.28))
      const info: PageInfo = {
        widthPt,
        heightPt,
        cssWidth: Math.floor(viewport.width),
        cssHeight: Math.floor(viewport.height),
        isA4
      }
      page.cleanup()
      return info
    },

    async extractText(pageNum) {
      return mergeRuns(await unmergedRuns(pageNum))
    },

    /**
     * The same runs, UNMERGED. The word importer samples each run's ink colour
     * off the rendered page first and only then merges neighbours — merging
     * before that glues a red phrase to the black words beside it and the
     * colour is lost.
     */
    async extractRuns(pageNum) {
      return unmergedRuns(pageNum)
    },


    // Where does the page paint bitmaps? The operator list is replayed with a
    // CTM stack (exactly what the canvas backend does) and every image op maps
    // the unit square through the current matrix. Rects, not pixels: the caller
    // crops them out of the rendered page, which keeps masks, CMYK JPEGs and
    // clipping correct without decoding a single image object by hand.
    async imageRects(pageNum) {
      const page = await doc.getPage(Math.min(Math.max(1, pageNum), doc.numPages))
      const [x1, y1, , y2] = page.view
      const pageH = (y2 - y1) * page.userUnit
      const out: ImageRect[] = []
      try {
        const ops = await page.getOperatorList()
        const OPS = pdfjsLib.OPS
        const PAINTS = new Set<number>(
          [OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat].filter(
            (op) => typeof op === 'number'
          )
        )
        let ctm: number[] = [1, 0, 0, 1, 0, 0]
        const stack: number[][] = []
        // canvas semantics: a transform op post-multiplies the current matrix
        const mul = (a: number[], b: number[]) => [
          a[0] * b[0] + a[2] * b[1],
          a[1] * b[0] + a[3] * b[1],
          a[0] * b[2] + a[2] * b[3],
          a[1] * b[2] + a[3] * b[3],
          a[0] * b[4] + a[2] * b[5] + a[4],
          a[1] * b[4] + a[3] * b[5] + a[5]
        ]
        for (let i = 0; i < ops.fnArray.length; i++) {
          const fn = ops.fnArray[i]
          if (fn === OPS.save) stack.push(ctm.slice())
          else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
          else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i] as number[])
          else if (PAINTS.has(fn)) {
            const [a, b, c, d, e, f] = ctm
            // the unit square's four corners under the current matrix
            const xs = [e, a + e, c + e, a + c + e]
            const ys = [f, b + f, d + f, b + d + f]
            const left = Math.min(...xs)
            const right = Math.max(...xs)
            const bottom = Math.min(...ys)
            const top = Math.max(...ys)
            const width = right - left
            const height = top - bottom
            // skip hairlines and full-page background washes
            if (width < 6 || height < 6) continue
            out.push({
              x: left - x1,
              y: pageH - (top - y1),
              width,
              height
            })
          }
        }
      } catch (err) {
        console.warn('[artwork] image scan failed', err)
      }
      page.cleanup()
      return out
    },

    // Every stroked/filled path's bounding box. A statement's table borders and
    // its info boxes arrive as hundreds of hairline rectangles; keeping them
    // lets the importer draw a border only where the FILE draws one instead of
    // inventing a grid around anything that happens to line up.
    async pageRules(pageNum) {
      const page = await doc.getPage(Math.min(Math.max(1, pageNum), doc.numPages))
      const [x1, y1, , y2] = page.view
      const pageH = (y2 - y1) * page.userUnit
      const out: PageRule[] = []
      try {
        const ops = await page.getOperatorList()
        const OPS = pdfjsLib.OPS
        let ctm: number[] = [1, 0, 0, 1, 0, 0]
        const stack: number[][] = []
        const mul = (a: number[], b: number[]) => [
          a[0] * b[0] + a[2] * b[1],
          a[1] * b[0] + a[3] * b[1],
          a[0] * b[2] + a[2] * b[3],
          a[1] * b[2] + a[3] * b[3],
          a[0] * b[4] + a[2] * b[5] + a[4],
          a[1] * b[4] + a[3] * b[5] + a[5]
        ]
        for (let i = 0; i < ops.fnArray.length; i++) {
          const fn = ops.fnArray[i]
          if (fn === OPS.save) stack.push(ctm.slice())
          else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
          else if (fn === OPS.transform) ctm = mul(ctm, ops.argsArray[i] as number[])
          else if (fn === OPS.constructPath) {
            // pdfjs already reports a path's bounding box in USER space — the
            // CTM is baked in. Transforming it again (as the image rects do,
            // since those map the unit square) shifts every rule and a ruled
            // table comes out borderless while a plain block sprouts a grid.
            const box = (ops.argsArray[i] as unknown[])[2] as ArrayLike<number> | undefined
            if (!box || box.length < 4) continue
            const [ax, ay] = [box[0], box[1]]
            const [bx, by] = [box[2], box[3]]
            const left = Math.min(ax, bx) - x1
            const right = Math.max(ax, bx) - x1
            const top = pageH - (Math.max(ay, by) - y1)
            const bottom = pageH - (Math.min(ay, by) - y1)
            const width = right - left
            const height = bottom - top
            // a rule is a long thin thing; ignore glyph-sized specks
            if ((width < 4 && height < 4) || (width > 3 && height > 3)) continue
            out.push({ x: left, y: top, width, height })
          }
        }
      } catch (err) {
        console.warn('[artwork] rule scan failed', err)
      }
      page.cleanup()
      return out
    },

    async noPdfContent() {
      try {
        const page = await doc.getPage(1)
        const tc = await page.getTextContent()
        const txt = tc.items.map((i) => ('str' in i ? i.str : '')).join(' ')
        page.cleanup()
        return /saved without PDF Content/i.test(txt)
      } catch {
        return false
      }
    },

    async destroy() {
      await task.destroy()
    }
  }
}
