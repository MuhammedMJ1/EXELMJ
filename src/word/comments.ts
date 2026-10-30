// Comments — تعليقات: a note pinned to a range of text, with replies, the way
// a memo or a set of minutes gets reviewed before it goes out.
//
// The anchoring is a mark on the text (see @sereneinserenade/tiptap-comment-
// extension); this file owns everything else — the threads themselves, their
// order down the page, and the trip through .docx so a reviewer can open the
// file in Word and see the same notes.

export interface CommentReply {
  author: string
  /** ISO timestamp; stored as text so it survives a JSON round trip. */
  created: string
  text: string
}

export interface CommentThread extends CommentReply {
  id: string
  resolved: boolean
  replies: CommentReply[]
}

/** A thread plus where its anchor sits, for ordering the gutter. */
export interface AnchoredThread {
  thread: CommentThread
  /** Document position of the first character the comment covers. */
  pos: number
  /** Pixel offset of the anchor inside the editor, for lining the card up. */
  top: number
}

export function newThreadId(seed: number): string {
  // Date.now() collides when two comments are added in the same millisecond,
  // and a collision silently merges two threads into one.
  return `c${seed.toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function makeThread(id: string, author: string, text: string, created: string): CommentThread {
  return { id, author, text, created, resolved: false, replies: [] }
}

/** Threads in the order their anchors appear down the page. */
export function orderThreads(anchored: AnchoredThread[]): AnchoredThread[] {
  return [...anchored].sort((a, b) => a.top - b.top || a.pos - b.pos)
}

/** Cards must not overlap: each one starts at or below the previous card's end. */
export function stackTops(tops: number[], heights: number[], gap = 8): number[] {
  const out: number[] = []
  let floor = 0
  for (let i = 0; i < tops.length; i++) {
    const top = Math.max(tops[i], floor)
    out.push(top)
    floor = top + (heights[i] ?? 0) + gap
  }
  return out
}

/** A short, human date for the card header. */
export function shortDate(iso: string, lang: 'ar' | 'en'): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Threads → the comments Word stores. Word keeps every reply as its own
 * comment and ties it to its parent, so a thread stays a thread when the file
 * is opened there — the numeric ids it wants are handed back alongside, since
 * the anchors in the document body must use exactly the same numbering.
 */
export interface FlatComment {
  id: number
  /** The comment this one replies to, for a real thread in Word. */
  parentId?: number
  author: string
  initials: string
  date: string
  resolved?: boolean
  text: string
}

export function docxComments(threads: CommentThread[]): {
  comments: FlatComment[]
  ids: Map<string, number>
} {
  const comments: FlatComment[] = []
  const ids = new Map<string, number>()
  let next = 0
  for (const thread of threads) {
    const parentId = next++
    ids.set(thread.id, parentId)
    comments.push({
      id: parentId,
      author: thread.author || '—',
      initials: initialsOf(thread.author),
      date: isoOrNow(thread.created),
      resolved: thread.resolved || undefined,
      text: thread.text
    })
    for (const reply of thread.replies) {
      comments.push({
        id: next++,
        parentId,
        author: reply.author || '—',
        initials: initialsOf(reply.author),
        date: isoOrNow(reply.created),
        text: reply.text
      })
    }
  }
  return { comments, ids }
}

export function initialsOf(author: string): string {
  const parts = author.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '؟'
  return parts
    .slice(0, 2)
    .map((part) => [...part][0])
    .join('')
}

function isoOrNow(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}
