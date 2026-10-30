// Find & replace for the word document.
//
// Two halves: a ProseMirror plugin that owns the match list and paints the
// highlights, and a small bar that docks under the ribbon. Matching runs over
// a FLATTENED copy of the document text (with a separator at every block
// boundary) rather than per text node, so a phrase still matches when part of
// it is bold, coloured or a link — exactly the case a per-node search misses —
// while never matching across two paragraphs.
import { Extension, type Editor } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { t } from '../i18n/i18n'

export interface Match {
  from: number
  to: number
}

interface FindState {
  query: string
  matchCase: boolean
  index: number
  matches: Match[]
  decos: DecorationSet
}

export const findKey = new PluginKey<FindState>('exelmjFind')

// A character no search box can produce: a phrase still matches when part of
// it is bold or coloured inside ONE block, but never spans two blocks.
const BLOCK_SEP = '\u0000'

/** Document text plus a text-index -> document-position map. */
export function flattenDoc(doc: PMNode): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) map.push(pos + i)
      text += node.text
      return false
    }
    if (node.isBlock && text.length && !text.endsWith(BLOCK_SEP)) {
      text += BLOCK_SEP
      map.push(pos)
    }
    return true
  })
  return { text, map }
}

export function findMatches(doc: PMNode, query: string, matchCase: boolean): Match[] {
  const out: Match[] = []
  if (!query) return out
  const { text, map } = flattenDoc(doc)
  const hay = matchCase ? text : text.toLowerCase()
  const needle = matchCase ? query : query.toLowerCase()
  if (!needle || needle.includes(BLOCK_SEP)) return out
  let i = hay.indexOf(needle)
  while (i !== -1) {
    const from = map[i]
    const to = map[i + needle.length - 1]
    if (from !== undefined && to !== undefined) out.push({ from, to: to + 1 })
    i = hay.indexOf(needle, i + needle.length)
  }
  return out
}

function build(state: EditorState, next: Omit<FindState, 'matches' | 'decos'>): FindState {
  const matches = findMatches(state.doc, next.query, next.matchCase)
  const index = matches.length ? ((next.index % matches.length) + matches.length) % matches.length : 0
  const decos = matches.length
    ? DecorationSet.create(
        state.doc,
        matches.map((m, i) =>
          Decoration.inline(m.from, m.to, {
            class: i === index ? 'exelmj-find-hit current' : 'exelmj-find-hit'
          })
        )
      )
    : DecorationSet.empty
  return { ...next, index, matches, decos }
}

export const FindReplace = Extension.create<{ onOpen: () => void }>({
  name: 'exelmjFindReplace',

  addOptions() {
    return { onOpen: () => undefined }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-f': () => {
        this.options.onOpen()
        return true
      },
      'Mod-h': () => {
        this.options.onOpen()
        return true
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({
            query: '',
            matchCase: false,
            index: 0,
            matches: [],
            decos: DecorationSet.empty
          }),
          apply(tr: Transaction, value: FindState, _old: EditorState, next: EditorState) {
            const meta = tr.getMeta(findKey) as Partial<FindState> | undefined
            if (!meta && !tr.docChanged) return value
            const merged = {
              query: meta?.query ?? value.query,
              matchCase: meta?.matchCase ?? value.matchCase,
              index: meta?.index ?? value.index
            }
            if (!merged.query) {
              return { ...merged, index: 0, matches: [], decos: DecorationSet.empty }
            }
            return build(next, merged)
          }
        },
        props: {
          decorations: (state) => findKey.getState(state)?.decos ?? DecorationSet.empty
        }
      })
    ]
  }
})

/** The docked search bar. Owns no state of its own beyond the input values. */
export class FindBar {
  readonly element: HTMLElement
  private editor: Editor | null = null
  private searchInput: HTMLInputElement
  private replaceInput: HTMLInputElement
  private caseBox: HTMLInputElement
  private counter: HTMLElement

  constructor() {
    injectCss()
    const bar = document.createElement('div')
    bar.id = 'exelmj-word-find'
    bar.style.display = 'none'

    this.searchInput = document.createElement('input')
    this.searchInput.type = 'text'
    this.searchInput.placeholder = t('wordFindPlaceholder')
    this.searchInput.className = 'fb-input'
    this.searchInput.addEventListener('input', () => this.run(0))
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.step(e.shiftKey ? -1 : 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })

    this.replaceInput = document.createElement('input')
    this.replaceInput.type = 'text'
    this.replaceInput.placeholder = t('wordReplacePlaceholder')
    this.replaceInput.className = 'fb-input'
    this.replaceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        this.replaceCurrent()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        this.close()
      }
    })

    this.counter = document.createElement('span')
    this.counter.className = 'fb-count'

    const mkBtn = (label: string, title: string, run: () => void) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'fb-btn'
      b.textContent = label
      b.title = title
      b.addEventListener('click', run)
      return b
    }

    this.caseBox = document.createElement('input')
    this.caseBox.type = 'checkbox'
    this.caseBox.id = 'exelmj-find-case'
    this.caseBox.addEventListener('change', () => this.run(0))
    const caseLabel = document.createElement('label')
    caseLabel.className = 'fb-case'
    caseLabel.htmlFor = this.caseBox.id
    caseLabel.append(this.caseBox, document.createTextNode(t('wordMatchCase')))

    bar.append(
      this.searchInput,
      this.counter,
      mkBtn('‹', t('wordFindPrev'), () => this.step(-1)),
      mkBtn('›', t('wordFindNext'), () => this.step(1)),
      this.replaceInput,
      mkBtn(t('wordReplace'), t('wordReplace'), () => this.replaceCurrent()),
      mkBtn(t('wordReplaceAll'), t('wordReplaceAll'), () => this.replaceAll()),
      caseLabel,
      mkBtn('✕', t('cancel'), () => this.close())
    )
    this.element = bar
  }

  attach(editor: Editor) {
    this.editor = editor
  }

  get isOpen() {
    return this.element.style.display !== 'none'
  }

  open() {
    const editor = this.editor
    if (editor) {
      const { from, to } = editor.state.selection
      const selected = from === to ? '' : editor.state.doc.textBetween(from, to)
      if (selected && selected.length <= 120 && !selected.includes('\n')) {
        this.searchInput.value = selected
      }
    }
    this.element.style.display = ''
    this.searchInput.focus()
    this.searchInput.select()
    this.run(0)
  }

  close() {
    this.element.style.display = 'none'
    this.send({ query: '', index: 0 })
    this.editor?.commands.focus()
  }

  private send(meta: Partial<FindState>) {
    const editor = this.editor
    if (!editor) return
    const { state, view } = editor
    view.dispatch(state.tr.setMeta(findKey, meta))
  }

  private state(): FindState | undefined {
    return this.editor ? findKey.getState(this.editor.state) : undefined
  }

  private run(index: number) {
    this.send({ query: this.searchInput.value, matchCase: this.caseBox.checked, index })
    this.refresh()
    this.scrollToCurrent()
  }

  private step(delta: number) {
    const st = this.state()
    if (!st || !st.matches.length) {
      this.run(0)
      return
    }
    this.send({ index: st.index + delta })
    this.refresh()
    this.scrollToCurrent()
  }

  private refresh() {
    const st = this.state()
    const total = st?.matches.length ?? 0
    this.counter.textContent = !this.searchInput.value
      ? ''
      : total
        ? `${st!.index + 1}/${total}`
        : t('wordNoMatches')
  }

  private scrollToCurrent() {
    const st = this.state()
    const editor = this.editor
    if (!editor || !st || !st.matches.length) return
    const hit = st.matches[st.index]
    const dom = editor.view.domAtPos(hit.from)?.node
    const el = dom instanceof HTMLElement ? dom : dom?.parentElement
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  private replaceCurrent() {
    const editor = this.editor
    const st = this.state()
    if (!editor || !st || !st.matches.length) return
    const hit = st.matches[st.index]
    const marks = editor.state.doc.resolve(hit.from).marks()
    const text = this.replaceInput.value
    const tr = editor.state.tr
    if (text) tr.replaceWith(hit.from, hit.to, editor.state.schema.text(text, marks))
    else tr.delete(hit.from, hit.to)
    editor.view.dispatch(tr.setMeta(findKey, { index: st.index }))
    this.refresh()
    this.scrollToCurrent()
  }

  private replaceAll() {
    const editor = this.editor
    const st = this.state()
    if (!editor || !st || !st.matches.length) return
    const text = this.replaceInput.value
    const tr = editor.state.tr
    // Back to front: every edit shifts the positions after it.
    for (const hit of [...st.matches].reverse()) {
      const marks = editor.state.doc.resolve(hit.from).marks()
      if (text) tr.replaceWith(hit.from, hit.to, editor.state.schema.text(text, marks))
      else tr.delete(hit.from, hit.to)
    }
    editor.view.dispatch(tr.setMeta(findKey, { index: 0 }))
    this.refresh()
  }
}

function injectCss() {
  if (document.getElementById('exelmj-find-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-find-style'
  style.textContent = `
#exelmj-word-find {
  display: flex; align-items: center; gap: 6px; padding: 5px 12px;
  background: #f8f9fb; border-bottom: 1px solid #e1dfdd;
  font: 12px 'Segoe UI', Tahoma, sans-serif; color: #344054;
}
#exelmj-word-find .fb-input {
  height: 26px; width: 190px; border: 1px solid #d0d5dd; border-radius: 4px;
  padding: 0 8px; font: inherit; background: #fff;
}
#exelmj-word-find .fb-input:focus { outline: 2px solid #b3d3f2; outline-offset: -1px; }
#exelmj-word-find .fb-btn {
  height: 26px; min-width: 26px; padding: 0 8px; border: 1px solid #d0d5dd;
  border-radius: 4px; background: #fff; cursor: pointer; font: inherit; color: #344054;
}
#exelmj-word-find .fb-btn:hover { background: #eef0f3; }
#exelmj-word-find .fb-count { min-width: 54px; color: #667085; }
#exelmj-word-find .fb-case { display: inline-flex; align-items: center; gap: 4px; margin-inline-start: 6px; }
.exelmj-find-hit { background: #ffe58f; border-radius: 2px; }
.exelmj-find-hit.current { background: #ffa940; }
`
  document.head.append(style)
}
