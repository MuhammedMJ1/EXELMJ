// The Word features the QA pass found missing from the Documents page, each
// small enough to live together: a real page break, superscript/subscript, and
// paragraph spacing before/after.
//
// All three round-trip through docx (w:br type="page", w:vertAlign, and
// w:spacing @w:before/@w:after), so a document that uses them still looks the
// same after a save and reopen in Word.
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    exelmjExtras: {
      setPageBreak: () => ReturnType
      toggleSuperscript: () => ReturnType
      toggleSubscript: () => ReturnType
      setParagraphSpacing: (before: number | null, after: number | null) => ReturnType
    }
  }
}

/** A manual page break — Ctrl+Enter, exactly like Word. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,

  parseHTML() {
    return [{ tag: 'div[data-page-break]' }, { tag: 'br[data-page-break]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-page-break': 'true', class: 'exelmj-page-break' })
    ]
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name })
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() }
  }
})

export const Superscript = Mark.create({
  name: 'superscript',
  excludes: 'superscript subscript',

  parseHTML() {
    return [
      { tag: 'sup' },
      {
        style: 'vertical-align',
        getAttrs: (value) => (value === 'super' ? null : false)
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sup', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      toggleSuperscript:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name)
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-.': () => this.editor.commands.toggleSuperscript() }
  }
})

export const Subscript = Mark.create({
  name: 'subscript',
  excludes: 'superscript subscript',

  parseHTML() {
    return [
      { tag: 'sub' },
      {
        style: 'vertical-align',
        getAttrs: (value) => (value === 'sub' ? null : false)
      }
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['sub', mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      toggleSubscript:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name)
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-,': () => this.editor.commands.toggleSubscript() }
  }
})

const SPACING_TYPES = ['paragraph', 'heading'] as const

/** "المسافة قبل/بعد الفقرة" — points, like Word's paragraph dialog. */
export const ParagraphSpacing = Extension.create({
  name: 'paragraphSpacing',

  addGlobalAttributes() {
    return [
      {
        types: [...SPACING_TYPES],
        attributes: {
          spaceBefore: {
            default: null,
            parseHTML: (element) => pt(element.style.marginTop),
            renderHTML: (attributes) =>
              attributes.spaceBefore ? { style: `margin-top: ${attributes.spaceBefore}pt` } : {}
          },
          spaceAfter: {
            default: null,
            parseHTML: (element) => pt(element.style.marginBottom),
            renderHTML: (attributes) =>
              attributes.spaceAfter ? { style: `margin-bottom: ${attributes.spaceAfter}pt` } : {}
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setParagraphSpacing:
        (before, after) =>
        ({ commands }) =>
          SPACING_TYPES.map((type) =>
            commands.updateAttributes(type, { spaceBefore: before, spaceAfter: after })
          ).some(Boolean)
    }
  }
})

function pt(value: string | null | undefined): number | null {
  if (!value) return null
  const match = /^([\d.]+)(pt|px)?$/.exec(value.trim())
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n) || n <= 0) return null
  return match[2] === 'px' ? Math.round(n * 0.75 * 10) / 10 : n
}
