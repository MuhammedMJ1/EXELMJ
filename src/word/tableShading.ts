// Cell background colour for word tables.
//
// TipTap's table cells carry only colspan/rowspan/colwidth, so shading needs
// its own global attribute. Kept as a plain hex string on the cell node: the
// editor renders it inline, the exporter maps it to w:shd/@w:fill and the
// importer reads that back, so a shaded header row survives a round trip.
//
// The command goes through prosemirror-tables' own rectangle rather than
// commands.updateAttributes: with a plain caret (no cell selection) that
// helper does not reach the enclosing cell, so clicking the paint button after
// simply typing in a cell did nothing. Word shades the SELECTED cells, or the
// one holding the cursor — this does the same.
import { Extension } from '@tiptap/core'
import { CellSelection, selectedRect, TableMap } from '@tiptap/pm/tables'
import type { Node as PMNode } from '@tiptap/pm/model'

const TYPES = ['tableCell', 'tableHeader'] as const

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableShading: {
      setCellBackground: (color: string | null) => ReturnType
    }
  }
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export const TableShading = Extension.create({
  name: 'tableShading',

  addGlobalAttributes() {
    return [
      {
        types: [...TYPES],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (element) => {
              const raw = element.getAttribute('data-bg') ?? ''
              return HEX_RE.test(raw) ? raw.toLowerCase() : null
            },
            renderHTML: (attributes) => {
              const color = String(attributes.backgroundColor ?? '')
              if (!HEX_RE.test(color)) return {}
              return { 'data-bg': color, style: `background-color: ${color}` }
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setCellBackground:
        (color) =>
        ({ state, dispatch }) => {
          const value = color && HEX_RE.test(color) ? color.toLowerCase() : null
          let rect
          try {
            rect = selectedRect(state)
          } catch {
            return false // the selection is not inside a table
          }
          if (!rect) return false
          const { tr } = state
          const map: TableMap = rect.map
          const cells = new Set<number>()
          if (state.selection instanceof CellSelection) {
            state.selection.forEachCell((_cell, pos) => cells.add(pos))
          } else {
            for (let row = rect.top; row < rect.bottom; row++) {
              for (let col = rect.left; col < rect.right; col++) {
                cells.add(rect.tableStart + map.map[row * map.width + col])
              }
            }
          }
          let touched = false
          for (const pos of cells) {
            const node: PMNode | null = tr.doc.nodeAt(pos)
            if (!node) continue
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, backgroundColor: value })
            touched = true
          }
          if (touched && dispatch) dispatch(tr)
          return touched
        }
    }
  }
})
