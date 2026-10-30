// The ZIP handoff bundle.
//
// One emitter, two audiences, kept in SEPARATE directories:
//   - everything at the top level is for the consuming agent, and is enough on
//     its own to rebuild the design without EXELMJ;
//   - source/ is our own reload path, and the agent is told to ignore it.
// Mixing them is how a bundle ends up with two descriptions of the same thing
// that can disagree.
//
// Determinism matters more than it looks: an export that differs byte-for-byte
// every time makes "what changed since last week" unanswerable. Entries are
// sorted, timestamps are fixed, and nothing reads the clock — the generation
// time is passed IN.

import JSZip from 'jszip'
import { documentPages, toStandaloneHtml } from './htmlExport'
import { motionStylesheet } from './motionCss'
import { serializeProject } from '../design/overlayModel'
import { toCssVars, toDtcg } from './color/tokens'
import { BUNDLE_FILES, buildManifest, toMarkdown, type HandoffInput } from './handoff'

/** Fixed mtime for every entry: 1980-01-01, the ZIP epoch. Using the real time
 * would make two exports of an unchanged design differ in every byte. */
const FIXED_DATE = new Date(Date.UTC(1980, 0, 1, 0, 0, 0))

export interface BundleFile {
  path: string
  /** text is written as UTF-8; bytes are written verbatim */
  text?: string
  bytes?: Uint8Array
}

/**
 * Everything the bundle contains, as a flat list.
 *
 * Exposed separately from the ZIP so the same content can be written to a
 * FOLDER instead — which is what an agent asking for `outDir` actually wants,
 * since it can then read the files without unzipping.
 */
export function bundleFiles(input: HandoffInput): BundleFile[] {
  const files: BundleFile[] = []

  files.push({ path: BUNDLE_FILES.spec, text: toMarkdown(input) })

  const hasTokens = Object.keys(input.studio.tokens.base).length > 0
  if (hasTokens) {
    files.push({ path: BUNDLE_FILES.tokensJson, text: toDtcg(input.studio.tokens) })
    files.push({ path: BUNDLE_FILES.tokensCss, text: toCssVars(input.studio.tokens) })
  }

  // Images travel as their own files rather than as base64 inside the spec:
  // a data URL is unreadable to a human reviewing the bundle and triples the
  // size of the document an agent has to read.
  for (const [page, list] of Object.entries(input.images)) {
    for (const img of list) {
      const bytes = dataUrlToBytes(img.src)
      if (!bytes) continue
      const ext = img.src.startsWith('data:image/png') ? 'png' : 'jpg'
      files.push({ path: `${BUNDLE_FILES.assets}${page}-${img.id}.${ext}`, bytes })
    }
  }

  // Vector artwork as real SVG, so the agent can use it directly.
  //
  // The file is added only when the SVG actually CONTAINS a path. Counting the
  // path shapes first would list an asset whose every path was then rejected
  // by the safety guard — an empty file that the manifest promises has content
  // is exactly the silent lie this format is designed against.
  for (const [page, list] of Object.entries(input.shapes)) {
    const svg = shapesToSvg(list)
    if (!svg.includes('<path')) continue
    files.push({ path: `${BUNDLE_FILES.assets}${page}-vectors.svg`, text: svg })
  }

  // ── the design as a page that RUNS ──────────────────────────────────────
  //
  // Everything above describes the design. This is the design: HTML for the
  // objects, CSS for how they look, and — when the document records any — a
  // second sheet for how they move. It opens from a double-click with nothing
  // installed, which is what the whole plain-CSS approach was for.
  const uiPages = documentPages(
    input.name,
    input.pages,
    input.shapes,
    input.images,
    input.studio,
    (page) => input.pageSize?.[page] ?? { widthPt: 595.28, heightPt: 841.89 },
    input.dir ?? 'rtl',
    input.lang ?? 'ar'
  )
  const firstPage = Object.keys(uiPages)[0]
  if (firstPage) {
    // Stagger needs to know which ids a group holds, and a draw motion needs
    // its target's strokes stamped with pathLength="1" — both flow through
    // here because only the bundle holds the document AND the compiler output.
    const groupMembers = Object.fromEntries(
      (input.studio.groups?.[firstPage] ?? []).map((g) => [g.id, g.children])
    )
    const motion = motionStylesheet(input.studio.interactions?.[firstPage] ?? [], { groupMembers })
    for (const id of motion.drawTargets) {
      const kids = groupMembers[id] ?? [id]
      for (const kid of kids) {
        motion.markup[kid] = { ...(motion.markup[kid] ?? {}), pathLength: true }
      }
    }
    // The toggle markup the CSS leans on has to reach the HTML, or the rules
    // would select a checkbox that does not exist.
    const html = toStandaloneHtml(
      uiPages[firstPage],
      motion.css,
      motion.js ? '<script src="motion.js" defer></script>' : '',
      motion.markup
    )
    files.push({ path: BUNDLE_FILES.uiHtml, text: html })
    if (motion.css) files.push({ path: BUNDLE_FILES.uiMotionCss, text: motion.css })
    if (motion.js) files.push({ path: BUNDLE_FILES.uiMotionJs, text: motion.js })
  }

  // Our own reload path, quarantined so nothing confuses it for the spec.
  files.push({
    path: BUNDLE_FILES.source,
    text: serializeProject(input.name, input.pages, input.shapes, input.images, input.studio)
  })

  const manifest = buildManifest(
    input,
    files.map((f) => f.path)
  )
  files.push({ path: BUNDLE_FILES.manifest, text: `${JSON.stringify(manifest, null, 2)}\n` })

  // Sorted so two exports diff cleanly and the archive order is stable.
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

/** The bundle as a ZIP. Uses the jszip already in the project — adding another
 * archiver for this would be a dependency for zero capability. */
export async function toZip(input: HandoffInput): Promise<Uint8Array> {
  const zip = new JSZip()
  for (const f of bundleFiles(input)) {
    const content = f.bytes ?? new TextEncoder().encode(f.text ?? '')
    zip.file(f.path, content, { date: FIXED_DATE, binary: true })
  }
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    // A fixed comment and no platform bits keeps the header stable across
    // machines, which is the other half of a reproducible archive.
    platform: 'UNIX'
  })
}

/** Decode a data URL to bytes. Returns null for anything that is not one. */
export function dataUrlToBytes(src: string): Uint8Array | null {
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(src)
  if (!m) return null
  try {
    const bin = atob(m[2])
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

const SAFE_D = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]+$/
const HEX = /^#[0-9a-fA-F]{6}$/

/** Path shapes as one SVG, in the page's own pt coordinates. */
function shapesToSvg(shapes: Array<{ kind: string; d?: string; x: number; y: number; fill: string; stroke: string; strokeWidth: number }>): string {
  let maxX = 0
  let maxY = 0
  const body: string[] = []
  for (const s of shapes) {
    if (s.kind !== 'path' || !s.d || !SAFE_D.test(s.d)) continue
    const fill = HEX.test(s.fill) ? s.fill : 'none'
    const stroke = HEX.test(s.stroke) ? s.stroke : 'none'
    body.push(
      `  <g transform="translate(${round(s.x)} ${round(s.y)})"><path d="${s.d}" fill="${fill}" stroke="${stroke}"${
        stroke !== 'none' ? ` stroke-width="${s.strokeWidth}"` : ''
      }/></g>`
    )
    maxX = Math.max(maxX, s.x + 1000)
    maxY = Math.max(maxY, s.y + 1000)
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${round(maxX)} ${round(maxY)}">`,
    ...body,
    '</svg>',
    ''
  ].join('\n')
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
