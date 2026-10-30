// Word-style table handles for the document editor.
//
// Word gives a table three affordances the plain editor lacks: a strip above
// every column and beside every row that SELECTS it on click, a small ✛ at the
// corner that selects the whole table, and a ⊕ at each boundary that inserts a
// column/row exactly there. This draws all three as an overlay on top of the
// sheet (never inside the contenteditable, so ProseMirror's document is never
// polluted) and drives them through prosemirror-tables' own CellSelection.
//
// RTL-aware throughout: geometry comes from getBoundingClientRect, so a
// mirrored table needs no special casing — the row strip simply lands on the
// visual start edge.
import type { Editor } from '@tiptap/core'
import { CellSelection, cellAround } from '@tiptap/pm/tables'
import { t } from '../i18n/i18n'

export class TableTools {
  private layer: HTMLElement | null = null
  private editor: Editor | null = null
  private page: HTMLElement | null = null
  private current: HTMLTableElement | null = null
  private raf = 0

  attach(editor: Editor, page: HTMLElement) {
    this.editor = editor
    this.page = page
    injectCss()
    const layer = document.createElement('div')
    layer.className = 'exelmj-table-tools'
    page.append(layer)
    this.layer = layer

    const editorDom = editor.view.dom as HTMLElement
    editorDom.addEventListener('mousemove', (e) => {
      const table = (e.target as HTMLElement)?.closest?.('table') as HTMLTableElement | null
      if (table && table !== this.current) this.show(table)
      else if (!table && this.current && !this.pointerOverLayer(e)) this.scheduleHide()
    })
    editorDom.addEventListener('mouseleave', () => this.scheduleHide())
    editor.on('selectionUpdate', () => this.refresh())
    editor.on('update', () => this.refresh())
    const scroller = document.getElementById('exelmj-word-scroll')
    scroller?.addEventListener('scroll', () => this.refresh(), { passive: true })
    window.addEventListener('resize', () => this.refresh())
  }

  private pointerOverLayer(e: MouseEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    return !!el?.closest?.('.exelmj-table-tools')
  }

  /** Re-measure whatever is showing (or the table holding the caret). */
  refresh() {
    const editor = this.editor
    if (!editor) return
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = requestAnimationFrame(() => {
      const fromCaret = this.tableAtSelection()
      const table = fromCaret ?? this.current
      if (table && document.contains(table)) this.show(table)
      else this.hide()
    })
  }

  private tableAtSelection(): HTMLTableElement | null {
    const editor = this.editor
    if (!editor || !editor.isActive('table')) return null
    const dom = editor.view.domAtPos(editor.state.selection.from)?.node
    const el = dom instanceof HTMLElement ? dom : dom?.parentElement
    return (el?.closest('table') as HTMLTableElement) ?? null
  }

  private scheduleHide() {
    setTimeout(() => {
      if (!this.tableAtSelection()) this.hide()
    }, 400)
  }

  private hide() {
    this.current = null
    if (this.layer) this.layer.innerHTML = ''
  }

  private show(table: HTMLTableElement) {
    const layer = this.layer
    const page = this.page
    const editor = this.editor
    if (!layer || !page || !editor || !table.rows.length) return
    this.current = table
    layer.innerHTML = ''
    const pageBox = page.getBoundingClientRect()
    const zoom = pageBox.width ? page.offsetWidth / pageBox.width : 1
    const rel = (box: DOMRect) => ({
      left: (box.left - pageBox.left) * zoom,
      top: (box.top - pageBox.top) * zoom,
      width: box.width * zoom,
      height: box.height * zoom
    })
    const tableBox = rel(table.getBoundingClientRect())
    const headCells = [...table.rows[0].cells]

    const mk = (cls: string, style: Record<string, number>, title: string, run: () => void) => {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = cls
      el.title = title
      for (const [key, value] of Object.entries(style)) el.style.setProperty(key, `${value}px`)
      el.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
      })
      el.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        run()
        this.refresh()
      })
      layer.append(el)
      return el
    }

    // column strips + the insert handle at each column's leading edge
    headCells.forEach((cell, index) => {
      const box = rel(cell.getBoundingClientRect())
      mk('tt-col', { left: box.left, top: tableBox.top - 13, width: box.width }, t('wordSelectColumn'), () =>
        this.selectCell(cell, 'col')
      )
      mk(
        'tt-add',
        { left: box.left - 7, top: tableBox.top - 30 },
        t('wordInsertColumnHere'),
        () => this.insertAt(cell, 'columnBefore')
      )
      if (index === headCells.length - 1) {
        mk(
          'tt-add',
          { left: box.left + box.width - 7, top: tableBox.top - 30 },
          t('wordInsertColumnHere'),
          () => this.insertAt(cell, 'columnAfter')
        )
      }
    })

    // row strips + the insert handle at each row's top edge
    ;[...table.rows].forEach((row, index) => {
      const cell = row.cells[0]
      if (!cell) return
      const box = rel(row.getBoundingClientRect())
      mk('tt-row', { left: tableBox.left - 13, top: box.top, height: box.height }, t('wordSelectRow'), () =>
        this.selectCell(cell, 'row')
      )
      mk('tt-add', { left: tableBox.left - 30, top: box.top - 7 }, t('wordInsertRowHere'), () =>
        this.insertAt(cell, 'rowBefore')
      )
      if (index === table.rows.length - 1) {
        mk('tt-add', { left: tableBox.left - 30, top: box.top + box.height - 7 }, t('wordInsertRowHere'), () =>
          this.insertAt(cell, 'rowAfter')
        )
      }
    })

    // corner: select the whole table
    mk('tt-all', { left: tableBox.left - 15, top: tableBox.top - 15 }, t('wordSelectTable'), () =>
      this.selectCell(headCells[0], 'all')
    )
  }

  private cellPos(cell: HTMLElement) {
    const editor = this.editor
    if (!editor) return null
    try {
      const pos = editor.view.posAtDOM(cell, 0)
      return cellAround(editor.state.doc.resolve(pos))
    } catch {
      return null
    }
  }

  private selectCell(cell: HTMLElement, mode: 'col' | 'row' | 'all') {
    const editor = this.editor
    const $cell = this.cellPos(cell)
    if (!editor || !$cell) return
    const { state, view } = editor
    const selection =
      mode === 'col'
        ? CellSelection.colSelection($cell)
        : mode === 'row'
          ? CellSelection.rowSelection($cell)
          : this.wholeTable($cell)
    if (!selection) return
    view.dispatch(state.tr.setSelection(selection))
    view.focus()
  }

  private wholeTable($cell: ReturnType<typeof cellAround>) {
    const editor = this.editor
    if (!editor || !$cell) return null
    const table = $cell.node(-1)
    const start = $cell.start(-1)
    let firstCell = -1
    let lastCell = -1
    table.descendants((node, pos) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        if (firstCell < 0) firstCell = start + pos
        lastCell = start + pos
      }
      return node.type.name === 'tableRow'
    })
    if (firstCell < 0) return null
    const doc = editor.state.doc
    return new CellSelection(doc.resolve(firstCell), doc.resolve(lastCell))
  }

  private insertAt(cell: HTMLElement, where: 'columnBefore' | 'columnAfter' | 'rowBefore' | 'rowAfter') {
    const editor = this.editor
    const $cell = this.cellPos(cell)
    if (!editor || !$cell) return
    const chain = editor.chain().focus().setTextSelection($cell.pos + 1)
    if (where === 'columnBefore') chain.addColumnBefore().run()
    else if (where === 'columnAfter') chain.addColumnAfter().run()
    else if (where === 'rowBefore') chain.addRowBefore().run()
    else chain.addRowAfter().run()
  }
}

function injectCss() {
  if (document.getElementById('exelmj-table-tools-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-table-tools-style'
  style.textContent = `
.exelmj-table-tools { position: absolute; inset: 0; pointer-events: none; z-index: 5; }
.exelmj-table-tools button { position: absolute; pointer-events: auto; padding: 0; cursor: pointer; }
.exelmj-table-tools .tt-col {
  height: 9px; border: 1px solid #cfd6e4; border-bottom: 0; border-radius: 3px 3px 0 0;
  background: #eef2f8;
}
.exelmj-table-tools .tt-row {
  width: 9px; border: 1px solid #cfd6e4; border-inline-end: 0; border-radius: 3px 0 0 3px;
  background: #eef2f8;
}
.exelmj-table-tools .tt-col:hover, .exelmj-table-tools .tt-row:hover { background: #185abd; border-color: #185abd; }
.exelmj-table-tools .tt-all {
  width: 14px; height: 14px; border: 1px solid #cfd6e4; border-radius: 3px; background: #eef2f8;
}
.exelmj-table-tools .tt-all::after {
  content: '✛'; position: absolute; inset: 0; font-size: 10px; line-height: 12px;
  text-align: center; color: #667085;
}
.exelmj-table-tools .tt-all:hover { background: #185abd; }
.exelmj-table-tools .tt-all:hover::after { color: #fff; }
.exelmj-table-tools .tt-add {
  width: 14px; height: 14px; border: 1px solid #cfd6e4; border-radius: 50%; background: #fff;
  color: #185abd; font: 12px/12px 'Segoe UI', Tahoma, sans-serif; opacity: 0.55;
}
.exelmj-table-tools .tt-add::after { content: '+'; }
.exelmj-table-tools .tt-add:hover { opacity: 1; background: #185abd; color: #fff; border-color: #185abd; }
.exelmj-word-editor .selectedCell { position: relative; }
`
  document.head.append(style)
}
