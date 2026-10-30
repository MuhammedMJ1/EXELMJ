// Builds a print-ready HTML document from sheet data (values + styles +
// merges + column widths), with native RTL flow for right-to-left sheets and
// the floating charts appended as images. Rendered in a hidden window by the
// main process for the system print dialog / PDF export.
import type { IStyleData } from '@univerjs/core'

export interface PrintCell {
  text: string
  css: string
  colspan?: number
  rowspan?: number
}

export interface PrintPayload {
  title: string
  sheetName: string
  rtl: boolean
  columnWidthsPx: number[]
  rows: Array<Array<PrintCell | null>>
  charts: Array<{ title: string; dataUrl: string }>
}

const BORDER_WIDTH: Record<number, string> = { 8: '2px', 9: '2px', 10: '2px', 11: '2px', 13: '3px' }
const BORDER_STYLE: Record<number, string> = { 3: 'dotted', 4: 'dashed', 5: 'dashed', 6: 'dashed', 7: 'double' }

function borderCss(side?: { s?: number; cl?: { rgb?: string | null } } | null): string | null {
  if (!side?.s) return null
  const width = BORDER_WIDTH[side.s] ?? '1px'
  const style = BORDER_STYLE[side.s] ?? 'solid'
  return `${width} ${style} ${side.cl?.rgb ?? '#000'}`
}

export function styleToCss(style: IStyleData | undefined): string {
  if (!style) return ''
  const css: string[] = []
  if (style.ff) css.push(`font-family:'${style.ff}'`)
  if (style.fs) css.push(`font-size:${style.fs}pt`)
  if (style.bl === 1) css.push('font-weight:bold')
  if (style.it === 1) css.push('font-style:italic')
  const deco: string[] = []
  if (style.ul?.s === 1) deco.push('underline')
  if (style.st?.s === 1) deco.push('line-through')
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`)
  if (style.cl?.rgb) css.push(`color:${style.cl.rgb}`)
  if (style.bg?.rgb) css.push(`background:${style.bg.rgb}`)
  const bd = style.bd as
    | Record<'t' | 'r' | 'b' | 'l', { s?: number; cl?: { rgb?: string | null } } | null | undefined>
    | undefined
  if (bd) {
    const top = borderCss(bd.t)
    const right = borderCss(bd.r)
    const bottom = borderCss(bd.b)
    const left = borderCss(bd.l)
    if (top) css.push(`border-top:${top}`)
    if (right) css.push(`border-right:${right}`)
    if (bottom) css.push(`border-bottom:${bottom}`)
    if (left) css.push(`border-left:${left}`)
  }
  if (style.ht === 2) css.push('text-align:center')
  else if (style.ht === 3) css.push('text-align:right')
  else if (style.ht === 1) css.push('text-align:left')
  if (style.vt === 1) css.push('vertical-align:top')
  else if (style.vt === 2) css.push('vertical-align:middle')
  else if (style.vt === 3) css.push('vertical-align:bottom')
  if (style.tb === 3) css.push('white-space:normal')
  return css.join(';')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildPrintHtml(p: PrintPayload): string {
  const totalW = p.columnWidthsPx.reduce((a, b) => a + b, 0) || 1
  const colgroup = p.columnWidthsPx
    .map((w) => `<col style="width:${((w / totalW) * 100).toFixed(3)}%">`)
    .join('')
  const body = p.rows
    .map((row) => {
      const tds = row
        .map((cell) => {
          if (cell === null) return ''
          const span =
            (cell.colspan && cell.colspan > 1 ? ` colspan="${cell.colspan}"` : '') +
            (cell.rowspan && cell.rowspan > 1 ? ` rowspan="${cell.rowspan}"` : '')
          return `<td${span} style="${cell.css}">${escapeHtml(cell.text) || '&nbsp;'}</td>`
        })
        .join('')
      return `<tr>${tds}</tr>`
    })
    .join('\n')
  const charts = p.charts
    .map(
      (c) =>
        `<div class="chart"><img src="${c.dataUrl}" alt="">${c.title ? `<p>${escapeHtml(c.title)}</p>` : ''}</div>`
    )
    .join('\n')
  return `<!DOCTYPE html>
<html dir="${p.rtl ? 'rtl' : 'ltr'}" lang="${p.rtl ? 'ar' : 'en'}">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(p.title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size: 10pt; margin: 0; color: #000; }
  h1 { font-size: 12pt; margin: 0 0 8px; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td { border: 0.5px solid #d0d0d0; padding: 2px 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: bottom; }
  tr { page-break-inside: avoid; }
  .chart { page-break-inside: avoid; margin-top: 14px; text-align: center; }
  .chart img { max-width: 100%; }
  .chart p { font-size: 9pt; margin: 4px 0 0; }
</style>
</head>
<body>
<h1>${escapeHtml(p.title)} — ${escapeHtml(p.sheetName)}</h1>
<table><colgroup>${colgroup}</colgroup>
${body}
</table>
${charts}
</body>
</html>`
}
