// Maps Univer plugin "resources" (filter / data validation / conditional
// formatting) to and from exceljs. Resource JSON shapes were captured from a
// live fWorkbook.save() on @univerjs 0.25.1 — see PROJECT_MAP.md.
//
// Fidelity contract (v2a):
// - Filter: the autoFilter RANGE only (no per-column criteria).
// - Data validation: literal lists, RANGE-sourced lists, whole/decimal/date/
//   textLength with operators. Custom formulas are skipped.
// - Conditional formatting: highlightCell (number ops incl. between/notBetween
//   + containsText), colorScale, dataBar, iconSet.
// - Notes: Excel legacy notes ↔ Univer note plugin (size/visibility defaults).
// - Images: floating images ↔ Univer drawing plugin (anchored at cell corner;
//   in-cell pixel offsets are approximated on export).
import type ExcelJS from 'exceljs'
import type { IWorkbookData } from '@univerjs/core'
import { colIndexToLetters, excelColorToRgb, excelStyleToUniver, parseAddress, rgbToArgb, univerStyleToExcelStyle } from './styleMap'
import type { ExcelStyleSource } from './styleMap'

const FILTER_KEY = 'SHEET_FILTER_PLUGIN'
const DV_KEY = 'SHEET_DATA_VALIDATION_PLUGIN'
const CF_KEY = 'SHEET_CONDITIONAL_FORMATTING_PLUGIN'
export const NOTE_KEY = 'SHEET_NOTE_PLUGIN'
const DRAWING_KEY = 'SHEET_DRAWING_PLUGIN'

type UniverResource = { name: string; data: string }

interface PlainRange {
  startRow: number
  startColumn: number
  endRow: number
  endColumn: number
  rangeType?: number
}

interface UniverDvRule {
  uid: string
  ranges: PlainRange[]
  type: string
  formula1?: string
  formula2?: string
  operator?: string
  allowBlank?: boolean
  showDropDown?: boolean
}

interface UniverCfRule {
  cfId: string
  stopIfTrue: boolean
  ranges: PlainRange[]
  // highlightCell {subType, operator, value, style} | colorScale {config} |
  // dataBar {config, isShowValue} | iconSet {config, isShowValue}
  rule: Record<string, unknown> & { type: string }
}

type Cfvo = { type: string; value?: number | string }

function cfvoToUniver(v: { type?: string; value?: unknown } | undefined, fallback: string): Cfvo {
  const type = v?.type === 'autoMin' ? 'min' : v?.type === 'autoMax' ? 'max' : (v?.type ?? fallback)
  const out: Cfvo = { type }
  if (v?.value != null && type !== 'min' && type !== 'max') {
    out.value = typeof v.value === 'number' ? v.value : Number(v.value) || String(v.value)
  }
  return out
}

function univerCfvoToExcel(v: { type?: string; value?: unknown } | undefined, fallback: string): Cfvo {
  const type = v?.type ?? fallback
  const out: Cfvo = { type }
  if (type !== 'min' && type !== 'max') {
    out.value = typeof v?.value === 'number' ? v.value : Number(v?.value ?? 0) || 0
  }
  return out
}

const NUMBER_OPERATORS = new Set([
  'greaterThan',
  'lessThan',
  'greaterThanOrEqual',
  'lessThanOrEqual',
  'equal',
  'notEqual'
])

// ---------- helpers ----------

function rangeToA1(r: PlainRange): string {
  const a = `${colIndexToLetters(r.startColumn)}${r.startRow + 1}`
  const b = `${colIndexToLetters(r.endColumn)}${r.endRow + 1}`
  return a === b ? a : `${a}:${b}`
}

function a1ToRange(a1: string): PlainRange | null {
  const [a, b] = a1.split(':')
  const p1 = a ? parseAddress(a) : null
  const p2 = b ? parseAddress(b) : p1
  if (!p1 || !p2) return null
  return {
    startRow: Math.min(p1.row, p2.row),
    endRow: Math.max(p1.row, p2.row),
    startColumn: Math.min(p1.col, p2.col),
    endColumn: Math.max(p1.col, p2.col),
    rangeType: 0
  }
}

/** 'A1:B2 C3' → ranges (Excel sqref lists are space-separated). */
function sqrefToRanges(sqref: string): PlainRange[] {
  return sqref
    .split(/\s+/)
    .map(a1ToRange)
    .filter((r): r is PlainRange => !!r)
}

/** Merge vertically-contiguous ranges sharing the same column span. */
function coalesceRanges(ranges: PlainRange[]): PlainRange[] {
  const sorted = [...ranges].sort(
    (a, b) => a.startColumn - b.startColumn || a.endColumn - b.endColumn || a.startRow - b.startRow
  )
  const out: PlainRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (
      last &&
      last.startColumn === r.startColumn &&
      last.endColumn === r.endColumn &&
      r.startRow <= last.endRow + 1
    ) {
      last.endRow = Math.max(last.endRow, r.endRow)
    } else {
      out.push({ ...r })
    }
  }
  return out
}

function formulaValueToString(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (v == null) return ''
  return String(v)
}

// ---------- import: exceljs worksheets → Univer resources ----------

interface UniverNote {
  row: number
  col: number
  id: string
  note: string
  width: number
  height: number
  show: boolean
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export function buildResources(
  wb: ExcelJS.Workbook,
  pairs: Array<{ ws: ExcelJS.Worksheet; sheetId: string }>,
  unitId: string
): UniverResource[] {
  const filterMap: Record<string, { ref: PlainRange; filterColumns: never[]; cachedFilteredOut: never[] }> = {}
  const dvMap: Record<string, UniverDvRule[]> = {}
  const cfMap: Record<string, UniverCfRule[]> = {}
  const noteMap: Record<string, Record<number, Record<number, UniverNote>>> = {}
  const drawingMap: Record<string, { data: Record<string, unknown>; order: string[] }> = {}
  let dvCounter = 0
  let cfCounter = 0
  let noteCounter = 0
  let imageCounter = 0

  for (const { ws, sheetId } of pairs) {
    // --- autoFilter range ---
    const rawAf =
      (ws as unknown as { autoFilter?: unknown }).autoFilter ??
      (ws.model as unknown as { autoFilter?: unknown })?.autoFilter
    const afRange = parseAutoFilter(rawAf)
    if (afRange) filterMap[sheetId] = { ref: afRange, filterColumns: [], cachedFilteredOut: [] }

    // --- data validations ---
    // exceljs expands a written range key (C2:C6) into per-cell entries on
    // read — group identical definitions and coalesce their ranges back.
    const dvModel = (ws as unknown as { dataValidations?: { model?: Record<string, ExcelJS.DataValidation> } })
      .dataValidations?.model
    const dvGroups = new Map<string, { def: ExcelJS.DataValidation; ranges: PlainRange[] }>()
    for (const [sqref, dv] of Object.entries(dvModel ?? {})) {
      if (!dv) continue
      const key = JSON.stringify({ t: dv.type, o: dv.operator, f: dv.formulae, a: dv.allowBlank })
      const group = dvGroups.get(key) ?? { def: dv, ranges: [] }
      group.ranges.push(...sqrefToRanges(sqref))
      dvGroups.set(key, group)
    }
    for (const group of dvGroups.values()) {
      const rule = excelDvToUniver(group.def, coalesceRanges(group.ranges), `dv-${++dvCounter}`)
      if (rule) (dvMap[sheetId] ??= []).push(rule)
    }

    // --- conditional formatting ---
    const cfs =
      (ws as unknown as { conditionalFormattings?: Array<{ ref: string; rules: unknown[] }> })
        .conditionalFormattings ??
      (ws.model as unknown as { conditionalFormattings?: Array<{ ref: string; rules: unknown[] }> })
        ?.conditionalFormattings ??
      []
    for (const cf of cfs) {
      const ranges = sqrefToRanges(cf.ref ?? '')
      if (!ranges.length) continue
      for (const raw of cf.rules ?? []) {
        const rule = excelCfToUniver(raw as Record<string, unknown>, ranges, `cf-${++cfCounter}`)
        if (rule) (cfMap[sheetId] ??= []).push(rule)
      }
    }

    // --- notes (Excel legacy notes) ---
    // includeEmpty on both axes: a cell can carry a note without any value.
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const rawNote = (cell as unknown as { note?: unknown }).note
        if (!rawNote) return
        const text =
          typeof rawNote === 'string'
            ? rawNote
            : Array.isArray((rawNote as { texts?: unknown }).texts)
              ? (rawNote as { texts: Array<{ text?: string }> }).texts.map((t) => t.text ?? '').join('')
              : ''
        if (!text) return
        const rowsMap = (noteMap[sheetId] ??= {})
        ;(rowsMap[rowNumber - 1] ??= {})[colNumber - 1] = {
          row: rowNumber - 1,
          col: colNumber - 1,
          id: `note-${++noteCounter}`,
          note: text,
          width: 216,
          height: 92,
          show: false
        }
      })
    })

    // --- floating images ---
    const images =
      (
        ws as unknown as {
          getImages?: () => Array<{
            imageId: string | number
            range?: {
              tl?: { nativeCol?: number; nativeRow?: number; nativeColOff?: number; nativeRowOff?: number }
              br?: { nativeCol?: number; nativeRow?: number; nativeColOff?: number; nativeRowOff?: number }
              ext?: { width?: number; height?: number }
            }
          }>
        }
      ).getImages?.() ?? []
    const drawingData: Record<string, unknown> = {}
    const drawingOrder: string[] = []
    for (const img of images) {
      const media = (
        wb as unknown as { getImage?: (id: number) => { extension?: string; buffer?: Uint8Array } | undefined }
      ).getImage?.(Number(img.imageId))
      if (!media?.buffer?.length) continue
      const ext = (media.extension === 'jpg' ? 'jpeg' : media.extension) || 'png'
      const source = `data:image/${ext};base64,${uint8ToBase64(media.buffer)}`
      const tl = img.range?.tl ?? {}
      const col = Math.floor(tl.nativeCol ?? 0)
      const rowIdx = Math.floor(tl.nativeRow ?? 0)
      const colOff = Math.round((tl.nativeColOff ?? 0) / 9525) // EMU → px
      const rowOff = Math.round((tl.nativeRowOff ?? 0) / 9525)
      let width = Math.round(img.range?.ext?.width ?? 0)
      let height = Math.round(img.range?.ext?.height ?? 0)
      const br = img.range?.br
      if ((!width || !height) && br) {
        // two-cell anchor without ext: approximate with default cell sizes
        width = Math.max(
          20,
          Math.round(((br.nativeCol ?? col) - col) * 64 + ((br.nativeColOff ?? 0) - (tl.nativeColOff ?? 0)) / 9525)
        )
        height = Math.max(
          20,
          Math.round(((br.nativeRow ?? rowIdx) - rowIdx) * 20 + ((br.nativeRowOff ?? 0) - (tl.nativeRowOff ?? 0)) / 9525)
        )
      }
      if (!width) width = 120
      if (!height) height = 120
      const drawingId = `img-${++imageCounter}`
      const anchor = { column: col, columnOffset: colOff, row: rowIdx, rowOffset: rowOff }
      const sheetTransform = {
        angle: 0,
        flipX: false,
        flipY: false,
        skewX: 0,
        skewY: 0,
        from: { ...anchor },
        to: { column: col, columnOffset: colOff + width, row: rowIdx, rowOffset: rowOff + height }
      }
      drawingData[drawingId] = {
        unitId,
        subUnitId: sheetId,
        drawingId,
        drawingType: 0,
        imageSourceType: 'URL',
        source,
        column: col,
        columnOffset: colOff,
        row: rowIdx,
        rowOffset: rowOff,
        width,
        height,
        sheetTransform,
        axisAlignSheetTransform: sheetTransform,
        transform: {
          angle: 0,
          flipX: false,
          flipY: false,
          left: col * 64 + colOff,
          top: rowIdx * 20 + rowOff,
          width,
          height
        }
      }
      drawingOrder.push(drawingId)
    }
    if (drawingOrder.length) drawingMap[sheetId] = { data: drawingData, order: drawingOrder }
  }

  const resources: UniverResource[] = []
  if (Object.keys(filterMap).length) resources.push({ name: FILTER_KEY, data: JSON.stringify(filterMap) })
  if (Object.keys(dvMap).length) resources.push({ name: DV_KEY, data: JSON.stringify(dvMap) })
  if (Object.keys(cfMap).length) resources.push({ name: CF_KEY, data: JSON.stringify(cfMap) })
  if (Object.keys(noteMap).length) resources.push({ name: NOTE_KEY, data: JSON.stringify(noteMap) })
  if (Object.keys(drawingMap).length) resources.push({ name: DRAWING_KEY, data: JSON.stringify(drawingMap) })
  return resources
}

function parseAutoFilter(raw: unknown): PlainRange | null {
  if (!raw) return null
  if (typeof raw === 'string') return a1ToRange(raw)
  const obj = raw as { from?: unknown; to?: unknown }
  const point = (p: unknown): string | null => {
    if (typeof p === 'string') return p
    if (p && typeof p === 'object') {
      const { row, column } = p as { row?: number; column?: number }
      if (row && column) return `${colIndexToLetters(column - 1)}${row}`
    }
    return null
  }
  const from = point(obj.from)
  const to = point(obj.to) ?? from
  if (!from || !to) return null
  return a1ToRange(`${from}:${to}`)
}

function excelDvToUniver(
  dv: ExcelJS.DataValidation,
  ranges: PlainRange[],
  uid: string
): UniverDvRule | null {
  if (!ranges.length || !dv?.type) return null
  if (dv.type === 'list') {
    const raw = formulaValueToString(dv.formulae?.[0])
    if (raw.startsWith('"') && raw.endsWith('"')) {
      const values = raw.slice(1, -1).split(',')
      return {
        uid,
        ranges,
        type: 'list',
        formula1: JSON.stringify(values),
        showDropDown: true,
        ...(dv.allowBlank != null ? { allowBlank: dv.allowBlank } : {})
      }
    }
    if (raw) {
      // Range-sourced list, e.g. Sheet1!$A$1:$A$6 — Univer stores it as a formula.
      const ref = raw.startsWith('=') ? raw.slice(1) : raw
      return {
        uid,
        ranges,
        type: 'list',
        formula1: `=${ref}`,
        showDropDown: true,
        ...(dv.allowBlank != null ? { allowBlank: dv.allowBlank } : {})
      }
    }
    return null
  }
  if (dv.type === 'whole' || dv.type === 'decimal' || dv.type === 'date' || dv.type === 'textLength') {
    return {
      uid,
      ranges,
      type: dv.type,
      operator: dv.operator ?? 'between',
      formula1: formulaValueToString(dv.formulae?.[0]),
      formula2: formulaValueToString(dv.formulae?.[1]),
      ...(dv.allowBlank != null ? { allowBlank: dv.allowBlank } : {})
    }
  }
  return null // custom & others: out of v1 scope
}

function excelCfToUniver(
  raw: Record<string, unknown>,
  ranges: PlainRange[],
  cfId: string
): UniverCfRule | null {
  const type = raw.type as string
  const operator = raw.operator as string | undefined
  const base = { cfId, stopIfTrue: false, ranges }

  if (type === 'colorScale') {
    const cfvo = raw.cfvo as Array<{ type?: string; value?: unknown }> | undefined
    const colors = raw.color as Array<Partial<ExcelJS.Color>> | undefined
    if (!cfvo || !colors || cfvo.length < 2 || colors.length < cfvo.length) return null
    const fallbacks = cfvo.map((_, i) => (i === 0 ? 'min' : i === cfvo.length - 1 ? 'max' : 'percentile'))
    return {
      ...base,
      rule: {
        type: 'colorScale',
        config: cfvo.map((v, i) => ({
          index: i,
          color: excelColorToRgb(colors[i] as ExcelJS.Color) ?? '#FFFFFF',
          value: cfvoToUniver(v, fallbacks[i])
        }))
      }
    }
  }

  if (type === 'dataBar') {
    const cfvo = raw.cfvo as Array<{ type?: string; value?: unknown }> | undefined
    return {
      ...base,
      rule: {
        type: 'dataBar',
        isShowValue: raw.showValue !== false,
        config: {
          min: cfvoToUniver(cfvo?.[0], 'min'),
          max: cfvoToUniver(cfvo?.[1], 'max'),
          positiveColor: excelColorToRgb(raw.color as ExcelJS.Color) ?? '#638EC6',
          nativeColor: '#FF0000',
          isGradient: raw.gradient !== false
        }
      }
    }
  }

  if (type === 'iconSet') {
    const cfvo = raw.cfvo as Array<{ type?: string; value?: unknown }> | undefined
    const iconType = typeof raw.iconSet === 'string' ? raw.iconSet : '3Arrows'
    if (!cfvo?.length) return null
    return {
      ...base,
      rule: {
        type: 'iconSet',
        isShowValue: raw.showValue !== false,
        config: cfvo.map((v, i) => ({
          iconType,
          iconId: String(i),
          operator: 'greaterThanOrEqual',
          value: cfvoToUniver(v, i === 0 ? 'min' : 'percent')
        }))
      }
    }
  }

  // highlight rules need a style to mean anything
  const style = raw.style ? excelStyleToUniver(raw.style as ExcelStyleSource) : undefined
  if (!style) return null

  if (type === 'cellIs' && (operator === 'between' || operator === 'notBetween')) {
    const f = raw.formulae as unknown[] | undefined
    const a = Number(f?.[0])
    const b = Number(f?.[1])
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    return {
      ...base,
      rule: { type: 'highlightCell', subType: 'number', operator, value: [a, b], style }
    }
  }
  if (type === 'cellIs' && operator && NUMBER_OPERATORS.has(operator)) {
    const value = Number((raw.formulae as unknown[] | undefined)?.[0])
    if (!Number.isFinite(value)) return null
    return {
      ...base,
      rule: { type: 'highlightCell', subType: 'number', operator, value, style }
    }
  }
  if (type === 'containsText' || (type === 'cellIs' && operator === 'containsText')) {
    let text = typeof raw.text === 'string' ? raw.text : ''
    if (!text) {
      // xlsx stores containsText as NOT(ISERROR(SEARCH("needle",ref))) — recover the needle.
      const formula = String((raw.formulae as unknown[] | undefined)?.[0] ?? '')
      const m = /SEARCH\("((?:[^"]|"")*)"/.exec(formula)
      if (m) text = m[1].replace(/""/g, '"')
    }
    if (!text) return null
    return {
      ...base,
      rule: { type: 'highlightCell', subType: 'text', operator: 'containsText', value: text, style }
    }
  }
  return null // exotic rules (formula-based, timePeriod, …) are out of scope
}

// ---------- export: Univer resources → exceljs worksheets ----------

export function applyResources(
  wb: ExcelJS.Workbook,
  resources: IWorkbookData['resources'],
  sheetIdToWs: Map<string, ExcelJS.Worksheet>
) {
  if (!resources?.length) return
  const byName = new Map(resources.map((r) => [r.name, r.data]))

  const filterMap = parseJson<Record<string, { ref?: PlainRange }>>(byName.get(FILTER_KEY))
  for (const [sheetId, entry] of Object.entries(filterMap ?? {})) {
    const ws = sheetIdToWs.get(sheetId)
    if (!ws || !entry?.ref) continue
    ws.autoFilter = {
      from: { row: entry.ref.startRow + 1, column: entry.ref.startColumn + 1 },
      to: { row: entry.ref.endRow + 1, column: entry.ref.endColumn + 1 }
    }
  }

  const dvMap = parseJson<Record<string, UniverDvRule[]>>(byName.get(DV_KEY))
  for (const [sheetId, rules] of Object.entries(dvMap ?? {})) {
    const ws = sheetIdToWs.get(sheetId)
    if (!ws) continue
    const model = (ws as unknown as { dataValidations: { model: Record<string, ExcelJS.DataValidation> } })
      .dataValidations.model
    for (const rule of rules ?? []) {
      const dv = univerDvToExcel(rule)
      if (!dv) continue
      const sqref = (rule.ranges ?? []).map(rangeToA1).join(' ')
      if (sqref) model[sqref] = dv
    }
  }

  const cfMap = parseJson<Record<string, UniverCfRule[]>>(byName.get(CF_KEY))
  for (const [sheetId, rules] of Object.entries(cfMap ?? {})) {
    const ws = sheetIdToWs.get(sheetId)
    if (!ws) continue
    for (const entry of rules ?? []) {
      const excelRule = univerCfToExcel(entry)
      if (!excelRule) continue
      const ref = (entry.ranges ?? []).map(rangeToA1).join(' ')
      if (!ref) continue
      ws.addConditionalFormatting({ ref, rules: [excelRule] } as unknown as ExcelJS.ConditionalFormattingOptions)
    }
  }

  const noteMap = parseJson<Record<string, Record<string, Record<string, { note?: string }>>>>(
    byName.get(NOTE_KEY)
  )
  for (const [sheetId, rows] of Object.entries(noteMap ?? {})) {
    const ws = sheetIdToWs.get(sheetId)
    if (!ws) continue
    for (const [r, cols] of Object.entries(rows ?? {})) {
      for (const [c, entry] of Object.entries(cols ?? {})) {
        if (entry?.note) ws.getCell(Number(r) + 1, Number(c) + 1).note = entry.note
      }
    }
  }

  const drawingMap = parseJson<
    Record<
      string,
      {
        data?: Record<
          string,
          {
            drawingType?: number
            source?: string
            column?: number
            row?: number
            width?: number
            height?: number
            transform?: { width?: number; height?: number }
          }
        >
      }
    >
  >(byName.get(DRAWING_KEY))
  for (const [sheetId, entry] of Object.entries(drawingMap ?? {})) {
    const ws = sheetIdToWs.get(sheetId)
    if (!ws || !entry?.data) continue
    for (const d of Object.values(entry.data)) {
      if (d?.drawingType !== 0 || typeof d.source !== 'string') continue
      const m = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/.exec(d.source)
      if (!m) continue // remote URLs can't be embedded into xlsx
      const extension = m[1] === 'jpeg' || m[1] === 'jpg' ? 'jpeg' : m[1] === 'gif' ? 'gif' : 'png'
      const imageId = (
        wb as unknown as { addImage(o: { base64: string; extension: string }): number }
      ).addImage({ base64: m[2], extension })
      const width = d.transform?.width ?? d.width ?? 120
      const height = d.transform?.height ?? d.height ?? 120
      ;(ws as unknown as { addImage(id: number, range: unknown): void }).addImage(imageId, {
        tl: { col: d.column ?? 0, row: d.row ?? 0 },
        ext: { width, height }
      })
    }
  }
}

function parseJson<T>(data: string | undefined): T | undefined {
  if (!data) return undefined
  try {
    return JSON.parse(data) as T
  } catch {
    return undefined
  }
}

function univerDvToExcel(rule: UniverDvRule): ExcelJS.DataValidation | null {
  if (rule.type === 'list') {
    const f1 = rule.formula1 ?? ''
    if (f1.startsWith('=')) {
      // Range-sourced list: strip Univer's [unitId] prefix for Excel.
      const ref = f1.slice(1).replace(/^\[[^\]]*\]/, '')
      if (!ref) return null
      return { type: 'list', allowBlank: rule.allowBlank ?? true, formulae: [ref] }
    }
    const values = parseJson<string[]>(f1)
    if (!Array.isArray(values)) return null
    return {
      type: 'list',
      allowBlank: rule.allowBlank ?? true,
      formulae: [`"${values.join(',')}"`]
    }
  }
  if (rule.type === 'whole' || rule.type === 'decimal' || rule.type === 'date' || rule.type === 'textLength') {
    const f = (s?: string) => {
      if (s == null || s === '') return undefined
      const n = Number(s)
      return Number.isFinite(n) ? n : s
    }
    const formulae = [f(rule.formula1), f(rule.formula2)].filter((x) => x !== undefined)
    if (!formulae.length) return null
    return {
      type: rule.type,
      operator: (rule.operator ?? 'between') as ExcelJS.DataValidation['operator'],
      allowBlank: rule.allowBlank ?? true,
      formulae
    }
  }
  return null
}

function univerCfToExcel(entry: UniverCfRule): Record<string, unknown> | null {
  const r = entry.rule
  if (!r?.type) return null

  if (r.type === 'colorScale') {
    const config = r.config as Array<{ color?: string; value?: { type?: string; value?: unknown } }> | undefined
    if (!config || config.length < 2) return null
    return {
      type: 'colorScale',
      priority: 1,
      cfvo: config.map((c, i) =>
        univerCfvoToExcel(c.value, i === 0 ? 'min' : i === config.length - 1 ? 'max' : 'percentile')
      ),
      color: config.map((c) => ({ argb: rgbToArgb(c.color) ?? 'FFFFFFFF' }))
    }
  }

  if (r.type === 'dataBar') {
    const config = r.config as
      | { min?: { type?: string; value?: unknown }; max?: { type?: string; value?: unknown }; positiveColor?: string; isGradient?: boolean }
      | undefined
    return {
      type: 'dataBar',
      priority: 1,
      cfvo: [univerCfvoToExcel(config?.min, 'min'), univerCfvoToExcel(config?.max, 'max')],
      color: { argb: rgbToArgb(config?.positiveColor) ?? 'FF638EC6' },
      gradient: config?.isGradient !== false,
      showValue: r.isShowValue !== false
    }
  }

  if (r.type === 'iconSet') {
    const config = r.config as Array<{ iconType?: string; value?: { type?: string; value?: unknown } }> | undefined
    if (!config?.length) return null
    return {
      type: 'iconSet',
      priority: 1,
      iconSet: config[0]?.iconType ?? '3Arrows',
      showValue: r.isShowValue !== false,
      cfvo: config.map((c, i) => univerCfvoToExcel(c.value, i === 0 ? 'min' : 'percent'))
    }
  }

  if (r.type !== 'highlightCell' || !r.style) return null
  const style = univerStyleToExcelStyle(r.style as Parameters<typeof univerStyleToExcelStyle>[0])
  const operator = r.operator as string
  if (r.subType === 'number' && (operator === 'between' || operator === 'notBetween') && Array.isArray(r.value)) {
    return {
      type: 'cellIs',
      operator,
      formulae: (r.value as unknown[]).slice(0, 2).map((v) => String(v)),
      priority: 1,
      style
    }
  }
  if (r.subType === 'number' && NUMBER_OPERATORS.has(operator)) {
    return {
      type: 'cellIs',
      operator,
      formulae: [String(r.value)],
      priority: 1,
      style
    }
  }
  if (r.subType === 'text' && operator === 'containsText') {
    return {
      type: 'containsText',
      operator: 'containsText',
      text: String(r.value),
      priority: 1,
      style
    }
  }
  return null
}
