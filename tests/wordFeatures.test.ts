// The word-mode repairs and additions from the 2026-08-18 QA pass:
// image sizing, paragraph line spacing, custom highlight/cell shading, the
// page setup + header/footer round trip, the font-picker filter and the
// find/replace matcher. Everything here is checked through the real docx
// writer and reader, so a regression shows up as a broken FILE, not just a
// broken call.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { importDocx } from '../src/word/docxImport'
import { exportDocx, imageBoxPx, intrinsicSize, type TipTapNode } from '../src/word/docxExport'
import { usableFonts } from '../src/word/fonts'
import { findMatches } from '../src/word/findReplace'
import type { Node as PMNode } from '@tiptap/pm/model'
import {
  clampSetup,
  contentHeightPx,
  contentWidthPx,
  defaultPageSetup,
  mmToTwip,
  paperBoxMm
} from '../src/word/pageSetup'

/** Smallest valid PNG header carrying a 640x300 IHDR. */
function pngBytes(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(26)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function pngDataUrl(width: number, height: number): string {
  let bin = ''
  for (const b of pngBytes(width, height)) bin += String.fromCharCode(b)
  return `data:image/png;base64,${Buffer.from(bin, 'binary').toString('base64')}`
}

const para = (text: string, attrs?: Record<string, unknown>): TipTapNode => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: text ? [{ type: 'text', text }] : []
})

async function docXml(bytes: Uint8Array, part = 'word/document.xml'): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(part)
  return file ? file.async('string') : ''
}

describe('image sizing', () => {
  it('reads the intrinsic size out of a PNG header', () => {
    expect(intrinsicSize(pngBytes(640, 300), 'png')).toEqual({ width: 640, height: 300 })
  })

  it('keeps the aspect ratio when the node carries no width/height', () => {
    const node: TipTapNode = { type: 'image', attrs: { src: 'x' } }
    const box = imageBoxPx(node, pngBytes(640, 300), 'png', 620)
    expect(box.width).toBe(620)
    // 620/640 * 300 = 290.6 — a fixed 300x200 box (the old fallback) would be 1.5
    expect(box.width / box.height).toBeCloseTo(640 / 300, 1)
  })

  it('honours the node attributes when they are there', () => {
    const node: TipTapNode = { type: 'image', attrs: { src: 'x', width: 400, height: 187 } }
    expect(imageBoxPx(node, pngBytes(640, 300), 'png', 620)).toEqual({ width: 400, height: 187 })
  })

  it('writes an undistorted extent into the docx', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src: pngDataUrl(640, 300) } }] }]
    }
    const xml = await docXml(await exportDocx(doc, 'ar'))
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)
    expect(extent).toBeTruthy()
    expect(Number(extent![1]) / Number(extent![2])).toBeCloseTo(640 / 300, 1)
  })
})

describe('paragraph line spacing', () => {
  it('round-trips through w:spacing', async () => {
    const doc: TipTapNode = { type: 'doc', content: [para('سطر', { dir: 'rtl', lineHeight: '1.5' })] }
    const bytes = await exportDocx(doc, 'ar')
    const xml = await docXml(bytes)
    expect(xml).toContain('w:line="360"')
    expect(xml).toContain('w:lineRule="auto"')
    const back = await importDocx(bytes)
    expect(back.html).toContain('line-height: 1.5')
  })

  it('ignores an absent or nonsense value', async () => {
    const doc: TipTapNode = { type: 'doc', content: [para('سطر', { dir: 'rtl' })] }
    expect(await docXml(await exportDocx(doc, 'ar'))).not.toContain('w:line=')
  })
})

describe('colours that Word has no name for', () => {
  it('keeps a custom highlight through save and reopen', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'مميّز', marks: [{ type: 'highlight', attrs: { color: '#b3e5ff' } }] }
          ]
        }
      ]
    }
    const bytes = await exportDocx(doc, 'ar')
    expect(await docXml(bytes)).toContain('w:fill="b3e5ff"')
    const back = await importDocx(bytes)
    expect(back.html).toContain('#b3e5ff')
  })

  it('still uses the named highlight when there is one', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'أصفر', marks: [{ type: 'highlight', attrs: { color: '#ffff00' } }] }
          ]
        }
      ]
    }
    expect(await docXml(await exportDocx(doc, 'ar'))).toContain('w:highlight w:val="yellow"')
  })

  it('round-trips a shaded table cell', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { backgroundColor: '#dbeafe' },
                  content: [para('خلية')]
                }
              ]
            }
          ]
        }
      ]
    }
    const bytes = await exportDocx(doc, 'ar')
    expect(await docXml(bytes)).toContain('w:fill="dbeafe"')
    expect((await importDocx(bytes)).html).toContain('data-bg="#dbeafe"')
  })
})

describe('page setup, header and footer', () => {
  it('writes the paper size, margins and bands, and reads them back', async () => {
    const page = {
      ...defaultPageSetup(),
      orientation: 'landscape' as const,
      margin: { top: 30, bottom: 15, left: 12, right: 12 },
      header: 'شركة الأمل',
      footer: 'تقرير داخلي',
      pageNumbers: true
    }
    const bytes = await exportDocx({ type: 'doc', content: [para('نص', { dir: 'rtl' })] }, 'ar', { page })
    const xml = await docXml(bytes)
    expect(xml).toContain('w:orient="landscape"')
    expect(xml).toContain(`w:top="${mmToTwip(30)}"`)
    expect(xml).toContain(`w:bottom="${mmToTwip(15)}"`)
    const zip = await JSZip.loadAsync(bytes)
    expect(zip.file(/word\/header\d*\.xml/).length).toBe(1)
    expect(await docXml(bytes, 'word/header1.xml')).toContain('شركة الأمل')
    expect(await docXml(bytes, 'word/footer1.xml')).toContain('PAGE')

    const back = await importDocx(bytes)
    expect(back.page?.header).toBe('شركة الأمل')
    expect(back.page?.footer).toBe('تقرير داخلي')
    expect(back.page?.pageNumbers).toBe(true)
    expect(back.page?.orientation).toBe('landscape')
    expect(back.page?.margin.top).toBeCloseTo(30, 0)
    // plain text bands are kept now, so they must NOT raise the "will be lost" notice
    expect(back.warnings).not.toContain('headers')
  })

  it('derives the printable column from the paper and margins', () => {
    const page = { ...defaultPageSetup(), margin: { top: 20, bottom: 20, left: 20, right: 20 } }
    expect(paperBoxMm(page)).toEqual({ width: 210, height: 297 })
    expect(paperBoxMm({ ...page, orientation: 'landscape' })).toEqual({ width: 297, height: 210 })
    // (210 - 40)mm at 96dpi
    expect(contentWidthPx(page)).toBeCloseTo((170 * 96) / 25.4, 0)
    expect(contentHeightPx(page)).toBeCloseTo((257 * 96) / 25.4, 0)
  })

  it('clamps absurd margins instead of producing a zero-width page', () => {
    const clamped = clampSetup({
      ...defaultPageSetup(),
      margin: { top: 900, bottom: -5, left: 500, right: 10 }
    })
    expect(clamped.margin.top).toBeLessThanOrEqual(99)
    expect(clamped.margin.bottom).toBe(0)
    expect(clamped.margin.left).toBeLessThanOrEqual(70)
    expect(clamped.margin.right).toBe(10)
  })
})

describe('font picker', () => {
  it('drops the faces that are not valid CSS identifiers', () => {
    expect(usableFonts(['', ' ', '. Semi', '@Batang', 'Arial', 'arial', 'Times New Roman'])).toEqual([
      'Arial',
      'Times New Roman'
    ])
  })
})

describe('find & replace matching', () => {
  // A stand-in for a ProseMirror doc: findMatches only walks descendants.
  const fakeDoc = (blocks: string[][]): PMNode => {
    const doc = {
      descendants(fn: (node: unknown, pos: number) => boolean | void) {
        let pos = 0
        for (const runs of blocks) {
          fn({ isText: false, isBlock: true }, pos)
          pos += 1
          for (const text of runs) {
            fn({ isText: true, isBlock: false, text }, pos)
            pos += text.length
          }
        }
      }
    }
    return doc as unknown as PMNode
  }

  it('matches a phrase split across formatting runs', () => {
    const doc = fakeDoc([['تقرير ', 'المبيعات', ' الشهري']])
    expect(findMatches(doc, 'تقرير المبيعات', false)).toHaveLength(1)
  })

  it('never matches across a block boundary', () => {
    const doc = fakeDoc([['نهاية'], ['بداية']])
    expect(findMatches(doc, 'نهايةبداية', false)).toHaveLength(0)
  })

  it('honours the case switch for latin text', () => {
    const doc = fakeDoc([['Sales report and sales data']])
    expect(findMatches(doc, 'sales', false)).toHaveLength(2)
    expect(findMatches(doc, 'sales', true)).toHaveLength(1)
    expect(findMatches(doc, '', false)).toHaveLength(0)
  })
})
