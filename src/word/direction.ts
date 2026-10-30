// Per-paragraph direction for the word editor: an explicit `dir` attribute on
// paragraphs and headings (the attribute the docx exporter reads — explicit
// per-node dir is the pattern that survives serialization and maps 1:1 to
// w:bidi). The editor ROOT carries the document default dir; this attribute is
// only set when a paragraph deviates or was imported with a direction.
import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    direction: {
      setDirection: (dir: 'rtl' | 'ltr' | null) => ReturnType
    }
  }
}

export const Direction = Extension.create({
  name: 'direction',

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          dir: {
            default: null,
            parseHTML: (element) => element.getAttribute('dir'),
            renderHTML: (attributes) => (attributes.dir ? { dir: attributes.dir } : {})
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setDirection:
        (dir) =>
        ({ commands }) =>
          // `some`, not `every`: updateAttributes returns false for the type the
          // selection is NOT in, and `every` stopped before reaching 'heading'.
          ['paragraph', 'heading']
            .map((type) => commands.updateAttributes(type, { dir }))
            .some(Boolean)
    }
  }
})
