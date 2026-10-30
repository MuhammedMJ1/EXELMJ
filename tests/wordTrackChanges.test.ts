// Track changes: an edit made in suggestion mode is a Word revision, so the
// person who receives the file gets real Accept/Reject buttons there.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportDocx, type TipTapNode } from '../src/word/docxExport'
import { importDocx } from '../src/word/docxImport'

const tracked = (text: string, kind: 'insertion' | 'deletion'): TipTapNode => ({
  type: 'text',
  text,
  marks: [
    {
      type: kind,
      attrs: {
        changeId: 'c1',
        authorName: 'محمد جاسم',
        timestamp: '2026-08-19T09:00:00.000Z'
      }
    }
  ]
})

const doc: TipTapNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      attrs: { dir: 'rtl' },
      content: [
        { type: 'text', text: 'المبلغ ' },
        tracked('المقترح', 'insertion'),
        { type: 'text', text: ' بدل ' },
        tracked('القديم', 'deletion')
      ]
    }
  ]
}

describe('export', () => {
  it('writes insertions and deletions as Word revisions', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('<w:ins ')
    expect(xml).toContain('<w:del ')
    // the deleted text uses delText, or Word shows it as normal text
    expect(xml).toContain('w:delText')
    expect(xml).toContain('محمد جاسم')
  })

  it('gives every revision its own id', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    const xml = await zip.file('word/document.xml')!.async('string')
    const ids = [...xml.matchAll(/w:id="(\d+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('leaves an untracked document without revisions', async () => {
    const plain: TipTapNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص عادي' }] }]
    }
    const zip = await JSZip.loadAsync(await exportDocx(plain, 'ar'))
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).not.toContain('<w:ins ')
    expect(xml).not.toContain('<w:del ')
  })
})

describe('import', () => {
  it('brings revisions back as tracked changes, not as plain text', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    expect(back.html).toContain('<ins')
    expect(back.html).toContain('<del')
    expect(back.html).toContain('data-change-id')
    expect(back.html).toContain('محمد جاسم')
    // the deleted words must survive the trip — they are the "before"
    expect(back.html).toContain('القديم')
  })

  it('keeps the author and the date on the mark', async () => {
    const back = await importDocx(await exportDocx(doc, 'ar'))
    // bare names: TipTap's default attribute parser reads getAttribute(name)
    expect(back.html).toMatch(/ authorName="محمد جاسم"/i)
    expect(back.html).toMatch(/ timestamp="20\d\d-/i)
    expect(back.html).toMatch(/ changeId="/i)
  })
})
