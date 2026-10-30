import { describe, expect, it } from 'vitest'
import { lineIsRtl, toPdfVisual } from '../src/design/bidiRuns'
import { coonsSurface, medianSmooth, type RGB } from '../src/design/inpaint'
import {
  boxCoveringRun,
  maxBoxId,
  newBox,
  parseProject,
  serializeProject,
  sidecarPathFor
} from '../src/design/overlayModel'
import { exportOverlayPdf } from '../src/design/pdfOverlayExport'
import fs from 'node:fs'

describe('bidi runs for pdf-lib output', () => {
  it('passes pure Arabic through untouched (fontkit shapes + reverses it)', () => {
    expect(toPdfVisual('حسن حامد صالح')).toBe('حسن حامد صالح')
  })

  it('pre-reverses embedded LTR runs so fontkit\'s whole-line flip restores them', () => {
    expect(toPdfVisual('رقم الهاتف 07717835312')).toBe('رقم الهاتف 21353871770')
    expect(toPdfVisual('الرمز AB12')).toBe('الرمز 21BA')
  })

  it('treats Arabic-Indic digits like European ones (review finding)', () => {
    expect(toPdfVisual('السنة ١٤٤٧')).toBe('السنة ٧٤٤١')
    expect(toPdfVisual('الرقم ۰۱۲')).toBe('الرقم ۲۱۰')
  })

  it('keeps inner separators inside the reversed run', () => {
    expect(toPdfVisual('التاريخ 2026/08/13')).toBe('التاريخ 31/80/6202')
  })

  it('leaves pure-LTR lines alone', () => {
    expect(toPdfVisual('Hello 123')).toBe('Hello 123')
    expect(lineIsRtl('Hello')).toBe(false)
    expect(lineIsRtl('سلام')).toBe(true)
  })
})

describe('design overlay model (sidecar v2: boxes per artboard)', () => {
  it('round-trips multi-page boxes', () => {
    const b1 = newBox('box-1', 120.456, 80.123, true)
    b1.text = 'اسم الزائر'
    b1.sizePt = 18
    b1.bold = true
    const b2 = newBox('box-2', 40, 40, true)
    b2.text = 'لوح ثاني'
    const json = serializeProject('poster.ai', { '1': [b1], '2': [b2] })
    const back = parseProject(json)!
    expect(back.version).toBe(3)
    expect(back.pages['1'][0].text).toBe('اسم الزائر')
    expect(back.pages['1'][0].x).toBeCloseTo(120.46)
    expect(back.pages['2'][0].text).toBe('لوح ثاني')
  })

  it('migrates v1 sidecars (single page) without losing the boxes', () => {
    const v1 = JSON.stringify({
      version: 1,
      source: 'x.ai',
      page: 3,
      boxes: [{ id: 'box-9', x: 10, y: 20, width: 0, text: 'قديم', font: 'Arial', sizePt: 14, color: '#111111', bold: false, align: 'right' }]
    })
    const back = parseProject(v1)!
    expect(back.pages['3'][0].text).toBe('قديم')
  })

  it('continues ids after the highest suffix (dup-id review finding)', () => {
    expect(maxBoxId({ '1': [{ ...newBox('box-7', 0, 0, true), text: 'a' }], '2': [{ ...newBox('box-3', 0, 0, true), text: 'b' }] })).toBe(7)
  })

  it('drops empty boxes on save and rejects garbage on load', () => {
    const empty = newBox('box-1', 0, 0, true)
    const json = serializeProject('a.ai', { '1': [empty] })
    expect(Object.keys(parseProject(json)!.pages)).toHaveLength(0)
    expect(parseProject('not json')).toBeNull()
    // v4 is OURS now (rotation / opacity / radius / studio); 5 is still the
    // future and must stay refused rather than half-read.
    expect(parseProject('{"version":4,"pages":{}}')).not.toBeNull()
    expect(parseProject('{"version":5,"pages":{}}')).toBeNull()
    const hostile = JSON.stringify({
      version: 2,
      source: 'x',
      pages: { '1': [{ id: 1, text: 'ok', x: 'NaN', sizePt: 9999, color: 'red;injection', align: 'up' }] }
    })
    const parsed = parseProject(hostile)!
    expect(parsed.pages['1'][0].x).toBe(40)
    expect(parsed.pages['1'][0].sizePt).toBe(200)
    expect(parsed.pages['1'][0].color).toBe('#111111')
    expect(parsed.pages['1'][0].align).toBe('right')
  })

  it('builds the sidecar path next to the artwork', () => {
    expect(sidecarPathFor('D:\\designs\\poster.ai')).toBe('D:\\designs\\poster.ai.exelmj.json')
  })

  it('round-trips the edit-original cover patch and sanitizes hostile ones', () => {
    const box = newBox('box-1', 200, 100, true)
    box.text = 'نص معدل'
    box.cover = { x: 150, y: 96, w: 120, h: 20, bg: '#e8eaf5' }
    const back = parseProject(serializeProject('a.ai', { '1': [box] }))!
    expect(back.pages['1'][0].cover).toEqual({ x: 150, y: 96, w: 120, h: 20, bg: '#e8eaf5' })
    // hostile bg is replaced, zero-size cover dropped
    const hostile = JSON.stringify({
      version: 2,
      source: 'x',
      pages: {
        '1': [
          { id: 'a', text: 'ok', x: 1, y: 1, cover: { x: 0, y: 0, w: 10, h: 10, bg: 'url(evil)' } },
          { id: 'b', text: 'ok2', x: 1, y: 1, cover: { x: 0, y: 0, w: 0, h: 0, bg: '#ffffff' } }
        ]
      }
    })
    const parsed = parseProject(hostile)!
    expect(parsed.pages['1'][0].cover!.bg).toBe('#ffffff')
    expect(parsed.pages['1'][1].cover).toBeUndefined()
  })

  it('keeps a rebuilt-background patch and rejects a non-png one', () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
    const box = newBox('box-1', 200, 100, true)
    box.cover = { x: 10, y: 10, w: 40, h: 12, bg: '#3a5fcd', img: png }
    const back = parseProject(serializeProject('a.ai', { '1': [box] }))!
    expect(back.pages['1'][0].cover!.img).toBe(png)

    const hostile = JSON.stringify({
      version: 2,
      source: 'x',
      pages: {
        '1': [
          {
            id: 'a',
            text: 'ok',
            x: 1,
            y: 1,
            cover: { x: 0, y: 0, w: 10, h: 10, bg: '#ffffff', img: 'javascript:alert(1)' }
          }
        ]
      }
    })
    expect(parseProject(hostile)!.pages['1'][0].cover!.img).toBeUndefined()
  })
})

describe('clicking a run that was already replaced', () => {
  // the run the edit tool seeds from, and the cover it lays over it
  const run = { x: 100, y: 200, width: 120, size: 14 }
  const coverOf = (r: typeof run) => ({
    x: r.x - 2,
    y: r.y - 2,
    w: r.width + 4,
    h: r.size * 1.3 + 4,
    bg: '#ffffff'
  })

  it('finds the box already standing in for it, so no duplicate is created', () => {
    const box = newBox('box-1', 100, 200, true)
    box.text = 'نص بديل'
    box.cover = coverOf(run)
    expect(boxCoveringRun([box], run)?.id).toBe('box-1')
  })

  it('does not match a different run, or a box with no patch', () => {
    const box = newBox('box-1', 100, 200, true)
    box.text = 'نص بديل'
    box.cover = coverOf(run)
    expect(boxCoveringRun([box], { x: 400, y: 600, width: 80, size: 12 })).toBeUndefined()
    const plain = newBox('box-2', 100, 200, true)
    plain.text = 'مربع بلا تغطية'
    expect(boxCoveringRun([plain], run)).toBeUndefined()
  })
})

describe('arabic text extracted from a pdf/.ai', () => {
  it('converts presentation forms back to real Arabic letters', async () => {
    const { normalizeArabicText } = await import('../src/design/bidiRuns')
    // exactly what pdf.js returned for the invoice's «التفصيل والنوع» heading
    const shaped = 'اﻟﺘﻔﺼﻴﻞ واﻟﻨﻮع'
    const out = normalizeArabicText(shaped)
    expect(out).toBe('التفصيل والنوع')
    expect(/[ﭐ-﷿ﹰ-﻿]/.test(out)).toBe(false)
  })

  it('splits the lam-alef ligature into its two letters', async () => {
    const { normalizeArabicText } = await import('../src/design/bidiRuns')
    expect(normalizeArabicText('ﻻ')).toBe('لا')
  })

  it('leaves ordinary Arabic and Latin untouched', async () => {
    const { normalizeArabicText } = await import('../src/design/bidiRuns')
    expect(normalizeArabicText('التفصيل والنوع')).toBe('التفصيل والنوع')
    expect(normalizeArabicText('Total 255 $')).toBe('Total 255 $')
  })
})

describe('pdf overlay export', () => {
  const winFont = (file: string) => {
    const p = `C:\\Windows\\Fonts\\${file}`
    return fs.existsSync(p) ? new Uint8Array(fs.readFileSync(p)) : null
  }
  const getFont = async (family: string, bold: boolean) => {
    const files: Record<string, { r: string; b: string }> = {
      Arial: { r: 'arial.ttf', b: 'arialbd.ttf' },
      Tahoma: { r: 'tahoma.ttf', b: 'tahomabd.ttf' }
    }
    const e = files[family] ?? files.Arial
    return winFont(bold ? e.b : e.r)
  }

  it('draws Arabic boxes with their OWN fonts over a fresh page and an existing pdf', async () => {
    if (!winFont('arial.ttf')) return
    const box = newBox('b1', 60, 60, true)
    box.text = 'تقرير الزيارة\nرقم الهاتف 07717835312'
    box.sizePt = 16
    const boxTahoma = newBox('b2', 60, 140, true)
    boxTahoma.text = 'خط طهوما'
    boxTahoma.font = 'Tahoma'
    boxTahoma.bold = true
    const bytes = await exportOverlayPdf({
      artwork: null,
      pageIndex: 0,
      pageSizePt: { width: 595.28, height: 841.89 },
      boxes: [box, boxTahoma],
      getFont
    })
    expect(bytes.length).toBeGreaterThan(2000)
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-')

    const box2 = newBox('b3', 60, 200, true)
    box2.text = 'طبقة ثانية'
    const layered = await exportOverlayPdf({
      artwork: bytes,
      pageIndex: 0,
      pageSizePt: { width: 595.28, height: 841.89 },
      boxes: [box2],
      getFont
    })
    expect(String.fromCharCode(...layered.subarray(0, 5))).toBe('%PDF-')
  })

  it('embeds a PNG background when provided (svg-design export path)', async () => {
    if (!winFont('arial.ttf')) return
    // tiny 1x1 white png
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0)
    )
    const bytes = await exportOverlayPdf({
      artwork: null,
      backgroundPng: png,
      pageIndex: 0,
      pageSizePt: { width: 300, height: 300 },
      boxes: [],
      getFont
    })
    expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-')
    // the PDF must reference an image XObject
    const text = Buffer.from(bytes).toString('latin1')
    expect(text).toContain('/XObject')
  })
})

describe('ai/pdf → editable Word conversion', () => {
  it('builds a docx with a behind-text background and positioned editable frames', async () => {
    const { buildDesignWord } = await import('../src/design/wordExport')
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0)
    )
    const box = newBox('b1', 300, 500, true)
    box.text = 'صندوق المستخدم'
    const bytes = await buildDesignWord({
      pageWidthPt: 595.28,
      pageHeightPt: 841.89,
      backgroundPng: png,
      runs: [
        { text: 'تصاميم قياس 2.56 - 3.55 متر', dir: 'rtl', x: 200, y: 120, width: 180, size: 14, color: '#22303f' },
        { text: '125', dir: 'ltr', x: 90, y: 120, width: 30, size: 14, color: '#000000' }
      ],
      boxes: [box]
    })
    expect(bytes.length).toBeGreaterThan(1000)
    const JSZipMod = (await import('jszip')).default
    const zip = await JSZipMod.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    // positioned frames + behind-document image + the actual texts
    expect(xml).toContain('w:framePr')
    expect(xml).toContain('behindDoc="1"')
    expect(xml).toContain('تصاميم قياس')
    expect(xml).toContain('صندوق المستخدم')
    expect(xml).toContain('<w:bidi/>')
    // our own docx importer can read the produced file's texts back
    const { importDocx } = await import('../src/word/docxImport')
    const { html } = await importDocx(bytes)
    expect(html).toContain('تصاميم قياس')
    expect(html).toContain('125')
  })

  it('drops a run the user replaced, so the original does not stack on the new text', async () => {
    const { buildDesignWord } = await import('../src/design/wordExport')
    const png = Uint8Array.from(
      atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
      (c) => c.charCodeAt(0)
    )
    // the box the edit-file-text tool seeds when a run is clicked: same spot,
    // new text, and a cover patch over the original
    const replaced = newBox('b1', 60, 148, false)
    replaced.text = 'REPLACED'
    replaced.sizePt = 34
    replaced.cover = { x: 58, y: 146, w: 220, h: 46, bg: '#3a5fcd' }
    const bytes = await buildDesignWord({
      pageWidthPt: 600,
      pageHeightPt: 400,
      backgroundPng: png,
      runs: [
        { text: 'ORIGINAL', dir: 'ltr', x: 60, y: 148, width: 216, size: 34, color: '#ffffff' },
        { text: 'UNTOUCHED', dir: 'ltr', x: 60, y: 260, width: 200, size: 20, color: '#ffffff' }
      ],
      boxes: [replaced]
    })
    const JSZipMod = (await import('jszip')).default
    const xml = await (await JSZipMod.loadAsync(bytes)).file('word/document.xml')!.async('string')
    expect(xml).not.toContain('ORIGINAL')
    expect(xml).toContain('REPLACED')
    // a run with no patch over it is still emitted
    expect(xml).toContain('UNTOUCHED')
  })
})

describe('svg helpers (string level)', () => {
  it('normalizes Illustrator PostScript font names', async () => {
    const { normalizeFontFamily } = await import('../src/design/svgDesign')
    const arial = normalizeFontFamily('ArialMT')
    expect(arial.css).toContain("'ArialMT'")
    expect(arial.css).toContain("'Arial'")
    const cairoBold = normalizeFontFamily('Cairo-Bold')
    expect(cairoBold.weight).toBe('700')
    expect(cairoBold.css).toContain("'Cairo'")
  })

  it('parses unit-bearing SVG lengths (review finding: 210mm)', async () => {
    const { lengthToPx } = await import('../src/design/svgDesign')
    expect(lengthToPx('210mm')).toBeCloseTo(793.7, 0)
    expect(lengthToPx('297mm')).toBeCloseTo(1122.5, 0)
    expect(lengthToPx('595pt')).toBeCloseTo(793.3, 0)
    expect(lengthToPx('100%')).toBeNaN()
    expect(lengthToPx('500')).toBe(500)
    expect(lengthToPx(null)).toBeNaN()
  })
})

// The manager's complaint: a flat patch over a gradient poster is obvious
// ("سيظهر لون مختلف يشوه الصورة"). These lock the reconstruction's math.
describe('gradient cover patches (inpaint)', () => {
  const gray = (v: number): RGB => [v, v, v]

  it('reproduces a diagonal linear gradient EXACTLY', () => {
    // background g(fx, fy) = 10 + 100·fx + 40·fy, sampled on an 11×6 ring
    const pw = 11
    const ph = 6
    const g = (fx: number, fy: number) => 10 + 100 * fx + 40 * fy
    const ring = {
      top: Array.from({ length: pw }, (_, i) => gray(g(i / (pw - 1), 0))),
      bottom: Array.from({ length: pw }, (_, i) => gray(g(i / (pw - 1), 1))),
      left: Array.from({ length: ph }, (_, j) => gray(g(0, j / (ph - 1)))),
      right: Array.from({ length: ph }, (_, j) => gray(g(1, j / (ph - 1))))
    }
    const out = coonsSurface(ring, pw, ph)
    for (let py = 0; py < ph; py++) {
      for (let px = 0; px < pw; px++) {
        const o = (py * pw + px) * 4
        const want = Math.round(g(px / (pw - 1), py / (ph - 1)))
        expect(out[o]).toBe(want)
        expect(out[o + 1]).toBe(want)
        expect(out[o + 2]).toBe(want)
        expect(out[o + 3]).toBe(255) // opaque, or the artwork shows through
      }
    }
  })

  it('stays flat on a solid background', () => {
    const ring = {
      top: Array.from({ length: 8 }, () => gray(200)),
      bottom: Array.from({ length: 8 }, () => gray(200)),
      left: Array.from({ length: 4 }, () => gray(200)),
      right: Array.from({ length: 4 }, () => gray(200))
    }
    const out = coonsSurface(ring, 8, 4)
    for (let i = 0; i < out.length; i += 4) expect(out[i]).toBe(200)
  })

  it('median-smooths a neighbouring glyph out of the ring, keeping real edges', () => {
    // one dark pixel = the line of text above bleeding into the strip
    const spiked: RGB[] = Array.from({ length: 11 }, () => gray(200))
    spiked[5] = gray(0)
    expect(medianSmooth(spiked).every((p) => p[0] === 200)).toBe(true)

    // a genuine color boundary (a banner edge) must survive untouched
    const step: RGB[] = [
      ...Array.from({ length: 5 }, () => gray(200)),
      ...Array.from({ length: 5 }, () => gray(50))
    ]
    expect(medianSmooth(step).map((p) => p[0])).toEqual([200, 200, 200, 200, 200, 50, 50, 50, 50, 50])
  })
})

describe('vector shapes', () => {
  it('bounds a shape drawn in any direction', async () => {
    const { newShape, shapeBBox } = await import('../src/design/shapes')
    const s = newShape('s1', 'rect', 100, 80)
    // dragged up and to the left → negative deltas
    s.w = -40
    s.h = -20
    expect(shapeBBox(s)).toEqual({ x: 60, y: 60, w: 40, h: 20 })
  })

  it('puts the arrow head at the END of the shaft, pointing along it', async () => {
    const { newShape, arrowHead } = await import('../src/design/shapes')
    const s = newShape('s1', 'arrow', 0, 0)
    s.w = 100
    s.h = 0
    const { tip, barbs } = arrowHead(s)
    expect(tip).toEqual([100, 0])
    // barbs sit behind the tip, symmetrically above and below the shaft
    expect(barbs[0][0]).toBeLessThan(100)
    expect(barbs[1][0]).toBeLessThan(100)
    expect(barbs[0][1]).toBeCloseTo(-barbs[1][1], 6)
  })

  it('rejects hostile or degenerate shapes from a sidecar', async () => {
    const { cleanShape } = await import('../src/design/shapes')
    expect(cleanShape({ kind: 'circle', w: 5, h: 5, fill: '#ffffff' }, 0)).toBeNull()
    expect(cleanShape({ kind: 'rect', w: 0, h: 0, fill: '#ffffff' }, 0)).toBeNull()
    // neither fill nor stroke → invisible, never selectable
    expect(cleanShape({ kind: 'rect', w: 5, h: 5 }, 0)).toBeNull()
    const bad = cleanShape({ kind: 'rect', w: 5, h: 5, fill: 'url(evil)', stroke: '#112233' }, 0)!
    expect(bad.fill).toBe('')
    expect(bad.stroke).toBe('#112233')
    expect(bad.strokeWidth).toBe(2)
  })

  it('round-trips shapes through the sidecar and ignores them in v2 files', async () => {
    const { newShape } = await import('../src/design/shapes')
    const box = newBox('box-1', 10, 10, true)
    box.text = 'نص'
    const s = newShape('shape-1', 'ellipse', 20, 30)
    s.w = 60
    s.h = 40
    const back = parseProject(serializeProject('a.ai', { '1': [box] }, { '1': [s] }))!
    expect(back.version).toBe(3)
    expect(back.shapes['1'][0]).toEqual(s)
    // an old sidecar simply has no shapes
    const v2 = parseProject('{"version":2,"source":"a.ai","pages":{"1":[{"id":"b","text":"x","x":1,"y":1}]}}')!
    expect(v2.shapes).toEqual({})
  })

  it('hit-tests a line along its length, not its bounding box', async () => {
    const { newShape, shapeHit } = await import('../src/design/shapes')
    const s = newShape('s1', 'line', 0, 0)
    s.w = 100
    s.h = 100
    expect(shapeHit(s, 50, 50)).toBe(true)
    // the far corner of the bbox is nowhere near the diagonal
    expect(shapeHit(s, 5, 95)).toBe(false)
  })
})

describe('shapes in the exported pdf', () => {
  it('draws them as real vectors, with the arrow head AT the shaft tip', async () => {
    const { newShape } = await import('../src/design/shapes')
    const arrow = newShape('s1', 'arrow', 100, 700) // pointing up-right
    arrow.w = 120
    arrow.h = -100
    arrow.stroke = '#0f172a'
    const ring = newShape('s2', 'ellipse', 40, 60)
    ring.w = 80
    ring.h = 50
    ring.fill = '#ab99cc'
    const bytes = await exportOverlayPdf({
      artwork: null,
      pageIndex: 0,
      pageSizePt: { width: 595.28, height: 841.89 },
      boxes: [],
      shapes: [arrow, ring],
      getFont: async () => null
    })
    const { PDFDocument, PDFName, PDFArray, PDFRawStream, decodePDFRawStream } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    const page = doc.getPage(0)
    const contents = page.node.get(PDFName.of('Contents'))
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents]
    let stream = ''
    for (const ref of refs) {
      const st = page.doc.context.lookup(ref)
      if (st instanceof PDFRawStream) stream += new TextDecoder().decode(decodePDFRawStream(st).decode())
    }
    // vectors, not a raster: no image XObject was appended
    expect(/\bDo\b/.test(stream)).toBe(false)
    expect(/\bc\b/.test(stream)).toBe(true) // ellipse beziers

    // the shaft's tip in pdf space (y flipped) — the head must be drawn there,
    // which is what the earlier off-by-a-page-height bug got wrong
    const tipX = arrow.x + arrow.w
    const tipY = 841.89 - (arrow.y + arrow.h)
    const pts = [...stream.matchAll(/([\d.]+) ([\d.]+) (?:m|l)\n?/g)].map((m) => [Number(m[1]), Number(m[2])])
    const nearTip = pts.filter((p) => Math.abs(p[0] - tipX) < 20 && Math.abs(p[1] - tipY) < 20)
    // the shaft end plus the three head points all cluster at the tip
    expect(nearTip.length).toBeGreaterThanOrEqual(3)
  })
})

describe('placed images / logos', () => {
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  it('fits a logo into the page without distorting it', async () => {
    const { fitIntoPage } = await import('../src/design/images')
    expect(fitIntoPage(2000, 1000, 300)).toEqual({ w: 300, h: 150 })
    // already small enough → left alone
    expect(fitIntoPage(120, 60, 300)).toEqual({ w: 120, h: 60 })
  })

  it('turns a crop into the source rectangle in pixels', async () => {
    const { cropRectPx } = await import('../src/design/images')
    const img = {
      id: 'i1', x: 0, y: 0, w: 100, h: 100, src: PNG,
      naturalW: 400, naturalH: 200,
      crop: { l: 0.25, t: 0.5, r: 0.25, b: 0 }
    }
    expect(cropRectPx(img)).toEqual({ sx: 100, sy: 100, sw: 200, sh: 100 })
  })

  it('rejects anything pdf-lib could not embed, and impossible crops', async () => {
    const { cleanImage } = await import('../src/design/images')
    expect(cleanImage({ src: 'data:image/svg+xml;base64,AAAA', w: 10, h: 10 }, 0)).toBeNull()
    expect(cleanImage({ src: 'javascript:alert(1)', w: 10, h: 10 }, 0)).toBeNull()
    expect(cleanImage({ src: PNG, w: 0, h: 10 }, 0)).toBeNull()
    // a crop that removes everything is dropped rather than rendering nothing
    const all = cleanImage({ src: PNG, w: 10, h: 10, crop: { l: 0.6, t: 0, r: 0.6, b: 0 } }, 0)!
    expect(all.crop).toBeUndefined()
  })

  it('round-trips images through the sidecar', async () => {
    const img = {
      id: 'img-1', x: 12.345, y: 20, w: 80, h: 40, src: PNG, naturalW: 8, naturalH: 4
    }
    const back = parseProject(serializeProject('a.ai', {}, {}, { '1': [img] }))!
    expect(back.images['1'][0].src).toBe(PNG)
    expect(back.images['1'][0].x).toBeCloseTo(12.35)
    // v2 sidecars simply carry none
    const v2 = parseProject('{"version":2,"source":"a.ai","pages":{}}')!
    expect(v2.images).toEqual({})
  })

  it('embeds a placed image into the exported pdf', async () => {
    const bytes = await exportOverlayPdf({
      artwork: null,
      pageIndex: 0,
      pageSizePt: { width: 300, height: 300 },
      boxes: [],
      images: [{ id: 'i1', x: 10, y: 20, w: 100, h: 50, src: PNG, naturalW: 1, naturalH: 1 }],
      getFont: async () => null
    })
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(bytes)
    // an XObject image resource means the picture really made it in
    const text = new TextDecoder('latin1').decode(bytes)
    expect(/\/Subtype\s*\/Image/.test(text)).toBe(true)
    expect(doc.getPageCount()).toBe(1)
  })
})

describe('raster → svg tracing', () => {
  const solid = (w: number, h: number, paint: (x: number, y: number) => [number, number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b, a] = paint(x, y)
        const o = (y * w + x) * 4
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a
      }
    }
    return d
  }

  /** A binary membership field with the 1px padding isoContours expects. */
  const binField = (w: number, h: number, inside: (x: number, y: number) => boolean) => {
    const gw = w + 2
    const gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (inside(x, y)) field[(y + 1) * gw + (x + 1)] = 1
    }
    return { field, gw, gh }
  }

  it('traces a filled square as one closed loop enclosing its true area', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    const { ringArea } = await import('../src/design/trace')
    const { field, gw, gh } = binField(4, 4, (x, y) => x >= 1 && x <= 2 && y >= 1 && y <= 2)
    const loops = isoContours(field, gw, gh)
    expect(loops).toHaveLength(1)
    // grid sampling chamfers each of the 4 corners by an eighth of a pixel
    expect(Math.abs(ringArea(loops[0]))).toBeCloseTo(3.5, 6)
  })

  it('produces a SECOND loop for a hole, wound the opposite way', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    const { ringArea } = await import('../src/design/trace')
    const { field, gw, gh } = binField(5, 5, (x, y) => !(x === 2 && y === 2))
    const loops = isoContours(field, gw, gh)
    expect(loops).toHaveLength(2)
    const areas = loops.map((l) => Math.abs(ringArea(l))).sort((a, b) => b - a)
    expect(areas[0]).toBeCloseTo(24.5, 6)
    expect(areas[1]).toBeCloseTo(0.5, 6)
    // opposite winding is what makes evenodd cut the hole out
    expect(Math.sign(ringArea(loops[0]))).toBe(-Math.sign(ringArea(loops[1])))
  })

  it('separates two diagonally touching blobs instead of merging them', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    const { field, gw, gh } = binField(4, 4, (x, y) => (x === 0 && y === 0) || (x === 1 && y === 1))
    const loops = isoContours(field, gw, gh)
    expect(loops).toHaveLength(2)
  })

  it('places the outline half-way through a soft (anti-aliased) edge', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    // a vertical edge whose middle column is exactly half-way between the sides
    const gw = 6
    const gh = 5
    const field = new Float32Array(gw * gh)
    for (let j = 1; j < gh - 1; j++) {
      field[j * gw + 1] = 1
      field[j * gw + 2] = 1
      field[j * gw + 3] = 0.5 // the anti-aliased pixel
    }
    const loops = isoContours(field, gw, gh)
    expect(loops).toHaveLength(1)
    // the boundary must sit ON that soft sample (pixel coord 2.5), not beside it
    const rightmost = Math.max(...loops[0].map((p) => p[0]))
    expect(rightmost).toBeCloseTo(2.5, 6)
  })

  it('simplifies a staircase-free straight edge down to its corners', async () => {
    const { simplifyRing } = await import('../src/design/trace')
    // a 10x10 square sampled every pixel along each side
    const ring: number[][] = []
    for (let x = 0; x < 10; x++) ring.push([x, 0])
    for (let y = 0; y < 10; y++) ring.push([10, y])
    for (let x = 10; x > 0; x--) ring.push([x, 10])
    for (let y = 10; y > 0; y--) ring.push([0, y])
    const out = simplifyRing(ring, 1)
    // only the four corners survive (plus the shared first/last endpoint)
    expect(out.length).toBeLessThanOrEqual(5)
    expect(out).toContainEqual([10, 0])
    expect(out).toContainEqual([10, 10])
  })

  it('picks a deterministic palette — the same image traces identically twice', async () => {
    const { buildPalette } = await import('../src/design/trace')
    const px: [number, number, number][] = [
      [255, 0, 0], [250, 5, 5], [0, 0, 255], [5, 5, 250], [250, 0, 0], [0, 0, 250]
    ]
    const a = buildPalette(px, 2)
    const b = buildPalette([...px], 2)
    expect(a).toEqual(b)
    expect(a).toHaveLength(2)
    // one box is clearly red, the other clearly blue
    const reds = a.filter((c) => c[0] > 200 && c[2] < 60)
    const blues = a.filter((c) => c[2] > 200 && c[0] < 60)
    expect(reds).toHaveLength(1)
    expect(blues).toHaveLength(1)
  })

  it('traces a two-colour picture into two filled paths', async () => {
    const { traceImage } = await import('../src/design/trace')
    // left half red, right half blue, 20x10
    const data = solid(20, 10, (x) => (x < 10 ? [220, 20, 20, 255] : [20, 20, 220, 255]))
    const paths = traceImage(data, 20, 10, { colors: 2, minArea: 4, simplify: 1, smooth: false })
    expect(paths).toHaveLength(2)
    expect(paths.every((p) => p.d.startsWith('M') && p.d.endsWith('Z'))).toBe(true)
    const fills = paths.map((p) => p.fill).sort()
    expect(fills[0]).toMatch(/^#1414dc$/i)
    expect(fills[1]).toMatch(/^#dc1414$/i)
    // each half covers 100 of the 200 pixels
    expect(paths[0].area).toBe(100)
  })

  it('emits a standalone svg document with evenodd filling', async () => {
    const { traceImage, pathsToSvg } = await import('../src/design/trace')
    const data = solid(8, 8, (x, y) => ((x + y) % 2 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const svg = pathsToSvg(traceImage(data, 8, 8, { colors: 2, minArea: 0 }), 8, 8)
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('viewBox="0 0 8 8"')
    expect(svg).toContain('fill-rule="evenodd"')
  })

  it('drops the background when asked, leaving a cut-out logo', async () => {
    const { traceImage } = await import('../src/design/trace')
    // white field with a small dark block = a logo on paper
    const data = solid(20, 20, (x, y) =>
      x > 6 && x < 14 && y > 6 && y < 14 ? [10, 10, 10, 255] : [255, 255, 255, 255]
    )
    const withBg = traceImage(data, 20, 20, { colors: 2, minArea: 4, ignoreBackground: false })
    const cut = traceImage(data, 20, 20, { colors: 2, minArea: 4, ignoreBackground: true })
    expect(withBg).toHaveLength(2)
    expect(cut).toHaveLength(1)
    expect(cut[0].fill).toMatch(/^#0a0a0a$/i)
  })
})

describe('traced paths as shapes', () => {
  it('scales path data from source pixels into the placed size', async () => {
    const { scalePathData } = await import('../src/design/trace')
    // 10x10 source drawn into a 20x5 box → x doubles, y quarters
    expect(scalePathData('M0 0L10 10Z', 2, 0.5)).toBe('M0 0L20 5Z')
    expect(scalePathData('M2 4Q6 8 10 12Z', 0.5, 2)).toBe('M1 8Q3 16 5 24Z')
  })

  it('refuses path data that is not plain geometry', async () => {
    const { cleanShape } = await import('../src/design/shapes')
    const ok = cleanShape({ kind: 'path', w: 10, h: 10, fill: '#112233', d: 'M0 0L5 5Z' }, 0)
    expect(ok?.d).toBe('M0 0L5 5Z')
    // no d at all, and anything carrying a url() or entity, is rejected
    expect(cleanShape({ kind: 'path', w: 10, h: 10, fill: '#112233' }, 0)).toBeNull()
    expect(
      cleanShape({ kind: 'path', w: 10, h: 10, fill: '#112233', d: 'M0 0 url(#x)' }, 0)
    ).toBeNull()
  })

  it('round-trips a traced path through the sidecar', async () => {
    const shape = {
      id: 'shape-1', kind: 'path' as const, x: 5, y: 6, w: 40, h: 30,
      fill: '#204080', stroke: '', strokeWidth: 0.25, d: 'M0 0L40 0L40 30Z'
    }
    const back = parseProject(serializeProject('a.ai', {}, { '1': [shape] }))!
    expect(back.shapes['1'][0].d).toBe('M0 0L40 0L40 30Z')
    expect(back.shapes['1'][0].kind).toBe('path')
  })

  it('writes traced paths into the pdf as vectors', async () => {
    const bytes = await exportOverlayPdf({
      artwork: null,
      pageIndex: 0,
      pageSizePt: { width: 200, height: 200 },
      boxes: [],
      shapes: [{
        id: 's1', kind: 'path', x: 10, y: 20, w: 50, h: 50,
        fill: '#ff0000', stroke: '', strokeWidth: 0.25, d: 'M0 0L50 0L50 50L0 50Z'
      }],
      getFont: async () => null
    })
    const txt = new TextDecoder('latin1').decode(bytes)
    // filled, and no raster fallback crept in
    expect(/\bf\b/.test(txt)).toBe(true)
    expect(/\/Subtype\s*\/Image/.test(txt)).toBe(false)
  })
})

describe('trace background removal', () => {
  const field = (w: number, h: number, paint: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = paint(x, y)
        const o = (y * w + x) * 4
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
      }
    }
    return d
  }
  // a dark logo on a coloured (NOT white) card
  const card = field(24, 24, (x, y) =>
    x > 7 && x < 17 && y > 7 && y < 17 ? [20, 20, 20] : [30, 120, 200]
  )

  it("'auto' keeps a coloured background — only paper is dropped", async () => {
    const { traceImage } = await import('../src/design/trace')
    const paths = traceImage(card, 24, 24, { colors: 2, minArea: 4, ignoreBackground: 'auto' })
    expect(paths).toHaveLength(2)
  })

  it('drops a colour the eyedropper picked, however un-white it is', async () => {
    const { traceImage } = await import('../src/design/trace')
    const paths = traceImage(card, 24, 24, {
      colors: 2,
      minArea: 4,
      ignoreBackground: 'auto',
      dropColors: [[30, 120, 200]]
    })
    expect(paths).toHaveLength(1)
    expect(paths[0].fill).toMatch(/^#141414$/i)
  })

  it('honours the tolerance rather than demanding an exact match', async () => {
    const { traceImage } = await import('../src/design/trace')
    // picked a neighbouring shade, not the exact one
    const near = traceImage(card, 24, 24, {
      colors: 2, minArea: 4, dropColors: [[40, 130, 190]], dropTolerance: 40
    })
    expect(near).toHaveLength(1)
    // the same pick with a tight tolerance keeps both
    const strict = traceImage(card, 24, 24, {
      colors: 2, minArea: 4, dropColors: [[40, 130, 190]], dropTolerance: 2
    })
    expect(strict).toHaveLength(2)
  })

  it('lower detail tolerance keeps more of the outline', async () => {
    const { traceImage } = await import('../src/design/trace')
    const circle = field(60, 60, (x, y) =>
      (x - 30) ** 2 + (y - 30) ** 2 < 500 ? [10, 10, 10] : [255, 255, 255]
    )
    const coarse = traceImage(circle, 60, 60, { colors: 2, simplify: 3, smooth: false })
    const fine = traceImage(circle, 60, 60, { colors: 2, simplify: 0.2, smooth: false })
    const nodes = (d: string) => (d.match(/[ML]/g) || []).length
    expect(nodes(fine[0].d)).toBeGreaterThan(nodes(coarse[0].d))
  })
})

describe('trace precision (curve fitting)', () => {
  /** Walk an M/C/Z path and return points along it. */
  const samplePath = (d: string, per = 12): number[][] => {
    const toks = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? []
    const out: number[][] = []
    let i = 0
    let cur: number[] = [0, 0]
    let start: number[] = [0, 0]
    const num = () => Number(toks[i++])
    while (i < toks.length) {
      const cmd = toks[i++]
      if (cmd === 'M') {
        cur = [num(), num()]
        start = cur
        out.push(cur)
      } else if (cmd === 'L') {
        const e = [num(), num()]
        for (let k = 1; k <= per; k++) {
          const t = k / per
          out.push([cur[0] + (e[0] - cur[0]) * t, cur[1] + (e[1] - cur[1]) * t])
        }
        cur = e
      } else if (cmd === 'C') {
        const c1 = [num(), num()]
        const c2 = [num(), num()]
        const e = [num(), num()]
        for (let s = 1; s <= per; s++) {
          const t = s / per
          const mt = 1 - t
          out.push([
            mt ** 3 * cur[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * e[0],
            mt ** 3 * cur[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * e[1]
          ])
        }
        cur = e
      } else if (cmd === 'Z') {
        cur = start
      }
    }
    return out
  }

  /** binary field + padding, the shape the sub-pixel tracer consumes */
  const fieldOf = (w: number, h: number, inside: (x: number, y: number) => boolean) => {
    const gw = w + 2
    const gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) if (inside(x, y)) field[(y + 1) * gw + (x + 1)] = 1
    }
    return { field, gw, gh }
  }

  it('fits a circle to sub-pixel accuracy instead of a lumpy staircase', async () => {
    const { ringToPath } = await import('../src/design/trace')
    const { isoContours } = await import('../src/design/isoContour')
    const R = 40
    const w = 100, h = 100
    const { field, gw, gh } = fieldOf(w, h, (x, y) => (x - 50) ** 2 + (y - 50) ** 2 <= R * R)
    const ring = isoContours(field, gw, gh)[0]
    const d = ringToPath(ring, true, 0.4)
    const pts = samplePath(d)
    // every sampled point must sit on the true circle, within a pixel
    const radii = pts.map((p) => Math.hypot(p[0] - 50.5, p[1] - 50.5))
    const worst = Math.max(...radii.map((r) => Math.abs(r - (R + 0.5))))
    expect(worst).toBeLessThan(1.2)
  })

  it('keeps a diagonal edge STRAIGHT — the wavy-stroke failure', async () => {
    const { ringToPath } = await import('../src/design/trace')
    const { isoContours } = await import('../src/design/isoContour')
    const w = 80, h = 80
    // a right triangle: the hypotenuse is a 45° staircase in the field
    const { field, gw, gh } = fieldOf(w, h, (x, y) => y >= 10 && x >= 10 && x - 10 <= y - 10 && y <= 70)
    const ring = isoContours(field, gw, gh)[0]
    const d = ringToPath(ring, true, 0.4)
    const pts = samplePath(d, 40)
    // points near the hypotenuse must lie on the line y = x (within a pixel)
    const onDiag = pts.filter((p) => p[0] > 20 && p[0] < 60 && Math.abs(p[1] - p[0]) < 6)
    expect(onDiag.length).toBeGreaterThan(10)
    const drift = Math.max(...onDiag.map((p) => Math.abs(p[1] - p[0])))
    expect(drift).toBeLessThan(1.6)
  })

  it('holds a rectangle square — corners stay sharp, sides stay flat', async () => {
    const { ringToPath } = await import('../src/design/trace')
    const { isoContours } = await import('../src/design/isoContour')
    const w = 60, h = 40
    const { field, gw, gh } = fieldOf(w, h, (x, y) => x >= 10 && x < 50 && y >= 8 && y < 32)
    const ring = isoContours(field, gw, gh)[0]
    const pts = samplePath(ringToPath(ring, true, 0.4))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    // the outline never bulges outside the true rectangle by more than a pixel
    expect(Math.min(...xs)).toBeGreaterThan(10 - 1.2)
    expect(Math.max(...xs)).toBeLessThan(50 + 1.2)
    expect(Math.min(...ys)).toBeGreaterThan(8 - 1.2)
    expect(Math.max(...ys)).toBeLessThan(32 + 1.2)
    // and the flat sides really are flat: many samples sit exactly on each edge
    const onTop = pts.filter((p) => Math.abs(p[1] - 8) < 0.6 && p[0] > 15 && p[0] < 45)
    expect(onTop.length).toBeGreaterThan(5)
  })

  it('detects the four corners of a square and none along its sides', async () => {
    const { findCorners } = await import('../src/design/curveFit')
    const ring: [number, number][] = []
    for (let x = 0; x < 30; x++) ring.push([x, 0])
    for (let y = 0; y < 30; y++) ring.push([30, y])
    for (let x = 30; x > 0; x--) ring.push([x, 30])
    for (let y = 30; y > 0; y--) ring.push([0, y])
    expect(findCorners(ring)).toHaveLength(4)
  })

  it('does not mistake a diagonal staircase for corners', async () => {
    const { findCorners } = await import('../src/design/curveFit')
    // the 1px zig-zag of a 45° edge
    const ring: [number, number][] = []
    for (let i = 0; i < 40; i++) {
      ring.push([i, i])
      ring.push([i + 1, i])
    }
    for (let i = 40; i > 0; i--) ring.push([i, 41])
    expect(findCorners(ring).length).toBeLessThanOrEqual(3)
  })
})

describe('corner reconstruction', () => {
  const samplePathPts = (d: string, per = 10): number[][] => {
    const toks = d.match(/[MLCZ]|-?\d*\.?\d+/g) ?? []
    const out: number[][] = []
    let i = 0
    let cur = [0, 0]
    let start = [0, 0]
    const num = () => Number(toks[i++])
    while (i < toks.length) {
      const cmd = toks[i++]
      if (cmd === 'M') { cur = [num(), num()]; start = cur; out.push(cur) }
      else if (cmd === 'L') {
        const e = [num(), num()]
        for (let s = 1; s <= per; s++) {
          const t = s / per
          out.push([cur[0] + (e[0] - cur[0]) * t, cur[1] + (e[1] - cur[1]) * t])
        }
        cur = e
      }
      else if (cmd === 'C') {
        const c1 = [num(), num()], c2 = [num(), num()], e = [num(), num()]
        for (let s = 1; s <= per; s++) {
          const t = s / per, mt = 1 - t
          out.push([
            mt ** 3 * cur[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t ** 3 * e[0],
            mt ** 3 * cur[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t ** 3 * e[1]
          ])
        }
        cur = e
      } else if (cmd === 'Z') cur = start
    }
    return out
  }

  it('puts a chamfered right angle back exactly where it belongs', async () => {
    const { sharpenCorners, findCorners } = await import('../src/design/curveFit')
    // a square whose corners have been cut by the grid, as marching squares does
    const ring: [number, number][] = []
    const push = (x: number, y: number) => ring.push([x, y])
    for (let x = 10.5; x <= 29.5; x++) push(x, 10)
    push(30, 10.5)
    for (let y = 10.5; y <= 29.5; y++) push(30, y)
    push(29.5, 30)
    for (let x = 29.5; x >= 10.5; x--) push(x, 30)
    push(10, 29.5)
    for (let y = 29.5; y >= 10.5; y--) push(10, y)
    push(10.5, 10)
    const sharp = sharpenCorners(ring, findCorners(ring))
    // the true corner (30,10) must now appear, not the two chamfer points
    const hasCorner = sharp.some((p) => Math.abs(p[0] - 30) < 0.01 && Math.abs(p[1] - 10) < 0.01)
    expect(hasCorner).toBe(true)
  })

  it('restores a hard-edged square to its FULL area through the tracer', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    const { ringToPath } = await import('../src/design/trace')
    const w = 40, h = 40
    const gw = w + 2, gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let y = 10; y < 30; y++) for (let x = 10; x < 30; x++) field[(y + 1) * gw + (x + 1)] = 1
    const pts = samplePathPts(ringToPath(isoContours(field, gw, gh)[0], true, 0.4))
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    // pixels 10..29 are inside, so the true edges lie at 10 and 30 (half-way
    // between the last inside centre and the first outside one). The corners
    // must REACH them — a chamfered square would stop ~0.5px short.
    expect(Math.min(...xs)).toBeCloseTo(10, 1)
    expect(Math.max(...xs)).toBeCloseTo(30, 1)
    expect(Math.min(...ys)).toBeCloseTo(10, 1)
    expect(Math.max(...ys)).toBeCloseTo(30, 1)
  })

  it('leaves a genuinely round shape round', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    const { ringToPath } = await import('../src/design/trace')
    const w = 80, h = 80
    const gw = w + 2, gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if ((x - 40) ** 2 + (y - 40) ** 2 <= 30 * 30) field[(y + 1) * gw + (x + 1)] = 1
      }
    }
    const pts = samplePathPts(ringToPath(isoContours(field, gw, gh)[0], true, 0.4))
    const worst = Math.max(...pts.map((p) => Math.abs(Math.hypot(p[0] - 40, p[1] - 40) - 30)))
    // no corner was invented on a smooth circle
    expect(worst).toBeLessThan(1.2)
  })
})

describe('seam overlap between adjacent colours', () => {
  it('grows a loop outward so neighbours overlap instead of leaving a hairline', async () => {
    const { offsetLoop } = await import('../src/design/isoContour')
    // A 10x10 square wound with the filled side on the LEFT in SCREEN axes
    // (y down): travelling (0,0)->(0,10) is downward, and left of downward is
    // +x — the square's inside. Winding it the other way would shrink it.
    const sq: number[][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
    const grown = offsetLoop(sq, 1)
    const xs = grown.map((p) => p[0])
    const ys = grown.map((p) => p[1])
    // every corner moved OUTWARD by the offset — the area got bigger, not smaller
    expect(Math.min(...xs)).toBeCloseTo(-1, 6)
    expect(Math.max(...xs)).toBeCloseTo(11, 6)
    expect(Math.min(...ys)).toBeCloseTo(-1, 6)
    expect(Math.max(...ys)).toBeCloseTo(11, 6)
  })

  it('shrinks a HOLE, which grows the material around it', async () => {
    const { offsetLoop, isoContours } = await import('../src/design/isoContour')
    const { ringArea } = await import('../src/design/trace')
    // a filled block with a hole: the two loops wind opposite ways
    const w = 9, h = 9, gw = w + 2, gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let y = 1; y < 8; y++) for (let x = 1; x < 8; x++) field[(y + 1) * gw + (x + 1)] = 1
    for (let y = 3; y < 6; y++) for (let x = 3; x < 6; x++) field[(y + 1) * gw + (x + 1)] = 0
    const loops = isoContours(field, gw, gh)
    expect(loops).toHaveLength(2)
    const byArea = [...loops].sort((a, b) => Math.abs(ringArea(b)) - Math.abs(ringArea(a)))
    const outerBefore = Math.abs(ringArea(byArea[0]))
    const holeBefore = Math.abs(ringArea(byArea[1]))
    expect(Math.abs(ringArea(offsetLoop(byArea[0], 0.5)))).toBeGreaterThan(outerBefore)
    expect(Math.abs(ringArea(offsetLoop(byArea[1], 0.5)))).toBeLessThan(holeBefore)
  })

  it('is what closes the gap: two abutting regions overlap after the offset', async () => {
    const { traceImage } = await import('../src/design/trace')
    // left half red, right half blue with a soft seam between them
    const w = 40, h = 20
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const t = Math.min(1, Math.max(0, (x - 19) / 2))
        d[o] = 220 * (1 - t) + 20 * t
        d[o + 1] = 20
        d[o + 2] = 20 * (1 - t) + 220 * t
        d[o + 3] = 255
      }
    }
    const xOf = (paths: { d: string }[]) =>
      paths.map((p) => (p.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0))
    const withGap = traceImage(d, w, h, { colors: 2, minArea: 4, seamOverlap: 0, ignoreBackground: false })
    const sealed = traceImage(d, w, h, { colors: 2, minArea: 4, seamOverlap: 0.75, ignoreBackground: false })
    expect(withGap).toHaveLength(2)
    expect(sealed).toHaveLength(2)
    // the sealed pair spans a wider combined x range — they now overlap
    const spread = (ps: { d: string }[]) => {
      const all = xOf(ps).flat()
      return Math.max(...all) - Math.min(...all)
    }
    expect(spread(sealed)).toBeGreaterThan(spread(withGap))
  })
})

describe('stacked layering (seams impossible by construction)', () => {
  const twoTone = () => {
    // left half red, right half blue, 40x20
    const w = 40, h = 20
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        d[o] = x < 20 ? 220 : 20
        d[o + 1] = 20
        d[o + 2] = x < 20 ? 20 : 220
        d[o + 3] = 255
      }
    }
    return { d, w, h }
  }

  it('the bottom layer spans the WHOLE image and the top layer sits above it', async () => {
    const { traceImage } = await import('../src/design/trace')
    const { d, w, h } = twoTone()
    const paths = traceImage(d, w, h, { colors: 2, minArea: 4, ignoreBackground: false, smooth: false })
    expect(paths).toHaveLength(2)
    const xs = (p: { d: string }) => (p.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0)
    const span = (p: { d: string }) => {
      const v = xs(p)
      return Math.max(...v) - Math.min(...v)
    }
    // paths[0] is the bottom of the stack: it covers the ENTIRE image, and the
    // top layer only its own half — that is what makes a seam impossible
    expect(span(paths[0])).toBeGreaterThan(35)
    expect(span(paths[1])).toBeLessThan(25)
    expect(span(paths[1])).toBeGreaterThan(15)
  })

  it('is deterministic — the same picture traces byte-identically twice', async () => {
    const { traceImage } = await import('../src/design/trace')
    const { d, w, h } = twoTone()
    const a = traceImage(d, w, h, { colors: 2, minArea: 4, ignoreBackground: false })
    const b = traceImage(new Uint8ClampedArray(d), w, h, { colors: 2, minArea: 4, ignoreBackground: false })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('an eyedropper-dropped colour is painted by NO layer at all', async () => {
    const { traceImage } = await import('../src/design/trace')
    const { d, w, h } = twoTone()
    const paths = traceImage(d, w, h, {
      colors: 2, minArea: 4, ignoreBackground: false, dropColors: [[220, 20, 20]]
    })
    expect(paths).toHaveLength(1)
    expect(paths[0].fill).toMatch(/^#1414dc$/i)
    // and the surviving layer does NOT stretch under the dropped region
    const xsAll = (paths[0].d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number).filter((_, i) => i % 2 === 0)
    expect(Math.min(...xsAll)).toBeGreaterThan(15)
  })
})

describe('colour fidelity (auto palette, refine, rescue)', () => {
  const img = (w: number, h: number, at: (x: number, y: number) => [number, number, number]) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = at(x, y)
        const o = (y * w + x) * 4
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
      }
    }
    return d
  }

  it("'auto' finds the natural colour count instead of a fixed one", async () => {
    const { traceImage } = await import('../src/design/trace')
    // exactly three flat colours — auto must produce exactly three layers
    const d = img(60, 30, (x) => (x < 20 ? [200, 30, 30] : x < 40 ? [30, 160, 60] : [30, 60, 200]))
    const paths = traceImage(d, 60, 30, { colors: 'auto', minArea: 4, ignoreBackground: false })
    expect(paths).toHaveLength(3)
  })

  it('refinePalette converges onto the exact cluster centres', async () => {
    const { buildPalette, refinePalette } = await import('../src/design/trace')
    const px: [number, number, number][] = []
    for (let i = 0; i < 200; i++) px.push([200 + (i % 3), 20, 20])
    for (let i = 0; i < 200; i++) px.push([20, 20, 200 + (i % 3)])
    const refined = refinePalette(px, buildPalette(px, 2))
    const sorted = [...refined].sort((a, b) => b[0] - a[0])
    expect(Math.abs(sorted[0][0] - 201)).toBeLessThanOrEqual(1)
    expect(Math.abs(sorted[1][2] - 201)).toBeLessThanOrEqual(1)
  })

  it('RESCUES a small colour the sample missed — the reported bug', async () => {
    const { traceImage } = await import('../src/design/trace')
    // white page, big blue block, and a SMALL gold seal (~0.6% of pixels)
    const d = img(100, 100, (x, y) => {
      if (x > 70 && x < 79 && y > 70 && y < 79) return [230, 170, 20]
      if (x > 10 && x < 60 && y > 10 && y < 60) return [30, 60, 180]
      return [255, 255, 255]
    })
    // colors: 2 would classically eat the seal into blue or white
    const paths = traceImage(d, 100, 100, { colors: 2, minArea: 4, ignoreBackground: false })
    const golds = paths.filter((p) => {
      const r = parseInt(p.fill.slice(1, 3), 16)
      const g = parseInt(p.fill.slice(3, 5), 16)
      const b = parseInt(p.fill.slice(5, 7), 16)
      return r > 180 && g > 120 && b < 90
    })
    expect(golds).toHaveLength(1)
  })
})

describe('saddle cells (the streak bug)', () => {
  const maxStep = (loops: number[][][]) => {
    let worst = 0
    for (const loop of loops) {
      for (let i = 0; i < loop.length; i++) {
        const a = loop[i]
        const b = loop[(i + 1) % loop.length]
        worst = Math.max(worst, Math.hypot(b[0] - a[0], b[1] - a[1]))
      }
    }
    return worst
  }

  it('a thin diagonal line traces as ONE contiguous loop, no jumps', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    // a 1-sample-wide diagonal — every cell along it is a saddle
    const w = 30, h = 30, gw = w + 2, gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let i = 2; i < 28; i++) field[(i + 1) * gw + (i + 1)] = 1
    const loops = isoContours(field, gw, gh)
    // consecutive contour points are at most one cell apart — the reversed
    // saddle links used to weld far-apart loops, producing page-crossing
    // streaks (max step jumped to dozens of pixels)
    expect(maxStep(loops)).toBeLessThan(2.1)
    // and every generated segment was consumed: total points = loop points
    const totalPts = loops.reduce((n, l) => n + l.length, 0)
    expect(totalPts).toBeGreaterThan(26 * 2)
  })

  it('two diagonals crossing (an X) stay four clean wedges or one tidy star — never a streak', async () => {
    const { isoContours } = await import('../src/design/isoContour')
    const w = 21, h = 21, gw = w + 2, gh = h + 2
    const field = new Float32Array(gw * gh)
    for (let i = 0; i < 21; i++) {
      field[(i + 1) * gw + (i + 1)] = 1
      field[(i + 1) * gw + (21 - i)] = 1
    }
    const loops = isoContours(field, gw, gh)
    expect(maxStep(loops)).toBeLessThan(2.1)
  })

  it('the full tracer keeps every path step-contiguous on a saddle-heavy picture', async () => {
    const { traceImage } = await import('../src/design/trace')
    // thin blue diagonals over white — a miniature of the manager's screens
    const w = 60, h = 60
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const onDiag = Math.abs((x - y + 60) % 20) < 2
        d[o] = onDiag ? 40 : 250
        d[o + 1] = onDiag ? 120 : 250
        d[o + 2] = onDiag ? 220 : 250
        d[o + 3] = 255
      }
    }
    // simplify: 0 keeps every lattice step, so a legitimate long straight
    // edge cannot masquerade as (or hide) a cross-image streak
    const paths = traceImage(d, w, h, { colors: 2, minArea: 3, smooth: false, simplify: 0, ignoreBackground: 'auto' })
    // walk each polygon path: consecutive L-points must stay near each other
    for (const p of paths) {
      const pts = (p.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      let worst = 0
      for (let i = 2; i + 3 < pts.length; i += 2) {
        // segment breaks (M after Z) are allowed to jump — detect via the raw
        // string instead: split subpaths first
      }
      const subs = p.d.split('M').filter(Boolean)
      for (const sub of subs) {
        const v = (sub.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
        for (let i = 0; i + 3 < v.length; i += 2) {
          worst = Math.max(worst, Math.hypot(v[i + 2] - v[i], v[i + 3] - v[i + 1]))
        }
      }
      expect(worst).toBeLessThan(2.1)
    }
  })
})

describe('gradient detection', () => {
  const canvasOf = (
    w: number,
    h: number,
    paint: (x: number, y: number) => [number, number, number]
  ) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [r, g, b] = paint(x, y)
        const o = (y * w + x) * 4
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255
      }
    }
    return d
  }
  const fullMask = (w: number, h: number) => new Uint8Array(w * h).fill(1)

  it('finds a horizontal ramp and reports its true end colours', async () => {
    const { fitLinearGradient } = await import('../src/design/gradientFit')
    const w = 60, h = 20
    // black -> red across x
    const d = canvasOf(w, h, (x) => [Math.round((x / (w - 1)) * 255), 0, 0])
    const g = fitLinearGradient(d, w, h, fullMask(w, h))
    expect(g).not.toBeNull()
    // direction is horizontal
    expect(Math.abs(g!.y2 - g!.y1)).toBeLessThan(1)
    expect(Math.abs(g!.x2 - g!.x1)).toBeGreaterThan(w * 0.8)
    // ends are near black and near red (2% trim keeps them just inside)
    const dark = g!.from < g!.to ? g!.from : g!.to
    expect(dark).toMatch(/^#0[0-9a-f]0000$/i)
    expect([g!.from, g!.to].some((c) => /^#f[0-9a-f]0000$/i.test(c))).toBe(true)
  })

  it('follows a DIAGONAL ramp, not just the axes', async () => {
    const { fitLinearGradient } = await import('../src/design/gradientFit')
    const w = 40, h = 40
    const d = canvasOf(w, h, (x, y) => {
      const t = (x + y) / ((w - 1) + (h - 1))
      return [Math.round(255 * t), Math.round(255 * t), Math.round(255 * t)]
    })
    const g = fitLinearGradient(d, w, h, fullMask(w, h))!
    expect(g).not.toBeNull()
    const dx = g.x2 - g.x1
    const dy = g.y2 - g.y1
    // 45 degrees: equal components
    expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeLessThan(2)
  })

  it('refuses a FLAT region — no gradient where there is no ramp', async () => {
    const { fitLinearGradient } = await import('../src/design/gradientFit')
    const w = 30, h = 30
    const d = canvasOf(w, h, () => [80, 120, 200])
    expect(fitLinearGradient(d, w, h, fullMask(w, h))).toBeNull()
  })

  it('refuses NOISE — a non-linear region must stay a flat fill', async () => {
    const { fitLinearGradient } = await import('../src/design/gradientFit')
    const w = 40, h = 40
    // deterministic checkerboard of two very different colours: huge range,
    // but no linear model explains it
    const d = canvasOf(w, h, (x, y) => ((x + y) % 2 ? [10, 10, 10] : [240, 240, 240]))
    expect(fitLinearGradient(d, w, h, fullMask(w, h))).toBeNull()
  })

  it('honours the mask — only the selected region is fitted', async () => {
    const { fitLinearGradient } = await import('../src/design/gradientFit')
    const w = 60, h = 20
    // left half ramps, right half is loud noise that would wreck a global fit
    const d = canvasOf(w, h, (x, y) =>
      x < 30 ? [Math.round((x / 29) * 200), 0, 0] : ((x + y) % 2 ? [0, 255, 0] : [255, 0, 255])
    )
    const mask = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < 30; x++) mask[y * w + x] = 1
    const g = fitLinearGradient(d, w, h, mask)
    expect(g).not.toBeNull()
    expect(g!.x2).toBeLessThanOrEqual(30)
  })

  it('is deterministic and never returns a direction and its mirror', async () => {
    const { dominantDirection } = await import('../src/design/gradientFit')
    const a = dominantDirection([{ b: -3, c: -4 }])
    const b = dominantDirection([{ b: 3, c: 4 }])
    expect(a).toEqual(b)
    expect(a.ux).toBeGreaterThanOrEqual(0)
  })
})

describe('gradients through the exporters', () => {
  const ramp = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const t = x / (w - 1)
        d[o] = Math.round(20 + t * 200); d[o + 1] = 40; d[o + 2] = Math.round(220 - t * 200); d[o + 3] = 255
      }
    }
    return d
  }

  it('a ramped picture traces to fewer paths carrying gradients', async () => {
    const { traceImage } = await import('../src/design/trace')
    const d = ramp(80, 20)
    const withG = traceImage(d, 80, 20, { colors: 4, ignoreBackground: false, gradients: true })
    const flat = traceImage(d, 80, 20, { colors: 4, ignoreBackground: false, gradients: false })
    expect(withG.some((p) => p.gradient)).toBe(true)
    expect(flat.every((p) => !p.gradient)).toBe(true)
    // the detected ramp runs left→right, matching the source
    const g = withG.find((p) => p.gradient)!.gradient!
    expect(Math.abs(g.x2 - g.x1)).toBeGreaterThan(Math.abs(g.y2 - g.y1))
  })

  it('writes gradients into the standalone SVG with a defs entry', async () => {
    const { traceImage, pathsToSvg } = await import('../src/design/trace')
    const paths = traceImage(ramp(80, 20), 80, 20, { colors: 4, ignoreBackground: false })
    const svg = pathsToSvg(paths, 80, 20)
    expect(svg).toContain('<defs>')
    expect(svg).toContain('<linearGradient')
    expect(svg).toContain('gradientUnits="userSpaceOnUse"')
    expect(svg).toMatch(/fill="url\(#g\d+\)"/)
  })

  it('emits a real PDF axial shading, not a flat fill', async () => {
    const bytes = await exportOverlayPdf({
      artwork: null,
      pageIndex: 0,
      pageSizePt: { width: 200, height: 200 },
      boxes: [],
      shapes: [{
        id: 's1', kind: 'path', x: 10, y: 20, w: 50, h: 50,
        fill: '#804020', stroke: '', strokeWidth: 0.25,
        d: 'M0 0L50 0L50 50L0 50Z',
        gradient: { x1: 0, y1: 0, x2: 50, y2: 0, from: '#112233', to: '#ddeeff' }
      }],
      getFont: async () => null
    })
    const txt = new TextDecoder('latin1').decode(bytes)
    // the shading dictionary itself is a plain object
    expect(txt).toContain('/ShadingType 2')
    expect(txt).toContain('/FunctionType 2')
    expect(txt).toMatch(/\/Shading\s*<</)
    expect(/\/Subtype\s*\/Image/.test(txt)).toBe(false)
    // The OPERATORS live in a Flate-compressed content stream: walk every
    // "stream" marker, inflate what follows, and search the result.
    const zlib = await import('node:zlib')
    const raw = Buffer.from(bytes)
    let streams = ''
    let at = 0
    for (;;) {
      const marker = txt.indexOf('stream', at)
      if (marker < 0) break
      at = marker + 6
      if (txt.startsWith('endstream', marker - 3)) continue
      let from = at
      while (from < txt.length && (txt.charCodeAt(from) === 13 || txt.charCodeAt(from) === 10)) from++
      const stop = txt.indexOf('endstream', from)
      if (stop < 0) continue
      try {
        streams += zlib.inflateSync(raw.subarray(from, stop)).toString('latin1')
      } catch {
        streams += txt.slice(from, stop)
      }
    }
    expect(/\/ExShx\d+ sh/.test(streams)).toBe(true)
    expect(/W\s+n/.test(streams)).toBe(true)
    // the clip path went in as real path operators
    expect(/(^|\s)m(\s|$)/m.test(streams)).toBe(true)
  })

  it('falls back to a flat fill when the gradient data is unusable', async () => {
    const { cleanShape } = await import('../src/design/shapes')
    const bad = cleanShape({
      kind: 'path', w: 10, h: 10, fill: '#112233', d: 'M0 0L5 5Z',
      gradient: { x1: 0, y1: 0, x2: 5, y2: 5, from: 'red; drop', to: '#ffffff' }
    }, 0)
    expect(bad).not.toBeNull()
    expect(bad!.gradient).toBeUndefined()
    expect(bad!.fill).toBe('#112233')
  })

  it('round-trips a gradient through the sidecar', async () => {
    const shape = {
      id: 'shape-1', kind: 'path' as const, x: 5, y: 6, w: 40, h: 30,
      fill: '#204080', stroke: '', strokeWidth: 0.25, d: 'M0 0L40 0L40 30Z',
      gradient: { x1: 0, y1: 0, x2: 40, y2: 30, from: '#111111', to: '#eeeeee' }
    }
    const back = parseProject(serializeProject('a.ai', {}, { '1': [shape] }))!
    expect(back.shapes['1'][0].gradient).toEqual(shape.gradient)
  })
})

describe('centreline (stroke) tracing', () => {
  const maskOf = (w: number, h: number, on: (x: number, y: number) => boolean) => {
    const m = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) m[y * w + x] = 1
    return m
  }

  it('thins a thick bar down to a single-pixel line', async () => {
    const { thin } = await import('../src/design/centerline')
    const w = 40, h = 20
    // a horizontal bar 5px thick
    const m = maskOf(w, h, (x, y) => x >= 5 && x < 35 && y >= 8 && y < 13)
    const sk = thin(m, w, h)
    let count = 0
    let minY = 99, maxY = -1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!sk[y * w + x]) continue
        count++
        minY = Math.min(minY, y); maxY = Math.max(maxY, y)
      }
    }
    // one pixel tall, and it sits in the MIDDLE of the bar (rows 8..12 → 10)
    expect(maxY - minY).toBeLessThanOrEqual(1)
    expect(minY).toBeGreaterThanOrEqual(9)
    expect(maxY).toBeLessThanOrEqual(11)
    expect(count).toBeGreaterThan(20)
  })

  it('measures the stroke weight of a bar', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const w = 40, h = 20
    const m = maskOf(w, h, (x, y) => x >= 5 && x < 35 && y >= 8 && y < 13)
    const r = centerlineOf(m, w, h)!
    expect(r).not.toBeNull()
    expect(r.width).toBeGreaterThan(3.5)
    expect(r.width).toBeLessThan(6.5)
  })

  it('REFUSES a filled blob — that is a shape, not a stroke', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const w = 40, h = 40
    const m = maskOf(w, h, (x, y) => (x - 20) ** 2 + (y - 20) ** 2 < 15 * 15)
    expect(centerlineOf(m, w, h, 12)).toBeNull()
  })

  it('splits a T junction into separate runs', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const w = 41, h = 41
    // horizontal bar + a stem going down from the middle
    const m = maskOf(w, h, (x, y) =>
      (y >= 9 && y < 12 && x >= 5 && x < 36) || (x >= 19 && x < 22 && y >= 9 && y < 36)
    )
    const r = centerlineOf(m, w, h)!
    expect(r).not.toBeNull()
    // three arms meet at the junction
    expect(r.lines.length).toBeGreaterThanOrEqual(3)
  })

  it('walks a closed ring as one closed run', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const w = 40, h = 40
    const m = maskOf(w, h, (x, y) => {
      const d = Math.hypot(x - 20, y - 20)
      return d > 12 && d < 15
    })
    const r = centerlineOf(m, w, h)!
    expect(r).not.toBeNull()
    expect(r.lines.some((l) => l.closed)).toBe(true)
  })

  it('keeps the skeleton connected — a diagonal line stays one run', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const w = 40, h = 40
    const m = maskOf(w, h, (x, y) => Math.abs(x - y) <= 1 && x >= 4 && x < 36)
    const r = centerlineOf(m, w, h)!
    expect(r).not.toBeNull()
    const longest = Math.max(...r.lines.map((l) => l.points.length))
    expect(longest).toBeGreaterThan(25)
  })
})

describe('centreline through the tracer', () => {
  // a thin dark cross on white — the classic line-art case
  const crossArt = (w: number, h: number) => {
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const ink = (Math.abs(y - 30) <= 1 && x >= 6 && x < 54) || (Math.abs(x - 30) <= 1 && y >= 6 && y < 54)
        const v = ink ? 15 : 250
        d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255
      }
    }
    return d
  }

  it('emits STROKED open paths instead of closed outlines', async () => {
    const { traceImage } = await import('../src/design/trace')
    const d = crossArt(60, 60)
    const stroked = traceImage(d, 60, 60, { colors: 2, strokes: true, smooth: false, minArea: 4 })
    const filled = traceImage(d, 60, 60, { colors: 2, strokes: false, smooth: false, minArea: 4 })
    expect(stroked.some((p) => p.strokeWidth)).toBe(true)
    expect(filled.every((p) => !p.strokeWidth)).toBe(true)
    const s = stroked.find((p) => p.strokeWidth)!
    // an open run: no Z closing it
    expect(s.d.includes('Z')).toBe(false)
    // the measured weight is about the 3px pen used to draw it
    expect(s.strokeWidth!).toBeGreaterThan(1.5)
    expect(s.strokeWidth!).toBeLessThan(5)
  })

  it('writes strokes into the SVG as stroke, not fill', async () => {
    const { traceImage, pathsToSvg } = await import('../src/design/trace')
    const paths = traceImage(crossArt(60, 60), 60, 60, { colors: 2, strokes: true, minArea: 4 })
    const svg = pathsToSvg(paths, 60, 60)
    expect(svg).toContain('fill="none"')
    expect(svg).toMatch(/stroke-width="[\d.]+"/)
    expect(svg).toContain('stroke-linecap="round"')
  })

  it('leaves a solid shape filled even when strokes are on', async () => {
    const { traceImage } = await import('../src/design/trace')
    const w = 60, h = 60
    const d = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4
        const inside = (x - 30) ** 2 + (y - 30) ** 2 < 18 * 18
        const v = inside ? 20 : 250
        d[o] = v; d[o + 1] = v; d[o + 2] = v; d[o + 3] = 255
      }
    }
    const paths = traceImage(d, w, h, { colors: 2, strokes: true, minArea: 4 })
    // the disc is far too fat to be a stroke — it must stay a filled outline
    expect(paths.every((p) => !p.strokeWidth)).toBe(true)
  })

  it('exports a centreline to PDF as a stroked path', async () => {
    const bytes = await exportOverlayPdf({
      artwork: null,
      pageIndex: 0,
      pageSizePt: { width: 200, height: 200 },
      boxes: [],
      shapes: [{
        id: 's1', kind: 'path', x: 10, y: 20, w: 80, h: 4,
        fill: '', stroke: '#223344', strokeWidth: 3,
        d: 'M0 0L80 0'
      }],
      getFont: async () => null
    })
    const txt = new TextDecoder('latin1').decode(bytes)
    expect(txt).not.toContain('/Subtype /Image')
    expect(bytes.length).toBeGreaterThan(400)
  })
})

describe('skeleton branch degree (the shattered-ring bug)', () => {
  it('a staircase pixel with 3 neighbours is a CURVE, not a junction', async () => {
    const { skeletonToPolylines } = await import('../src/design/centerline')
    // an 8-connected diagonal step: (1,1),(2,1),(2,2) — the middle pixel has
    // three neighbours but the line is one pixel wide throughout
    const w = 8, h = 8
    const sk = new Uint8Array(w * h)
    for (const [x, y] of [[1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3]]) sk[y * w + x] = 1
    const lines = skeletonToPolylines(sk, w, h)
    // ONE run end to end — a raw neighbour count would cut it into stubs
    expect(lines.length).toBe(1)
    expect(lines[0].points.length).toBeGreaterThanOrEqual(5)
  })

  it('a traced ring stays ONE run instead of shattering into stubs', async () => {
    const { thin, skeletonToPolylines } = await import('../src/design/centerline')
    const w = 40, h = 40
    const m = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - 20, y - 20)
        if (d > 12 && d < 15) m[y * w + x] = 1
      }
    }
    const lines = skeletonToPolylines(thin(m, w, h), w, h)
    // the bug produced 89 two-point stubs here
    expect(lines.length).toBeLessThan(4)
    expect(Math.max(...lines.map((l) => l.points.length))).toBeGreaterThan(50)
  })
})

describe('stroke-vs-fill gate', () => {
  const maskOf = (w: number, h: number, on: (x: number, y: number) => boolean) => {
    const m = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) m[y * w + x] = 1
    return m
  }

  it('REFUSES a big filled rectangle — the desk-top failure', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const m = maskOf(60, 60, (x, y) => x >= 5 && x < 55 && y >= 15 && y < 45)
    expect(centerlineOf(m, 60, 60, 12)).toBeNull()
  })

  it('REFUSES an L-shaped slab, whose long medial axis fooled the mean width', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const m = maskOf(60, 60, (x, y) =>
      (x >= 5 && x < 50 && y >= 5 && y < 25) || (x >= 5 && x < 25 && y >= 5 && y < 55)
    )
    expect(centerlineOf(m, 60, 60, 12)).toBeNull()
  })

  it('still ACCEPTS a genuine thin stroke', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const m = maskOf(60, 30, (x, y) => x >= 4 && x < 56 && y >= 14 && y < 17)
    const r = centerlineOf(m, 60, 30, 12)
    expect(r).not.toBeNull()
    expect(r!.width).toBeGreaterThan(2)
    expect(r!.width).toBeLessThan(5)
  })

  it('accepts a thin stroke that BENDS — length, not straightness, is the test', async () => {
    const { centerlineOf } = await import('../src/design/centerline')
    const m = maskOf(60, 60, (x, y) => {
      const onArc = Math.abs(Math.hypot(x - 30, y - 30) - 20) <= 1.5
      return onArc && y <= 30
    })
    expect(centerlineOf(m, 60, 60, 12)).not.toBeNull()
  })
})
