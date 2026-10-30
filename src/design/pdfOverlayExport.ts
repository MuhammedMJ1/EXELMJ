// Export the design composition: the ORIGINAL vector artwork (when it is a
// PDF/.ai) — or a rasterized SVG background — with the user's Arabic text
// boxes drawn on top as real PDF text.
//
// Arabic correctness proven on this machine at content-stream level:
// pdf-lib+fontkit shape Arabic (GSUB init/medi/fina) and reverse pure-RTL
// lines by themselves — text must be passed in LOGICAL order, with ONLY the
// embedded LTR runs pre-reversed (bidiRuns.toPdfVisual).
import { PDFDocument, PDFDict, PDFName, PDFOperator, cmyk, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { toPdfVisual } from './bidiRuns'
import type { TextBox } from './overlayModel'
import { arrowHead, shapeBBox, type Shape } from './shapes'
import type { PlacedImage } from './images'

const LINE_HEIGHT = 1.35
// The on-screen boxes use CSS line-height 1.35: the browser puts the first
// baseline at half-leading + ascent ≈ 1.02em below the box top (Arial metrics).
// 0.8 sat visibly higher than the screen (review finding).
const BASELINE_FACTOR = 1.02

export interface OverlayExportInput {
  /** the original artwork bytes when it is PDF-compatible; null → blank page */
  artwork: Uint8Array | null
  /** full-page raster background (SVG designs) drawn before the boxes */
  backgroundPng?: Uint8Array | null
  pageIndex: number
  /** used when artwork is null */
  pageSizePt: { width: number; height: number }
  boxes: TextBox[]
  /** drawn shapes — exported as REAL vectors, not raster */
  shapes?: Shape[]
  /** placed images/logos; any crop must already be baked into the pixels */
  images?: PlacedImage[]
  /** resolves a font family+weight to TTF bytes; null → fall back to Arial */
  getFont(family: string, bold: boolean): Promise<Uint8Array | null>
}

export async function exportOverlayPdf(input: OverlayExportInput): Promise<Uint8Array> {
  const doc = input.artwork
    ? await PDFDocument.load(input.artwork.slice(), { ignoreEncryption: true })
    : await PDFDocument.create()
  doc.registerFontkit(fontkit)

  const page = input.artwork
    ? doc.getPage(Math.min(Math.max(0, input.pageIndex), doc.getPageCount() - 1))
    : doc.addPage([input.pageSizePt.width, input.pageSizePt.height])
  const pageHeight = page.getHeight()
  const pageWidth = page.getWidth()

  if (input.backgroundPng?.length) {
    const png = await doc.embedPng(input.backgroundPng.slice())
    page.drawImage(png, { x: 0, y: 0, width: pageWidth, height: pageHeight })
  }

  // one embedded font per (family, bold) actually used — Arial as safety net
  const fontCache = new Map<string, PDFFont>()
  const embed = async (family: string, bold: boolean): Promise<PDFFont> => {
    const key = `${family}|${bold}`
    const hit = fontCache.get(key)
    if (hit) return hit
    let bytes = await input.getFont(family, bold)
    if (!bytes && bold) bytes = await input.getFont(family, false)
    if (!bytes && family !== 'Arial') bytes = await input.getFont('Arial', bold)
    if (!bytes) throw new Error('no exportable font')
    const font = await doc.embedFont(bytes.slice(), { subset: true })
    fontCache.set(key, font)
    return font
  }

  // patches first — the background rebuilt over the artwork's original runs
  // (the "edit file text" tool), then every box's text above
  for (const box of input.boxes) {
    if (!box.cover) continue
    const rect = {
      x: box.cover.x,
      y: pageHeight - box.cover.y - box.cover.h,
      width: box.cover.w,
      height: box.cover.h
    }
    if (box.cover.img) {
      try {
        const png = await doc.embedPng(box.cover.img)
        page.drawImage(png, rect)
        continue
      } catch {
        // undecodable patch — fall back to the flat fill
      }
    }
    page.drawRectangle({ ...rect, color: hexToRgb(box.cover.bg) })
  }

  // images sit under the shapes, exactly as on screen
  for (const img of input.images ?? []) {
    try {
      const embedded = /^data:image\/png/.test(img.src)
        ? await doc.embedPng(img.src)
        : await doc.embedJpg(img.src)
      page.drawImage(embedded, {
        x: img.x,
        y: pageHeight - img.y - img.h,
        width: img.w,
        height: img.h
      })
    } catch {
      // an undecodable picture must not take the whole export down
    }
  }

  // shapes ride between the patches and the text, matching the on-screen order.
  // pdf-lib's origin is bottom-left, so every y flips through pageHeight.
  for (const sh of input.shapes ?? []) {
    const b = shapeBBox(sh)
    if (sh.kind === 'path') {
      // traced artwork: the data is LOCAL pt with y DOWN, and drawSvgPath emits
      // the numbers unchanged (see the arrow head below), so the shape's own
      // origin is folded in by anchoring at the page top and shifting by x/y.
      if (sh.d) {
        if (sh.gradient) {
          // A gradient cannot be a fill colour in PDF — it is a SHADING painted
          // through the path used as a clip. Falls back to the flat colour if
          // anything about the shading fails, so an export never dies here.
          const ok = drawGradientPath(doc, page, sh, pageHeight)
          if (ok) continue
        }
        if (!sh.fill && sh.stroke) {
          // centreline artwork: an open run painted with a pen, not filled
          page.drawSvgPath(sh.d, {
            x: sh.x,
            y: pageHeight - sh.y,
            scale: 1,
            borderColor: hexToRgb(sh.stroke),
            borderWidth: sh.strokeWidth,
            borderLineCap: 1
          })
        } else {
          page.drawSvgPath(sh.d, {
            x: sh.x,
            y: pageHeight - sh.y,
            scale: 1,
            color: hexToRgb(sh.fill || '#000000'),
            borderWidth: 0
          })
        }
      }
      continue
    }
    const stroke = sh.stroke ? { borderColor: hexToRgb(sh.stroke), borderWidth: sh.strokeWidth } : {}
    if (sh.kind === 'rect') {
      page.drawRectangle({
        x: b.x,
        y: pageHeight - b.y - b.h,
        width: b.w,
        height: b.h,
        ...(sh.fill ? { color: hexToRgb(sh.fill) } : {}),
        ...stroke
      })
    } else if (sh.kind === 'ellipse') {
      page.drawEllipse({
        x: b.x + b.w / 2,
        y: pageHeight - (b.y + b.h / 2),
        xScale: b.w / 2,
        yScale: b.h / 2,
        ...(sh.fill ? { color: hexToRgb(sh.fill) } : {}),
        ...stroke
      })
    } else {
      page.drawLine({
        start: { x: sh.x, y: pageHeight - sh.y },
        end: { x: sh.x + sh.w, y: pageHeight - (sh.y + sh.h) },
        thickness: sh.strokeWidth,
        color: hexToRgb(sh.stroke || '#000000')
      })
      if (sh.kind === 'arrow') {
        const { tip, barbs } = arrowHead(sh)
        // pdf-lib has no filled-polygon primitive, so the head is an SVG path.
        // With these options drawSvgPath emits the numbers UNCHANGED (verified
        // against the produced content stream), so flip y here ourselves.
        const fy = (y: number) => pageHeight - y
        const d =
          `M ${barbs[0][0]} ${fy(barbs[0][1])} L ${tip[0]} ${fy(tip[1])} ` +
          `L ${barbs[1][0]} ${fy(barbs[1][1])} Z`
        page.drawSvgPath(d, {
          color: hexToRgb(sh.stroke || '#000000'),
          borderWidth: 0,
          x: 0,
          y: pageHeight,
          scale: 1
        })
      }
    }
  }

  for (const box of input.boxes) {
    if (!box.text.trim()) continue
    const font = await embed(box.font, box.bold)
    const size = box.sizePt
    const color = hexToRgb(box.color)
    const lines = box.text.replace(/\r/g, '').split('\n')
    const boxWidth = box.width > 0 ? box.width : 0
    let lineTop = box.y
    for (const logical of lines) {
      const visual = toPdfVisual(logical)
      const textWidth = font.widthOfTextAtSize(visual, size)
      // box.x/y are from the page's top-left; PDF draws from bottom-left with
      // y at the BASELINE.
      const baselineY = pageHeight - lineTop - size * BASELINE_FACTOR
      let drawX = box.x
      if (boxWidth > 0) {
        if (box.align === 'right') drawX = box.x + boxWidth - textWidth
        else if (box.align === 'center') drawX = box.x + (boxWidth - textWidth) / 2
      } else if (box.align === 'right') {
        drawX = box.x - textWidth
      } else if (box.align === 'center') {
        drawX = box.x - textWidth / 2
      }
      drawX = Math.max(0, Math.min(drawX, pageWidth - 1))
      page.drawText(visual, { x: drawX, y: baselineY, size, font, color })
      lineTop += size * LINE_HEIGHT
    }
  }

  return doc.save({ useObjectStreams: false })
}

/**
 * Paint a traced path with a linear gradient.
 *
 * PDF has no "gradient fill": you clip to the shape and paint an axial shading
 * (ShadingType 2) across it. The content stream is
 *   q  1 0 0 -1 x y cm   <path>  W n   /Sh sh   Q
 * — the `cm` puts us in the shape's own LOCAL, y-DOWN space, so the path data
 * and the gradient coordinates go in exactly as stored, with no conversion.
 *
 * Returns false (and draws nothing) when anything is missing, so the caller can
 * fall back to a flat fill rather than lose the shape.
 */
function drawGradientPath(
  doc: PDFDocument,
  page: PDFPage,
  sh: Shape,
  pageHeight: number
): boolean {
  const g = sh.gradient
  if (!g || !sh.d) return false
  try {
    // A shading dictionary names its own colour space and carries raw
    // components, so it cannot reuse the pdf-lib colour object — it follows
    // the document's mode separately. A CMYK document with an RGB gradient in
    // it is a file the print shop has to convert by hand.
    const c0 = hexToComponents(g.from)
    const c1 = hexToComponents(g.to)
    const shading = doc.context.obj({
      ShadingType: 2,
      ColorSpace: colorMode === 'cmyk' ? 'DeviceCMYK' : 'DeviceRGB',
      Coords: [g.x1, g.y1, g.x2, g.y2],
      Extend: [true, true],
      Function: doc.context.obj({
        FunctionType: 2,
        Domain: [0, 1],
        C0: c0,
        C1: c1,
        N: 1
      })
    })
    const ref = doc.context.register(shading)
    const resources = page.node.Resources()
    if (!resources) return false
    let shadings = resources.lookupMaybe(PDFName.of('Shading'), PDFDict)
    if (!shadings) {
      shadings = doc.context.obj({}) as PDFDict
      resources.set(PDFName.of('Shading'), shadings)
    }
    const key = `ExShx${shadingSeq++}`
    shadings.set(PDFName.of(key), ref)

    const ops = pathToOperators(sh.d)
    if (!ops.length) return false
    page.pushOperators(
      PDFOperator.of('q' as never),
      PDFOperator.of('cm' as never, ['1', '0', '0', '-1', String(sh.x), String(pageHeight - sh.y)] as never),
      ...ops,
      PDFOperator.of('W' as never),
      PDFOperator.of('n' as never),
      PDFOperator.of('sh' as never, [`/${key}`] as never),
      PDFOperator.of('Q' as never)
    )
    return true
  } catch {
    return false
  }
}

/** One counter per module load keeps shading names unique inside a page. */
let shadingSeq = 0

/**
 * Convert our traced path data to PDF path operators. The tracer only ever
 * emits absolute M / L / C / Z (see ringToPath), so this stays a small exact
 * translation rather than a general SVG parser.
 */
function pathToOperators(d: string): PDFOperator[] {
  const tokens = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? []
  const ops: PDFOperator[] = []
  let i = 0
  const num = () => String(Number(tokens[i++]))
  while (i < tokens.length) {
    const cmd = tokens[i++]
    if (cmd === 'M' || cmd === 'm') {
      const x = num()
      const y = num()
      ops.push(PDFOperator.of('m' as never, [x, y] as never))
    } else if (cmd === 'L' || cmd === 'l') {
      const x = num()
      const y = num()
      ops.push(PDFOperator.of('l' as never, [x, y] as never))
    } else if (cmd === 'C' || cmd === 'c') {
      const a = num()
      const b = num()
      const c = num()
      const e = num()
      const f = num()
      const g2 = num()
      ops.push(PDFOperator.of('c' as never, [a, b, c, e, f, g2] as never))
    } else if (cmd === 'Z' || cmd === 'z') {
      ops.push(PDFOperator.of('h' as never))
    } else {
      // a stray number without a command — malformed, refuse the whole path
      return []
    }
  }
  return ops
}

/**
 * The colour mode of the document being written. Set once per export.
 *
 * This is what makes the New-document dialog's CMYK choice mean something
 * rather than being a label: a CMYK document writes ink percentages into the
 * PDF, which is what a print shop expects to receive, while an RGB one writes
 * light values, which is what a screen expects.
 *
 * It is module state because hexToRgb is called from two dozen places and
 * threading a mode through every one of them would be noise — the exporter is
 * single-shot and synchronous, so there is no second document to confuse it
 * with.
 */
let colorMode: 'rgb' | 'cmyk' = 'rgb'

export function setPdfColorMode(mode: 'rgb' | 'cmyk'): void {
  colorMode = mode === 'cmyk' ? 'cmyk' : 'rgb'
}

/** The raw components a shading dictionary wants, in the document's space. */
function hexToComponents(hex: string): number[] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  const v = m ? parseInt(m[1], 16) : 0x111111
  const r = ((v >> 16) & 0xff) / 255
  const g = ((v >> 8) & 0xff) / 255
  const b = (v & 0xff) / 255
  if (colorMode !== 'cmyk') return [r, g, b]
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return [0, 0, 0, 1]
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k]
}

function hexToRgb(hex: string) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  const v = m ? parseInt(m[1], 16) : 0x111111
  const r = ((v >> 16) & 0xff) / 255
  const g = ((v >> 8) & 0xff) / 255
  const b = (v & 0xff) / 255
  if (colorMode !== 'cmyk') return rgb(r, g, b)
  // A DEVICE conversion, not a colour-managed separation — see docSetup.ts.
  // Pure black would divide by zero here, so it is answered directly.
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return cmyk(0, 0, 0, 1)
  return cmyk((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k)
}
