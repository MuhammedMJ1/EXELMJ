// exceljs 4.4.0 WRITES cell notes (xl/comments*.xml + VML) but its reader
// never surfaces them back on cell.note (verified empirically). This module
// reads them straight from the xlsx zip.
import JSZip from 'jszip'
import { parseAddress } from './styleMap'
import { parseRels, relsPathFor, resolveTarget, sheetPartsInOrder, unescapeXml } from './zipUtils'

export interface ParsedNote {
  row: number
  col: number
  text: string
}

/** Notes per worksheet ORDINAL (0-based, in workbook.xml order). */
export async function parseNotesFromZip(bytes: Uint8Array | ArrayBuffer): Promise<Map<number, ParsedNote[]>> {
  const out = new Map<number, ParsedNote[]>()
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    return out
  }
  const read = (path: string) => zip.file(path)?.async('string')
  const sheets = await sheetPartsInOrder(zip)

  for (let ordinal = 0; ordinal < sheets.length; ordinal++) {
    const part = sheets[ordinal].part
    const relsXml = await read(relsPathFor(part))
    if (!relsXml) continue
    const baseDir = part.slice(0, part.lastIndexOf('/'))
    const commentsRel = parseRels(relsXml).find((r) => r.type.endsWith('/comments'))
    if (!commentsRel) continue
    const commentsXml = await read(resolveTarget(baseDir, commentsRel.target))
    if (!commentsXml) continue

    const notes: ParsedNote[] = []
    for (const cm of commentsXml.matchAll(/<comment\b[^>]*ref="([^"]+)"[^>]*>([\s\S]*?)<\/comment>/g)) {
      const pos = parseAddress(cm[1])
      if (!pos) continue
      const text = [...cm[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join('')
      if (text) notes.push({ row: pos.row, col: pos.col, text })
    }
    if (notes.length) out.set(ordinal, notes)
  }
  return out
}
