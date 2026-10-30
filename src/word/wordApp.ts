// EXELMJ Word mode — a Word-like docx editor living beside the sheet app.
//
// The editor is TipTap (ProseMirror): a native contenteditable, so the BROWSER
// does Arabic bidi/shaping/caret — the exact property Univer's canvas engine
// lacks (which is why the sheet side needed the whole rtlMirror apparatus).
// The word container sits OUTSIDE the mirrored sheet host and is never
// affected by it.
//
// File I/O goes through the existing bridge: readFile/saveFile/saveFileAs
// handle raw bytes for any extension; printing reuses the hidden-window
// 'print:html' channel with @page A4 + preferCSSPageSize.
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { TableKit } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import { getLang, t } from '../i18n/i18n'
import { importDocx } from './docxImport'
import { exportDocx, type TipTapNode } from './docxExport'
import { Direction } from './direction'
import { LineHeight } from './lineHeight'
import { TableShading } from './tableShading'
import { TableBorders } from './tableBorders'
import { FindBar, FindReplace } from './findReplace'
import { TableTools } from './tableTools'
import { PageBreak, ParagraphSpacing, Subscript, Superscript } from './wordExtras'
import { MergeField } from './mergeField'
import { CommentExtension } from '@sereneinserenade/tiptap-comment-extension'
import { Footnote, FootnoteReference, Footnotes } from 'tiptap-footnotes'
import Document from '@tiptap/extension-document'
import { CommentPane } from './commentPane'
import {
  TrackChangesExtension,
  DeletionMark,
  InsertionMark,
  FormatChangeMark,
  getPendingChangeCount,
  getTrackedChanges
} from 'tiptap-track-changes'
import {
  makeThread,
  newThreadId,
  type AnchoredThread,
  type CommentThread
} from './comments'
import {
  fieldLabel,
  mergeAll,
  missingFields,
  sheetToRecords,
  type MergeFieldAttrs,
  type MergeSource
} from './mailMerge'
import { amountInWords, CURRENCIES } from './tafqit'
import { askForm } from './askForm'
import { documentTemplates } from './templates'
import {
  formatLike,
  guessSeparator,
  rowsToText,
  sumColumn,
  textToRows,
  type Separator
} from './tableOffice'
import {
  applyPageSetup,
  applyWatermark,
  clampSetup,
  contentHeightPx,
  contentWidthPx,
  defaultPageSetup,
  mmToPx,
  pageAt,
  pageStarts,
  paintPageGuides,
  type PageSetup
} from './pageSetup'
import { reportWordDirty } from './dirtyMux'
import { buildDocPrintHtml, printBands } from './printDoc'
import { buildRibbon, type RibbonActions } from './ribbon'

const ZOOM_STEPS = [50, 75, 90, 100, 125, 150, 200]

export class WordApp {
  private editor: Editor | null = null
  private root: HTMLElement
  private toolbar: HTMLElement | null = null
  private noticeBar: HTMLElement | null = null
  private statusBar: HTMLElement | null = null
  private commentPane: CommentPane | null = null
  private threads = new Map<string, CommentThread>()
  private showResolved = false
  private commentsVisible = true
  private commentSeq = 0
  private suggesting = false
  private imageInput: HTMLInputElement | null = null
  private findBar: FindBar | null = null
  private tableTools = new TableTools()
  private painter: { marks: Array<{ type: string; attrs?: Record<string, unknown> }> } | null = null
  private page: PageSetup = defaultPageSetup()
  private pageCount = 1
  private guideTimer: ReturnType<typeof setTimeout> | null = null
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null
  private mounted = false
  filePath: string | null = null
  dirty = false
  private loading = false
  private systemFonts: string[]

  constructor(systemFonts: string[] = []) {
    this.root = document.getElementById('word-app') as HTMLElement
    this.systemFonts = systemFonts
  }

  /** Build DOM + editor on first use (word mode is lazy-loaded). */
  mount() {
    if (this.mounted) return
    this.mounted = true
    const rtl = getLang() === 'ar'
    this.root.dir = rtl ? 'rtl' : 'ltr'
    this.root.innerHTML = ''
    injectWordCss()

    this.toolbar = document.createElement('div')
    this.toolbar.id = 'exelmj-word-toolbar'
    this.root.append(this.toolbar)

    this.noticeBar = document.createElement('div')
    this.noticeBar.id = 'exelmj-word-notice'
    this.noticeBar.style.display = 'none'
    this.root.append(this.noticeBar)

    this.findBar = new FindBar()
    this.root.append(this.findBar.element)

    const scroller = document.createElement('div')
    scroller.id = 'exelmj-word-scroll'
    const stage = document.createElement('div')
    stage.id = 'exelmj-word-stage'
    const page = document.createElement('div')
    page.id = 'exelmj-word-page'
    this.commentPane = new CommentPane({
      activate: (id) => this.focusComment(id),
      reply: (id) => void this.replyToComment(id),
      resolve: (id) => this.toggleResolved(id),
      remove: (id) => this.deleteComment(id),
      edit: (id) => void this.editComment(id)
    })
    this.commentPane.setLang(rtl ? 'ar' : 'en')
    stage.dir = rtl ? 'rtl' : 'ltr'
    stage.append(page, this.commentPane.element)
    scroller.append(stage)
    this.root.append(scroller)

    this.statusBar = document.createElement('div')
    this.statusBar.id = 'exelmj-word-status'
    const counts = document.createElement('span')
    counts.id = 'exelmj-word-counts'
    const pages = document.createElement('span')
    pages.id = 'exelmj-word-pages'
    const zoomBox = document.createElement('span')
    zoomBox.id = 'exelmj-word-zoom'
    const zoomOut = document.createElement('button')
    zoomOut.type = 'button'
    zoomOut.textContent = '−'
    zoomOut.title = t('ribbonZoom')
    zoomOut.addEventListener('click', () => this.zoomStep(-1))
    const zoomLabel = document.createElement('span')
    zoomLabel.id = 'exelmj-word-zoomlabel'
    zoomLabel.textContent = '100%'
    const zoomIn = document.createElement('button')
    zoomIn.type = 'button'
    zoomIn.textContent = '+'
    zoomIn.title = t('ribbonZoom')
    zoomIn.addEventListener('click', () => this.zoomStep(1))
    zoomBox.append(zoomOut, zoomLabel, zoomIn)
    this.statusBar.append(counts, pages, zoomBox)
    this.root.append(this.statusBar)

    this.editor = new Editor({
      element: page,
      extensions: [
        // The footnote list is its own node at the very end of the document, so
        // the doc's content rule has to admit it — StarterKit's Document does
        // not, and without this the button inserts a reference with no note.
        StarterKit.configure({ link: { openOnClick: false }, document: false }),
        Document.extend({ content: 'block+ footnotes?' }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
          alignments: ['left', 'center', 'right', 'justify'],
          defaultAlignment: rtl ? 'right' : 'left'
        }),
        // lineHeight OFF: TipTap's is a text-style mark that needs a selection.
        // ./lineHeight replaces it with a paragraph attribute, like Word.
        TextStyleKit.configure({ lineHeight: false }),
        LineHeight,
        Highlight.configure({ multicolor: true }),
        TableKit.configure({ table: { resizable: true } }),
        TableShading,
        TableBorders,
        Image.configure({ inline: true, allowBase64: true, resize: { enabled: true } }),
        Direction,
        PageBreak,
        Superscript,
        Subscript,
        ParagraphSpacing,
        MergeField,
        Footnotes,
        Footnote,
        FootnoteReference,
        TrackChangesExtension.configure({
          author: { id: 'me', name: this.lastAuthor() || t('wordCommentAuthor'), color: '#c2410c' },
          mode: 'edit'
        }),
        InsertionMark,
        DeletionMark,
        FormatChangeMark,
        CommentExtension.configure({
          HTMLAttributes: { class: 'exelmj-comment' },
          onCommentActivated: (id: string) => this.commentPane?.setActive(id || null)
        }),
        FindReplace.configure({ onOpen: () => this.findBar?.open() })
      ],
      editorProps: {
        attributes: { dir: rtl ? 'rtl' : 'ltr', lang: rtl ? 'ar' : 'en', class: 'exelmj-word-editor' }
      },
      content: '<p></p>',
      onUpdate: () => {
        if (!this.loading && !this.dirty) this.setDirty(true)
        this.refreshStatus()
        this.scheduleGuides()
        this.scheduleAutosave()
      },
      onSelectionUpdate: () => {
        this.refreshToolbarState()
        // the status bar shows which page the caret is on — that changes with
        // the selection, not only when the document is edited
        this.refreshStatus()
        this.applyPainter()
      }
    })

    this.buildToolbar()
    this.findBar.attach(this.editor)
    const pageEl = document.getElementById('exelmj-word-page')
    if (pageEl) this.tableTools.attach(this.editor, pageEl)
    this.applyPage()
    this.refreshStatus()
    // A pending "open with" file must win over the recovery prompt.
    setTimeout(() => void this.offerRecovery(), 1500)
  }

  /** Sheet + text column geometry, then the page-break guides. */
  private applyPage() {
    const sheet = document.getElementById('exelmj-word-page')
    if (sheet) applyWatermark(sheet, this.page)
    const pageEl = document.getElementById('exelmj-word-page')
    if (!pageEl) return
    applyPageSetup(pageEl, (this.editor?.view.dom as HTMLElement) ?? null, this.page)
    this.scheduleGuides()
  }

  private scheduleGuides() {
    if (this.guideTimer) clearTimeout(this.guideTimer)
    this.guideTimer = setTimeout(() => {
      const pageEl = document.getElementById('exelmj-word-page')
      if (!pageEl) return
      this.pageCount = paintPageGuides(
        pageEl,
        (this.editor?.view.dom as HTMLElement) ?? null,
        this.page,
        (n) => `${t('wordPage')} ${n}`
      )
      this.refreshStatus()
      this.refreshComments()
    }, 220)
  }

  focus() {
    this.editor?.commands.focus()
  }

  undo() {
    this.editor?.commands.undo()
  }

  redo() {
    this.editor?.commands.redo()
  }

  private setDirty(dirty: boolean) {
    this.dirty = dirty
    reportWordDirty(dirty)
    this.updateTitle()
  }

  updateTitle() {
    const name = this.filePath ? basename(this.filePath) : t('wordNewDocName')
    document.title = `${this.dirty ? '* ' : ''}${name} — ${t('appName')}`
  }

  newDoc() {
    if (!this.editor) return
    this.threads.clear()
    this.loading = true
    this.editor.commands.setContent('<p></p>')
    this.loading = false
    this.filePath = null
    this.page = defaultPageSetup()
    this.applyPage()
    this.showNotice([])
    this.setDirty(false)
    window.exelmj?.clearAutosave?.('word')
  }

  /** Which printed page the caret sits on (zoom-corrected). */
  private currentPage(): number {
    const editor = this.editor
    const pageEl = document.getElementById('exelmj-word-page')
    if (!editor || !pageEl) return 1
    try {
      const caret = editor.view.coordsAtPos(editor.state.selection.from)
      const scale = this.zoom / 100
      const y = (caret.top - pageEl.getBoundingClientRect().top) / scale - mmToPx(this.page.margin.top)
      const blocks = Array.from((editor.view.dom as HTMLElement).children) as HTMLElement[]
      const starts = pageStarts(blocks, contentHeightPx(this.page))
      return Math.min(this.pageCount, Math.max(1, pageAt(starts, y)))
    } catch {
      return 1
    }
  }

  async openViaBytes(path: string, bytes: Uint8Array) {
    if (!this.editor) return
    try {
      const { html, warnings, page, comments } = await importDocx(bytes)
      this.loading = true
      this.editor.commands.setContent(html)
      this.loading = false
      this.threads.clear()
      for (const thread of comments ?? []) this.threads.set(thread.id, thread)
      this.filePath = path
      if (page) this.page = clampSetup(page)
      this.applyPage()
      this.showNotice(warnings)
      this.setDirty(false)
      window.exelmj?.clearAutosave?.('word')
      this.editor.commands.focus('start')
    } catch (err) {
      console.warn('[word] import failed', err)
      // NOT window.alert: a native modal freezes the whole renderer while it is
      // up, so a file that fails to open takes the app with it until someone
      // clicks OK. The notice bar says the same thing and leaves the app usable.
      this.loading = false
      this.showNotice(['open'], t('wordOpenFailed'))
    }
  }

  /** A PDF is not a document — it is rebuilt into one (see ./pdfToDoc). */
  async openPdfBytes(path: string, bytes: Uint8Array) {
    if (!this.editor) return
    this.showNotice([], t('wordPdfImporting'))
    try {
      const { pdfToHtml } = await import('./pdfToDoc')
      const { html, setup, direction } = await pdfToHtml(bytes)
      this.loading = true
      this.editor.commands.setContent(html)
      this.loading = false
      // An English statement must not be laid out right-to-left just because
      // the app's own language is Arabic: the FILE decides which way the
      // document reads, exactly as it decides its paper and its body size.
      this.setDocDirection(direction)
      // it is a CONVERSION, so it deliberately has no file path: saving asks
      // for a .docx name instead of overwriting the pdf
      this.filePath = null
      // the paper and margins come from the FILE, so the rebuilt document
      // breaks its lines where the original did
      this.page = clampSetup({ ...defaultPageSetup(), ...setup })
      this.applyPage()
      this.showNotice([], t('wordPdfImported'))
      this.setDirty(true)
      this.editor.commands.focus('start')
      document.title = `* ${basename(path)} — ${t('appName')}`
    } catch (err) {
      console.warn('[word] pdf import failed', err)
      this.showNotice([])
      alert(t('wordPdfFailed'))
    }
  }

  async openPath(path: string) {
    if (!window.exelmj) return
    const res = await window.exelmj.readFile(path).catch(() => null)
    if (!res) return
    if (/\.pdf$/i.test(res.path)) await this.openPdfBytes(res.path, res.bytes)
    else await this.openViaBytes(res.path, res.bytes)
  }

  private async exportBytes(silent = false): Promise<Uint8Array | null> {
    if (!this.editor) return null
    try {
      return await exportDocx(this.editor.getJSON() as TipTapNode, getLang(), {
        page: this.page,
        // only the threads still anchored in the text: a note whose words were
        // deleted has nothing left to point at
        comments: [...this.threads.values()].filter((thread) => this.commentRange(thread.id))
      })
    } catch (err) {
      console.warn('[word] export failed', err)
      if (!silent) alert(t('wordSaveFailed'))
      return null
    }
  }

  async save(): Promise<boolean> {
    if (!window.exelmj) return false
    if (!this.filePath) return this.saveAs()
    const bytes = await this.exportBytes()
    if (!bytes) return false
    try {
      const ok = await window.exelmj.saveFile(this.filePath, bytes)
      if (ok) {
        this.setDirty(false)
        window.exelmj?.clearAutosave?.('word')
      }
      else alert(t('wordSaveFailed'))
      return ok
    } catch (err) {
      console.warn('[word] save failed', err)
      alert(t('wordSaveFailed'))
      return false
    }
  }

  async saveAs(): Promise<boolean> {
    if (!window.exelmj) return false
    const bytes = await this.exportBytes()
    if (!bytes) return false
    const suggested = this.filePath ? basename(this.filePath) : `${t('wordNewDocName')}.docx`
    try {
      const saved = await window.exelmj.saveFileAs(bytes, suggested, 'docx')
      if (!saved) return false
      this.filePath = saved
      this.setDirty(false)
      window.exelmj?.clearAutosave?.('word')
      return true
    } catch (err) {
      console.warn('[word] save-as failed', err)
      alert(t('wordSaveFailed'))
      return false
    }
  }

  async saveThenClose() {
    const ok = await this.save()
    if (ok) window.exelmj?.requestClose()
  }

  async print(mode: 'print' | 'pdf') {
    if (!this.editor || !window.exelmj?.printSheet) return
    const name = this.filePath ? basename(this.filePath).replace(/\.docx$/i, '') : t('wordNewDocName')
    const rtl = this.root.dir === 'rtl'
    const html = buildDocPrintHtml(this.editor.getHTML(), rtl, this.page)
    const opts = {
      preferCSSPageSize: true,
      landscape: this.page.orientation === 'landscape',
      bands: printBands(this.page, rtl)
    }
    try {
      await window.exelmj.printSheet(html, mode, `${name}.pdf`, opts)
    } catch (err) {
      if (/cancel/i.test(String(err))) return
      console.warn('[word] print failed', err)
      // The usual cause is an offline default printer, which fails BEFORE the
      // print dialog appears — so offer the printer list instead of dying mute.
      if (mode === 'print' && (await this.printOnPickedPrinter(html, name, opts))) return
      alert(t('wordPrintFailed'))
    }
  }

  /** Second chance after a print failure: let the user name the printer. */
  private async printOnPickedPrinter(
    html: string,
    name: string,
    opts: Record<string, unknown>
  ): Promise<boolean> {
    const printers = (await window.exelmj?.listPrinters?.().catch(() => [])) ?? []
    if (!printers.length) return false
    const res = await askForm(
      t('wordPrint'),
      [
        {
          key: 'device',
          label: t('wordPrinter'),
          type: 'select',
          options: printers.map((p) => [p.name, p.label] as [string, string]),
          value: printers[0].name
        }
      ],
      { note: t('wordPrintFailed') }
    )
    if (!res || !res.device) return false
    try {
      await window.exelmj?.printSheet?.(html, 'print', `${name}.pdf`, {
        ...opts,
        deviceName: res.device
      })
      return true
    } catch (err) {
      console.warn('[word] print retry failed', err)
      return false
    }
  }

  private showNotice(warnings: string[], message?: string) {
    if (!this.noticeBar) return
    if (!warnings.length && !message) {
      this.noticeBar.style.display = 'none'
      return
    }
    this.noticeBar.textContent = message ?? t('wordUnsupportedNotice')
    this.noticeBar.style.display = 'block'
  }

  private refreshStatus() {
    if (!this.statusBar || !this.editor) return
    const text = this.editor.getText()
    const words = (text.match(/\S+/g) ?? []).length
    const chars = text.replace(/\s/g, '').length
    const counts = document.getElementById('exelmj-word-counts')
    if (counts) counts.textContent = `${t('wordWords')}: ${words}   ${t('wordChars')}: ${chars}`
    const pages = document.getElementById('exelmj-word-pages')
    if (pages) pages.textContent = `${t('wordPage')} ${this.currentPage()} ${t('wordPageOf')} ${this.pageCount}`
    const pending = this.pendingChanges()
    if (counts && pending) counts.textContent += `  •  ${pending} ${t('wordChangesCount')}`
    const zoomLabel = document.getElementById('exelmj-word-zoomlabel')
    if (zoomLabel) zoomLabel.textContent = `${this.zoom}%`
  }

  private toolbarButtons = new Map<string, HTMLButtonElement>()

  private refreshToolbarState() {
    const ed = this.editor
    if (!ed) return
    const active: Record<string, boolean> = {
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      bullets: ed.isActive('bulletList'),
      numbers: ed.isActive('orderedList'),
      alignRight: ed.isActive({ textAlign: 'right' }),
      alignCenter: ed.isActive({ textAlign: 'center' }),
      alignLeft: ed.isActive({ textAlign: 'left' }),
      alignJustify: ed.isActive({ textAlign: 'justify' })
    }
    for (const [key, btn] of this.toolbarButtons) {
      if (key in active) btn.classList.toggle('active', !!active[key])
    }
    const inTable = ed.isActive('table')
    for (const key of ['tAddRow', 'tAddCol', 'tDelRow', 'tDelCol', 'tDel']) {
      const btn = this.toolbarButtons.get(key)
      if (btn) btn.disabled = !inTable
    }
  }

  private buildToolbar() {
    const bar = this.toolbar
    const ed = this.editor
    if (!bar || !ed) return

    const actions: RibbonActions = {
      newDoc: () => this.requestNew(),
      open: () => void this.openDialog(),
      save: () => void this.save(),
      saveAs: () => void this.saveAs(),
      print: () => void this.print('print'),
      exportPdf: () => void this.print('pdf'),
      undo: () => ed.chain().focus().undo().run(),
      redo: () => ed.chain().focus().redo().run(),
      setFont: (family) =>
        family
          ? // JSON.stringify quotes it: "29LT Adir" or ". Semi" are invalid as
            // bare CSS identifiers, so the declaration was dropped silently.
            ed.chain().focus().setFontFamily(JSON.stringify(family)).run()
          : ed.chain().focus().unsetFontFamily().run(),
      setFontSize: (pt) =>
        pt ? ed.chain().focus().setFontSize(`${pt}pt`).run() : ed.chain().focus().unsetFontSize().run(),
      toggleBold: () => ed.chain().focus().toggleBold().run(),
      toggleItalic: () => ed.chain().focus().toggleItalic().run(),
      toggleUnderline: () => ed.chain().focus().toggleUnderline().run(),
      toggleStrike: () => ed.chain().focus().toggleStrike().run(),
      setColor: (hex) => ed.chain().focus().setColor(hex).run(),
      clearColor: () => ed.chain().focus().unsetColor().run(),
      setHighlight: (hex) => ed.chain().focus().setHighlight({ color: hex }).run(),
      clearHighlight: () => ed.chain().focus().unsetHighlight().run(),
      clearFormat: () => ed.chain().focus().unsetAllMarks().setParagraph().run(),
      setBlock: (kind) =>
        kind === 'p'
          ? ed.chain().focus().setParagraph().run()
          : kind === 'quote'
            ? ed.chain().focus().toggleBlockquote().run()
            : ed.chain().focus().setHeading({ level: kind }).run(),
      toggleBullets: () => ed.chain().focus().toggleBulletList().run(),
      toggleNumbers: () => ed.chain().focus().toggleOrderedList().run(),
      indent: () => ed.chain().focus().sinkListItem('listItem').run(),
      outdent: () => ed.chain().focus().liftListItem('listItem').run(),
      setAlign: (align) => ed.chain().focus().setTextAlign(align).run(),
      setDirection: (dir) => ed.chain().focus().setDirection(dir).run(),
      setLineHeight: (value) =>
        value ? ed.chain().focus().setLineHeight(value).run() : ed.chain().focus().unsetLineHeight().run(),
      insertTable: (rows, cols) =>
        ed.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run(),
      insertTableExact: () => void this.tableSizeDialog(),
      insertPageBreak: () => ed.chain().focus().setPageBreak().run(),
      insertMergeField: () => void this.mergeFieldDialog(),
      runMailMerge: () => void this.mailMergeDialog(),
      amountInWords: () => void this.amountWordsDialog(),
      addComment: () => void this.addCommentDialog(),
      toggleComments: () => this.toggleCommentsVisible(),
      toggleTrackChanges: () => void this.toggleSuggesting(),
      insertFootnote: () => this.insertFootnote(),
      reviewChange: (action) => void this.reviewChange(action),
      insertHorizontalRule: () => ed.chain().focus().setHorizontalRule().run(),
      insertDate: () => void this.insertDateDialog(),
      toggleSuperscript: () => ed.chain().focus().toggleSuperscript().run(),
      toggleSubscript: () => ed.chain().focus().toggleSubscript().run(),
      paragraphSpacing: () => void this.spacingDialog(),
      toggleFormattingMarks: () => this.toggleFormattingMarks(),
      formatPainter: () => this.startPainter(),
      newFromTemplate: () => void this.templateDialog(),
      watermark: () => void this.watermarkDialog(),
      documentStats: () => void this.statsDialog(),
      textToTable: () => void this.textToTableDialog(),
      tableToText: () => this.tableToText(),
      sumColumn: () => this.sumCurrentColumn(),
      insertToc: () => this.insertToc(),
      convertDigits: (toHindi) => this.convertDigits(toHindi),
      tableOp: (op) => {
        const chain = ed.chain().focus()
        if (op === 'addRow') chain.addRowAfter().run()
        else if (op === 'addCol') chain.addColumnAfter().run()
        else if (op === 'delRow') chain.deleteRow().run()
        else if (op === 'delCol') chain.deleteColumn().run()
        else if (op === 'merge') chain.mergeCells().run()
        else if (op === 'split') chain.splitCell().run()
        else if (op === 'headerRow') chain.toggleHeaderRow().run()
        else chain.deleteTable().run()
      },
      insertImage: () => this.pickImage(),
      insertLink: () => void this.linkDialog(),
      find: () => this.findBar?.open(),
      headerFooter: () => void this.headerFooterDialog(),
      pageSetup: () => void this.pageSetupDialog(),
      cellShading: (hex) => ed.chain().focus().setCellBackground(hex).run(),
      setZoom: (percent) => this.applyZoom(percent)
    }

    const handles = buildRibbon(bar, actions, this.systemFonts)
    this.toolbarButtons = handles.buttons
    // state refresh after every ribbon click, not only selection changes
    bar.addEventListener('click', () => setTimeout(() => this.refreshToolbarState(), 0))

    this.refreshToolbarState()
  }

  private zoom = 100

  private applyZoom(percent: number) {
    this.zoom = Math.max(50, Math.min(200, percent))
    const page = document.getElementById('exelmj-word-page')
    if (page) {
      page.style.transformOrigin = 'top center'
      page.style.transform = this.zoom === 100 ? '' : `scale(${this.zoom / 100})`
    }
    this.refreshStatus()
  }

  zoomStep(delta: 1 | -1) {
    const idx = ZOOM_STEPS.findIndex((z) => z >= this.zoom)
    const cur = idx < 0 ? ZOOM_STEPS.length - 1 : idx
    const next = Math.max(0, Math.min(ZOOM_STEPS.length - 1, cur + delta))
    this.applyZoom(ZOOM_STEPS[next])
  }

  get zoomPercent() {
    return this.zoom
  }

  /** Menu/toolbar "new": never wipe an unsaved document silently. */
  requestNew() {
    void this.confirmDiscardThen(() => this.newDoc())
  }

  private async confirmDiscardThen(run: () => void) {
    // The app's OWN modal, not window.confirm: the native one freezes the whole
    // renderer while it is up, which stalls anything else the app is doing (and
    // any automation driving it). OK means "discard and continue".
    if (this.dirty) {
      const answer = await askForm(t('wordDiscardTitle'), [
        { key: 'note', label: t('wordDiscardConfirm'), type: 'note' }
      ])
      if (!answer) return
    }
    run()
  }

  private async openDialog() {
    if (!window.exelmj) return
    // Opening REPLACES this document, so it needs the same guard as "new" —
    // without it an unsaved edit vanished the moment a file was picked.
    if (this.dirty) {
      const go = await askForm(t('wordDiscardTitle'), [
        { key: 'note', label: t('wordDiscardConfirm'), type: 'note' }
      ])
      if (!go) return
    }
    const res = await window.exelmj.openFile().catch(() => null)
    if (!res) return
    if (/\.docx$/i.test(res.path)) {
      await this.openViaBytes(res.path, res.bytes)
    } else if (/\.pdf$/i.test(res.path)) {
      await this.openPdfBytes(res.path, res.bytes)
    } else {
      // A spreadsheet was picked from the word toolbar — hand it to the sheet
      // side through the same open-path route the menu uses.
      openInSheetMode?.(res.path, res.bytes)
    }
  }

  /** Link dialog — Electron refuses window.prompt, which is why this exists. */
  private async linkDialog() {
    const ed = this.editor
    if (!ed) return
    const current = String(ed.getAttributes('link').href ?? '')
    const res = await askForm(
      t('wordLinkTitle'),
      [{ key: 'href', label: t('wordLinkAddress'), value: current, hint: t('wordLinkHint') }],
      current ? { extra: { key: 'remove', label: t('wordLinkRemove') } } : {}
    )
    if (!res) {
      ed.commands.focus()
      return
    }
    const raw = (res.href ?? '').trim()
    if (res.__action === 'remove' || !raw) {
      ed.chain().focus().unsetLink().run()
      return
    }
    const url = /^(https?:|mailto:)/i.test(raw) ? raw : `https://${raw}`
    if (ed.state.selection.empty) {
      // Nothing selected: drop the address in as its own linked text.
      ed.chain()
        .focus()
        .insertContent({ type: 'text', text: raw, marks: [{ type: 'link', attrs: { href: url } }] })
        .run()
    } else {
      ed.chain().focus().setLink({ href: url }).run()
    }
  }

  /** Point the whole document one way — used when a file says which way it reads. */
  private setDocDirection(dir: 'rtl' | 'ltr') {
    const dom = this.editor?.view.dom as HTMLElement | undefined
    if (!dom) return
    dom.dir = dir
    dom.lang = dir === 'rtl' ? 'ar' : 'en'
    this.root.dir = dir
    const page = document.getElementById('exelmj-word-page')
    if (page) page.dir = dir
    // the comment gutter belongs in the margin the text does not start from
    const stage = document.getElementById('exelmj-word-stage')
    if (stage) stage.dir = dir
    this.commentPane?.setLang(dir === 'rtl' ? 'ar' : 'en')
    this.refreshComments()
  }

  private async templateDialog() {
    const templates = documentTemplates()
    const res = await askForm(t('wordTemplates'), [
      {
        key: 'kind',
        label: t('wordTemplates'),
        type: 'select',
        value: templates[0].key,
        options: templates.map((tpl) => [tpl.key, tpl.label] as [string, string])
      }
    ])
    if (!res) return
    const chosen = templates.find((tpl) => tpl.key === res.kind) ?? templates[0]
    await this.confirmDiscardThen(() => {
      if (!this.editor) return
      this.loading = true
      this.editor.commands.setContent(chosen.html)
      this.loading = false
      this.filePath = null
      this.showNotice([])
      this.setDirty(true)
      this.editor.commands.focus('start')
    })
  }

  private async watermarkDialog() {
    const res = await askForm(t('wordWatermark'), [
      {
        key: 'text',
        label: t('wordWatermarkText'),
        type: 'text',
        value: this.page.watermark || t('wordWatermarkDraft')
      }
    ])
    if (!res) return
    this.page = clampSetup({ ...this.page, watermark: (res.text ?? '').trim() })
    this.applyPage()
    this.setDirty(true)
  }

  private async statsDialog() {
    const editor = this.editor
    if (!editor) return
    const text = editor.getText()
    const dom = editor.view.dom as HTMLElement
    const stats: Array<[string, number]> = [
      [t('wordStatsWords'), (text.match(/\S+/g) ?? []).length],
      [t('wordStatsChars'), text.length],
      [t('wordStatsCharsNo'), text.replace(/\s/g, '').length],
      [t('wordStatsParas'), dom.querySelectorAll('p, h1, h2, h3, h4, li').length],
      [t('wordStatsTables'), dom.querySelectorAll('table').length],
      [t('wordStatsImages'), dom.querySelectorAll('img').length],
      [t('wordStatsPages'), this.pageCount]
    ]
    await askForm(
      t('wordStats'),
      stats.map(([label, value]) => ({
        key: label,
        label,
        type: 'text' as const,
        value: String(value),
        readonly: true
      }))
    )
  }

  /** A pasted list becomes a table — the office's most common table by far. */
  private async textToTableDialog() {
    const editor = this.editor
    if (!editor) return
    const { from, to } = editor.state.selection
    const text = editor.state.doc.textBetween(from, to, '\n', ' ')
    if (!text.trim()) {
      alert(t('wordSelectTextFirst'))
      return
    }
    const guessed = guessSeparator(text)
    const res = await askForm(t('wordTextToTable'), [
      {
        key: 'sep',
        label: t('wordSeparator'),
        type: 'select',
        value: guessed,
        options: [
          ['tab', t('wordSepTab')],
          ['comma', t('wordSepComma')],
          ['semicolon', t('wordSepSemicolon')],
          ['space', t('wordSepSpace')]
        ]
      },
      { key: 'header', label: t('wordTableHeaderRow'), type: 'checkbox', value: 'true' }
    ])
    if (!res) return
    const rows = textToRows(text, (res.sep as Separator) ?? guessed)
    if (!rows.length) return
    const header = res.header === 'true'
    const cell = (value: string, head: boolean) =>
      `<${head ? 'th' : 'td'}><p>${value.replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
      )}</p></${head ? 'th' : 'td'}>`
    const html = `<table><tbody>${rows
      .map((row, index) => `<tr>${row.map((value) => cell(value, header && index === 0)).join('')}</tr>`)
      .join('')}</tbody></table>`
    editor.chain().focus().deleteSelection().insertContent(html).run()
  }

  /** …and back again, tab separated, so it can be pasted into the sheet side. */
  private tableToText() {
    const editor = this.editor
    if (!editor) return
    const dom = editor.view.domAtPos(editor.state.selection.from)?.node
    const el = dom instanceof HTMLElement ? dom : dom?.parentElement
    const table = el?.closest('table')
    if (!table) {
      alert(t('wordPutCursorInTable'))
      return
    }
    const rows = [...table.rows].map((row) => [...row.cells].map((c) => c.innerText.trim()))
    const text = rowsToText(rows)
    const dir = this.root.dir === 'rtl' ? 'rtl' : 'ltr'
    const html = text
      .split('\n')
      .map((line) => `<p dir="${dir}">${line.replace(/[&<>]/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'
      )}</p>`)
      .join('')
    editor.chain().focus().deleteNode('table').insertContent(html).run()
  }

  /** Word's Formula=SUM(ABOVE), the way an invoice actually needs it. */
  private sumCurrentColumn() {
    const editor = this.editor
    if (!editor) return
    const dom = editor.view.domAtPos(editor.state.selection.from)?.node
    const el = dom instanceof HTMLElement ? dom : dom?.parentElement
    const cell = el?.closest('td, th') as HTMLTableCellElement | null
    const table = cell?.closest('table')
    if (!cell || !table) {
      alert(t('wordPutCursorInTable'))
      return
    }
    const index = cell.cellIndex
    const values = [...table.rows]
      .filter((row) => row !== cell.parentElement)
      .map((row) => row.cells[index]?.innerText ?? '')
    const { total, counted, sample } = sumColumn(values)
    if (!counted) {
      alert(t('wordSumNoNumbers'))
      return
    }
    editor
      .chain()
      .focus()
      .command(({ tr, state, dispatch }) => {
        const pos = editor.view.posAtDOM(cell, 0)
        const $cell = state.doc.resolve(pos)
        const node = $cell.node()
        if (!node || !dispatch) return false
        tr.insertText(formatLike(total, sample), $cell.start(), $cell.start() + node.content.size)
        dispatch(tr)
        return true
      })
      .run()
  }

  /** A contents list built from the document's own headings, with page numbers. */
  private insertToc() {
    const editor = this.editor
    if (!editor) return
    const dom = editor.view.dom as HTMLElement
    const headings = [...dom.querySelectorAll('h1, h2, h3, h4')] as HTMLElement[]
    if (!headings.length) {
      alert(t('wordTocEmpty'))
      return
    }
    const step = contentHeightPx(this.page)
    const first = dom.firstElementChild as HTMLElement | null
    const originTop = first ? first.offsetTop : 0
    const rtl = this.root.dir === 'rtl'
    const rows = headings
      .map((heading) => {
        const level = Number(heading.tagName.slice(1)) || 1
        const page = Math.max(1, Math.floor((heading.offsetTop - originTop) / step) + 1)
        const text = (heading.innerText || '').trim()
        if (!text) return ''
        const indent = (level - 1) * 12
        const safe = text.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
        return (
          `<p dir="${rtl ? 'rtl' : 'ltr'}" style="text-align: ${rtl ? 'right' : 'left'}` +
          `${indent ? `; margin-inline-start: ${indent}pt` : ''}">` +
          `${safe}\u00a0\u00a0<span style="color: #667085">${page}</span></p>`
        )
      })
      .filter(Boolean)
      .join('')
    const title = `<h2 dir="${rtl ? 'rtl' : 'ltr'}" style="text-align: ${rtl ? 'right' : 'left'}">${t(
      'wordTocTitle'
    )}</h2>`
    editor
      .chain()
      .focus()
      .setTextSelection(0)
      .insertContentAt(0, `${title}${rows}<div data-page-break="true"></div>`)
      .run()
  }

  /** ١٢٣ ⇄ 123 across the selection (or the whole document when nothing is picked). */
  private convertDigits(toHindi: boolean) {
    const editor = this.editor
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const start = empty ? 0 : from
    const end = empty ? editor.state.doc.content.size : to
    const west = '0123456789'
    const hindi = '٠١٢٣٤٥٦٧٨٩'
    const { tr } = editor.state
    let changed = false
    editor.state.doc.nodesBetween(start, end, (node, pos) => {
      if (!node.isText || !node.text) return
      const text = node.text
      const converted = [...text]
        .map((ch) => {
          if (toHindi) {
            const i = west.indexOf(ch)
            return i >= 0 ? hindi[i] : ch
          }
          const i = hindi.indexOf(ch)
          return i >= 0 ? west[i] : ch
        })
        .join('')
      if (converted === text) return
      const nodeStart = Math.max(pos, start)
      const nodeEnd = Math.min(pos + text.length, end)
      const slice = converted.slice(nodeStart - pos, nodeEnd - pos)
      tr.insertText(slice, tr.mapping.map(nodeStart), tr.mapping.map(nodeEnd))
      changed = true
    })
    if (changed) editor.view.dispatch(tr)
    editor.commands.focus()
  }

  /** Insert a «field» that stands in for a value until the merge runs. */
  private async mergeFieldDialog() {
    const editor = this.editor
    if (!editor) return
    const headers = this.mergeHeaders()
    const res = await askForm(t('wordMergeField'), [
      {
        key: 'kind',
        label: t('wordFieldKind'),
        type: 'select',
        value: 'column',
        options: [
          ['column', t('wordFieldColumn')],
          ['date', t('wordFieldDate')],
          ['hijri', t('wordFieldHijri')],
          ['count', t('wordFieldCount')]
        ]
      },
      headers.length
        ? {
            key: 'name',
            label: t('wordFieldName'),
            type: 'select',
            value: headers[0],
            options: headers.map((h) => [h, h] as [string, string])
          }
        : { key: 'name', label: t('wordFieldName'), placeholder: t('wordFieldName') },
      {
        key: 'format',
        label: t('wordFieldFormat'),
        type: 'select',
        value: 'plain',
        options: [
          ['plain', t('wordFieldPlain')],
          ['words', t('wordFieldWords')]
        ]
      },
      {
        key: 'currency',
        label: t('wordFieldCurrency'),
        type: 'select',
        value: '',
        options: [
          ['', t('wordNoCurrency')],
          ...CURRENCIES.map((c) => [c.code, c.label] as [string, string])
        ]
      }
    ])
    if (!res) return
    const attrs: MergeFieldAttrs = {
      name: (res.name ?? '').trim(),
      source: (res.kind as MergeSource) || 'column',
      format: res.format === 'words' ? 'words' : 'plain',
      currency: res.currency ?? ''
    }
    if (attrs.source === 'column' && !attrs.name) return
    editor.chain().focus().insertMergeField(attrs).run()
  }

  /** The data the merge runs against, read off the sheet open next door. */
  private mergeRecords(): { headers: string[]; records: Record<string, string>[] } {
    const cells = readSheetCells?.() ?? []
    return sheetToRecords(cells)
  }

  private mergeHeaders(): string[] {
    try {
      return this.mergeRecords().headers
    } catch {
      return []
    }
  }

  /** Word's "finish and merge": every record becomes its own letter. */
  private async mailMergeDialog() {
    const editor = this.editor
    if (!editor) return
    const doc = editor.getJSON() as unknown as Parameters<typeof mergeAll>[0]
    const { headers, records } = this.mergeRecords()
    if (!records.length) {
      alert(t('wordMergeNoData'))
      return
    }
    const missing = missingFields(doc, headers)
    const fields = [
      { key: 'count', label: t('wordMergeCount'), value: String(records.length), readonly: true },
      { key: 'source', label: t('wordMergeSource'), value: headers.join(' | '), readonly: true },
      { key: 'pages', label: t('wordMergeSeparate'), type: 'checkbox' as const, value: 'true' },
      { key: 'note', label: t('wordMergeReplace'), type: 'note' as const }
    ]
    if (missing.length) {
      fields.splice(2, 0, {
        key: 'missing',
        label: t('wordMergeMissing'),
        value: missing.join(' | '),
        readonly: true
      })
    }
    const res = await askForm(t('wordMergeRun'), fields)
    if (!res) return
    const merged = mergeAll(doc, records, {
      pageBreaks: res.pages === 'true',
      lang: getLang() === 'ar' ? 'ar' : 'en'
    })
    // the template must survive: the merged letters become a NEW unsaved
    // document, so a later Save cannot overwrite what was merged from
    this.filePath = null
    this.loading = true
    editor.commands.setContent(merged as never)
    this.loading = false
    this.setDirty(true)
    this.updateTitle()
    this.refreshStatus()
    alert(t('wordMergeDone').replace('{0}', String(records.length)))
  }

  /** An amount written out in Arabic words, dropped in at the caret. */
  private async amountWordsDialog() {
    const editor = this.editor
    if (!editor) return
    const { from, to } = editor.state.selection
    const picked = editor.state.doc.textBetween(from, to, ' ', ' ').trim()
    const res = await askForm(t('wordAmountWords'), [
      { key: 'amount', label: t('wordAmountPrompt'), value: picked },
      {
        key: 'currency',
        label: t('wordFieldCurrency'),
        type: 'select',
        value: CURRENCIES[0].code,
        options: [
          ['', t('wordNoCurrency')],
          ...CURRENCIES.map((c) => [c.code, c.label] as [string, string])
        ]
      }
    ])
    if (!res || !(res.amount ?? '').trim()) return
    const text = amountInWords(res.amount, { currency: res.currency || undefined })
    if (!text) return
    editor.chain().focus().insertContent(text).run()
  }

  /**
   * Insert a footnote and put the caret in it. The extension's addFootnote()
   * only drops the reference in the text — without this the user types the note
   * into the paragraph they were writing.
   */
  private insertFootnote() {
    const editor = this.editor
    if (!editor) return
    const before = new Set(this.footnoteIds())
    editor.chain().focus().addFootnote().run()
    const added = this.footnoteIds().find((id) => !before.has(id))
    if (added) editor.commands.focusFootnote(added)
    this.setDirty(true)
  }

  private footnoteIds(): string[] {
    const editor = this.editor
    if (!editor) return []
    const ids: string[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name !== 'footnoteReference') return
      const id = String(node.attrs['data-id'] ?? '')
      if (id) ids.push(id)
    })
    return ids
  }

  // ---------- track changes ----------

  /** Word's "Track Changes": from here on, edits are suggestions. */
  private async toggleSuggesting() {
    const editor = this.editor
    if (!editor) return
    if (!this.suggesting) {
      const who = this.lastAuthor()
      if (!who) {
        const res = await askForm(t('wordTrackChanges'), [
          { key: 'author', label: t('wordWhoAreYou') }
        ])
        if (!res || !(res.author ?? '').trim()) return
        this.rememberAuthor(res.author.trim())
      }
      editor.commands.setTrackChangesAuthor({
        id: 'me',
        name: this.lastAuthor(),
        color: '#c2410c'
      })
      editor.commands.setSuggestMode()
      this.suggesting = true
    } else {
      editor.commands.setEditMode()
      this.suggesting = false
    }
    this.markToolbarState()
    this.refreshStatus()
    alert(t(this.suggesting ? 'wordTrackOn' : 'wordTrackOff'))
  }

  /** Accept or reject — one change under the caret, or the whole document. */
  private async reviewChange(action: 'accept' | 'reject' | 'acceptAll' | 'rejectAll') {
    const editor = this.editor
    if (!editor) return
    if (action === 'acceptAll' || action === 'rejectAll') {
      if (!getPendingChangeCount(editor)) return
      const ok = await askForm(
        t(action === 'acceptAll' ? 'wordAcceptAll' : 'wordRejectAll'),
        [{ key: 'note', label: t(action === 'acceptAll' ? 'wordConfirmAcceptAll' : 'wordConfirmRejectAll'), type: 'note' }]
      )
      if (!ok) return
      if (action === 'acceptAll') editor.commands.acceptAll()
      else editor.commands.rejectAll()
      this.refreshStatus()
      this.setDirty(true)
      return
    }
    const id = this.changeIdAtCaret()
    if (!id) {
      alert(t('wordNoChangeHere'))
      return
    }
    if (action === 'accept') editor.commands.acceptChange(id)
    else editor.commands.rejectChange(id)
    this.refreshStatus()
    this.setDirty(true)
  }

  /** The suggested change the caret sits in, if any. */
  private changeIdAtCaret(): string | null {
    const editor = this.editor
    if (!editor) return null
    const { from } = editor.state.selection
    for (const change of getTrackedChanges(editor)) {
      if (from >= change.from && from <= change.to) return change.changeId
    }
    return null
  }

  /** Pending-change count for the status bar. */
  private pendingChanges(): number {
    const editor = this.editor
    if (!editor) return 0
    try {
      return getPendingChangeCount(editor)
    } catch {
      return 0
    }
  }

  private markToolbarState() {
    const btn = this.toolbarButtons?.get('trackChanges')
    if (btn) btn.classList.toggle('active', this.suggesting)
  }

  // ---------- comments ----------

  /** Pin a note to the selected words. */
  private async addCommentDialog() {
    const editor = this.editor
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    if (empty) {
      alert(t('wordCommentSelect'))
      return
    }
    const res = await askForm(t('wordAddComment'), [
      { key: 'author', label: t('wordCommentAuthor'), value: this.lastAuthor() },
      { key: 'text', label: t('wordCommentText'), placeholder: t('wordCommentText') }
    ])
    if (!res || !(res.text ?? '').trim()) return
    const id = newThreadId(++this.commentSeq)
    this.threads.set(id, makeThread(id, (res.author ?? '').trim(), res.text.trim(), new Date().toISOString()))
    this.rememberAuthor((res.author ?? '').trim())
    editor.chain().focus().setTextSelection({ from, to }).setComment(id).run()
    this.commentsVisible = true
    this.refreshComments()
    this.setDirty(true)
  }

  private async replyToComment(id: string) {
    const thread = this.threads.get(id)
    if (!thread) return
    const res = await askForm(t('wordCommentReplyTitle'), [
      { key: 'author', label: t('wordCommentAuthor'), value: this.lastAuthor() },
      { key: 'text', label: t('wordCommentText') }
    ])
    if (!res || !(res.text ?? '').trim()) return
    thread.replies.push({
      author: (res.author ?? '').trim(),
      created: new Date().toISOString(),
      text: res.text.trim()
    })
    this.rememberAuthor((res.author ?? '').trim())
    this.refreshComments()
    this.setDirty(true)
  }

  private async editComment(id: string) {
    const thread = this.threads.get(id)
    if (!thread) return
    const res = await askForm(t('wordCommentEdit'), [
      { key: 'text', label: t('wordCommentText'), value: thread.text }
    ])
    if (!res || !(res.text ?? '').trim()) return
    thread.text = res.text.trim()
    this.refreshComments()
    this.setDirty(true)
  }

  private toggleResolved(id: string) {
    const thread = this.threads.get(id)
    if (!thread) return
    thread.resolved = !thread.resolved
    this.refreshComments()
    this.setDirty(true)
  }

  /** Remove the note AND its mark: a highlight with no card behind it is worse
   *  than no highlight at all. */
  private deleteComment(id: string) {
    const editor = this.editor
    if (!editor) return
    this.threads.delete(id)
    const range = this.commentRange(id)
    if (range) {
      editor.chain().focus().setTextSelection(range).unsetComment(id).setTextSelection(range.from).run()
    }
    this.refreshComments()
    this.setDirty(true)
  }

  private focusComment(id: string) {
    const editor = this.editor
    const range = this.commentRange(id)
    if (!editor || !range) return
    editor.chain().focus().setTextSelection(range).run()
    this.commentPane?.setActive(id)
  }

  /** Show / hide the gutter. Resolved notes stay hidden until asked for. */
  private toggleCommentsVisible() {
    if (this.commentsVisible && !this.showResolved && [...this.threads.values()].some((th) => th.resolved)) {
      // three states, one button: notes → notes + resolved → nothing
      this.showResolved = true
    } else if (this.commentsVisible) {
      this.commentsVisible = false
      this.showResolved = false
    } else {
      this.commentsVisible = true
    }
    this.refreshComments()
  }

  /** Where a thread's mark sits in the document, if it is still there. */
  private commentRange(id: string): { from: number; to: number } | null {
    const editor = this.editor
    if (!editor) return null
    let from = -1
    let to = -1
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      const mark = node.marks.find(
        (m) => m.type.name === 'comment' && String(m.attrs.commentId ?? '') === id
      )
      if (!mark) return
      if (from < 0) from = pos
      to = pos + node.nodeSize
    })
    return from < 0 ? null : { from, to }
  }

  /** Redraw the gutter from the marks actually present in the document. */
  private refreshComments() {
    const editor = this.editor
    const pane = this.commentPane
    const pageEl = document.getElementById('exelmj-word-page')
    if (!editor || !pane || !pageEl) return
    if (!this.commentsVisible) {
      pane.render([], false)
      return
    }
    const anchored: AnchoredThread[] = []
    const seen = new Set<string>()
    const pageTop = pageEl.getBoundingClientRect().top
    const scale = this.zoom / 100
    editor.state.doc.descendants((node, pos) => {
      if (!node.isText) return
      for (const mark of node.marks) {
        if (mark.type.name !== 'comment') continue
        const id = String(mark.attrs.commentId ?? '')
        const thread = this.threads.get(id)
        if (!thread || seen.has(id)) continue
        seen.add(id)
        let top = 0
        try {
          top = (editor.view.coordsAtPos(pos).top - pageTop) / scale
        } catch {
          top = 0
        }
        anchored.push({ thread, pos, top: Math.max(0, top) })
      }
    })
    pane.render(anchored, this.showResolved)
  }

  private lastAuthor(): string {
    try {
      return localStorage.getItem('exelmj-comment-author') ?? ''
    } catch {
      return ''
    }
  }

  private rememberAuthor(name: string) {
    if (!name) return
    try {
      localStorage.setItem('exelmj-comment-author', name)
    } catch {
      /* a locked-down profile is not a reason to lose the comment */
    }
  }

  private async tableSizeDialog() {
    const res = await askForm(t('wordTableExact'), [
      { key: 'rows', label: t('wordTableRows'), type: 'number', value: '3', min: 1, max: 60, step: 1 },
      { key: 'cols', label: t('wordTableCols'), type: 'number', value: '3', min: 1, max: 20, step: 1 },
      { key: 'header', label: t('wordTableHeaderRow'), type: 'checkbox', value: 'true' }
    ])
    if (!res) return
    const rows = Math.max(1, Math.min(60, Number(res.rows) || 3))
    const cols = Math.max(1, Math.min(20, Number(res.cols) || 3))
    this.editor
      ?.chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow: res.header === 'true' })
      .run()
  }

  private async insertDateDialog() {
    const now = new Date()
    const gregorian = new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(now)
    let hijri = ''
    try {
      hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(now)
    } catch {
      hijri = ''
    }
    const options: Array<[string, string]> = [[gregorian, gregorian]]
    if (hijri) options.push([hijri, `${hijri} (${t('wordDateHijri')})`])
    options.push([now.toISOString().slice(0, 10), now.toISOString().slice(0, 10)])
    const res = await askForm(t('wordInsertDate'), [
      { key: 'value', label: t('wordInsertDate'), type: 'select', value: gregorian, options }
    ])
    if (!res || !res.value) return
    this.editor?.chain().focus().insertContent(res.value).run()
  }

  private async spacingDialog() {
    const attrs = { ...this.editor?.getAttributes('paragraph'), ...this.editor?.getAttributes('heading') }
    const res = await askForm(t('wordParagraphSpacing'), [
      {
        key: 'before',
        label: t('wordSpaceBefore'),
        type: 'number',
        value: String(attrs.spaceBefore ?? 0),
        min: 0,
        max: 96,
        step: 1
      },
      {
        key: 'after',
        label: t('wordSpaceAfter'),
        type: 'number',
        value: String(attrs.spaceAfter ?? 0),
        min: 0,
        max: 96,
        step: 1
      }
    ])
    if (!res) return
    const num = (value: string) => {
      const n = Number(value)
      return Number.isFinite(n) && n > 0 ? n : null
    }
    this.editor?.chain().focus().setParagraphSpacing(num(res.before), num(res.after)).run()
  }

  private toggleFormattingMarks() {
    const dom = this.editor?.view.dom as HTMLElement | undefined
    dom?.classList.toggle('show-marks')
    this.toolbarButtons.get('formatMarks')?.classList.toggle('active', !!dom?.classList.contains('show-marks'))
    this.editor?.commands.focus()
  }

  /** Word's format painter: remember the marks here, paint the next selection. */
  private startPainter() {
    const editor = this.editor
    if (!editor) return
    const marks = editor.state.selection.$from.marks().map((mark) => ({
      type: mark.type.name,
      attrs: { ...mark.attrs }
    }))
    this.painter = { marks }
    this.toolbarButtons.get('formatPainter')?.classList.add('active')
    this.showNotice([], t('wordFormatPainterHint'))
    editor.commands.focus()
  }

  private applyPainter() {
    const editor = this.editor
    const painter = this.painter
    if (!editor || !painter) return
    const { from, to } = editor.state.selection
    if (from === to) return
    this.painter = null
    this.toolbarButtons.get('formatPainter')?.classList.remove('active')
    this.showNotice([])
    const chain = editor.chain().focus()
    chain.unsetAllMarks()
    for (const mark of painter.marks) chain.setMark(mark.type, mark.attrs)
    chain.run()
  }

  private async headerFooterDialog() {
    const res = await askForm(
      t('wordHeaderFooter'),
      [
        { key: 'header', label: t('wordHeaderText'), value: this.page.header },
        { key: 'footer', label: t('wordFooterText'), value: this.page.footer },
        {
          key: 'numbers',
          label: t('wordPageNumbers'),
          type: 'checkbox',
          value: String(this.page.pageNumbers)
        }
      ],
      { note: t('wordHeaderFooterNote') }
    )
    if (!res) return
    this.page = {
      ...this.page,
      header: (res.header ?? '').trim(),
      footer: (res.footer ?? '').trim(),
      pageNumbers: res.numbers === 'true'
    }
    this.setDirty(true)
    this.editor?.commands.focus()
  }

  private async pageSetupDialog() {
    const m = this.page.margin
    const res = await askForm(t('wordPageSetup'), [
      {
        key: 'size',
        label: t('wordPaperSize'),
        type: 'select',
        value: this.page.size,
        options: [
          ['A4', 'A4'],
          ['Letter', 'Letter']
        ]
      },
      {
        key: 'orientation',
        label: t('wordOrientation'),
        type: 'select',
        value: this.page.orientation,
        options: [
          ['portrait', t('wordPortrait')],
          ['landscape', t('wordLandscape')]
        ]
      },
      { key: 'top', label: t('wordMarginTop'), type: 'number', value: String(m.top), min: 0, max: 60, step: 1 },
      { key: 'bottom', label: t('wordMarginBottom'), type: 'number', value: String(m.bottom), min: 0, max: 60, step: 1 },
      { key: 'left', label: t('wordMarginLeft'), type: 'number', value: String(m.left), min: 0, max: 60, step: 1 },
      { key: 'right', label: t('wordMarginRight'), type: 'number', value: String(m.right), min: 0, max: 60, step: 1 },
      {
        key: 'base',
        label: t('wordBaseFont'),
        type: 'number',
        value: String(this.page.baseFontPt),
        min: 4,
        max: 72,
        step: 0.5
      }
    ])
    if (!res) return
    const num = (key: string, fallback: number) => {
      const value = Number(res[key])
      return Number.isFinite(value) ? value : fallback
    }
    this.page = clampSetup({
      ...this.page,
      size: res.size === 'Letter' ? 'Letter' : 'A4',
      orientation: res.orientation === 'landscape' ? 'landscape' : 'portrait',
      baseFontPt: num('base', this.page.baseFontPt),
      margin: {
        top: num('top', m.top),
        bottom: num('bottom', m.bottom),
        left: num('left', m.left),
        right: num('right', m.right)
      }
    })
    this.applyPage()
    this.setDirty(true)
    this.editor?.commands.focus()
  }

  // --- crash recovery ------------------------------------------------------
  private scheduleAutosave() {
    if (this.loading) return
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer)
    this.autosaveTimer = setTimeout(() => void this.writeAutosave(), 6000)
  }

  private autosaveBusy = false

  /** Also called by the web edition the moment the app is hidden (main.ts). */
  async writeAutosave() {
    // Exporting a docx is real work (images included), so never let two runs
    // overlap — the debounce only spaces out the STARTS.
    if (this.autosaveBusy || !this.editor || !this.dirty || !window.exelmj?.saveAutosave) return
    this.autosaveBusy = true
    try {
      const bytes = await this.exportBytes(true)
      if (bytes) window.exelmj.saveAutosave(bytes, JSON.stringify({ path: this.filePath }), 'word')
    } finally {
      this.autosaveBusy = false
    }
  }

  /** Offer back whatever the last session left behind, once, on first mount. */
  private async offerRecovery() {
    const editor = this.editor
    if (!editor || this.filePath || this.dirty || editor.getText().trim()) return
    const saved = await window.exelmj?.getAutosave?.('word').catch(() => null)
    if (!saved || !saved.bytes || !saved.bytes.length) return
    // The app's OWN modal, never window.confirm: the native one is a task
    // dialog that blocks the renderer while it is up, so the whole app looks
    // frozen behind it — and it is the first thing shown after a crash.
    const answer = await askForm(t('wordRecoverTitle'), [
      { key: 'note', label: t('wordRecoverConfirm'), type: 'note' }
    ])
    if (!answer) {
      window.exelmj?.clearAutosave?.('word')
      return
    }
    try {
      const { html, warnings, page, comments } = await importDocx(saved.bytes)
      this.loading = true
      editor.commands.setContent(html)
      this.loading = false
      this.threads.clear()
      for (const thread of comments ?? []) this.threads.set(thread.id, thread)
      if (page) this.page = clampSetup(page)
      this.applyPage()
      this.showNotice(warnings)
      let meta: { path?: string } = {}
      try {
        meta = JSON.parse(saved.meta || '{}') as { path?: string }
      } catch {
        meta = {}
      }
      this.filePath = typeof meta.path === 'string' ? meta.path : null
      this.setDirty(true)
    } catch (err) {
      console.warn('[word] recovery failed', err)
      alert(t('wordRecoverFailed'))
    }
  }

  private pickImage() {
    if (!this.imageInput) {
      this.imageInput = document.createElement('input')
      this.imageInput.type = 'file'
      this.imageInput.accept = 'image/png,image/jpeg,image/gif,image/bmp'
      this.imageInput.style.display = 'none'
      document.body.append(this.imageInput)
      this.imageInput.addEventListener('change', () => {
        const file = this.imageInput?.files?.[0]
        if (!file || !this.editor) return
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result)
          const probe = new window.Image()
          probe.onload = () => {
            // Size goes in with setImage: a follow-up updateAttributes never
            // landed on the new node, so every picture reached Word as a fixed
            // 300x200 box and came out squashed.
            const maxW = contentWidthPx(this.page)
            const scale = probe.width > maxW ? maxW / probe.width : 1
            this.editor
              ?.chain()
              .focus()
              .setImage({
                src: dataUrl,
                width: Math.round(probe.width * scale),
                height: Math.round(probe.height * scale)
              } as never)
              .run()
          }
          probe.src = dataUrl
        }
        reader.readAsDataURL(file)
        this.imageInput!.value = ''
      })
    }
    this.imageInput.click()
  }
}

// Set by main.ts so the word toolbar's Open can route spreadsheets back.
export let openInSheetMode: ((path: string, bytes: Uint8Array) => void) | null = null
export function setOpenInSheetMode(fn: (path: string, bytes: Uint8Array) => void) {
  openInSheetMode = fn
}

/** The rows of the sheet open in the other mode — the mail merge's data. */
let readSheetCells: (() => string[][]) | null = null

export function setSheetCellReader(fn: () => string[][]) {
  readSheetCells = fn
}

function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function injectWordCss() {
  if (document.getElementById('exelmj-word-style')) return
  const style = document.createElement('style')
  style.id = 'exelmj-word-style'
  style.textContent = `
#word-app { display: none; flex-direction: column; }
#word-app.visible { display: flex; }
#exelmj-word-toolbar { display: block; }
#exelmj-word-toolbar .wg {
  display: flex; align-items: center; gap: 2px; padding: 0 6px;
  border-inline-end: 1px solid #e4e7ec;
}
#exelmj-word-toolbar button {
  min-width: 30px; height: 28px; padding: 0 6px; border: 1px solid transparent;
  border-radius: 4px; background: transparent; cursor: pointer; font-size: 14px;
  color: #1f2937;
}
#exelmj-word-toolbar button:hover { background: #f2f4f7; }
#exelmj-word-toolbar button.active { background: #e7f0fb; border-color: #b3d3f2; color: #0f6cbd; }
#exelmj-word-toolbar button:disabled { opacity: 0.35; cursor: default; }
#exelmj-word-toolbar select {
  height: 28px; border: 1px solid #d0d5dd; border-radius: 4px; background: #fff;
  font-size: 12px; max-width: 150px;
}
#exelmj-word-toolbar input[type=color] {
  width: 30px; height: 28px; border: 1px solid #d0d5dd; border-radius: 4px;
  padding: 1px; background: #fff; cursor: pointer;
}
#exelmj-word-notice {
  padding: 6px 12px; background: #fff8e6; color: #7a5b00; font-size: 12px;
  border-bottom: 1px solid #f0d78c;
}
#exelmj-word-scroll { flex: 1; overflow: auto; }
/* The gutter sits in the margin the text does NOT start from — the left one in
   an Arabic document, exactly where Word puts its balloons. */
#exelmj-word-stage { position: relative; width: fit-content; margin: 0 auto; padding-inline-end: 268px; }
#exelmj-comment-pane { inset-inline-end: 0; }
#exelmj-word-page {
  width: 794px; min-height: 1123px; margin: 24px auto; background: #ffffff;
  box-shadow: 0 2px 12px rgba(16, 24, 40, 0.18); border-radius: 2px;
}
.exelmj-word-editor {
  min-height: 1123px; padding: 96px 90px; outline: none; box-sizing: border-box;
  font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #111827;
}
.exelmj-word-editor p { margin: 0 0 0.5em; }
.exelmj-word-editor h1 { font-size: 20pt; margin: 14px 0 10px; }
.exelmj-word-editor h2 { font-size: 16pt; margin: 12px 0 8px; }
.exelmj-word-editor h3 { font-size: 13pt; margin: 10px 0 6px; }
.exelmj-word-editor table { border-collapse: collapse; width: 100%; margin: 8px 0; table-layout: fixed; }
.exelmj-word-editor td, .exelmj-word-editor th {
  border: 1px solid #9ca3af; padding: 4px 8px; vertical-align: top; position: relative;
}
.exelmj-word-editor th { background: #f3f4f6; }
.exelmj-word-editor img { max-width: 100%; height: auto; }
.exelmj-word-editor mark { padding: 0 1px; }
.exelmj-word-editor td[data-borderless],
.exelmj-word-editor th[data-borderless] { border: 0; padding: 0 2px; }
#exelmj-word-page .exelmj-watermark {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font: 700 72pt 'Segoe UI', Tahoma, sans-serif; color: rgba(16, 24, 40, 0.08);
  transform: rotate(-35deg); pointer-events: none; user-select: none; z-index: 0;
  white-space: nowrap; overflow: hidden;
}
.exelmj-word-editor { position: relative; z-index: 1; }
.exelmj-word-editor h4 { font-size: 12pt; margin: 10px 0 5px; }
.exelmj-word-editor blockquote {
  border-inline-start: 3px solid #d0d5dd; margin: 8px 0; padding-inline-start: 12px; color: #475467;
}
.exelmj-word-editor hr { border: 0; border-top: 1px solid #98a2b3; margin: 12px 0; }
.exelmj-word-editor sup { font-size: 0.72em; vertical-align: super; }
.exelmj-word-editor sub { font-size: 0.72em; vertical-align: sub; }
.exelmj-word-editor .exelmj-page-break {
  height: 0; margin: 16px 0; border-top: 2px dashed #9aa8bd; position: relative;
}
.exelmj-word-editor .exelmj-page-break::after {
  content: '${t('wordPageBreakLabel')}'; position: absolute; top: -8px; inset-inline-end: 6px;
  background: #fff; padding: 0 6px; font-size: 10px; color: #98a2b3;
}
.exelmj-word-editor .exelmj-page-break.ProseMirror-selectednode { border-top-color: #185abd; }
/* a merge field reads as one chip, so it is obvious it is a placeholder and
   not text someone typed */
/* a suggested edit reads at a glance: added text underlined, removed text
   struck through, both in the suggester's colour */
/* the footnote list at the end of the document, and the little raised number */
.exelmj-word-editor ol.footnotes {
  margin-top: 24px; padding-top: 10px; border-top: 1px solid #d0d5dd;
  font-size: 0.85em; color: #475467;
}
.exelmj-word-editor ol.footnotes li { margin: 2px 0; }
.exelmj-word-editor sup a.footnote-ref {
  color: #185abd; text-decoration: none; font-weight: 600; padding: 0 1px;
}
.exelmj-word-editor ins[data-change-id] {
  text-decoration: underline; text-decoration-color: var(--author-color, #c2410c);
  color: var(--author-color, #c2410c); background: rgba(194, 65, 12, 0.08);
}
.exelmj-word-editor del[data-change-id] {
  text-decoration: line-through; text-decoration-color: var(--author-color, #c2410c);
  color: var(--author-color, #c2410c); opacity: 0.75;
}
.exelmj-word-editor .exelmj-merge-field {
  background: #eef4ff; border: 1px solid #c7d7f5; border-radius: 4px;
  padding: 0 4px; color: #1a4fa0; white-space: nowrap;
}
.exelmj-word-editor .exelmj-merge-field.ProseMirror-selectednode {
  background: #dbe7ff; border-color: #185abd; box-shadow: 0 0 0 1px #185abd;
}
.exelmj-word-editor.show-marks p::after,
.exelmj-word-editor.show-marks h1::after,
.exelmj-word-editor.show-marks h2::after,
.exelmj-word-editor.show-marks h3::after,
.exelmj-word-editor.show-marks h4::after {
  content: '\\00b6'; color: #c3cbd8; margin-inline-start: 2px;
}
.exelmj-word-editor .selectedCell:after {
  content: ''; position: absolute; inset: 0; background: rgba(15, 108, 189, 0.12); pointer-events: none;
}
#exelmj-word-status {
  display: flex; align-items: center; justify-content: space-between;
  padding: 2px 14px; background: #f3f3f3; border-top: 1px solid #e1dfdd;
  font-size: 12px; color: #475467;
}
#exelmj-word-zoom { display: inline-flex; align-items: center; gap: 6px; direction: ltr; }
#exelmj-word-zoom button {
  width: 22px; height: 20px; border: 1px solid #d1cfcd; border-radius: 4px;
  background: #fff; cursor: pointer; line-height: 1;
}
#exelmj-word-zoomlabel { min-width: 40px; text-align: center; }
`
  document.head.append(style)
}
