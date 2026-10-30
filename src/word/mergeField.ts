// The merge-field node: an inline chip like «اسم العميل» that stands in for a
// value until the merge runs.
//
// It is an atom, so the caret steps over it as one thing and the user cannot
// half-delete a field into a broken name. On export it becomes a real Word
// MERGEFIELD, so an unmerged .docx still opens as a merge document in Word.
import { Node, mergeAttributes } from '@tiptap/core'
import { defaultFieldAttrs, fieldLabel, MERGE_FIELD, type MergeFieldAttrs } from './mailMerge'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mergeField: {
      insertMergeField: (attrs: Partial<MergeFieldAttrs>) => ReturnType
    }
  }
}

export const MergeField = Node.create({
  name: MERGE_FIELD,
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    const base = defaultFieldAttrs()
    return {
      name: {
        default: base.name,
        parseHTML: (el) => el.getAttribute('data-merge-name') ?? '',
        renderHTML: (attrs) => ({ 'data-merge-name': String(attrs.name ?? '') })
      },
      source: {
        default: base.source,
        parseHTML: (el) => el.getAttribute('data-merge-source') ?? 'column',
        renderHTML: (attrs) => ({ 'data-merge-source': String(attrs.source ?? 'column') })
      },
      format: {
        default: base.format,
        parseHTML: (el) => el.getAttribute('data-merge-format') ?? 'plain',
        renderHTML: (attrs) => ({ 'data-merge-format': String(attrs.format ?? 'plain') })
      },
      currency: {
        default: base.currency,
        parseHTML: (el) => el.getAttribute('data-merge-currency') ?? '',
        renderHTML: (attrs) =>
          attrs.currency ? { 'data-merge-currency': String(attrs.currency) } : {}
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-source]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = { ...defaultFieldAttrs(), ...(node.attrs as object) } as MergeFieldAttrs
    return [
      'span',
      mergeAttributes(HTMLAttributes, { class: 'exelmj-merge-field' }),
      fieldLabel(attrs)
    ]
  },

  renderText({ node }) {
    return fieldLabel({ ...defaultFieldAttrs(), ...(node.attrs as object) } as MergeFieldAttrs)
  },

  addCommands() {
    return {
      insertMergeField:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { ...defaultFieldAttrs(), ...attrs } })
    }
  }
})
