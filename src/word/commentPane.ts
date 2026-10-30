// The comment gutter: cards in the page margin, each lined up with the text it
// is pinned to.
//
// The side matters. Word puts the balloons in the margin the text does NOT
// start from — the left one for an Arabic document — and putting them on the
// wrong side is the tell that a program was translated rather than built for
// Arabic.
import { t } from '../i18n/i18n'
import {
  orderThreads,
  shortDate,
  stackTops,
  type AnchoredThread,
  type CommentThread
} from './comments'

export interface CommentPaneHooks {
  activate(id: string): void
  reply(id: string): void
  resolve(id: string): void
  remove(id: string): void
  edit(id: string): void
}

export class CommentPane {
  readonly element: HTMLElement
  private activeId: string | null = null
  private lang: 'ar' | 'en' = 'ar'

  constructor(private hooks: CommentPaneHooks) {
    injectCss()
    this.element = document.createElement('div')
    this.element.id = 'exelmj-comment-pane'
    this.element.style.display = 'none'
  }

  setLang(lang: 'ar' | 'en') {
    this.lang = lang
  }

  setActive(id: string | null) {
    if (this.activeId === id) return
    this.activeId = id
    for (const card of this.element.querySelectorAll<HTMLElement>('.exelmj-comment-card')) {
      card.classList.toggle('active', card.dataset.id === id)
    }
  }

  /** Draw the cards for the threads that still have an anchor in the text. */
  render(anchored: AnchoredThread[], showResolved: boolean) {
    const visible = orderThreads(anchored).filter(
      (item) => showResolved || !item.thread.resolved
    )
    this.element.innerHTML = ''
    this.element.style.display = visible.length ? '' : 'none'
    if (!visible.length) return

    const cards = visible.map((item) => this.card(item.thread))
    for (const card of cards) this.element.append(card)
    // measure first, then place: a card's height depends on its text
    const heights = cards.map((card) => card.offsetHeight)
    const tops = stackTops(
      visible.map((item) => item.top),
      heights
    )
    cards.forEach((card, index) => {
      card.style.top = `${tops[index]}px`
    })
  }

  private card(thread: CommentThread): HTMLElement {
    const card = document.createElement('div')
    card.className = 'exelmj-comment-card'
    if (thread.resolved) card.classList.add('resolved')
    if (thread.id === this.activeId) card.classList.add('active')
    card.dataset.id = thread.id
    card.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button')) return
      this.hooks.activate(thread.id)
    })

    card.append(this.entry(thread.author, thread.created, thread.text))
    for (const reply of thread.replies) {
      const node = this.entry(reply.author, reply.created, reply.text)
      node.classList.add('reply')
      card.append(node)
    }

    const actions = document.createElement('div')
    actions.className = 'exelmj-comment-actions'
    const mk = (label: string, run: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.textContent = label
      b.addEventListener('click', run)
      actions.append(b)
    }
    mk(t('wordCommentReply'), () => this.hooks.reply(thread.id))
    mk(thread.resolved ? t('wordCommentReopen') : t('wordCommentResolve'), () =>
      this.hooks.resolve(thread.id)
    )
    mk(t('wordCommentEdit'), () => this.hooks.edit(thread.id))
    mk(t('wordCommentDelete'), () => this.hooks.remove(thread.id))
    card.append(actions)
    return card
  }

  private entry(author: string, created: string, text: string): HTMLElement {
    const wrap = document.createElement('div')
    wrap.className = 'exelmj-comment-entry'
    const head = document.createElement('div')
    head.className = 'exelmj-comment-head'
    const who = document.createElement('span')
    who.className = 'who'
    who.textContent = author || '—'
    const when = document.createElement('span')
    when.className = 'when'
    when.textContent = shortDate(created, this.lang)
    head.append(who, when)
    const body = document.createElement('div')
    body.className = 'exelmj-comment-text'
    body.textContent = text
    wrap.append(head, body)
    return wrap
  }
}

function injectCss() {
  if (document.getElementById('exelmj-comment-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-comment-style'
  style.textContent = `
#exelmj-comment-pane {
  position: absolute; top: 0; width: 250px; pointer-events: none;
}
.exelmj-comment-card {
  position: absolute; inset-inline-start: 0; width: 236px; pointer-events: auto;
  background: #fffdf5; border: 1px solid #e6dcc0; border-inline-start: 3px solid #e0a800;
  border-radius: 6px; padding: 8px 10px; box-shadow: 0 1px 4px rgba(16, 24, 40, 0.10);
  font-size: 12px; color: #344054; cursor: pointer; transition: box-shadow 0.12s, top 0.12s;
}
.exelmj-comment-card.active {
  border-inline-start-color: #185abd; box-shadow: 0 2px 10px rgba(24, 90, 189, 0.22);
}
.exelmj-comment-card.resolved { opacity: 0.55; border-inline-start-color: #98a2b3; }
.exelmj-comment-entry + .exelmj-comment-entry { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e6dcc0; }
.exelmj-comment-entry.reply { margin-inline-start: 10px; }
.exelmj-comment-head { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
.exelmj-comment-head .who { font-weight: 600; color: #101828; }
.exelmj-comment-head .when { font-size: 10px; color: #98a2b3; }
.exelmj-comment-text { white-space: pre-wrap; margin-top: 2px; }
.exelmj-comment-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.exelmj-comment-actions button {
  border: 1px solid #e4e7ec; background: #fff; border-radius: 4px; padding: 2px 8px;
  font-size: 11px; color: #475467; cursor: pointer;
}
.exelmj-comment-actions button:hover { background: #f2f4f7; }
/* the commented words themselves */
.exelmj-word-editor .exelmj-comment {
  background: rgba(224, 168, 0, 0.16); border-bottom: 1px solid rgba(224, 168, 0, 0.7);
}
.exelmj-word-editor .exelmj-comment.active { background: rgba(24, 90, 189, 0.18); }
`
  document.head.append(style)
}
