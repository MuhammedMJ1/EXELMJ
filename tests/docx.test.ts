import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { importDocx, resolveAlign } from '../src/word/docxImport'
import { alignForExport, docIsRtl, exportDocx, type TipTapNode } from '../src/word/docxExport'
import { AlignmentType } from 'docx'

const p = (text: string, attrs?: Record<string, unknown>, marks?: TipTapNode['marks']): TipTapNode => ({
  type: 'paragraph',
  ...(attrs ? { attrs } : {}),
  content: text ? [{ type: 'text', text, ...(marks ? { marks } : {}) }] : []
})

describe('OOXML bidi mapping (logical jc ⇄ physical align)', () => {
  it('resolves start/end against the paragraph direction on import', () => {
    expect(resolveAlign('start', true)).toBe('right')
    expect(resolveAlign('start', false)).toBe('left')
    expect(resolveAlign('end', true)).toBe('left')
    expect(resolveAlign('end', false)).toBe('right')
    expect(resolveAlign('center', true)).toBe('center')
    expect(resolveAlign('both', true)).toBe('justify')
    expect(resolveAlign('left', true)).toBe('left')
    expect(resolveAlign(undefined, true)).toBeUndefined()
  })

  it('maps physical editor alignment back to logical jc on export', () => {
    expect(alignForExport('right', true)).toBe(AlignmentType.START)
    expect(alignForExport('left', true)).toBe(AlignmentType.END)
    expect(alignForExport('right', false)).toBe(AlignmentType.END)
    expect(alignForExport('left', false)).toBe(AlignmentType.START)
    expect(alignForExport('center', true)).toBe(AlignmentType.CENTER)
    expect(alignForExport('justify', false)).toBe(AlignmentType.JUSTIFIED)
    // an unset alignment in an RTL paragraph still gets an explicit START —
    // bidirectional alone leaves text stuck left in Word (docx#3419)
    expect(alignForExport(undefined, true)).toBe(AlignmentType.START)
    expect(alignForExport(undefined, false)).toBeUndefined()
  })

  it('votes the document base direction from paragraph dirs', () => {
    const doc: TipTapNode = { type: 'doc', content: [p('سلام', { dir: 'rtl' }), p('hi', { dir: 'ltr' }), p('عربي', { dir: 'rtl' })] }
    expect(docIsRtl(doc, 'en')).toBe(true)
    expect(docIsRtl({ type: 'doc', content: [p('hello')] }, 'ar')).toBe(true)
    expect(docIsRtl({ type: 'doc', content: [p('hello')] }, 'en')).toBe(false)
  })
})

describe('docx round trip (export → import)', () => {
  it('keeps Arabic text, direction, alignment, marks, headings, lists and tables', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1, dir: 'rtl', textAlign: 'center' }, content: [{ type: 'text', text: 'تقرير الزيارة' }] },
        p('حسن حامد صالح', { dir: 'rtl', textAlign: 'right' }, [{ type: 'bold' }]),
        p('نص مائل', { dir: 'rtl' }, [{ type: 'italic' }]),
        p('ملون', { dir: 'rtl' }, [{ type: 'textStyle', attrs: { color: '#ff0000', fontSize: '14pt', fontFamily: 'Arial' } }]),
        p('English left', { dir: 'ltr', textAlign: 'left' }),
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [p('بند أول', { dir: 'rtl' })] },
            { type: 'listItem', content: [p('بند ثاني', { dir: 'rtl' })] }
          ]
        },
        {
          type: 'orderedList',
          content: [{ type: 'listItem', content: [p('مرقم', { dir: 'rtl' })] }]
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: {}, content: [p('خلية ١', { dir: 'rtl' })] },
                { type: 'tableCell', attrs: {}, content: [p('خلية ٢', { dir: 'rtl' })] }
              ]
            }
          ]
        }
      ]
    }

    const bytes = await exportDocx(doc, 'ar')
    expect(bytes.length).toBeGreaterThan(1000)

    // The produced OOXML itself carries the Arabic-critical bits.
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:bidi/>')
    expect(xml).toContain('w:val="start"')
    expect(xml).toContain('<w:rtl/>')
    expect(xml).toContain('w:bCs')

    const { html } = await importDocx(bytes)
    expect(html).toContain('تقرير الزيارة')
    expect(html).toContain('<h1')
    expect(html).toContain('text-align: center')
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('<strong>حسن حامد صالح</strong>')
    expect(html).toContain('<em>نص مائل</em>')
    expect(html).toContain('color: #ff0000')
    expect(html).toContain('font-size: 14pt')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('بند أول')
    expect(html).toContain('<table>')
    expect(html).toContain('خلية ١')
    // the explicitly LTR English paragraph must NOT come back right-aligned
    expect(html).toMatch(/<p[^>]*>English left<\/p>|<p[^>]*style="text-align: left"[^>]*>English left/)
  })

  it('exports nested lists with their OWN kind and round-trips them', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                p('بند مرقم', { dir: 'rtl' }),
                { type: 'bulletList', content: [{ type: 'listItem', content: [p('نقطة داخلية', { dir: 'rtl' })] }] }
              ]
            }
          ]
        }
      ]
    }
    const bytes = await exportDocx(doc, 'ar')
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    const numberingXml = await zip.file('word/numbering.xml')!.async('string')
    // both list kinds exist in numbering.xml, and the two paragraphs reference
    // DIFFERENT concrete lists (the nested bullet must not inherit numbering)
    expect(numberingXml).toContain('w:val="decimal"')
    expect(numberingXml).toContain('w:val="bullet"')
    const numIdOf = (text: string) => {
      const start = xml.indexOf(text)
      const before = xml.slice(Math.max(0, start - 800), start)
      // the LAST numId before the text belongs to that paragraph
      const all = [...before.matchAll(/w:numId w:val="(\d+)"/g)]
      return all.at(-1)?.[1]
    }
    const numbered = numIdOf('بند مرقم')
    const bulleted = numIdOf('نقطة داخلية')
    expect(numbered).toBeTruthy()
    expect(bulleted).toBeTruthy()
    expect(numbered).not.toBe(bulleted)
    const { html } = await importDocx(bytes)
    expect(html).toContain('بند مرقم')
    expect(html).toContain('نقطة داخلية')
  })

  it('round-trips a merged (rowspan) table cell through vMerge', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', attrs: { rowspan: 2 }, content: [p('ممتد', { dir: 'rtl' })] },
                { type: 'tableCell', attrs: {}, content: [p('أ', { dir: 'rtl' })] }
              ]
            },
            { type: 'tableRow', content: [{ type: 'tableCell', attrs: {}, content: [p('ب', { dir: 'rtl' })] }] }
          ]
        }
      ]
    }
    const bytes = await exportDocx(doc, 'ar')
    const zip = await JSZip.loadAsync(bytes)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('w:vMerge')
    const { html } = await importDocx(bytes)
    expect(html).toContain('rowspan="2"')
  })

  it('round-trips hyperlinks through ExternalHyperlink', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        p('زر موقعنا', { dir: 'rtl' }, [{ type: 'link', attrs: { href: 'https://example.org/x' } }])
      ]
    }
    const bytes = await exportDocx(doc, 'ar')
    const { html } = await importDocx(bytes)
    expect(html).toContain('href="https://example.org/x"')
    expect(html).toContain('زر موقعنا')
  })

  it('round-trips alignment without flipping sides (the classic RTL bug)', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [p('يمين', { dir: 'rtl', textAlign: 'right' }), p('يسار مقصود', { dir: 'rtl', textAlign: 'left' })]
    }
    const bytes = await exportDocx(doc, 'ar')
    const { html } = await importDocx(bytes)
    // right-aligned stays right (jc=start under bidi), left stays left (jc=end)
    const first = html.indexOf('يمين')
    const second = html.indexOf('يسار مقصود')
    const между = html.slice(0, first)
    expect(между).toContain('text-align: right')
    expect(html.slice(first, second)).toContain('text-align: left')
  })
})

describe('docx import from foreign files', () => {
  /** Hand-built minimal docx (as Word writes it) to test import alone. */
  async function makeDocx(documentXml: string, stylesXml?: string): Promise<Uint8Array> {
    const zip = new JSZip()
    zip.file(
      '[Content_Types].xml',
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
    )
    zip.file(
      '_rels/.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
    )
    zip.file('word/document.xml', documentXml)
    if (stylesXml) zip.file('word/styles.xml', stylesXml)
    return zip.generateAsync({ type: 'uint8array' })
  }

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'

  it('reads direction from styles.xml docDefaults (Arabic docs often carry it there)', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>فقرة بلا خصائص</w:t></w:r></w:p></w:body></w:document>`,
      `<?xml version="1.0"?><w:styles ${W}><w:docDefaults><w:pPrDefault><w:pPr><w:bidi/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`
    )
    const { html } = await importDocx(bytes)
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('فقرة بلا خصائص')
  })

  it('resolves legacy physical jc=right and keeps complex-script bold', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:bCs/><w:szCs w:val="28"/></w:rPr><w:t>عريض بالمرآة</w:t></w:r></w:p></w:body></w:document>`
    )
    const { html } = await importDocx(bytes)
    expect(html).toContain('text-align: right')
    expect(html).toContain('<strong>')
    expect(html).toContain('font-size: 14pt')
  })

  it('keeps hyperlink text AND its URL in a mixed paragraph (order preserved)', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body><w:p><w:r><w:t xml:space="preserve">للتفاصيل راجع </w:t></w:r><w:hyperlink r:id="rId9"><w:r><w:t>موقعنا</w:t></w:r></w:hyperlink><w:r><w:t xml:space="preserve"> اليوم</w:t></w:r></w:p></w:body></w:document>`
    )
    const zip = await JSZip.loadAsync(bytes)
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/page" TargetMode="External"/></Relationships>`
    )
    const withRels = await zip.generateAsync({ type: 'uint8array' })
    const { html } = await importDocx(withRels)
    expect(html).toContain('للتفاصيل راجع ')
    expect(html).toContain('موقعنا')
    expect(html).toContain(' اليوم')
    expect(html).toContain('href="https://example.com/page"')
    expect(html.indexOf('للتفاصيل')).toBeLessThan(html.indexOf('موقعنا'))
    expect(html.indexOf('موقعنا')).toBeLessThan(html.indexOf('اليوم'))
  })

  it('keeps tracked-change insertions (w:ins) instead of dropping them', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:ins><w:r><w:t>نص مُدرج</w:t></w:r></w:ins></w:p></w:body></w:document>`
    )
    const { html } = await importDocx(bytes)
    expect(html).toContain('نص مُدرج')
  })

  it('maps kashida justification to justify', async () => {
    expect(resolveAlign('mediumKashida', true)).toBe('justify')
    expect(resolveAlign('highKashida', true)).toBe('justify')
    expect(resolveAlign('lowKashida', true)).toBe('justify')
  })

  it('never lets file content escape into HTML attributes', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:rPr><w:color w:val="ff0000&quot;&gt;&lt;img src=x&gt;"/><w:rFonts w:cs="Arial&quot; onmouseover=&quot;x"/><w:highlight w:val="&quot;&gt;&lt;svg&gt;"/></w:rPr><w:t>نص</w:t></w:r></w:p></w:body></w:document>`
    )
    const { html } = await importDocx(bytes)
    expect(html).not.toContain('<img')
    expect(html).not.toContain('<svg')
    // stripped of quotes/equals, the payload can no longer form an attribute
    expect(html).not.toMatch(/onmouseover=/)
    expect(html).toContain('نص')
  })

  it('treats OnOff "off" as disabled bold', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:rPr><w:b w:val="off"/></w:rPr><w:t>عادي</w:t></w:r></w:p></w:body></w:document>`
    )
    const { html } = await importDocx(bytes)
    expect(html).not.toContain('<strong>')
  })

  it('turns vMerge into real rowspans and skips continuation cells', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:tbl>` +
        `<w:tr><w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>ممتد</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>أ</w:t></w:r></w:p></w:tc></w:tr>` +
        `<w:tr><w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p></w:p></w:tc><w:tc><w:p><w:r><w:t>ب</w:t></w:r></w:p></w:tc></w:tr>` +
        `</w:tbl></w:body></w:document>`
    )
    const { html } = await importDocx(bytes)
    expect(html).toContain('rowspan="2"')
    const secondRow = html.slice(html.indexOf('</tr>') + 5)
    expect((secondRow.match(/<td/g) ?? []).length).toBe(1)
  })

  it('nests imported multi-level lists by ilvl', async () => {
    const numbering =
      `<?xml version="1.0"?><w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`
    const p = (ilvl: number, text: string) =>
      `<w:p><w:pPr><w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body>${p(0, 'أب')}${p(1, 'ابن')}${p(0, 'أب ثاني')}</w:body></w:document>`
    )
    const zip = await JSZip.loadAsync(bytes)
    zip.file('word/numbering.xml', numbering)
    const withNum = await zip.generateAsync({ type: 'uint8array' })
    const { html } = await importDocx(withNum)
    // the child list must live INSIDE the first item's li
    expect(html).toMatch(/<li><p[^>]*>أب<\/p><ul><li><p[^>]*>ابن<\/p><\/li><\/ul><\/li>/)
    expect(html).toContain('أب ثاني')
  })

  it('keeps leading zeros in phone numbers (no numeric coercion)', async () => {
    const bytes = await makeDocx(
      `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>07717835312</w:t></w:r></w:p></w:body></w:document>`
    )
    const { html } = await importDocx(bytes)
    expect(html).toContain('07717835312')
  })

  // Plain-text headers are IMPORTED now (page.header), so they must not warn —
  // only a header carrying something the model cannot hold still does.
  it('keeps a plain-text header without warning, and warns about a rich one', async () => {
    const build = async (headerBody: string) => {
      const zipBytes = await makeDocx(
        `<?xml version="1.0"?><w:document ${W}><w:body><w:p><w:r><w:t>نص</w:t></w:r></w:p>` +
          `<w:sectPr><w:headerReference w:type="default" r:id="rIdH"/></w:sectPr></w:body></w:document>`
      )
      const zip = await JSZip.loadAsync(zipBytes)
      zip.file('word/header1.xml', `<?xml version="1.0"?><w:hdr ${W}>${headerBody}</w:hdr>`)
      zip.file(
        'word/_rels/document.xml.rels',
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rIdH" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>` +
          `</Relationships>`
      )
      return importDocx(await zip.generateAsync({ type: 'uint8array' }))
    }

    const plain = await build('<w:p><w:r><w:t>شركة الأمل</w:t></w:r></w:p>')
    expect(plain.warnings).not.toContain('headers')
    expect(plain.page?.header).toBe('شركة الأمل')

    const rich = await build('<w:p><w:r><w:drawing/></w:r></w:p>')
    expect(rich.warnings).toContain('headers')
  })
})
