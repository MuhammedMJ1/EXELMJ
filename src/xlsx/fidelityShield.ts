// The Fidelity Shield: parts of a foreign xlsx that our pipeline does not
// model (pivot tables, native Excel charts/drawings, VBA macros) are
// RE-INJECTED into the exported file at zip level, so "open in EXELMJ, edit a
// cell, save" never destroys them. Sheets are matched by NAME (robust to
// reordering; renaming a sheet drops its attached parts — documented).
//
// Preserved: xl/vbaProject.bin (+ macroEnabled workbook content type),
// pivotTable/pivotCache part chains, per-sheet drawing chains (native charts,
// their rels and media). Skipped: slicers, a sheet whose exported version
// already has its own drawing (EXELMJ images added this session), media name
// collisions.
import JSZip from 'jszip'
import {
  attr,
  insertBefore,
  parseRels,
  relTargetFrom,
  relsPathFor,
  resolveTarget,
  sheetPartsInOrder
} from './zipUtils'

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
const TYPE_DRAWING = `${REL}drawing`
const TYPE_PIVOT_TABLE = `${REL}pivotTable`
const TYPE_PIVOT_CACHE = `${REL}pivotCacheDefinition`
const TYPE_VBA = 'http://schemas.microsoft.com/office/2006/relationships/vbaProject'
const MACRO_WB_CT = 'application/vnd.ms-excel.sheet.macroEnabled.main+xml'

export interface FidelityReport {
  vba: boolean
  pivotSheets: string[]
  drawingSheets: string[]
  skipped: string[]
}

export async function fidelityMerge(
  exported: Uint8Array,
  original: Uint8Array | ArrayBuffer
): Promise<{ bytes: Uint8Array; report: FidelityReport }> {
  const report: FidelityReport = { vba: false, pivotSheets: [], drawingSheets: [], skipped: [] }
  let orig: JSZip
  let out: JSZip
  try {
    orig = await JSZip.loadAsync(original)
    out = await JSZip.loadAsync(exported)
  } catch {
    return { bytes: exported, report }
  }

  const readO = (p: string) => orig.file(p)?.async('string')
  const readOBin = (p: string) => orig.file(p)?.async('uint8array')
  const readU = (p: string) => out.file(p)?.async('string')

  // --- content types bookkeeping ---
  let outCT = (await readU('[Content_Types].xml')) ?? ''
  const origCT = (await readO('[Content_Types].xml')) ?? ''
  const origOverrides = new Map<string, string>()
  for (const m of origCT.matchAll(/<Override\b[^>]*>/g)) {
    const pn = attr(m[0], 'PartName')
    const ct = attr(m[0], 'ContentType')
    if (pn && ct) origOverrides.set(pn, ct)
  }
  const origDefaults = new Map<string, string>()
  for (const m of origCT.matchAll(/<Default\b[^>]*>/g)) {
    const ext = attr(m[0], 'Extension')
    const ct = attr(m[0], 'ContentType')
    if (ext && ct) origDefaults.set(ext.toLowerCase(), ct)
  }
  const ctAdds: string[] = []
  const ensureOverride = (partName: string) => {
    if (outCT.includes(`PartName="${partName}"`) || ctAdds.some((c) => c.includes(`PartName="${partName}"`)))
      return
    const ct = origOverrides.get(partName)
    if (ct) ctAdds.push(`<Override PartName="${partName}" ContentType="${ct}"/>`)
  }
  const ensureDefault = (ext: string) => {
    if (
      new RegExp(`Extension="${ext}"`, 'i').test(outCT) ||
      ctAdds.some((c) => new RegExp(`Extension="${ext}"`, 'i').test(c))
    )
      return
    const ct = origDefaults.get(ext)
    if (ct) ctAdds.push(`<Default Extension="${ext}" ContentType="${ct}"/>`)
  }

  /** Copy one part (binary-safe) + its content-type entries. False when absent. */
  const copyPart = async (p: string): Promise<boolean> => {
    if (out.file(p)) return true
    const data = await readOBin(p)
    if (!data) return false
    out.file(p, data)
    ensureOverride(`/${p}`)
    const ext = p.split('.').pop()?.toLowerCase()
    if (ext) ensureDefault(ext)
    return true
  }

  /** Copy a part plus its rels and their transitive local targets. */
  const copyWithDeps = async (part: string, depth = 0): Promise<boolean> => {
    if (depth > 4) return true
    if (!(await copyPart(part))) return false
    const relsPath = relsPathFor(part)
    const relsXml = await readO(relsPath)
    if (relsXml) {
      if (!out.file(relsPath)) out.file(relsPath, relsXml)
      const baseDir = part.slice(0, part.lastIndexOf('/'))
      for (const rel of parseRels(relsXml)) {
        if (/^https?:/i.test(rel.target)) continue
        const dep = resolveTarget(baseDir, rel.target)
        if (out.file(dep)) continue // media/name collision — keep exported side
        await copyWithDeps(dep, depth + 1)
      }
    }
    return true
  }

  const origSheets = await sheetPartsInOrder(orig)
  const outSheets = await sheetPartsInOrder(out)
  const outByName = new Map(outSheets.map((s) => [s.name, s.part]))

  // --- per-sheet: pivot tables + native drawings/charts ---
  for (const os of origSheets) {
    const outPart = outByName.get(os.name)
    if (!outPart) {
      report.skipped.push(`sheet:${os.name}`)
      continue
    }
    const origRelsXml = await readO(relsPathFor(os.part))
    if (!origRelsXml) continue
    const origBase = os.part.slice(0, os.part.lastIndexOf('/'))
    const attaches: Array<{ type: string; part: string }> = []
    for (const rel of parseRels(origRelsXml)) {
      if (rel.type === TYPE_PIVOT_TABLE) {
        const dep = resolveTarget(origBase, rel.target)
        if (await copyWithDeps(dep)) attaches.push({ type: TYPE_PIVOT_TABLE, part: dep })
      } else if (rel.type === TYPE_DRAWING) {
        const outRelsNow = (await readU(relsPathFor(outPart))) ?? ''
        if (outRelsNow.includes(TYPE_DRAWING)) {
          report.skipped.push(`drawing:${os.name}`)
          continue
        }
        const dep = resolveTarget(origBase, rel.target)
        if (await copyWithDeps(dep)) attaches.push({ type: TYPE_DRAWING, part: dep })
      }
    }
    if (!attaches.length) continue

    const relsPath = relsPathFor(outPart)
    let relsXml =
      (await readU(relsPath)) ??
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    let maxId = 0
    for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) maxId = Math.max(maxId, Number(m[1]))
    let sheetXml = (await readU(outPart)) ?? ''
    const relAdds: string[] = []
    for (const a of attaches) {
      const rid = `rId${++maxId}`
      const target = relTargetFrom('xl/worksheets', a.part)
      relAdds.push(`<Relationship Id="${rid}" Type="${a.type}" Target="${target}"/>`)
      if (a.type === TYPE_DRAWING) {
        sheetXml = insertBefore(sheetXml, ['<tableParts', '<extLst', '</worksheet>'], `<drawing r:id="${rid}"/>`)
        report.drawingSheets.push(os.name)
      } else {
        report.pivotSheets.push(os.name)
      }
    }
    relsXml = relsXml.replace('</Relationships>', `${relAdds.join('')}</Relationships>`)
    out.file(relsPath, relsXml)
    out.file(outPart, sheetXml)
  }

  // --- workbook-level: vba + pivot caches ---
  const origWbXml = (await readO('xl/workbook.xml')) ?? ''
  const origWbRels = parseRels((await readO('xl/_rels/workbook.xml.rels')) ?? '')
  let outWbXml = (await readU('xl/workbook.xml')) ?? ''
  let outWbRels = (await readU('xl/_rels/workbook.xml.rels')) ?? ''
  let maxWbId = 0
  for (const m of outWbRels.matchAll(/Id="rId(\d+)"/g)) maxWbId = Math.max(maxWbId, Number(m[1]))
  const wbRelAdds: string[] = []

  if (origWbRels.some((r) => r.type === TYPE_VBA) && (await copyPart('xl/vbaProject.bin'))) {
    const rid = `rId${++maxWbId}`
    wbRelAdds.push(`<Relationship Id="${rid}" Type="${TYPE_VBA}" Target="vbaProject.bin"/>`)
    ensureDefault('bin')
    outCT = outCT.replace(
      /(<Override PartName="\/xl\/workbook\.xml" ContentType=")[^"]*(")/,
      `$1${MACRO_WB_CT}$2`
    )
    report.vba = true
  }

  const cacheRels = origWbRels.filter((r) => r.type === TYPE_PIVOT_CACHE)
  const cacheBlock = /<pivotCaches>[\s\S]*?<\/pivotCaches>/.exec(origWbXml)?.[0]
  if (cacheRels.length && cacheBlock && report.pivotSheets.length) {
    let block = cacheBlock
    for (const rel of cacheRels) {
      const dep = resolveTarget('xl', rel.target)
      if (!(await copyWithDeps(dep))) continue
      const rid = `rId${++maxWbId}`
      wbRelAdds.push(`<Relationship Id="${rid}" Type="${TYPE_PIVOT_CACHE}" Target="${rel.target}"/>`)
      block = block.replace(new RegExp(`r:id="${rel.id}"`), `r:id="${rid}"`)
    }
    outWbXml = insertBefore(outWbXml, ['<extLst', '</workbook>'], block)
    out.file('xl/workbook.xml', outWbXml)
  }

  if (wbRelAdds.length) {
    outWbRels = outWbRels.replace('</Relationships>', `${wbRelAdds.join('')}</Relationships>`)
    out.file('xl/_rels/workbook.xml.rels', outWbRels)
  }
  if (ctAdds.length || report.vba) {
    outCT = outCT.replace('</Types>', `${ctAdds.join('')}</Types>`)
    out.file('[Content_Types].xml', outCT)
  }

  const bytes = await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  return { bytes, report }
}
