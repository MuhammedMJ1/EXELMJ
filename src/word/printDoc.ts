// Print HTML for the word document: the editor's HTML wrapped in a standalone
// page whose @page block carries the user's paper size, orientation and
// margins (body padding would only apply to the first page). Printed through
// the hidden-window 'print:html' channel with preferCSSPageSize so Chromium
// honors the @page block.
//
// The header/footer text is NOT in this HTML: it is handed to Chromium's own
// header/footer band (printToPDF templates / print options), which is the only
// place a live page number can be produced.
import { t } from '../i18n/i18n'
import { defaultPageSetup, paperBoxMm, type PageSetup } from './pageSetup'

export function buildDocPrintHtml(
  editorHtml: string,
  rtl: boolean,
  page: PageSetup = defaultPageSetup()
): string {
  const box = paperBoxMm(page)
  const m = page.margin
  const basePt = page.baseFontPt || 11
  const mark = page.watermark
    ? `<div class="exelmj-print-watermark">${escapeBand(page.watermark)}</div>`
    : ''
  const baseLine = page.baseLineHeight || 1.6
  const body = promoteHeaderRows(editorHtml)
  return `<!doctype html>
<html lang="${rtl ? 'ar' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<style>
  @page { size: ${box.width}mm ${box.height}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif; font-size: ${basePt}pt; line-height: ${baseLine}; color: #111;
    direction: ${rtl ? 'rtl' : 'ltr'};
  }
  p { margin: 0 0 8px; }
  h1 { font-size: 20pt; margin: 14px 0 10px; break-after: avoid; }
  h2 { font-size: 16pt; margin: 12px 0 8px; break-after: avoid; }
  h3 { font-size: 13pt; margin: 10px 0 6px; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  td, th { border: 1px solid #666; padding: 4px 8px; vertical-align: top; }
  /* the header row draws itself again at the top of every page the table
     spills onto — Chromium only does this for a row group it recognises */
  thead { display: table-header-group; }
  thead tr { break-inside: avoid; }
  /* a table that only lines the text up carries no grid in the original */
  td[data-borderless], th[data-borderless] { border: 0; padding: 0 2px; }
  tr, li, figure { break-inside: avoid; }
  img { max-width: 100%; height: auto; }
  mark { padding: 0 1px; }
  h4 { font-size: 12pt; margin: 10px 0 5px; break-after: avoid; }
  blockquote { border-inline-start: 3px solid #999; margin: 8px 0; padding-inline-start: 12px; }
  hr { border: 0; border-top: 1px solid #666; margin: 12px 0; }
  sup { font-size: 0.72em; vertical-align: super; }
  sub { font-size: 0.72em; vertical-align: sub; }
  /* the manual page break the editor writes */
  div[data-page-break] { break-after: page; height: 0; border: 0; margin: 0; }
  /* repeats on every printed page, behind the text */
  .exelmj-print-watermark {
    position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
    font-size: 72pt; font-weight: 700; color: rgba(0, 0, 0, 0.10); transform: rotate(-35deg);
    z-index: -1; pointer-events: none;
  }
</style>
</head>
<body>${mark}${body}</body>
</html>`
}

/**
 * Moves a table's leading all-`<th>` row into a `<thead>`.
 *
 * ProseMirror keeps header cells inside the `<tbody>` like every other row, and
 * a browser only repeats a row group it recognises — so without this a table
 * that runs over a page break loses its column titles on page two. Tables are
 * never nested here (neither the editor nor the PDF importer makes one), so
 * matching `</table>` to the nearest `<table` is safe.
 */
export function promoteHeaderRows(html: string): string {
  let out = ''
  let index = 0
  for (;;) {
    const open = html.indexOf('<table', index)
    if (open < 0) break
    const close = html.indexOf('</table>', open)
    if (close < 0) break
    const end = close + '</table>'.length
    out += html.slice(index, open) + promoteOne(html.slice(open, end))
    index = end
  }
  return out + html.slice(index)
}

function promoteOne(table: string): string {
  if (/<thead[\s>]/i.test(table)) return table
  const rowStart = table.search(/<tr[\s>]/i)
  if (rowStart < 0) return table
  const rowEnd = table.toLowerCase().indexOf('</tr>', rowStart)
  if (rowEnd < 0) return table
  const row = table.slice(rowStart, rowEnd + 5)
  // only a row Word would repeat: every cell in it is a header cell
  if (!/<th[\s>]/i.test(row) || /<td[\s>]/i.test(row)) return table
  const before = table.slice(0, rowStart)
  const after = table.slice(rowEnd + 5)
  const tbody = /<tbody[^>]*>\s*$/i.exec(before)
  if (tbody) return `${before.slice(0, tbody.index)}<thead>${row}</thead>${tbody[0]}${after}`
  return `${before}<thead>${row}</thead>${after}`
}

/** Escapes text destined for Chromium's header/footer template HTML. */
export function escapeBand(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Options for the print bridge: what Chromium should draw in its own band. */
export interface PrintBands {
  header: string
  footer: string
  pageNumbers: boolean
  rtl: boolean
  /** "صفحة {0} من {1}" - the slots are filled by Chromium's own counters. */
  pageLabel: string
}

export function printBands(page: PageSetup, rtl: boolean): PrintBands {
  return {
    header: page.header,
    footer: page.footer,
    pageNumbers: page.pageNumbers,
    rtl,
    pageLabel: t('wordPageXofY')
  }
}
