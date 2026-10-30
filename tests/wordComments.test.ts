// Comments: notes pinned to a range of text, with replies, that survive the
// trip into Word — a memo that circulates for review is the whole point.
import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import {
  docxComments,
  initialsOf,
  makeThread,
  newThreadId,
  orderThreads,
  shortDate,
  stackTops,
  type CommentThread
} from '../src/word/comments'
import { exportDocx, type TipTapNode } from '../src/word/docxExport'
import { importDocx } from '../src/word/docxImport'

const thread = (id: string, text: string, replies: string[] = []): CommentThread => ({
  ...makeThread(id, 'محمد جاسم', text, '2026-08-19T10:00:00.000Z'),
  replies: replies.map((r) => ({ author: 'سارة', created: '2026-08-19T11:00:00.000Z', text: r }))
})

describe('threads', () => {
  it('makes ids that do not collide inside one millisecond', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newThreadId(1)))
    expect(ids.size).toBe(200)
  })

  it('orders the cards the way the anchors run down the page', () => {
    const a = { thread: thread('a', 'أ'), pos: 90, top: 300 }
    const b = { thread: thread('b', 'ب'), pos: 10, top: 100 }
    expect(orderThreads([a, b]).map((x) => x.thread.id)).toEqual(['b', 'a'])
  })

  it('stops the cards overlapping each other', () => {
    // three anchors almost on the same line, cards 60px tall
    expect(stackTops([100, 110, 120], [60, 60, 60])).toEqual([100, 168, 236])
  })

  it('keeps a card at its anchor when there is room', () => {
    expect(stackTops([100, 400], [60, 60])).toEqual([100, 400])
  })

  it('takes initials from an Arabic name', () => {
    expect(initialsOf('محمد جاسم')).toBe('مج')
    expect(initialsOf('  ')).toBe('؟')
  })

  it('shows a readable date, and nothing for a broken one', () => {
    expect(shortDate('2026-08-19T10:00:00.000Z', 'en')).toContain('2026')
    expect(shortDate('not a date', 'ar')).toBe('')
  })
})

describe('docx numbering', () => {
  it('gives every comment and reply its own id, replies pointing at the parent', () => {
    const { comments, ids } = docxComments([thread('t1', 'ملاحظة', ['رد أول', 'رد ثانٍ']), thread('t2', 'أخرى')])
    expect(comments.map((c) => c.id)).toEqual([0, 1, 2, 3])
    expect(comments[1].parentId).toBe(0)
    expect(comments[2].parentId).toBe(0)
    expect(comments[3].parentId).toBeUndefined()
    // the anchors in the body must use the parent's id
    expect(ids.get('t1')).toBe(0)
    expect(ids.get('t2')).toBe(3)
  })

  it('marks a resolved thread resolved', () => {
    const resolved: CommentThread = { ...thread('t1', 'تمت'), resolved: true }
    expect(docxComments([resolved]).comments[0].resolved).toBe(true)
  })
})

describe('docx export', () => {
  const doc: TipTapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'قبل ' },
          { type: 'text', text: 'النص المعلَّق', marks: [{ type: 'comment', attrs: { commentId: 't1' } }] },
          { type: 'text', text: ' بعد' }
        ]
      }
    ]
  }

  it('writes a real Word comment with its anchor', async () => {
    const bytes = await exportDocx(doc, 'ar', { comments: [thread('t1', 'يرجى المراجعة', ['تم'])] })
    const zip = await JSZip.loadAsync(bytes)
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).toContain('commentRangeStart')
    expect(body).toContain('commentRangeEnd')
    const comments = await zip.file('word/comments.xml')!.async('string')
    expect(comments).toContain('يرجى المراجعة')
    expect(comments).toContain('تم')
    expect(comments).toContain('محمد جاسم')
  })

  it('writes no comment and no anchor when there are none', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(doc, 'ar'))
    // the library always emits the part; what matters is that it is empty
    const comments = await zip.file('word/comments.xml')!.async('string')
    expect(comments).not.toContain('<w:comment ')
    const body = await zip.file('word/document.xml')!.async('string')
    expect(body).not.toContain('commentRangeStart')
  })

  it('does not anchor a comment whose thread was deleted', async () => {
    const bytes = await exportDocx(doc, 'ar', { comments: [thread('other', 'ملاحظة')] })
    const body = await JSZip.loadAsync(bytes).then((z) => z.file('word/document.xml')!.async('string'))
    expect(body).not.toContain('commentRangeStart')
    expect(body).toContain('النص المعلَّق')
  })
})

describe('round trip', () => {
  it('reads its own comments back after a save', async () => {
    const doc: TipTapNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'بند ' },
            { type: 'text', text: 'يحتاج مراجعة', marks: [{ type: 'comment', attrs: { commentId: 't1' } }] }
          ]
        }
      ]
    }
    const bytes = await exportDocx(doc, 'ar', { comments: [thread('t1', 'يرجى التأكد من المبلغ', ['تم التأكد'])] })
    const back = await importDocx(bytes)
    expect(back.comments?.length).toBeGreaterThanOrEqual(1)
    expect(back.comments![0].text).toBe('يرجى التأكد من المبلغ')
    expect(back.comments![0].author).toBe('محمد جاسم')
    // the anchor comes back as a mark whose id is the thread's own id —
    // a mismatch here shows no card at all
    const id = back.comments![0].id
    expect(back.html).toContain(`data-comment-id="${id}"`)
    expect(back.html).toContain('يحتاج مراجعة')
  })

  it('brings nothing back from a file without comments', async () => {
    const doc: TipTapNode = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'نص' }] }] }
    const back = await importDocx(await exportDocx(doc, 'ar'))
    expect(back.comments).toBeUndefined()
    expect(back.html).not.toContain('data-comment-id')
  })
})
