// The geometry half of the PDF import: runs at coordinates → document HTML.
//
// Kept apart from pdfToDoc.ts so the rules can be unit-tested without loading
// pdfjs (which only resolves inside the bundler).
//
// A PDF has no paragraphs, only glyph runs at coordinates, so the structure is
// REBUILT: runs group into lines, lines into paragraphs, and the page geometry
// is read back as headings, alignment, direction, lists and simple tables.
//
// FIDELITY FIRST: every run keeps the size, family, weight and colour it had in
// the file. Structure tags (h1…h4, ul/ol, table) are added on top of that, never
// instead of it — a heading still carries its exact point size, so the rebuilt
// page reads the same as the original instead of being re-styled by the editor's
// own stylesheet.

/** The shape src/design/aiBackground.ts already produces for every run. */
export interface PdfRun {
  text: string
  dir: 'rtl' | 'ltr'
  x: number
  y: number
  width: number
  size: number
  baselineTop: number
  /** embedded font name, e.g. "Cairo-Bold" */
  font?: string
  /** sampled ink colour, "#rrggbb" */
  color?: string
  /** weight/slant, straight from the embedded font descriptor */
  bold?: boolean
  italic?: boolean
}

/** A picture cropped out of the rendered page, placed in pt from the top-left. */
export interface PdfImage {
  dataUrl: string
  x: number
  y: number
  width: number
  height: number
}

export interface PageBox {
  widthPt: number
  heightPt: number
}

/** A line or box the page draws, pt from the top-left. */
export interface PdfRule {
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutOptions {
  images?: PdfImage[]
  page?: PageBox
  /** what the file actually draws — borders are copied, never invented */
  rules?: PdfRule[]
}

interface Line {
  runs: PdfRun[]
  top: number
  size: number
  minX: number
  maxX: number
  rtl: boolean
  text: string
}

interface Block {
  top: number
  html: string
}

const BULLET_RE = /^\s*[•▪◦●·▫]\s*/
// "1." reaches us as ".1" when the line is RTL — both orders are one marker.
const NUMBER_RE = /^\s*(?:[.)]\s*(?:\d{1,3}|[٠-٩]{1,3})|(?:\d{1,3}|[٠-٩]{1,3})\s*[.)\-–])\s+/

const BOLD_RE = /bold|black|heavy|semibold|demibold|[-_]bd\b/i
const ITALIC_RE = /italic|oblique|[-_]it\b/i

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** PDF font names arrive as "ABCDEF+Cairo-Bold": strip the subset tag + style. */
export function familyOf(font: string | undefined): string {
  if (!font) return ''
  const name = font.replace(/^[A-Z]{6}\+/, '').split(',')[0]
  const base = name
    .replace(/[-_](bold|black|heavy|semibold|demibold|medium|light|regular|italic|oblique|bd|it|mt|ps)+/gi, '')
    .replace(/(MT|PS|Std|Pro)+$/g, '')
    .replace(/[-_]+$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
  // pdfjs hands back its own ids ("g_d0_f1") when a font carries no name
  if (/^g_d\d+_f\d+$/i.test(base.replace(/\s+/g, ''))) return ''
  // letters, digits, spaces only — a family name is interpolated into a style
  return /^[\w؀-ۿ ]{2,40}$/.test(base) ? base : ''
}

export function isBold(run: PdfRun): boolean {
  return run.bold ?? BOLD_RE.test(run.font ?? '')
}

export function isItalic(run: PdfRun): boolean {
  return run.italic ?? ITALIC_RE.test(run.font ?? '')
}

/** Runs → visual lines, each already joined in logical reading order. */
export function groupLines(runs: PdfRun[]): Line[] {
  const sorted = [...runs].sort((a, b) => a.baselineTop - b.baselineTop || a.x - b.x)
  const lines: Line[] = []
  for (const run of sorted) {
    const last = lines[lines.length - 1]
    const tolerance = Math.max(1.5, run.size * 0.4)
    if (last && Math.abs(last.top - run.baselineTop) <= tolerance) {
      last.runs.push(run)
      last.size = Math.max(last.size, run.size)
      last.minX = Math.min(last.minX, run.x)
      last.maxX = Math.max(last.maxX, run.x + run.width)
    } else {
      lines.push({
        runs: [run],
        top: run.baselineTop,
        size: run.size,
        minX: run.x,
        maxX: run.x + run.width,
        rtl: run.dir === 'rtl',
        text: ''
      })
    }
  }
  for (const line of lines) {
    const total = line.runs.reduce((n, r) => n + r.text.length, 0)
    const rtlWeight = line.runs.reduce((n, r) => n + (r.dir === 'rtl' ? r.text.length : 0), 0)
    line.rtl = rtlWeight * 2 >= total
    // Visual order is left→right on screen; an RTL line reads the other way.
    line.runs.sort((a, b) => (line.rtl ? b.x - a.x : a.x - b.x))
    line.text = line.runs
      .map((r) => r.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return lines.filter((line) => line.text.length > 0)
}

/**
 * The page's usual line-to-line distance — the real paragraph rhythm. The MODE
 * rather than the median: a page whose blocks sit far apart would otherwise
 * report the white space between them as its leading, and every paragraph in
 * the rebuilt document would come out double-spaced.
 */
export function linePitch(lines: Line[]): number {
  const buckets = new Map<number, number>()
  const gaps: number[] = []
  const overlaps = (a: Line, b: Line) => {
    const shared = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
    return shared >= 0.3 * Math.min(a.maxX - a.minX, b.maxX - b.minX)
  }
  for (let i = 0; i < lines.length; i++) {
    // Two columns interleave down the page, so the NEXT line is often the one
    // beside this one rather than the one under it. The leading is the step to
    // the next line that shares horizontal space — the next line in the same
    // column — which is why this looks forward instead of at i-1.
    for (let j = i + 1; j < lines.length; j++) {
      if (!overlaps(lines[i], lines[j])) continue
      const gap = lines[j].top - lines[i].top
      if (gap > 1 && gap < 200) {
        gaps.push(gap)
        const key = Math.round(gap)
        buckets.set(key, (buckets.get(key) ?? 0) + 1)
      }
      break
    }
  }
  if (!gaps.length) return 0
  let best = 0
  let bestCount = 0
  for (const [gap, count] of buckets) {
    if (count > bestCount || (count === bestCount && gap < best)) {
      best = gap
      bestCount = count
    }
  }
  if (bestCount >= 2) return best
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}

/** The body text size: the size most of the characters are set in. */
export function bodySize(lines: Line[]): number {
  const weight = new Map<number, number>()
  for (const line of lines) {
    const key = Math.round(line.size * 2) / 2
    weight.set(key, (weight.get(key) ?? 0) + line.text.length)
  }
  let best = 11
  let bestWeight = -1
  for (const [size, w] of weight) {
    if (w > bestWeight) {
      best = size
      bestWeight = w
    }
  }
  return best || 11
}

/**
 * Heading level from the size ratio. Only a LARGER line can be a heading: the
 * tag is structure, and the run keeps its own size either way, so a wrong guess
 * never changes how the page looks.
 */
function headingLevel(size: number, body: number): 0 | 1 | 2 | 3 | 4 {
  const ratio = size / body
  if (ratio >= 1.6) return 1
  if (ratio >= 1.33) return 2
  if (ratio >= 1.15) return 3
  if (ratio >= 1.06) return 4
  return 0
}

interface Column {
  left: number
  right: number
}

function textColumn(lines: Line[]): Column {
  const lefts = lines.map((l) => l.minX).sort((a, b) => a - b)
  const rights = lines.map((l) => l.maxX).sort((a, b) => a - b)
  // 10th/90th percentile: ignores the odd indented or overflowing line
  const at = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))] ?? 0
  return { left: at(lefts, 0.1), right: at(rights, 0.9) }
}

export function alignOf(line: Line, column: Column, rtl: boolean): string | undefined {
  const leftGap = line.minX - column.left
  const rightGap = column.right - line.maxX
  const width = column.right - column.left
  if (width <= 0) return undefined
  const centered = Math.abs(leftGap - rightGap) <= Math.max(6, width * 0.03) && leftGap > width * 0.06
  if (centered) return 'center'
  if (rtl) return rightGap <= Math.max(6, width * 0.04) ? 'right' : leftGap <= 6 ? 'left' : undefined
  return leftGap <= Math.max(6, width * 0.04) ? 'left' : rightGap <= 6 ? 'right' : undefined
}

export function isListLine(line: Line): 'bullet' | 'ordered' | null {
  if (BULLET_RE.test(line.text)) return 'bullet'
  if (NUMBER_RE.test(line.text)) return 'ordered'
  // the marker can also arrive as its own tiny run beside the text
  const marker = line.runs[0]
  const text = marker?.text.trim() ?? ''
  if (text.length <= 4 && /^[•▪◦●·▫]$/.test(text)) return 'bullet'
  if (text.length <= 4 && /^(?:[.)]?\s*(?:\d{1,3}|[٠-٩]{1,3})[.)]?)$/.test(text) && line.runs.length > 1) {
    return 'ordered'
  }
  return null
}

/** Consecutive lines whose runs occupy the same two-plus column bands. */
function tableRun(lines: Line[], start: number, column: Column, pitch = 0): number {
  // Cells are aligned inside their column, so a data value rarely STARTS where
  // the header does — matching by span overlap is what makes a right-aligned
  // Arabic table (or a centred number) line up with its heading.
  const spans = (line: Line): Array<[number, number]> =>
    line.runs.map((r) => [r.x, r.x + Math.max(r.width, 1)] as [number, number]).sort((a, b) => a[0] - b[0])
  const overlaps = (a: [number, number], b: [number, number]) => {
    const shared = Math.min(a[1], b[1]) - Math.max(a[0], b[0])
    return shared > 0.25 * Math.min(a[1] - a[0], b[1] - b[0])
  }
  if (isListLine(lines[start])) return 0
  const first = spans(lines[start])
  if (first.length < 2) return 0
  // real columns stand apart; two words with a wide space do not
  if (first[first.length - 1][1] - first[0][0] < 60) return 0
  // THE test that separates a table from an ordinary line: a column boundary
  // is a wide empty band. Words inside a sentence are a few points apart, so
  // without this every line holding a number reads as a two-column table.
  const gaps = first.slice(1).map((span, i) => span[0] - first[i][1])
  if (!gaps.length || Math.min(...gaps) < 14) return 0
  let end = start
  for (let i = start + 1; i < lines.length; i++) {
    const here = spans(lines[i])
    if (here.length < 2 || isListLine(lines[i])) break
    const shared = here.filter((h) => first.some((f) => overlaps(f, h))).length
    const gap = lines[i].top - lines[i - 1].top
    // table rows sit a normal line apart; the page's own pitch is the yardstick
    if (shared < 2 || gap > Math.max(lines[i].size * 2.6, pitch * 1.6)) break
    end = i
  }
  const rows = end - start + 1
  // two rows of aligned columns are a table; one is just a line
  return rows >= 2 && column.right > column.left ? rows : 0
}

/**
 * The document's LEADING: the tightest step the page repeats, not the most
 * common one. A statement full of table rows makes the row pitch the mode, and
 * setting that as the body line spacing spreads every ordinary paragraph out;
 * the lower quartile lands on the real text leading instead.
 */
export function textLeading(lines: Line[]): number {
  const gaps: number[] = []
  // Table rows have their own rhythm — a statement is mostly rows, and letting
  // them vote turns the row pitch into the document's line spacing.
  const inTable = new Set<number>()
  const column = textColumn(lines)
  for (let i = 0; i < lines.length; i++) {
    if (inTable.has(i)) continue
    const rows = tableRun(lines, i, column)
    for (let r = 0; r < rows; r++) inTable.add(i + r)
  }
  const overlaps = (a: Line, b: Line) => {
    const shared = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)
    return shared >= 0.3 * Math.min(a.maxX - a.minX, b.maxX - b.minX)
  }
  for (let i = 0; i < lines.length; i++) {
    if (inTable.has(i)) continue
    for (let j = i + 1; j < lines.length; j++) {
      if (inTable.has(j) || !overlaps(lines[i], lines[j])) continue
      const gap = lines[j].top - lines[i].top
      if (gap > 1 && gap < 200) gaps.push(gap)
      break
    }
  }
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length * 0.25)]
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * Rectangles the page draws: a horizontal rule with a matching one below it and
 * a vertical rule down each side. A grid (three or more rules inside) is a
 * TABLE, not a box, and is left to the column detector.
 */
export function findBoxes(rules: PdfRule[]): Box[] {
  const h = rules.filter((r) => r.height <= 3 && r.width > 30)
  const v = rules.filter((r) => r.width <= 3 && r.height > 12)
  const boxes: Box[] = []
  for (let i = 0; i < h.length; i++) {
    for (let j = i + 1; j < h.length; j++) {
      const top = h[i].y < h[j].y ? h[i] : h[j]
      const bottom = h[i].y < h[j].y ? h[j] : h[i]
      const height = bottom.y - top.y
      if (height < 14 || height > 400) continue
      if (Math.abs(top.x - bottom.x) > 4 || Math.abs(top.width - bottom.width) > 6) continue
      const left = top.x
      const right = top.x + top.width
      const side = (x: number) =>
        v.some(
          (r) =>
            Math.abs(r.x - x) <= 4 && r.y <= top.y + 4 && r.y + r.height >= bottom.y - 4
        )
      if (!side(left) || !side(right)) continue
      const inner = h.filter((r) => r.y > top.y + 4 && r.y < bottom.y - 4 && r.x >= left - 4 && r.x + r.width <= right + 4)
      // A rule ACROSS the middle means row separators: that is a grid, and the
      // column detector owns it. An info panel is empty between its two sides.
      if (inner.length >= 3 || inner.some((r) => r.width >= (right - left) * 0.6)) continue
      if (boxes.some((b) => Math.abs(b.left - left) < 3 && Math.abs(b.top - top.y) < 3)) continue
      boxes.push({ left, right, top: top.y, bottom: bottom.y })
    }
  }
  return boxes.sort((a, b) => a.top - b.top || a.left - b.left)
}

/** Boxes that sit beside each other belong in one row. */
function boxRows(boxes: Box[]): Box[][] {
  const rows: Box[][] = []
  for (const box of boxes) {
    const row = rows.find((r) =>
      r.some((other) => Math.min(other.bottom, box.bottom) - Math.max(other.top, box.top) > 6)
    )
    if (row) row.push(box)
    else rows.push([box])
  }
  for (const row of rows) row.sort((a, b) => a.left - b.left)
  return rows
}

/**
 * Does the file draw rules across this block? Then the table keeps its grid.
 *
 * A ruled table is almost never drawn as one line per row: every CELL draws its
 * own little rectangle, so the widths that arrive are 40-250pt on a 490pt page.
 * The rules are therefore grouped by height and their widths SUMMED — a row
 * whose segments together span the block is a ruled row.
 */
function isRuled(rules: PdfRule[], top: number, bottom: number, left: number, right: number): boolean {
  const span = right - left
  if (span <= 0) return false
  const byRow = new Map<number, number>()
  for (const rule of rules) {
    if (rule.height > 3 || rule.y < top - 8 || rule.y > bottom + 8) continue
    const covered = Math.min(rule.x + rule.width, right) - Math.max(rule.x, left)
    if (covered <= 0) continue
    const key = Math.round(rule.y / 2) * 2
    byRow.set(key, (byRow.get(key) ?? 0) + covered)
  }
  let rows = 0
  for (const width of byRow.values()) if (width > span * 0.4) rows += 1
  return rows >= 2
}

/** One run → HTML that carries its exact size, family, weight and colour. */
function runHtml(run: PdfRun, body: number): string {
  const text = esc(run.text.trim())
  if (!text) return ''
  const bits: string[] = []
  const size = Math.round(run.size * 2) / 2
  if (size > 0 && Math.abs(size - body) > 0.24) bits.push(`font-size: ${size}pt`)
  const family = familyOf(run.font)
  if (family) bits.push(`font-family: '${family}'`)
  if (run.color && /^#[0-9a-f]{6}$/i.test(run.color) && run.color.toLowerCase() !== '#000000') {
    bits.push(`color: ${run.color.toLowerCase()}`)
  }
  let html = bits.length ? `<span style="${bits.join('; ')}">${text}</span>` : text
  if (isItalic(run)) html = `<em>${html}</em>`
  if (isBold(run)) html = `<strong>${html}</strong>`
  return html
}

function runsHtml(runs: PdfRun[], body: number): string {
  return runs
    .map((run) => runHtml(run, body))
    .filter(Boolean)
    .join(' ')
}

function imageHtml(image: PdfImage, column: Column, page?: PageBox): string {
  const px = (pt: number) => Math.max(1, Math.round((pt * 96) / 72))
  const centre = image.x + image.width / 2
  const tolerance = Math.max(12, (column.right - column.left) * 0.06)
  const centres = [(column.left + column.right) / 2]
  if (page) centres.push(page.widthPt / 2)
  // ALWAYS explicit: a paragraph with no alignment of its own inherits the
  // editor default, which is RIGHT under an Arabic UI — that is what moved a
  // logo drawn on the left edge of the page over to the right.
  const align = centres.some((c) => Math.abs(centre - c) < tolerance)
    ? 'center'
    : image.x - column.left <= column.right - (image.x + image.width)
      ? 'left'
      : 'right'
  return `<p style="text-align: ${align}"><img src="${image.dataUrl}" width="${px(
    image.width
  )}" height="${px(image.height)}"></p>`
}

/** One page of runs (and its pictures) → editor HTML, in reading order. */
export function pageToHtml(runs: PdfRun[], options: LayoutOptions = {}): string {
  const lines = groupLines(runs)
  const images = options.images ?? []
  const rules = options.rules ?? []
  if (!lines.length) {
    const column = { left: 0, right: options.page?.widthPt ?? 595 }
    return images.map((image) => imageHtml(image, column, options.page)).join('')
  }
  const body = bodySize(lines)
  const column = textColumn(lines)
  const pitch = linePitch(lines) || body * 1.4
  const blocks: Block[] = images.map((image) => ({
    top: image.y,
    html: imageHtml(image, column, options.page)
  }))

  // ---- boxes the FILE draws: their RUNS go inside a bordered cell -------
  // Run level, not line level: a table's header row is drawn as one box per
  // column, but its text is ONE visual line spanning all of them. Matching
  // whole lines left that line homeless and the row came out empty.
  const boxed = new Set<PdfRun>()
  const boxBlocks: Block[] = []
  for (const row of boxRows(findBoxes(rules))) {
    const cells = row.map((box) =>
      runs.filter((run) => {
        if (boxed.has(run)) return false
        const cx = run.x + run.width / 2
        const cy = run.baselineTop - run.size * 0.4
        return cx > box.left - 2 && cx < box.right + 2 && cy > box.top - 2 && cy < box.bottom + 2
      })
    )
    if (!cells.some((cell) => cell.length)) continue
    // A row of one-line boxes is a table's HEADER, not a set of panels. Leaving
    // its runs in the flow lets the table below pull them in as its first row,
    // instead of stranding a separate one-row table above it.
    const height = row[0].bottom - row[0].top
    const singleLine = cells.every((cell) => groupLines(cell).length <= 1)
    if (singleLine && height < body * 4) continue
    for (const cell of cells) for (const run of cell) boxed.add(run)
    const html = cells
      .map((cell, index) => {
        const cellLines = groupLines(cell)
        const inner = cellLines.length
          ? cellLines
              .map(
                (line) =>
                  `<p dir="${line.rtl ? 'rtl' : 'ltr'}" style="text-align: ${
                    line.rtl ? 'right' : 'left'
                  }">${runsHtml(line.runs, body)}</p>`
              )
              .join('')
          : '<p></p>'
        // the panel keeps the width the file drew it at
        return `<td colwidth="${px(row[index].right - row[index].left)}">${inner}</td>`
      })
      .join('')
    boxBlocks.push({ top: row[0].top, html: `<table><tbody><tr>${html}</tr></tbody></table>` })
  }
  blocks.push(...boxBlocks)
  // whatever the boxes claimed is gone from the flow
  const flowLines = boxed.size ? groupLines(runs.filter((run) => !boxed.has(run))) : lines

  let listKind: 'ul' | 'ol' | null = null
  let listTop = 0
  let listItems: string[] = []
  const closeList = () => {
    if (listKind && listItems.length) {
      blocks.push({ top: listTop, html: `<${listKind}>${listItems.join('')}</${listKind}>` })
    }
    listKind = null
    listItems = []
  }

  const taken = new Set<number>()
  let i = 0
  while (i < flowLines.length) {
    if (taken.has(i)) {
      i += 1
      continue
    }
    const rows = tableRun(flowLines, i, column, pitch)
    if (rows) {
      closeList()
      // The header sits above the first data row in its own line — or three of
      // them, when a caption wraps. They share the table's columns, so they are
      // pulled in as its first row instead of floating above it as loose text.
      let head = i
      while (
        head > 0 &&
        head > i - 3 &&
        !taken.has(head - 1) &&
        flowLines[head - 1].top > flowLines[i].top - pitch * 3.2 &&
        sharesColumns(flowLines[head - 1], flowLines[i])
      ) {
        head -= 1
      }
      const headLines = flowLines.slice(head, i)
      for (let k = head; k < i; k++) taken.add(k)
      const ruled = isRuled(
        rules,
        flowLines[head].top,
        flowLines[i + rows - 1].top,
        column.left,
        column.right
      )
      blocks.push({
        top: flowLines[head].top,
        html: tableHtml(flowLines.slice(i, i + rows), body, headLines, ruled, rules)
      })
      i += rows
      continue
    }

    const line = flowLines[i]
    const kind = isListLine(line)
    const bullet = kind === 'bullet'
    const numbered = kind === 'ordered'
    const level = headingLevel(line.size, body)
    const dir = line.rtl ? 'rtl' : 'ltr'
    const align = alignOf(line, column, line.rtl) ?? (line.rtl ? 'right' : 'left')
    const indent = line.rtl ? column.right - line.maxX : line.minX - column.left
    const styleBits = [
      `text-align: ${align}`,
      ...(indent > 8 && align === (line.rtl ? 'right' : 'left')
        ? [`margin-inline-start: ${Math.round(indent)}pt`]
        : [])
    ]
    const attrs = `dir="${dir}" style="${styleBits.join('; ')}"`

    if (bullet || numbered) {
      const want = bullet ? 'ul' : 'ol'
      if (listKind !== want) {
        closeList()
        listKind = want
        listTop = line.top
      }
      const marker = bullet ? BULLET_RE : NUMBER_RE
      const kept = line.runs.filter((run, index) => !(index === 0 && marker.test(`${run.text} `)))
      const inner = kept.length ? runsHtml(kept, body) : esc(line.text.replace(marker, '').trim())
      listItems.push(`<li><p ${attrs}>${inner}</p></li>`)
      i += 1
      continue
    }

    closeList()
    const parts = [runsHtml(line.runs, body)]
    let j = i + 1
    while (j < flowLines.length && !level && !taken.has(j)) {
      const next = flowLines[j]
      const gap = next.top - flowLines[j - 1].top
      const sameSize = Math.abs(next.size - line.size) < line.size * 0.12
      const flows = gap <= pitch * 1.45
      const starts = !!isListLine(next)
      const full = Math.max(8, (column.right - column.left) * 0.06)
      const prevFull = flowLines[j - 1].maxX >= column.right - full
      const prevFullRtl = flowLines[j - 1].minX <= column.left + full
      const continues = line.rtl ? prevFullRtl || prevFull : prevFull
      if (!sameSize || !flows || starts || !continues || tableRun(flowLines, j, column, pitch)) break
      parts.push(runsHtml(next.runs, body))
      j++
    }
    const inner = parts.filter(Boolean).join(' ')
    blocks.push({
      top: line.top,
      html: level ? `<h${level} ${attrs}>${inner}</h${level}>` : `<p ${attrs}>${inner}</p>`
    })
    i = j
  }
  closeList()

  blocks.sort((a, b) => a.top - b.top)
  return blocks.map((block) => block.html).join('')
}

/** pt → the px the editor and Word both measure column widths in. */
function px(pt: number): number {
  return Math.max(12, Math.round((pt * 96) / 72))
}

/** Do two lines put their runs in the same column bands? */
function sharesColumns(a: Line, b: Line): number {
  const spans = (line: Line) => line.runs.map((r) => [r.x, r.x + Math.max(r.width, 1)] as const)
  const second = spans(b)
  let shared = 0
  for (const f of spans(a)) {
    if (second.some((sp) => Math.min(f[1], sp[1]) - Math.max(f[0], sp[0]) > -6)) shared += 1
  }
  return shared >= 2 ? shared : 0
}

function tableHtml(
  rows: Line[],
  body: number,
  head: Line[] = [],
  ruled = true,
  rules: PdfRule[] = []
): string {
  const centres: number[] = []
  for (const row of rows) {
    for (const run of row.runs) {
      const centre = run.x + run.width / 2
      if (!centres.some((c) => Math.abs(c - centre) <= Math.max(18, run.width * 0.6))) centres.push(centre)
    }
  }
  centres.sort((a, b) => a - b)
  const rtl = rows[0].rtl
  const order = rtl ? [...centres].reverse() : centres
  const bucketOf = (run: PdfRun) => {
    const centre = run.x + run.width / 2
    let best = 0
    let bestDist = Infinity
    order.forEach((c, index) => {
      const d = Math.abs(c - centre)
      if (d < bestDist) {
        bestDist = d
        best = index
      }
    })
    return best
  }
  // Column edges, so each cell can keep the alignment it had: labels sit
  // against the reading edge, amounts against the far one.
  const edges = order.map((_, index) => {
    let left = Infinity
    let right = -Infinity
    for (const row of [...head, ...rows]) {
      for (const run of row.runs) {
        if (bucketOf(run) !== index) continue
        left = Math.min(left, run.x)
        right = Math.max(right, run.x + run.width)
      }
    }
    return { left, right }
  })
  const flag = ruled ? '' : ' data-borderless="true"'
  // THE CELL BOUNDARIES THE FILE DRAWS decide alignment when it draws any:
  // a lone "-" in a fees column sits 45pt from the cell's left edge and 3pt
  // from its right, which says right-aligned — while the content on its own
  // says nothing at all, since it hugs neither of ITS own extents.
  const top = Math.min(...[...head, ...rows].map((line) => line.top))
  const bottom = Math.max(...rows.map((line) => line.top))
  const bounds: number[] = []
  for (const rule of rules) {
    if (rule.width > 3 || rule.height < 6) continue
    if (rule.y > bottom + 8 || rule.y + rule.height < top - 8) continue
    const x = Math.round(rule.x)
    if (!bounds.some((b) => Math.abs(b - x) <= 3)) bounds.push(x)
  }
  bounds.sort((a, b) => a - b)

  // Alignment is decided once PER COLUMN. Judging each cell on its own makes a
  // column of equal-width dates flicker between left and right.
  const columnAlign = edges.map((edge, index) => {
    const cellLeft = bounds.filter((b) => b <= edge.left + 2).pop() ?? edge.left
    const cellRight = bounds.find((b) => b >= edge.right - 2) ?? edge.right
    const width = cellRight - cellLeft
    if (bounds.length >= 2 && width > 4) {
      const leftGap = edge.left - cellLeft
      const rightGap = cellRight - edge.right
      if (Math.abs(leftGap - rightGap) <= Math.max(3, width * 0.08) && leftGap > width * 0.12) {
        return 'center'
      }
      return rightGap < leftGap ? 'right' : 'left'
    }
    // no drawn grid: fall back to which edge of its own span the cells hug
    let leftHug = 0
    let rightHug = 0
    let centre = 0
    let cells = 0
    const span = edge.right - edge.left
    for (const row of [...head, ...rows]) {
      const cellRuns = row.runs.filter((run) => bucketOf(run) === index)
      if (!cellRuns.length) continue
      cells += 1
      const minX = Math.min(...cellRuns.map((r) => r.x))
      const maxX = Math.max(...cellRuns.map((r) => r.x + r.width))
      if (minX - edge.left <= 1.5) leftHug += 1
      if (edge.right - maxX <= 1.5) rightHug += 1
      if (
        span > 12 &&
        Math.abs(minX - edge.left - (edge.right - maxX)) < span * 0.12 &&
        minX - edge.left > span * 0.15
      ) {
        centre += 1
      }
    }
    if (cells && centre > cells / 2) return 'center'
    return rightHug > leftHug ? 'right' : 'left'
  })
  // COLUMN WIDTHS: from the drawn cell boxes where the file has them, else
  // from the midpoints between the content bands. Without these every column
  // comes out the same width and the page stops matching at a glance.
  const columnWidth = edges.map((edge, index) => {
    const cellLeft = bounds.filter((b) => b <= edge.left + 2).pop()
    const cellRight = bounds.find((b) => b >= edge.right - 2)
    if (bounds.length >= 2 && cellLeft !== undefined && cellRight !== undefined && cellRight > cellLeft) {
      return cellRight - cellLeft
    }
    const prev = edges[index - 1]
    const next = edges[index + 1]
    const from = prev ? (prev.right + edge.left) / 2 : edge.left - 2
    const to = next ? (edge.right + next.left) / 2 : edge.right + 2
    return Math.max(8, to - from)
  })
  const cellHtml = (cellRuns: PdfRun[], index: number) => {
    const width = ` colwidth="${px(columnWidth[index])}"`
    if (!cellRuns.length) return `<td${flag}${width}><p></p></td>`
    return `<td${flag}${width}><p dir="${rtl ? 'rtl' : 'ltr'}" style="text-align: ${
      columnAlign[index]
    }">${runsHtml(cellRuns, body)}</p></td>`
  }
  const rowHtml = (line: Line) => {
    const buckets: PdfRun[][] = order.map(() => [])
    for (const run of line.runs) buckets[bucketOf(run)].push(run)
    return `<tr>${buckets.map((cell, index) => cellHtml(cell, index)).join('')}</tr>`
  }
  // several header lines stack into ONE row, cell by cell
  let headHtml = ''
  if (head.length) {
    const buckets: PdfRun[][] = order.map(() => [])
    for (const line of head) for (const run of line.runs) buckets[bucketOf(run)].push(run)
    headHtml = `<tr>${buckets.map((cell, index) => cellHtml(cell, index)).join('')}</tr>`
  }
  return `<table><tbody>${headHtml}${rows.map(rowHtml).join('')}</tbody></table>`
}

/** Which way the page as a whole reads — the direction the document adopts. */
export function pageDirection(runs: PdfRun[]): 'rtl' | 'ltr' {
  let rtl = 0
  let total = 0
  for (const run of runs) {
    const n = run.text.trim().length
    total += n
    if (run.dir === 'rtl') rtl += n
  }
  return total && rtl * 2 >= total ? 'rtl' : 'ltr'
}

/** The page's own margins, in millimetres, from where its content actually sits. */
export function pageMargins(
  runs: PdfRun[],
  images: PdfImage[],
  page: PageBox
): { top: number; bottom: number; left: number; right: number } {
  const xs: number[] = []
  const rights: number[] = []
  const tops: number[] = []
  const bottoms: number[] = []
  for (const run of runs) {
    xs.push(run.x)
    rights.push(run.x + run.width)
    tops.push(run.baselineTop - run.size)
    bottoms.push(run.baselineTop)
  }
  for (const image of images) {
    xs.push(image.x)
    rights.push(image.x + image.width)
    tops.push(image.y)
    bottoms.push(image.y + image.height)
  }
  const mm = (pt: number) => Math.round((pt * 25.4) / 72)
  const clamp = (value: number, limit: number) => Math.max(5, Math.min(limit, value))
  if (!xs.length) return { top: 25, bottom: 25, left: 24, right: 24 }
  const widthLimit = mm(page.widthPt) / 3
  const heightLimit = mm(page.heightPt) / 3
  const top = clamp(mm(Math.min(...tops)), heightLimit)
  return {
    top,
    // the last page stops wherever its text stops, so the measured gap at the
    // bottom is not a margin — mirror the top instead of inventing a huge one
    bottom: Math.min(clamp(mm(page.heightPt - Math.max(...bottoms)), heightLimit), Math.max(top, 25)),
    left: clamp(mm(Math.min(...xs)), widthLimit),
    right: clamp(mm(page.widthPt - Math.max(...rights)), widthLimit)
  }
}
