// The second wave of Word parity: the PDF layout rebuild, the manual page
// break, superscript/subscript, paragraph spacing, heading 4 and the quote
// style — each checked through the real docx writer/reader where it lands in
// a file, and through pure geometry where it does not.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { importDocx } from '../src/word/docxImport'
import { exportDocx, type TipTapNode } from '../src/word/docxExport'
import {
  alignOf,
  bodySize,
  familyOf,
  findBoxes,
  groupLines,
  isBold,
  pageMargins,
  pageToHtml,
  type PdfRun
} from '../src/word/pdfLayout'

/** A run as src/design/aiBackground.ts reports it. */
function run(text: string, x: number, baseline: number, opts: Partial<PdfRun> = {}): PdfRun {
  const size = opts.size ?? 11
  return {
    text,
    dir: opts.dir ?? 'ltr',
    x,
    y: baseline - size,
    width: opts.width ?? text.length * size * 0.5,
    size,
    baselineTop: baseline,
    ...(opts.font ? { font: opts.font } : {}),
    ...(opts.color ? { color: opts.color } : {})
  }
}

async function docXml(bytes: Uint8Array, part = 'word/document.xml'): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  const file = zip.file(part)
  return file ? file.async('string') : ''
}

describe('PDF → document layout', () => {
  it('groups runs on the same baseline into one line', () => {
    const lines = groupLines([
      run('Hello', 72, 100),
      run('world', 120, 100.4),
      run('second line', 72, 118)
    ])
    expect(lines).toHaveLength(2)
    expect(lines[0].text).toBe('Hello world')
  })

  it('reads an Arabic line right-to-left', () => {
    const lines = groupLines([
      run('الشهري', 72, 100, { dir: 'rtl', width: 40 }),
      run('التقرير', 130, 100, { dir: 'rtl', width: 40 })
    ])
    expect(lines[0].text).toBe('التقرير الشهري')
    expect(lines[0].rtl).toBe(true)
  })

  it('takes the body size from the bulk of the text, not the biggest run', () => {
    const lines = groupLines([
      run('A very large title', 72, 60, { size: 24 }),
      run('a long paragraph of ordinary body text here', 72, 100),
      run('and another long line of ordinary body text', 72, 118)
    ])
    expect(bodySize(lines)).toBe(11)
  })

  it('turns sizes into headings and keeps the paragraphs flowing', () => {
    const html = pageToHtml([
      run('Monthly Report', 72, 60, { size: 20, width: 200 }),
      run('First line of the paragraph that runs to the right margin', 72, 100, { width: 440 }),
      run('and continues on the next line.', 72, 118, { width: 200 }),
      run('Sales', 72, 160, { size: 15, width: 60 })
    ])
    expect(html).toContain('<h1')
    expect(html).toContain('Monthly Report')
    expect(html).toMatch(/<p[^>]*>First line of the paragraph[^<]*continues on the next line\./)
    expect(html).toContain('<h2')
  })

  it('detects centred lines', () => {
    const column = { left: 72, right: 512 }
    const centred = groupLines([run('centred', 250, 100, { width: 84 })])[0]
    const flush = groupLines([run('flush left', 72, 100, { width: 120 })])[0]
    expect(alignOf(centred, column, false)).toBe('center')
    expect(alignOf(flush, column, false)).toBe('left')
  })

  it('rebuilds bullet and numbered lists', () => {
    const html = pageToHtml([
      run('• first point', 72, 100, { width: 120 }),
      run('• second point', 72, 120, { width: 130 }),
      run('1. step one', 72, 160, { width: 110 }),
      run('2. step two', 72, 180, { width: 110 })
    ])
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).not.toContain('• first')
    expect(html).toContain('first point')
    expect(html).toContain('step one')
  })

  it('rebuilds a column-aligned block as a table', () => {
    const html = pageToHtml([
      run('Branch', 72, 100, { width: 60 }),
      run('Sales', 260, 100, { width: 50 }),
      run('Riyadh', 72, 120, { width: 60 }),
      run('412,500', 260, 120, { width: 60 }),
      run('Jeddah', 72, 140, { width: 60 }),
      run('318,900', 260, 140, { width: 60 })
    ])
    expect(html).toContain('<table')
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html).toContain('Riyadh')
    expect(html).toContain('412,500')
  })

  it('keeps every run at the size, family, weight and colour it had', () => {
    const html = pageToHtml([
      run('ordinary body text on this page', 72, 100, { width: 300 }),
      run('more ordinary body text here', 72, 118, { width: 300 }),
      run('BIG RED TITLE', 72, 160, {
        size: 24,
        width: 260,
        font: 'ABCDEF+Cairo-Bold',
        color: '#c00000'
      })
    ])
    expect(html).toContain('font-size: 24pt')
    expect(html).toContain("font-family: 'Cairo'")
    expect(html).toContain('color: #c00000')
    expect(html).toContain('<strong>')
    // body-size runs stay clean — no pointless font-size on every paragraph
    expect(html).toMatch(/<p[^>]*>ordinary body text/)
  })

  it('reads the weight and family out of an embedded font name', () => {
    expect(familyOf('ABCDEF+Cairo-Bold')).toBe('Cairo')
    expect(familyOf('KLMNOP+TimesNewRomanPSMT')).toBe('Times New Roman')
    expect(isBold(run('x', 0, 0, { font: 'Cairo-Bold' }))).toBe(true)
    expect(isBold(run('x', 0, 0, { font: 'Cairo-Regular' }))).toBe(false)
  })

  it('places pictures in reading order, centred when the page centres them', () => {
    const html = pageToHtml(
      [
        run('above the picture', 72, 100, { width: 300 }),
        run('below the picture', 72, 400, { width: 300 })
      ],
      {
        images: [{ dataUrl: 'data:image/png;base64,AAA', x: 170, y: 200, width: 240, height: 120 }],
        page: { widthPt: 595, heightPt: 842 }
      }
    )
    const before = html.indexOf('above the picture')
    const image = html.indexOf('<img')
    const after = html.indexOf('below the picture')
    expect(before).toBeLessThan(image)
    expect(image).toBeLessThan(after)
    expect(html).toContain('width="320"') // 240pt → px
    expect(html).toContain('text-align: center')
  })

  it('recovers the page margins from where the content sits', () => {
    const margins = pageMargins(
      [run('text', 72, 100, { width: 400 })],
      [],
      { widthPt: 595.28, heightPt: 841.89 }
    )
    expect(margins.left).toBe(25) // 72pt ≈ 25mm
    expect(margins.top).toBeGreaterThan(20)
    // the empty lower half is not a margin: it mirrors the top instead
    expect(margins.bottom).toBe(margins.top)
  })

  it('draws a border only where the file draws one', () => {
    const rows: PdfRun[] = [
      run('Date', 72, 100, { width: 40 }),
      run('Amount', 300, 100, { width: 50 }),
      run('01/07', 72, 120, { width: 40 }),
      run('12,500', 300, 120, { width: 50 }),
      run('02/07', 72, 140, { width: 40 }),
      run('9,000', 300, 140, { width: 45 })
    ]
    // no rules in the file: the columns are real, the grid is not
    expect(pageToHtml(rows)).toContain('data-borderless="true"')
    // the same block, with the file drawing lines across it
    const ruled = pageToHtml(rows, {
      rules: [
        { x: 70, y: 110, width: 300, height: 0.6 },
        { x: 70, y: 130, width: 300, height: 0.6 },
        { x: 70, y: 150, width: 300, height: 0.6 }
      ]
    })
    expect(ruled).toContain('<table>')
    expect(ruled).not.toContain('borderless')
  })

  it('aligns each column the way the drawn cell boxes say', () => {
    // a bank statement's fees column: a lone dash sitting against the RIGHT
    // edge of a wide cell. Its own extents say nothing; the cell says right.
    const rows: PdfRun[] = []
    let y = 221
    for (const amount of ['32,750.000', '8,950.169', '22,000.000']) {
      rows.push(
        run('31/07/2026', 51, y, { width: 35 }),
        run('Sales draft', 121, y, { width: 32 }),
        run(amount, 386, y, { width: 34 }),
        run('-', 468, y, { width: 2 }),
        run(amount, 511, y, { width: 34 })
      )
      y += 12
    }
    const rules = [
      // the row rulings
      { x: 48, y: 215, width: 499, height: 0.6 },
      { x: 48, y: 227, width: 499, height: 0.6 },
      { x: 48, y: 239, width: 499, height: 0.6 },
      { x: 48, y: 251, width: 499, height: 0.6 },
      // the cell boundaries the file draws
      ...[48, 118, 348, 423, 473, 547].map((x) => ({ x, y: 215, width: 0.6, height: 40 }))
    ]
    const html = pageToHtml(rows, { rules })
    const cells = [...html.matchAll(/<td[^>]*><p [^>]*text-align: (\w+)[^>]*>([^<]*)</g)].map(
      (m) => `${m[2]}=${m[1]}`
    )
    expect(cells.slice(0, 5)).toEqual([
      '31/07/2026=left',
      'Sales draft=left',
      '32,750.000=right',
      '-=right',
      '32,750.000=right'
    ])
  })

  it('pulls the header line into the table it belongs to', () => {
    const html = pageToHtml([
      run('Trx Date', 72, 100, { width: 40 }),
      run('Amount', 300, 100, { width: 50 }),
      run('01/07', 72, 118, { width: 40 }),
      run('12,500', 300, 118, { width: 50 }),
      run('02/07', 72, 136, { width: 40 }),
      run('9,000', 300, 136, { width: 45 })
    ])
    // three rows: the header plus the two data lines, and no loose text above
    expect(html.match(/<tr>/g)).toHaveLength(3)
    expect(html.indexOf('Trx Date')).toBeGreaterThan(html.indexOf('<table'))
  })

  it('finds a drawn box and puts the lines inside it in one bordered cell', () => {
    const rules = [
      { x: 48, y: 200, width: 250, height: 0.6 },
      { x: 48, y: 260, width: 250, height: 0.6 },
      { x: 48, y: 200, width: 0.6, height: 60 },
      { x: 297, y: 200, width: 0.6, height: 60 }
    ]
    expect(findBoxes(rules)).toHaveLength(1)
    const html = pageToHtml(
      [
        run('Card / Account Info', 54, 215, { width: 90 }),
        run('Card Number: 519360', 54, 232, { width: 100 }),
        run('a paragraph outside the box', 54, 400, { width: 200 })
      ],
      { rules }
    )
    const table = html.slice(html.indexOf('<table'), html.indexOf('</table>'))
    expect(table).toContain('Card / Account Info')
    expect(table).toContain('Card Number')
    expect(table).not.toContain('outside the box')
  })

  it('places a picture on the side the page drew it, never the UI default', () => {
    const left = pageToHtml([run('body text here', 200, 300, { width: 200 })], {
      images: [{ dataUrl: 'data:image/png;base64,AAA', x: 50, y: 60, width: 80, height: 60 }],
      page: { widthPt: 595, heightPt: 842 }
    })
    expect(left.slice(0, left.indexOf('<img'))).toContain('text-align: left')
  })

  it('keeps a right-aligned Arabic paragraph right-aligned', () => {
    const html = pageToHtml([
      run('عنوان التقرير', 300, 60, { dir: 'rtl', size: 18, width: 212 }),
      run('نص الفقرة الأولى في المستند', 72, 100, { dir: 'rtl', width: 440 })
    ])
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('text-align: right')
  })
})

describe('page break, scripts, spacing, heading 4 and quotes in docx', () => {
  const doc = (content: TipTapNode[]): TipTapNode => ({ type: 'doc', content })

  it('writes a real page break and reads it back', async () => {
    const bytes = await exportDocx(
      doc([
        { type: 'paragraph', content: [{ type: 'text', text: 'أولى' }] },
        { type: 'pageBreak' },
        { type: 'paragraph', content: [{ type: 'text', text: 'ثانية' }] }
      ]),
      'ar'
    )
    expect(await docXml(bytes)).toContain('w:type="page"')
    expect((await importDocx(bytes)).html).toContain('data-page-break')
  })

  it('round-trips superscript and subscript', async () => {
    const bytes = await exportDocx(
      doc([
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'م' },
            { type: 'text', text: '2', marks: [{ type: 'superscript' }] },
            { type: 'text', text: 'H' },
            { type: 'text', text: '2', marks: [{ type: 'subscript' }] }
          ]
        }
      ]),
      'ar'
    )
    const xml = await docXml(bytes)
    expect(xml).toContain('w:val="superscript"')
    expect(xml).toContain('w:val="subscript"')
    const back = (await importDocx(bytes)).html
    expect(back).toContain('<sup>')
    expect(back).toContain('<sub>')
  })

  it('round-trips paragraph spacing before/after', async () => {
    const bytes = await exportDocx(
      doc([
        {
          type: 'paragraph',
          attrs: { spaceBefore: 12, spaceAfter: 6 },
          content: [{ type: 'text', text: 'فقرة' }]
        }
      ]),
      'ar'
    )
    const xml = await docXml(bytes)
    expect(xml).toContain('w:before="240"')
    expect(xml).toContain('w:after="120"')
    const back = (await importDocx(bytes)).html
    expect(back).toContain('margin-top: 12pt')
    expect(back).toContain('margin-bottom: 6pt')
  })

  it('supports a fourth heading level', async () => {
    const bytes = await exportDocx(
      doc([{ type: 'heading', attrs: { level: 4 }, content: [{ type: 'text', text: 'عنوان رابع' }] }]),
      'ar'
    )
    expect(await docXml(bytes)).toContain('Heading4')
    expect((await importDocx(bytes)).html).toContain('<h4')
  })

  it('writes a quote as an indented, ruled paragraph', async () => {
    const bytes = await exportDocx(
      doc([
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', attrs: { dir: 'rtl' }, content: [{ type: 'text', text: 'اقتباس' }] }]
        }
      ]),
      'ar'
    )
    const xml = await docXml(bytes)
    expect(xml).toContain('اقتباس')
    expect(xml).toContain('w:ind')
    // RTL quote: the rule sits on the right, the reading-start side
    expect(xml).toContain('w:right')
  })
})
