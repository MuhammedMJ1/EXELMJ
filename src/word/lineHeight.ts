// Per-paragraph line spacing.
//
// TipTap's own LineHeight (inside TextStyleKit) is a TEXT-STYLE mark: it needs
// a selection and wraps the selected words in a <span style="line-height">,
// which means a caret sitting in a paragraph did nothing at all — the exact
// complaint from the QA pass, and not how Word behaves. Here it is a paragraph
// attribute instead (same shape as Direction), so putting the caret anywhere
// in the paragraph and picking a value re-spaces the WHOLE paragraph, and the
// value survives the docx round-trip through w:spacing/@w:line.
import { Extension } from '@tiptap/core'

const TYPES = ['paragraph', 'heading'] as const

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    paragraphLineHeight: {
      setLineHeight: (value: string) => ReturnType
      unsetLineHeight: () => ReturnType
    }
  }
}

export const LineHeight = Extension.create({
  name: 'paragraphLineHeight',

  addGlobalAttributes() {
    return [
      {
        types: [...TYPES],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (element) => element.style.lineHeight || null,
            renderHTML: (attributes) =>
              attributes.lineHeight ? { style: `line-height: ${attributes.lineHeight}` } : {}
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      // `some`, never `every`: updateAttributes returns false for the types the
      // selection is NOT in, and `every` would short-circuit on the first miss
      // — with 'paragraph' listed first that left headings untouched.
      setLineHeight:
        (value) =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { lineHeight: value })).some(Boolean),
      unsetLineHeight:
        () =>
        ({ commands }) =>
          TYPES.map((type) => commands.resetAttributes(type, 'lineHeight')).some(Boolean)
    }
  }
})
