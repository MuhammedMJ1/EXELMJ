// Whether a table draws its grid.
//
// A converted PDF needs both kinds: a bank statement's transaction table IS
// ruled in the file, while the "Bank: … Page: …" header only LINES UP — the
// columns are real, the borders are not. Inventing a grid around the second
// one is exactly what made a converted page stop looking like its original, so
// the importer marks what the file actually draws.
//
// The flag lives on the CELLS, not on the table: with resizable tables TipTap
// renders the <table> through its own node view, which ignores attributes
// added here — cells still go through renderHTML, so that is where it sticks.
import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableBorders: {
      setTableBorders: (visible: boolean) => ReturnType
    }
  }
}

const TYPES = ['tableCell', 'tableHeader'] as const

export const TableBorders = Extension.create({
  name: 'tableBorders',

  addGlobalAttributes() {
    return [
      {
        types: [...TYPES],
        attributes: {
          borderless: {
            default: false,
            parseHTML: (element) => element.getAttribute('data-borderless') === 'true',
            renderHTML: (attributes) => (attributes.borderless ? { 'data-borderless': 'true' } : {})
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setTableBorders:
        (visible) =>
        ({ commands }) =>
          TYPES.map((type) => commands.updateAttributes(type, { borderless: !visible })).some(Boolean)
    }
  }
})
