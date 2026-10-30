// EXELMJ Word-mode ribbon — an in-house, RTL-first Word-style ribbon.
//
// Own code throughout. The layout follows the classic ribbon PATTERN (tab row,
// grouped controls with a label strip, table hover-grid picker, status-bar
// zoom) which is a functional UI method, studied from open-source references
// (ONLYOFFICE/LibreOffice ribbons — looked at, never copied) — see
// PROJECT_MAP. Icons are Microsoft's Fluent UI System Icons (MIT) inlined in
// icons.ts. No Office assets, no trademarks.
import { t } from '../i18n/i18n'
import { usableFonts } from './fonts'
import { ICONS } from './icons'

/** Everything the ribbon can ask the editor side to do. */
export interface RibbonActions {
  newDoc(): void
  open(): void
  save(): void
  saveAs(): void
  print(): void
  exportPdf(): void
  undo(): void
  redo(): void
  setFont(family: string | null): void
  setFontSize(pt: string | null): void
  toggleBold(): void
  toggleItalic(): void
  toggleUnderline(): void
  toggleStrike(): void
  setColor(hex: string): void
  clearColor(): void
  setHighlight(hex: string): void
  clearHighlight(): void
  clearFormat(): void
  setBlock(kind: 'p' | 1 | 2 | 3 | 4 | 'quote'): void
  toggleBullets(): void
  toggleNumbers(): void
  indent(): void
  outdent(): void
  setAlign(align: 'right' | 'center' | 'left' | 'justify'): void
  setDirection(dir: 'rtl' | 'ltr'): void
  setLineHeight(value: string | null): void
  insertTable(rows: number, cols: number): void
  insertTableExact(): void
  insertPageBreak(): void
  insertMergeField(): void
  runMailMerge(): void
  amountInWords(): void
  addComment(): void
  toggleComments(): void
  toggleTrackChanges(): void
  insertFootnote(): void
  reviewChange(action: 'accept' | 'reject' | 'acceptAll' | 'rejectAll'): void
  insertHorizontalRule(): void
  insertDate(): void
  toggleSuperscript(): void
  toggleSubscript(): void
  paragraphSpacing(): void
  toggleFormattingMarks(): void
  formatPainter(): void
  newFromTemplate(): void
  watermark(): void
  documentStats(): void
  textToTable(): void
  tableToText(): void
  sumColumn(): void
  insertToc(): void
  convertDigits(toHindi: boolean): void
  tableOp(op: 'addRow' | 'addCol' | 'delRow' | 'delCol' | 'delTable' | 'merge' | 'split' | 'headerRow'): void
  cellShading(hex: string): void
  insertImage(): void
  insertLink(): void
  find(): void
  headerFooter(): void
  pageSetup(): void
  setZoom(percent: number): void
}

export interface RibbonHandles {
  /** key → button element, for active/disabled state refresh. */
  buttons: Map<string, HTMLButtonElement>
  zoomLabel: HTMLElement
}

const FONT_SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '32', '36', '48', '72']
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2', '2.5', '3']

/** Pinned to the top of the picker when the machine has them. */
const COMMON_FONTS = [
  'Arial',
  'Calibri',
  'Tahoma',
  'Times New Roman',
  'Segoe UI',
  'Cambria',
  'Georgia',
  'Verdana',
  'Courier New',
  'Traditional Arabic',
  'Simplified Arabic',
  'Sakkal Majalla',
  'Dubai',
  'Amiri',
  'Cairo'
]

function icon(name: string): string {
  return ICONS[name] ?? ''
}

/** Word's standard palette: greys, then the colour wheel in two tints. */
const PALETTE = [
  '#000000', '#404040', '#595959', '#7f7f7f', '#a6a6a6', '#d9d9d9', '#f2f2f2', '#ffffff',
  '#c00000', '#ff0000', '#e36c0a', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0',
  '#0070c0', '#002060', '#7030a0', '#b0308f', '#8b4513', '#2f5597', '#1f7a1f', '#7f6000',
  '#f4b183', '#ffe699', '#c6e0b4', '#bdd7ee', '#d9c2e9', '#f8cbad', '#dbdbdb', '#fce4d6'
]

export function buildRibbon(
  host: HTMLElement,
  actions: RibbonActions,
  systemFonts: string[]
): RibbonHandles {
  injectRibbonCss()
  host.innerHTML = ''
  host.className = 'exelmj-ribbon'
  const buttons = new Map<string, HTMLButtonElement>()
  const colorMenus: HTMLElement[] = []

  // ---------- tab row ----------
  const tabRow = document.createElement('div')
  tabRow.className = 'rb-tabs'
  host.append(tabRow)

  // quick access: undo/redo live on the tab row like Word's quick toolbar
  const quick = document.createElement('div')
  quick.className = 'rb-quick'
  const mkQuick = (key: string, title: string, run: () => void) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rb-btn rb-btn-sm'
    b.innerHTML = icon(key)
    b.title = title
    b.addEventListener('click', run)
    quick.append(b)
    buttons.set(key, b)
  }
  mkQuick('save', t('wordSave'), () => actions.save())
  mkQuick('undo', t('wordUndo'), () => actions.undo())
  mkQuick('redo', t('wordRedo'), () => actions.redo())

  const fileTab = document.createElement('button')
  fileTab.type = 'button'
  fileTab.className = 'rb-tab rb-tab-file'
  fileTab.textContent = t('ribbonFile')
  tabRow.append(fileTab, quick)

  const panes: Record<string, HTMLElement> = {}
  const tabButtons: Record<string, HTMLButtonElement> = {}
  let activeTab = 'home'
  const selectTab = (id: string) => {
    activeTab = id
    for (const [key, btn] of Object.entries(tabButtons)) btn.classList.toggle('active', key === id)
    for (const [key, pane] of Object.entries(panes)) pane.style.display = key === id ? '' : 'none'
  }
  for (const [id, label] of [
    ['home', t('ribbonHome')],
    ['insert', t('ribbonInsert')]
  ] as const) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rb-tab'
    b.textContent = label
    b.addEventListener('click', () => selectTab(id))
    tabRow.append(b)
    tabButtons[id] = b
  }

  // ---------- ribbon body ----------
  const body = document.createElement('div')
  body.className = 'rb-body'
  host.append(body)
  const mkPane = (id: string) => {
    const pane = document.createElement('div')
    pane.className = 'rb-pane'
    body.append(pane)
    panes[id] = pane
    return pane
  }
  const mkGroup = (pane: HTMLElement, label: string) => {
    const g = document.createElement('div')
    g.className = 'rb-group'
    const controls = document.createElement('div')
    controls.className = 'rb-controls'
    const cap = document.createElement('div')
    cap.className = 'rb-caption'
    cap.textContent = label
    g.append(controls, cap)
    pane.append(g)
    return controls
  }
  const mkRow = (controls: HTMLElement) => {
    const r = document.createElement('div')
    r.className = 'rb-row'
    controls.append(r)
    return r
  }
  const mkBtn = (
    parent: HTMLElement,
    key: string,
    title: string,
    run: () => void,
    opts: { icon?: string; html?: string } = {}
  ) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'rb-btn'
    b.innerHTML = opts.html ?? icon(opts.icon ?? key)
    b.title = title
    b.addEventListener('click', run)
    parent.append(b)
    buttons.set(key, b)
    return b
  }

  // ---------- File pane (dropdown from the File tab) ----------
  const filePanel = document.createElement('div')
  filePanel.className = 'rb-filepanel'
  filePanel.style.display = 'none'
  host.append(filePanel)
  const fileItems: Array<[string, string, () => void]> = [
    ['new', t('wordNew'), () => actions.newDoc()],
    ['template', t('wordTemplates'), () => actions.newFromTemplate()],
    ['open', t('wordOpen'), () => actions.open()],
    ['save', t('wordSave'), () => actions.save()],
    ['saveAs', t('wordSaveAs'), () => actions.saveAs()],
    ['print', t('wordPrint'), () => actions.print()],
    ['pdf', t('wordExportPdf'), () => actions.exportPdf()]
  ]
  for (const [key, label, run] of fileItems) {
    const item = document.createElement('button')
    item.type = 'button'
    item.className = 'rb-fileitem'
    item.innerHTML = `${icon(key)}<span>${label}</span>`
    item.addEventListener('click', () => {
      filePanel.style.display = 'none'
      run()
    })
    filePanel.append(item)
  }
  fileTab.addEventListener('click', () => {
    filePanel.style.display = filePanel.style.display === 'none' ? '' : 'none'
  })
  document.addEventListener('pointerdown', (e) => {
    if (filePanel.style.display !== 'none' && !filePanel.contains(e.target as Node) && e.target !== fileTab) {
      filePanel.style.display = 'none'
    }
  })

  // ---------- HOME ----------
  const home = mkPane('home')

  // — font group —
  const fontCtl = mkGroup(home, t('ribbonFontGroup'))
  const fontRow1 = mkRow(fontCtl)
  const fontSel = document.createElement('select')
  fontSel.className = 'rb-font'
  fontSel.title = t('wordFont')
  const fontDefault = document.createElement('option')
  fontDefault.value = ''
  fontDefault.textContent = t('wordFont')
  fontSel.append(fontDefault)
  const addOption = (parent: HTMLElement, family: string) => {
    const o = document.createElement('option')
    o.value = family
    o.textContent = family
    o.style.fontFamily = JSON.stringify(family)
    parent.append(o)
  }
  const usable = usableFonts(systemFonts)
  const common = COMMON_FONTS.filter((f) => usable.some((u) => u.toLowerCase() === f.toLowerCase()))
  if (common.length) {
    const group = document.createElement('optgroup')
    group.label = t('wordFontCommon')
    for (const f of common) addOption(group, f)
    fontSel.append(group)
  }
  const rest = document.createElement('optgroup')
  rest.label = t('wordFontAll')
  for (const f of usable) addOption(rest, f)
  fontSel.append(rest)
  fontSel.addEventListener('change', () => actions.setFont(fontSel.value || null))
  fontRow1.append(fontSel)
  const sizeSel = document.createElement('select')
  sizeSel.className = 'rb-size'
  sizeSel.title = t('wordFontSize')
  const sizeDefault = document.createElement('option')
  sizeDefault.value = ''
  sizeDefault.textContent = t('wordFontSize')
  sizeSel.append(sizeDefault)
  for (const s of FONT_SIZES) {
    const o = document.createElement('option')
    o.value = s
    o.textContent = s
    sizeSel.append(o)
  }
  sizeSel.addEventListener('change', () => actions.setFontSize(sizeSel.value || null))
  fontRow1.append(sizeSel)
  mkBtn(fontRow1, 'clear', t('wordClearFormat'), () => actions.clearFormat())

  const fontRow2 = mkRow(fontCtl)
  mkBtn(fontRow2, 'bold', `${t('wordBold')} (Ctrl+B)`, () => actions.toggleBold())
  mkBtn(fontRow2, 'italic', `${t('wordItalic')} (Ctrl+I)`, () => actions.toggleItalic())
  mkBtn(fontRow2, 'underline', `${t('wordUnderline')} (Ctrl+U)`, () => actions.toggleUnderline())
  mkBtn(fontRow2, 'strike', t('wordStrike'), () => actions.toggleStrike())
  mkBtn(fontRow2, 'superscript', `${t('wordSuperscript')} (Ctrl+.)`, () => actions.toggleSuperscript())
  mkBtn(fontRow2, 'subscript', `${t('wordSubscript')} (Ctrl+,)`, () => actions.toggleSubscript())
  // Colour buttons open their palette. Word applies the last colour on the
  // icon and opens the list from a separate arrow, but the manager asked for
  // the plain thing: press the button, see the colours.
  const mkColorButton = (
    key: string,
    title: string,
    initial: string,
    apply: (hex: string) => void,
    clear: () => void
  ) => {
    const wrap = document.createElement('span')
    wrap.className = 'rb-colorsplit'
    let current = initial
    const button = mkBtn(wrap, key, title, () => {
      const open = menu.style.display === 'none'
      for (const other of host.querySelectorAll<HTMLElement>('.rb-colormenu')) other.style.display = 'none'
      menu.style.display = open ? '' : 'none'
    })
    const bar = document.createElement('span')
    bar.className = 'rb-colorbar'
    bar.style.background = initial
    button.append(bar)
    button.insertAdjacentHTML('beforeend', icon('chevronDown'))

    const menu = document.createElement('div')
    menu.className = 'rb-colormenu'
    menu.style.display = 'none'
    const grid = document.createElement('div')
    grid.className = 'rb-colorgrid'
    const use = (hex: string) => {
      current = hex
      bar.style.background = hex
      input.value = hex
      menu.style.display = 'none'
      apply(hex)
    }
    for (const hex of PALETTE) {
      const swatch = document.createElement('button')
      swatch.type = 'button'
      swatch.className = 'rb-swatch'
      swatch.style.background = hex
      swatch.title = hex
      swatch.addEventListener('click', () => use(hex))
      grid.append(swatch)
    }
    const none = document.createElement('button')
    none.type = 'button'
    none.className = 'rb-colorlink'
    none.textContent = t('wordNoColor')
    none.addEventListener('click', () => {
      menu.style.display = 'none'
      clear()
    })
    const more = document.createElement('button')
    more.type = 'button'
    more.className = 'rb-colorlink'
    more.textContent = t('wordMoreColors')
    more.addEventListener('click', () => input.click())
    const input = document.createElement('input')
    input.type = 'color'
    input.value = initial
    input.title = t('wordChooseColor')
    input.className = 'rb-colorinput'
    input.addEventListener('input', () => use(input.value))
    menu.append(grid, none, more, input)
    wrap.append(menu)
    fontRow2.append(wrap)
    colorMenus.push(menu)
    return { current: () => current }
  }
  mkColorButton(
    'color',
    t('wordTextColor'),
    '#c00000',
    (hex) => actions.setColor(hex),
    () => actions.clearColor()
  )
  mkColorButton(
    'highlight',
    t('wordHighlight'),
    '#ffff00',
    (hex) => actions.setHighlight(hex),
    () => actions.clearHighlight()
  )

  // — paragraph group —
  const paraCtl = mkGroup(home, t('ribbonParaGroup'))
  const paraRow1 = mkRow(paraCtl)
  mkBtn(paraRow1, 'bullets', t('wordBullets'), () => actions.toggleBullets())
  mkBtn(paraRow1, 'numbers', t('wordNumbers'), () => actions.toggleNumbers())
  mkBtn(paraRow1, 'outdent', t('ribbonOutdent'), () => actions.outdent())
  mkBtn(paraRow1, 'indent', t('ribbonIndent'), () => actions.indent())
  mkBtn(paraRow1, 'dirRtl', t('wordDirRtl'), () => actions.setDirection('rtl'))
  mkBtn(paraRow1, 'dirLtr', t('wordDirLtr'), () => actions.setDirection('ltr'))
  const paraRow2 = mkRow(paraCtl)
  mkBtn(paraRow2, 'alignRight', t('wordAlignRight'), () => actions.setAlign('right'))
  mkBtn(paraRow2, 'alignCenter', t('wordAlignCenter'), () => actions.setAlign('center'))
  mkBtn(paraRow2, 'alignLeft', t('wordAlignLeft'), () => actions.setAlign('left'))
  mkBtn(paraRow2, 'alignJustify', t('wordAlignJustify'), () => actions.setAlign('justify'))
  // line-spacing dropdown
  const lsWrap = document.createElement('span')
  lsWrap.className = 'rb-dropwrap'
  const lsBtn = mkBtn(lsWrap, 'lineSpacing', t('ribbonLineSpacing'), () => {
    lsMenu.style.display = lsMenu.style.display === 'none' ? '' : 'none'
  })
  lsBtn.insertAdjacentHTML('beforeend', icon('chevronDown'))
  const lsMenu = document.createElement('div')
  lsMenu.className = 'rb-menu'
  lsMenu.style.display = 'none'
  for (const v of LINE_HEIGHTS) {
    const item = document.createElement('button')
    item.type = 'button'
    item.textContent = v
    item.addEventListener('click', () => {
      lsMenu.style.display = 'none'
      actions.setLineHeight(v)
    })
    lsMenu.append(item)
  }
  lsWrap.append(lsMenu)
  paraRow2.append(lsWrap)
  mkBtn(paraRow2, 'paraSpacing', t('wordParagraphSpacing'), () => actions.paragraphSpacing())
  mkBtn(paraRow2, 'formatMarks', t('wordFormattingMarks'), () => actions.toggleFormattingMarks())

  // — styles group —
  const stylesCtl = mkGroup(home, t('ribbonStylesGroup'))
  const stylesRow = mkRow(stylesCtl)
  stylesRow.className = 'rb-row rb-styles'
  const styleDefs: Array<['p' | 1 | 2 | 3 | 4 | 'quote', string, string]> = [
    ['p', t('wordParagraph'), 'font-size:11px'],
    [1, t('wordHeading1'), 'font-size:15px;font-weight:700;color:#185abd'],
    [2, t('wordHeading2'), 'font-size:13px;font-weight:700;color:#2b579a'],
    [3, t('wordHeading3'), 'font-size:12px;font-weight:600;color:#444'],
    [4, t('wordHeading4'), 'font-size:11px;font-weight:600;color:#666'],
    ['quote', t('wordQuote'), 'font-size:11px;font-style:italic;color:#555']
  ]
  for (const [kind, label, css] of styleDefs) {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'rb-style'
    card.innerHTML = `<span style="${css}">${label}</span>`
    card.title = label
    card.addEventListener('click', () => actions.setBlock(kind))
    stylesRow.append(card)
    buttons.set(`style-${kind}`, card)
  }

  // — editing group —
  const editCtl = mkGroup(home, t('ribbonEditGroup'))
  const editRow = mkRow(editCtl)
  editRow.className = 'rb-row rb-row-tall'
  mkBtn(editRow, 'find', t('wordFind'), () => actions.find())
  mkBtn(editRow, 'formatPainter', t('wordFormatPainter'), () => actions.formatPainter())
  mkBtn(editRow, 'stats', t('wordStats'), () => actions.documentStats())

  // ---------- INSERT ----------
  const insert = mkPane('insert')

  // — table group with the hover-grid picker —
  const tableCtl = mkGroup(insert, t('ribbonTableGroup'))
  const tableRow1 = mkRow(tableCtl)
  const tblWrap = document.createElement('span')
  tblWrap.className = 'rb-dropwrap'
  const tblBtn = mkBtn(tblWrap, 'table', t('wordInsertTable'), () => {
    grid.style.display = grid.style.display === 'none' ? '' : 'none'
  })
  tblBtn.insertAdjacentHTML('beforeend', icon('chevronDown'))
  const grid = document.createElement('div')
  grid.className = 'rb-grid'
  grid.style.display = 'none'
  const gridCells: HTMLElement[] = []
  const gridCaption = document.createElement('div')
  gridCaption.className = 'rb-grid-cap'
  gridCaption.textContent = t('wordInsertTable')
  const COLS = 10
  const ROWS = 8
  const cellsBox = document.createElement('div')
  cellsBox.className = 'rb-grid-cells'
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement('span')
      cell.dataset.r = String(r)
      cell.dataset.c = String(c)
      cellsBox.append(cell)
      gridCells.push(cell)
    }
  }
  cellsBox.addEventListener('pointermove', (e) => {
    const target = e.target as HTMLElement
    if (!target.dataset.r) return
    const rr = Number(target.dataset.r)
    const cc = Number(target.dataset.c)
    for (const cell of gridCells) {
      const on = Number(cell.dataset.r) <= rr && Number(cell.dataset.c) <= cc
      cell.classList.toggle('on', on)
    }
    gridCaption.textContent = `${t('ribbonTableSize')} ${cc + 1}×${rr + 1}`
  })
  cellsBox.addEventListener('pointerleave', () => {
    for (const cell of gridCells) cell.classList.remove('on')
    gridCaption.textContent = t('wordInsertTable')
  })
  cellsBox.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.dataset.r) return
    grid.style.display = 'none'
    actions.insertTable(Number(target.dataset.r) + 1, Number(target.dataset.c) + 1)
  })
  const exact = document.createElement('button')
  exact.type = 'button'
  exact.className = 'rb-grid-exact'
  exact.textContent = `${t('wordTableExact')}…`
  exact.addEventListener('click', () => {
    grid.style.display = 'none'
    actions.insertTableExact()
  })
  grid.append(cellsBox, gridCaption, exact)
  tblWrap.append(grid)
  tableRow1.append(tblWrap)
  const tableRow2 = mkRow(tableCtl)
  mkBtn(tableRow2, 'tAddRow', t('wordTableAddRow'), () => actions.tableOp('addRow'), { icon: 'addRow' })
  mkBtn(tableRow2, 'tAddCol', t('wordTableAddCol'), () => actions.tableOp('addCol'), { icon: 'addCol' })
  mkBtn(tableRow2, 'tDelRow', t('wordTableDelRow'), () => actions.tableOp('delRow'), { icon: 'delRow' })
  mkBtn(tableRow2, 'tDelCol', t('wordTableDelCol'), () => actions.tableOp('delCol'), { icon: 'delCol' })
  mkBtn(tableRow2, 'tDel', t('wordTableDelete'), () => actions.tableOp('delTable'), { icon: 'delTable' })
  const tableRow3 = mkRow(tableCtl)
  mkBtn(tableRow3, 'tMerge', t('wordMergeCells'), () => actions.tableOp('merge'), { icon: 'mergeCells' })
  mkBtn(tableRow3, 'tSplit', t('wordSplitCell'), () => actions.tableOp('split'), { icon: 'splitCell' })
  // the header row is also what repeats on page two of a long table, in print
  // and in the exported Word file — worth saying on the button itself
  mkBtn(
    tableRow3,
    'tHeaderRow',
    `${t('wordHeaderRow')} — ${t('wordRepeatHeaderRow')}`,
    () => actions.tableOp('headerRow'),
    { icon: 'headerRow' }
  )
  const tableRow4 = mkRow(tableCtl)
  mkBtn(tableRow4, 'text2table', t('wordTextToTable'), () => actions.textToTable())
  mkBtn(tableRow4, 'table2text', t('wordTableToText'), () => actions.tableToText())
  mkBtn(tableRow4, 'sum', t('wordSumColumn'), () => actions.sumColumn())
  // cell shading: the icon paints with the current swatch, the swatch picks
  const shadeWrap = document.createElement('span')
  shadeWrap.className = 'rb-colorsplit'
  let shadeColor = '#dbeafe'
  const shadeBtn = mkBtn(shadeWrap, 'tShade', t('wordCellShading'), () => actions.cellShading(shadeColor), {
    icon: 'cellShading'
  })
  const shadeBar = document.createElement('span')
  shadeBar.className = 'rb-colorbar'
  shadeBar.style.background = shadeColor
  shadeBtn.append(shadeBar)
  const shadeInput = document.createElement('input')
  shadeInput.type = 'color'
  shadeInput.value = shadeColor
  shadeInput.title = t('wordCellShading')
  shadeInput.addEventListener('input', () => {
    shadeColor = shadeInput.value
    shadeBar.style.background = shadeColor
    actions.cellShading(shadeColor)
  })
  shadeWrap.append(shadeInput)
  tableRow3.append(shadeWrap)

  // — media group —
  const mediaCtl = mkGroup(insert, t('ribbonMediaGroup'))
  const mediaRow = mkRow(mediaCtl)
  mediaRow.className = 'rb-row rb-row-tall'
  mkBtn(mediaRow, 'image', t('wordInsertImage'), () => actions.insertImage())
  mkBtn(mediaRow, 'link', t('ribbonInsertLink'), () => actions.insertLink())
  mkBtn(mediaRow, 'hr', t('wordHorizontalRule'), () => actions.insertHorizontalRule())
  mkBtn(mediaRow, 'insertDate', t('wordInsertDate'), () => actions.insertDate())

  // — page group —
  const layoutCtl = mkGroup(insert, t('ribbonLayoutGroup'))
  const layoutRow = mkRow(layoutCtl)
  layoutRow.className = 'rb-row rb-row-tall'
  mkBtn(layoutRow, 'headerFooter', t('wordHeaderFooter'), () => actions.headerFooter())
  mkBtn(layoutRow, 'pageSetup', t('wordPageSetup'), () => actions.pageSetup())
  mkBtn(layoutRow, 'pageBreak', t('wordPageBreak'), () => actions.insertPageBreak())
  mkBtn(layoutRow, 'watermark', t('wordWatermark'), () => actions.watermark())
  mkBtn(layoutRow, 'toc', t('wordToc'), () => actions.insertToc())
  mkBtn(layoutRow, 'digitsHindi', t('wordDigitsHindi'), () => actions.convertDigits(true))
  mkBtn(layoutRow, 'digitsArabic', t('wordDigitsArabic'), () => actions.convertDigits(false))

  // — mail merge group: one letter plus a list of names —
  const mergeCtl = mkGroup(insert, t('ribbonMergeGroup'))
  const mergeRow = mkRow(mergeCtl)
  mergeRow.className = 'rb-row rb-row-tall'
  mkBtn(mergeRow, 'mergeField', t('wordMergeField'), () => actions.insertMergeField())
  mkBtn(mergeRow, 'mergeRun', t('wordMergeRun'), () => actions.runMailMerge())
  mkBtn(mergeRow, 'amountWords', t('wordAmountWords'), () => actions.amountInWords())

  // — review group —
  const reviewCtl = mkGroup(insert, t('ribbonReviewGroup'))
  const reviewRow = mkRow(reviewCtl)
  reviewRow.className = 'rb-row rb-row-tall'
  mkBtn(reviewRow, 'addComment', t('wordAddComment'), () => actions.addComment())
  mkBtn(reviewRow, 'showComments', t('wordShowComments'), () => actions.toggleComments())
  mkBtn(reviewRow, 'trackChanges', t('wordTrackChanges'), () => actions.toggleTrackChanges())
  mkBtn(reviewRow, 'acceptChange', t('wordAcceptChange'), () => actions.reviewChange('accept'))
  mkBtn(reviewRow, 'rejectChange', t('wordRejectChange'), () => actions.reviewChange('reject'))
  mkBtn(reviewRow, 'acceptAll', t('wordAcceptAll'), () => actions.reviewChange('acceptAll'))
  mkBtn(reviewRow, 'rejectAll', t('wordRejectAll'), () => actions.reviewChange('rejectAll'))
  mkBtn(reviewRow, 'footnote', t('wordFootnote'), () => actions.insertFootnote())

  // close dropdowns on outside clicks
  document.addEventListener('pointerdown', (e) => {
    const target = e.target as Node
    if (!lsWrap.contains(target)) lsMenu.style.display = 'none'
    if (!tblWrap.contains(target)) grid.style.display = 'none'
    for (const menu of colorMenus) {
      if (!menu.parentElement?.contains(target)) menu.style.display = 'none'
    }
  })

  selectTab('home')

  // ---------- status-bar zoom handle (rendered by wordApp, controlled here) ----------
  const zoomLabel = document.createElement('span')

  return { buttons, zoomLabel }
}

function injectRibbonCss() {
  if (document.getElementById('exelmj-ribbon-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-ribbon-style'
  style.textContent = `
.exelmj-ribbon { background: #fff; border-bottom: 1px solid #e1dfdd; user-select: none; position: relative; }
.rb-tabs {
  display: flex; align-items: center; gap: 2px; height: 34px; padding: 0 8px;
  padding-inline-start: 272px; /* clear the fixed 3-way mode pill */
}
.rb-tab {
  border: 0; background: transparent; height: 28px; padding: 0 14px; cursor: pointer;
  font: 600 13px 'Segoe UI', Tahoma, sans-serif; color: #444; border-radius: 4px; position: relative;
}
.rb-tab:hover { background: #f5f5f5; }
.rb-tab.active { color: #185abd; }
.rb-tab.active::after {
  content: ''; position: absolute; inset-inline: 10px; bottom: -3px; height: 3px;
  border-radius: 2px; background: #185abd;
}
.rb-tab-file { background: #185abd; color: #fff; }
.rb-tab-file:hover { background: #124b99; }
.rb-quick { display: flex; gap: 2px; margin-inline: 6px; padding-inline-end: 8px; border-inline-end: 1px solid #e1dfdd; }
.rb-body { display: flex; min-height: 92px; padding: 4px 10px 2px; }
.rb-pane { display: flex; align-items: stretch; }
.rb-group {
  display: flex; flex-direction: column; padding: 0 8px; border-inline-end: 1px solid #e1dfdd;
}
.rb-group:last-child { border-inline-end: 0; }
.rb-controls { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 3px; }
.rb-caption { text-align: center; font: 11px 'Segoe UI', Tahoma, sans-serif; color: #605e5c; padding: 2px 0 3px; }
.rb-row { display: flex; align-items: center; gap: 2px; }
.rb-row-tall .rb-btn { height: 52px; width: 52px; }
.rb-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 2px;
  min-width: 28px; height: 28px; padding: 0 4px; border: 1px solid transparent; border-radius: 4px;
  background: transparent; cursor: pointer; color: #1f2937; position: relative;
}
.rb-btn:hover { background: #f5f5f5; }
.rb-btn:active { background: #ebebeb; }
.rb-btn.active { background: #edf3fb; border-color: #a9c8ee; color: #185abd; }
.rb-btn:disabled { opacity: 0.35; cursor: default; }
.rb-btn svg { width: 20px; height: 20px; flex: none; }
.rb-btn-sm { min-width: 26px; height: 26px; }
.rb-font { width: 140px; }
.rb-size { width: 58px; }
.rb-font, .rb-size, .rb-menu button {
  height: 26px; border: 1px solid #d1cfcd; border-radius: 4px; background: #fff; font-size: 12px;
}
.rb-grid-exact {
  display: block; width: 100%; margin-top: 4px; padding: 4px 6px; border: 0; border-top: 1px solid #e1dfdd;
  background: transparent; cursor: pointer; font: 12px 'Segoe UI', Tahoma, sans-serif; color: #185abd;
  text-align: start;
}
.rb-grid-exact:hover { background: #f5f5f5; }
.rb-colorsplit { display: inline-flex; align-items: center; position: relative; }
.rb-colormenu {
  position: absolute; top: 100%; inset-inline-start: 0; z-index: 40; margin-top: 2px;
  background: #fff; border: 1px solid #d0d5dd; border-radius: 4px; padding: 6px;
  box-shadow: 0 6px 18px rgba(16, 24, 40, 0.16); width: 176px;
}
.rb-colorgrid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px; }
.rb-swatch {
  width: 18px; height: 18px; border: 1px solid rgba(0, 0, 0, 0.18); border-radius: 3px;
  padding: 0; cursor: pointer;
}
.rb-swatch:hover { outline: 2px solid #185abd; outline-offset: 1px; }
.rb-colorlink {
  display: block; width: 100%; margin-top: 5px; padding: 4px 6px; border: 0; background: transparent;
  cursor: pointer; font: 12px 'Segoe UI', Tahoma, sans-serif; color: #185abd; text-align: start;
  border-radius: 3px;
}
.rb-colorlink:hover { background: #f2f5fb; }
.rb-colorinput { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.rb-colorsplit input[type=color] {
  width: 16px; height: 26px; padding: 0; border: 1px solid transparent; border-radius: 4px;
  background: transparent; cursor: pointer;
}
.rb-colorbar { position: absolute; bottom: 3px; inset-inline-start: 5px; width: 18px; height: 3px; border-radius: 1px; }
.rb-dropwrap { position: relative; display: inline-flex; }
.rb-menu {
  position: absolute; top: 100%; inset-inline-start: 0; z-index: 40; min-width: 70px;
  background: #fff; border: 1px solid #d1cfcd; border-radius: 8px; padding: 4px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.13); display: flex; flex-direction: column; gap: 2px;
}
.rb-menu button { border: 0; background: transparent; cursor: pointer; padding: 4px 10px; text-align: center; }
.rb-menu button:hover { background: #f5f5f5; }
.rb-styles { gap: 4px; }
.rb-style {
  min-width: 64px; height: 52px; border: 1px solid #e1dfdd; border-radius: 4px; background: #fff;
  cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0 8px;
  font-family: 'Segoe UI', Tahoma, sans-serif;
}
.rb-style:hover { border-color: #a9c8ee; background: #f8fbff; }
.rb-style.active { border-color: #185abd; background: #edf3fb; }
.rb-filepanel {
  position: absolute; top: 34px; inset-inline-start: 272px; z-index: 60; width: 230px;
  background: #fff; border: 1px solid #d1cfcd; border-radius: 0 0 8px 8px; padding: 6px;
  box-shadow: 0 8px 22px rgba(0,0,0,0.16); display: flex; flex-direction: column; gap: 2px;
}
.rb-fileitem {
  display: flex; align-items: center; gap: 10px; border: 0; background: transparent; cursor: pointer;
  padding: 8px 10px; border-radius: 6px; font: 13px 'Segoe UI', Tahoma, sans-serif; color: #1f2937;
}
.rb-fileitem:hover { background: #f5f5f5; }
.rb-fileitem svg { width: 20px; height: 20px; color: #185abd; }
.rb-grid {
  position: absolute; top: 100%; inset-inline-start: 0; z-index: 40; background: #fff;
  border: 1px solid #d1cfcd; border-radius: 8px; padding: 8px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.13);
}
.rb-grid-cells {
  display: grid; grid-template-columns: repeat(10, 17px); grid-auto-rows: 17px; gap: 2px; direction: rtl;
}
.rb-grid-cells span { border: 1px solid #c8c6c4; border-radius: 2px; background: #fff; }
.rb-grid-cells span.on { background: #cfe0f5; border-color: #185abd; }
.rb-grid-cap { text-align: center; font: 12px 'Segoe UI', Tahoma, sans-serif; color: #444; padding-top: 6px; }
`
  document.head.append(style)
}
