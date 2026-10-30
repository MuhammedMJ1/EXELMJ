// A table that runs over a page break must carry its column titles onto the
// next page — in Chromium's print output and in the exported Word file alike.
// Two different mechanisms, one behaviour, so both are checked here.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { buildDocPrintHtml, promoteHeaderRows } from '../src/word/printDoc'
import { exportDocx, type TipTapNode } from '../src/word/docxExport'
import { pageAt, pageStarts } from '../src/word/pageSetup'

const cell = (type: 'tableCell' | 'tableHeader', text: string): TipTapNode => ({
  type,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
})

describe('promoteHeaderRows', () => {
  it('lifts a leading all-th row out of the tbody', () => {
    const html = '<table><tbody><tr><th>م</th><th>البيان</th></tr><tr><td>1</td><td>قلم</td></tr></tbody></table>'
    expect(promoteHeaderRows(html)).toBe(
      '<table><thead><tr><th>م</th><th>البيان</th></tr></thead>' +
        '<tbody><tr><td>1</td><td>قلم</td></tr></tbody></table>'
    )
  })

  it('keeps the colgroup the editor writes ahead of the header', () => {
    const html =
      '<table><colgroup><col style="width: 40px"></colgroup><tbody>' +
      '<tr><th colspan="2">عنوان</th></tr><tr><td>أ</td><td>ب</td></tr></tbody></table>'
    const out = promoteHeaderRows(html)
    expect(out).toContain('<colgroup><col style="width: 40px"></colgroup><thead>')
    expect(out.indexOf('<thead>')).toBeLessThan(out.indexOf('<tbody>'))
  })

  it('leaves a table whose first row is data alone', () => {
    const html = '<table><tbody><tr><td>1</td></tr><tr><th>غريب</th></tr></tbody></table>'
    expect(promoteHeaderRows(html)).toBe(html)
  })

  it('leaves a mixed th/td first row alone — Word would not repeat it either', () => {
    const html = '<table><tbody><tr><th>م</th><td>البيان</td></tr></tbody></table>'
    expect(promoteHeaderRows(html)).toBe(html)
  })

  it('does not double-wrap a table that already has a thead', () => {
    const html = '<table><thead><tr><th>م</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>'
    expect(promoteHeaderRows(html)).toBe(html)
  })

  it('handles every table in the document, and the text between them', () => {
    const one = '<table><tbody><tr><th>أ</th></tr></tbody></table>'
    const out = promoteHeaderRows(`<p>قبل</p>${one}<p>بين</p>${one}<p>بعد</p>`)
    expect(out.match(/<thead>/g)?.length).toBe(2)
    expect(out).toContain('<p>بين</p>')
    expect(out).toContain('<p>بعد</p>')
  })

  it('passes a document with no table through untouched', () => {
    expect(promoteHeaderRows('<p>لا جدول هنا</p>')).toBe('<p>لا جدول هنا</p>')
  })
})

describe('print html', () => {
  it('asks the browser to repeat the header row group', () => {
    const html = buildDocPrintHtml('<p>نص</p>', true)
    expect(html).toContain('thead { display: table-header-group; }')
  })

  it('promotes the header row of the printed document', () => {
    const html = buildDocPrintHtml(
      '<table><tbody><tr><th>التاريخ</th></tr><tr><td>2026</td></tr></tbody></table>',
      true
    )
    expect(html).toContain('<thead><tr><th>التاريخ</th></tr></thead>')
  })
})

describe('docx export', () => {
  it('flags the header row so Word repeats it on every page', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [cell('tableHeader', 'م'), cell('tableHeader', 'المبلغ')] },
            { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '500')] }
          ]
        }
      ]
    }
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('w:tblHeader')
    // exactly once: the data row must not claim to be a header too
    expect(xml.match(/w:tblHeader/g)!.length).toBe(1)
  })

  it('writes no tblHeader when the table has no header row', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [{ type: 'tableRow', content: [cell('tableCell', 'أ'), cell('tableCell', 'ب')] }]
        }
      ]
    }
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).not.toContain('w:tblHeader')
  })
})

describe('page counting', () => {
  /** A stand-in for a laid-out block: only offsetTop/offsetHeight are read. */
  const block = (top: number, height: number, manual = false) =>
    ({
      offsetTop: top,
      offsetHeight: height,
      hasAttribute: (name: string) => manual && name === 'data-page-break'
    }) as unknown as HTMLElement

  it('counts a manual page break as a new page even when the text is short', () => {
    // three one-line letters separated by breaks: three pages, not one
    const starts = pageStarts(
      [block(0, 20), block(30, 4, true), block(40, 20), block(70, 4, true), block(80, 20)],
      900
    )
    expect(starts.length).toBe(3)
    expect(starts[1].manual).toBe(true)
  })

  it('still counts pages by height when there is no break', () => {
    expect(pageStarts([block(0, 2500)], 1000).length).toBe(3)
  })

  it('puts the caret on the page its offset falls in', () => {
    const starts = pageStarts([block(0, 20), block(30, 4, true), block(40, 20)], 900)
    expect(pageAt(starts, 0)).toBe(1)
    expect(pageAt(starts, 45)).toBe(2)
  })

  it('reports one page for an empty document', () => {
    expect(pageStarts([], 900).length).toBe(1)
  })
})
