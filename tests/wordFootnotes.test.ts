// Footnotes: the reference in the text and the note itself must both survive
// the trip into Word — a numbered note that loses its number is worse than none.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportDocx, type TipTapNode } from '../src/word/docxExport'
import { importDocx } from '../src/word/docxImport'

const doc: TipTapNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { dir: 'rtl' },
      content: [
        { type: 'text', text: 'حسب النظام المالي' },
        { type: 'footnoteReference', attrs: { 'data-id': 'a1', referenceNumber: '1' } },
        { type: 'text', text: ' يُصرف المبلغ' },
        { type: 'footnoteReference', attrs: { 'data-id': 'a2', referenceNumber: '2' } }
      ]
    },
    {
      type: 'footnotes',
      content: [
        {
          type: 'footnote',
          attrs: { 'data-id': 'a1' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'المادة الثالثة من النظام' }] }]
        },
        {
          type: 'footnote',
          attrs: { 'data-id': 'a2' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'بعد موافقة المدير المالي' }] }]
        }
      ]
    }
  ]
}

describe('export', () => {
  it('writes real Word footnotes with their references', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).toContain('w:footnoteReference')
    const notes = await zip.file('word/footnotes.xml')!.async('string')
    expect(notes).toContain('المادة الثالثة من النظام')
    expect(notes).toContain('بعد موافقة المدير المالي')
  })

  it('keeps the note list out of the page body', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).not.toContain('المادة الثالثة من النظام')
  })

  it('drops a reference that has no note behind it', async () => {
    const orphan: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'نص' },
            { type: 'footnoteReference', attrs: { 'data-id': 'gone' } }
          ]
        }
      ]
    }
    const zip = await JSZip.loadAsync(await exportDocx(orphan, 'ar'))
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).not.toContain('w:footnoteReference')
  })
})

describe('import', () => {
  it('reads the notes back, numbered in order', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    expect(back.html).toContain('class="footnotes"')
    expect(back.html).toContain('المادة الثالثة من النظام')
    expect(back.html).toContain('data-reference-number="1"')
    expect(back.html).toContain('data-reference-number="2"')
  })

  it('never numbers Word\u2019s separator entries', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    const items = back.html.match(/<li id="fn:\d+"/g) ?? []
    expect(items.length).toBe(2)
  })

  it('no longer warns that footnotes are lost', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    expect(back.warnings).not.toContain('footnotes')
  })
})

describe('the shape the editor demands', () => {
  it('gives every note BOTH required attributes', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    // the footnote node declares id and data-id isRequired: missing either one
    // makes ProseMirror reject the document and the file will not open at all
    expect(back.html).toMatch(/<li id="fn:1" data-id="fn-1">/)
    expect(back.html).toMatch(/<li id="fn:2" data-id="fn-2">/)
  })

  it('points each reference at its own note', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    expect(back.html).toContain('href="#fn:1"')
    expect(back.html).toContain('data-id="fn-1"')
  })
})
