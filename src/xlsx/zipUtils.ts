// Shared low-level helpers for reading xlsx zip internals (used by the notes
// parser and the fidelity shield).
import type JSZip from 'jszip'

export interface Relationship {
  id: string
  type: string
  target: string
}

export interface SheetPart {
  /** Display name from workbook.xml. */
  name: string
  /** Zip path of the worksheet part, e.g. xl/worksheets/sheet1.xml. */
  part: string
}

export function attr(tag: string, name: string): string | undefined {
  return new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1]
}

export function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&')
}

export function parseRels(xml: string): Relationship[] {
  const rels: Relationship[] = []
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], 'Id')
    const type = attr(m[0], 'Type')
    const target = attr(m[0], 'Target')
    if (id && type && target) rels.push({ id, type, target })
  }
  return rels
}

/** Resolve a relationship Target against the folder of its source part. */
export function resolveTarget(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1)
  const segments = `${baseDir}/${target}`.split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (seg === '..') out.pop()
    else if (seg !== '.' && seg !== '') out.push(seg)
  }
  return out.join('/')
}

/** '../pivotTables/p1.xml' style target for a part, relative to fromDir. */
export function relTargetFrom(fromDir: string, part: string): string {
  const from = fromDir.split('/')
  const to = part.split('/')
  let i = 0
  while (i < from.length && i < to.length && from[i] === to[i]) i++
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/')
}

/** xl/worksheets/sheet1.xml → xl/worksheets/_rels/sheet1.xml.rels */
export function relsPathFor(part: string): string {
  const idx = part.lastIndexOf('/')
  return `${part.slice(0, idx)}/_rels/${part.slice(idx + 1)}.rels`
}

/** Worksheet parts in workbook.xml order, with display names. */
export async function sheetPartsInOrder(zip: JSZip): Promise<SheetPart[]> {
  const workbookXml = (await zip.file('xl/workbook.xml')?.async('string')) ?? ''
  const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) ?? ''
  const worksheetRels = new Map(
    parseRels(relsXml)
      .filter((r) => r.type.endsWith('/worksheet'))
      .map((r) => [r.id, resolveTarget('xl', r.target)])
  )
  const out: SheetPart[] = []
  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name')
    const rid = attr(m[0], 'r:id')
    const part = rid ? worksheetRels.get(rid) : undefined
    if (name != null && part) out.push({ name: unescapeXml(name), part })
  }
  return out
}

/** Insert a fragment before the first present marker (last marker must exist). */
export function insertBefore(xml: string, markers: string[], fragment: string): string {
  for (const marker of markers) {
    const idx = xml.indexOf(marker)
    if (idx >= 0) return xml.slice(0, idx) + fragment + xml.slice(idx)
  }
  return xml + fragment
}
