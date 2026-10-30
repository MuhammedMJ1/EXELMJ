// Templates and component instances.
//
// A TEMPLATE is one self-contained JSON file, `*.exelmj-tpl.json`, holding one
// ComponentDef with its content inline. No database, no index to rebuild, no
// server: a template can be emailed, dropped in a folder, and used. That is
// the excalidraw-libraries model, and it is proven at scale precisely because
// it refuses to be clever.
//
// An INSTANCE is a reference plus overrides. Editing the definition updates
// every instance; overriding a slot changes only that one. "Detach" expands an
// instance into ordinary objects and severs the link — the escape hatch that
// keeps the abstraction from ever being a trap.
//
// Pure: no DOM, no filesystem. Unit-tested in node.

import { cleanShape, type Shape } from '../design/shapes'
import { cleanImage, type PlacedImage } from '../design/images'
import type { ComponentDef, ComponentInstance, Frame, StudioDoc } from './model'

export const TEMPLATE_EXT = '.exelmj-tpl.json'

/** What a template file contains. Deliberately a thin envelope: the payload is
 * the ComponentDef the app already understands. */
export interface TemplateFile {
  format: 'exelmj-template/1'
  /** app version that wrote it, for a future migration to key off */
  writer: string
  def: ComponentDef
}

export interface Selection {
  boxes: Array<Record<string, unknown>>
  shapes: Shape[]
  images: PlacedImage[]
  frames?: Frame[]
}

/**
 * Turn a canvas selection into a definition.
 *
 * The geometry is REBASED so the selection's own top-left becomes (0,0). A
 * template that remembered where it happened to be drawn would place itself
 * back there on every use, which is the single most annoying possible
 * behaviour for a reusable asset.
 */
export function defFromSelection(
  id: string,
  name: string,
  type: string,
  sel: Selection
): ComponentDef {
  const origin = selectionOrigin(sel)
  const dx = -origin.x
  const dy = -origin.y
  return {
    id,
    name,
    type,
    content: {
      boxes: sel.boxes.map((b) => ({ ...b, x: num(b.x) + dx, y: num(b.y) + dy })),
      shapes: sel.shapes.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })),
      images: sel.images.map((i) => ({ ...i, x: i.x + dx, y: i.y + dy })),
      ...(sel.frames?.length
        ? { frames: sel.frames.map((f) => ({ ...f, x: f.x + dx, y: f.y + dy })) }
        : {})
    }
  }
}

/** Top-left of everything in the selection, in pt. */
export function selectionOrigin(sel: Selection): { x: number; y: number } {
  let x = Infinity
  let y = Infinity
  for (const b of sel.boxes) {
    x = Math.min(x, num(b.x))
    y = Math.min(y, num(b.y))
  }
  for (const s of sel.shapes) {
    x = Math.min(x, Math.min(s.x, s.x + s.w))
    y = Math.min(y, Math.min(s.y, s.y + s.h))
  }
  for (const i of sel.images) {
    x = Math.min(x, i.x)
    y = Math.min(y, i.y)
  }
  for (const f of sel.frames ?? []) {
    x = Math.min(x, f.x)
    y = Math.min(y, f.y)
  }
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 }
}

/** Size of a definition's content, for placing and for the library thumbnail. */
export function defSize(def: ComponentDef): { w: number; h: number } {
  let w = 0
  let h = 0
  for (const b of def.content.boxes as Array<Record<string, unknown>>) {
    w = Math.max(w, num(b.x) + num(b.width))
    h = Math.max(h, num(b.y) + num(b.sizePt) * 1.3)
  }
  for (const s of def.content.shapes as Shape[]) {
    w = Math.max(w, Math.max(s.x, s.x + s.w))
    h = Math.max(h, Math.max(s.y, s.y + s.h))
  }
  for (const i of def.content.images as PlacedImage[]) {
    w = Math.max(w, i.x + i.w)
    h = Math.max(h, i.y + i.h)
  }
  for (const f of def.content.frames ?? []) {
    w = Math.max(w, f.x + f.w)
    h = Math.max(h, f.y + f.h)
  }
  return { w, h }
}

export interface Expanded {
  boxes: Array<Record<string, unknown>>
  shapes: Shape[]
  images: PlacedImage[]
  frames: Frame[]
}

/**
 * Expand an instance into concrete objects at its position.
 *
 * Every id is namespaced with the instance id, so placing the same definition
 * twice cannot produce two objects claiming the same id — which would make the
 * layers panel, the selection and the undo stack all disagree about which one
 * the user meant.
 */
export function expandInstance(inst: ComponentInstance, def: ComponentDef): Expanded {
  const ns = (id: unknown): string => `${inst.id}:${String(id ?? '')}`
  const ov = inst.overrides ?? {}
  return {
    boxes: (def.content.boxes as Array<Record<string, unknown>>).map((b) => {
      const id = String(b.id ?? '')
      const out: Record<string, unknown> = { ...b, id: ns(id), x: num(b.x) + inst.x, y: num(b.y) + inst.y }
      // A text slot overrides the TEXT and nothing else — an override that
      // could change position or size would let one instance silently diverge
      // from the definition's layout.
      if (ov[id] !== undefined) out.text = ov[id]
      return out
    }),
    shapes: (def.content.shapes as Shape[]).map((s) => {
      const out: Shape = { ...s, id: ns(s.id), x: s.x + inst.x, y: s.y + inst.y }
      const o = ov[s.id]
      if (o && /^#[0-9a-fA-F]{6}$/.test(o)) {
        if (out.fill) out.fill = o
        else out.stroke = o
      }
      return out
    }),
    images: (def.content.images as PlacedImage[]).map((i) => {
      const out: PlacedImage = { ...i, id: ns(i.id), x: i.x + inst.x, y: i.y + inst.y }
      const o = ov[i.id]
      if (o && o.startsWith('data:image/')) out.src = o
      return out
    }),
    frames: (def.content.frames ?? []).map((f) => ({
      ...f,
      id: ns(f.id),
      x: f.x + inst.x,
      y: f.y + inst.y,
      children: f.children.map((c) => ns(c))
    }))
  }
}

/**
 * Expand every instance on a page.
 *
 * A definition that is missing is SKIPPED rather than substituted: a silent
 * placeholder would look like a design decision, and the user would not know
 * a template had gone missing until it shipped.
 */
export function expandPage(doc: StudioDoc, page: string): Expanded & { missing: string[] } {
  const out: Expanded & { missing: string[] } = {
    boxes: [],
    shapes: [],
    images: [],
    frames: [],
    missing: []
  }
  const defs = new Map(doc.components.map((d) => [d.id, d]))
  for (const inst of doc.instances[page] ?? []) {
    const def = defs.get(inst.defId)
    if (!def) {
      out.missing.push(inst.defId)
      continue
    }
    const e = expandInstance(inst, def)
    out.boxes.push(...e.boxes)
    out.shapes.push(...e.shapes)
    out.images.push(...e.images)
    out.frames.push(...e.frames)
  }
  return out
}

/**
 * Would placing `defId` inside itself create a cycle?
 *
 * Templates can contain instances of other templates, so this must be checked
 * before the definition is saved — a cycle turns expansion into an infinite
 * loop that hangs the renderer with no error to read.
 */
export function wouldCycle(doc: StudioDoc, hostId: string, insertedId: string): boolean {
  if (hostId === insertedId) return true
  const defs = new Map(doc.components.map((d) => [d.id, d]))
  const seen = new Set<string>()
  const visit = (id: string): boolean => {
    if (id === hostId) return true
    if (seen.has(id)) return false
    seen.add(id)
    const def = defs.get(id)
    if (!def) return false
    // A nested instance is recorded on the definition's own frames list today;
    // when nesting grows richer this is the one place to extend.
    for (const f of def.content.frames ?? []) {
      for (const child of f.children) if (visit(child)) return true
    }
    return false
  }
  return visit(insertedId)
}

// ─── the file format ─────────────────────────────────────────────────────────

export function serializeTemplate(def: ComponentDef, writer: string): string {
  const file: TemplateFile = { format: 'exelmj-template/1', writer, def }
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * Read a template file.
 *
 * A template arrives from outside the app — emailed, downloaded, copied off a
 * colleague's machine — so it is validated with the SAME cleaners the sidecar
 * uses. Returns null rather than a partly-trusted object.
 */
export function parseTemplate(json: string): ComponentDef | null {
  try {
    const raw = JSON.parse(json) as Record<string, unknown>
    if (raw.format !== 'exelmj-template/1') return null
    const d = raw.def as Record<string, unknown> | undefined
    if (!d || typeof d !== 'object') return null
    const content = d.content as Record<string, unknown> | undefined
    if (!content || typeof content !== 'object') return null
    const shapes = Array.isArray(content.shapes)
      ? content.shapes.map((s, i) => cleanShape(s, i)).filter((s): s is Shape => !!s)
      : []
    const images = Array.isArray(content.images)
      ? content.images.map((im, i) => cleanImage(im, i)).filter((im): im is PlacedImage => !!im)
      : []
    const boxes = Array.isArray(content.boxes)
      ? content.boxes.filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
      : []
    if (!shapes.length && !images.length && !boxes.length) return null
    return {
      id: String(d.id ?? 'tpl'),
      name: String(d.name ?? 'template'),
      type: String(d.type ?? 'generic'),
      content: { boxes, shapes, images },
      ...(Array.isArray(d.slots)
        ? {
            slots: d.slots
              .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
              .map((s) => ({
                id: String(s.id ?? ''),
                label: String(s.label ?? ''),
                kind:
                  s.kind === 'image' || s.kind === 'color' ? (s.kind as 'image' | 'color') : ('text' as const)
              }))
              .filter((s) => !!s.id)
          }
        : {}),
      ...(typeof d.source === 'string' ? { source: d.source } : {})
    }
  } catch {
    return null
  }
}

/** A filename that is safe on Windows, from a user-typed template name. */
export function templateFileName(name: string): string {
  const safe = name
    .trim()
    .replace(/[<>:"/\\|?* -]/g, '-')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 60)
  // CON, PRN, AUX, NUL, COM1..9, LPT1..9 are reserved DEVICE names on Windows
  // and cannot be filenames even with an extension.
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
  const base = !safe || reserved.test(safe) ? 'template' : safe
  return `${base}${TEMPLATE_EXT}`
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
