import { cleanInteractions, type PageInteractions } from '../design/motion'

// The Studio document — the design-system half of a DesignProject.
//
// WHY THIS IS A SIDE-TABLE AND NOT A NODE TREE
// Every renderer, hit-test and exporter in src/design (pdfOverlayExport,
// svgDesign, wordExport) iterates the FLAT per-page arrays of boxes, shapes
// and images, and the undo stack serialises exactly those three. Converting
// them into a tree would be a rewrite of all of it with no visible feature at
// the end. So hierarchy lives HERE, as records that reference leaves by id.
// Code that knows nothing about frames still draws a correct picture — it just
// draws it without layout. That property is what keeps every intermediate
// build shippable.
//
// Everything is additive and optional: a DesignProject with no studio data
// serialises as version 3 exactly as it always did (see overlayModel.ts).

/** Dot path into the token tree, e.g. 'color.brand.600'. */
export type TokenRef = string

/** What a page IS — an icon canvas and a phone screen need different chrome. */
export type PageKind =
  | { kind: 'free' }
  | { kind: 'icon'; grid: number; preset: string }
  | { kind: 'device'; device: string; w: number; h: number }

export type FrameDirection = 'row' | 'column'
export type FrameAlign = 'start' | 'center' | 'end' | 'stretch'
export type FrameJustify = 'start' | 'center' | 'end' | 'between' | 'around'
export type FrameSizing = 'fixed' | 'hug' | 'fill'

/** An auto-layout container. `children` are leaf ids from the flat arrays. */
export interface Frame {
  id: string
  /** pt from the page top-left — the same contract as every other object. */
  x: number
  y: number
  w: number
  h: number
  children: string[]
  layout?: {
    direction: FrameDirection
    gap: number
    padding: [number, number, number, number]
    align: FrameAlign
    justify: FrameJustify
    wrap: boolean
    /** RTL mirrors a row without touching any child's own direction. */
    dir: 'rtl' | 'ltr'
  }
  sizing?: { w: FrameSizing; h: FrameSizing }
  /** Set when this frame is an icon canvas; keyed into StudioDoc.icons. */
  iconOf?: string
}

/**
 * A plain group: objects that select and transform as one.
 *
 * NOT a Frame. A Frame lays its children OUT — it owns their positions and
 * rewrites them on every change. A group owns nothing: it only records that
 * these leaves belong together, so clicking one selects them all and the
 * existing multi-selection machinery moves, scales and rotates the lot.
 *
 * Same side-table doctrine as everything else here: `children` are ids from
 * the flat per-page arrays, so every renderer and exporter that knows nothing
 * about groups still draws exactly the right picture.
 */
export interface Group {
  id: string
  name: string
  /** leaf ids — shapes, images and text boxes alike */
  children: string[]
}

/** One design token. `$value`/`$type` follow the DTCG spelling deliberately so
 * export is a rename-free pass-through. */
export interface Token {
  $value: string | number
  $type: 'color' | 'dimension' | 'fontFamily' | 'fontWeight' | 'duration' | 'number' | 'shadow'
  $description?: string
}

/** Nested groups, DTCG-shaped: leaves are Tokens, branches are more groups. */
export interface TokenGroup {
  [key: string]: Token | TokenGroup
}

export interface TokenSet {
  /** The light theme, and the only required one. */
  base: TokenGroup
  /** Derived overrides; only the tokens that actually differ. */
  dark?: TokenGroup
  /** Tokens the user edited by hand and that a re-derive must not overwrite. */
  locked?: TokenRef[]
}

/** A reusable definition — a template, a captured component, or an icon. */
export interface ComponentDef {
  id: string
  name: string
  type: string
  /** The leaves this definition owns, serialised the same way a page is. */
  content: {
    boxes: unknown[]
    shapes: unknown[]
    images: unknown[]
    frames?: Frame[]
  }
  /** Named holes an instance may override, by leaf id. */
  slots?: Array<{ id: string; label: string; kind: 'text' | 'image' | 'color' }>
  source?: string
}

export interface ComponentInstance {
  id: string
  defId: string
  x: number
  y: number
  /** slot id -> replacement value. */
  overrides?: Record<string, string>
}

/** Icon-authoring metadata, keyed by the frame id holding the icon. */
export interface IconMeta {
  grid: number
  preset: string
  strokeWidth: number
  /** Sizes the preview strip and the validator check against. */
  targets: number[]
}

/** Where an imported component came from, so a stale import is explainable. */
export interface CaptureRecord {
  id: string
  url: string
  host: string
  capturedAt: string
  /** Everything we could not reproduce, in the user's words. Never silent. */
  degraded: string[]
}

export interface StudioDoc {
  schema: 'exelmj-studio/1'
  frames: Record<string, Frame[]>
  /** Plain groups per page. Absent in a document that never grouped anything. */
  groups: Record<string, Group[]>
  /**
   * What happens when someone touches a thing — per page.
   *
   * Same side-table doctrine as groups: interactions reference objects by id
   * and nothing moves into them, so every renderer and exporter that knows
   * nothing about motion still draws exactly the right picture.
   */
  interactions: PageInteractions
  instances: Record<string, ComponentInstance[]>
  pageKind: Record<string, PageKind>
  tokens: TokenSet
  components: ComponentDef[]
  icons: Record<string, IconMeta>
  captures: CaptureRecord[]
}

export function emptyStudioDoc(): StudioDoc {
  return {
    schema: 'exelmj-studio/1',
    frames: {},
    groups: {},
    interactions: {},
    instances: {},
    pageKind: {},
    tokens: { base: {} },
    components: [],
    icons: {},
    captures: []
  }
}

/** True when the doc carries nothing worth writing — the test that keeps a
 * document that never touched Studio serialising as plain v3. */
export function isEmptyStudioDoc(d: StudioDoc | undefined): boolean {
  if (!d) return true
  return (
    !Object.keys(d.frames).length &&
    !Object.keys(d.groups).length &&
    !Object.keys(d.interactions ?? {}).length &&
    !Object.keys(d.instances).length &&
    !Object.keys(d.pageKind).length &&
    !Object.keys(d.tokens.base).length &&
    !d.tokens.dark &&
    !d.components.length &&
    !Object.keys(d.icons).length &&
    !d.captures.length
  )
}

// ─── validation ──────────────────────────────────────────────────────────────
// A sidecar is user-editable and travels with the file. Same doctrine as
// shapes.ts and images.ts: never trust it, drop what does not parse rather
// than repairing it into something the user did not mean.

const num = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

const HEX = /^#[0-9a-fA-F]{6}$/

function cleanFrame(raw: unknown, i: number): Frame | null {
  if (!raw || typeof raw !== 'object') return null
  const f = raw as Record<string, unknown>
  const children = Array.isArray(f.children) ? f.children.filter((c) => typeof c === 'string') : []
  const w = num(f.w, 0)
  const h = num(f.h, 0)
  if (w <= 0 || h <= 0) return null
  const l = f.layout as Record<string, unknown> | undefined
  const pad = Array.isArray(l?.padding) && l.padding.length === 4
    ? (l.padding.map((p) => Math.max(0, num(p, 0))) as [number, number, number, number])
    : ([0, 0, 0, 0] as [number, number, number, number])
  const sz = f.sizing as Record<string, unknown> | undefined
  const sizing = (v: unknown): FrameSizing =>
    v === 'hug' || v === 'fill' ? v : 'fixed'
  return {
    id: str(f.id, `frame-${i + 1}`),
    x: num(f.x, 0),
    y: num(f.y, 0),
    w,
    h,
    children,
    ...(l
      ? {
          layout: {
            direction: l.direction === 'column' ? 'column' : 'row',
            gap: Math.max(0, num(l.gap, 0)),
            padding: pad,
            align: (['start', 'center', 'end', 'stretch'] as const).includes(l.align as FrameAlign)
              ? (l.align as FrameAlign)
              : 'start',
            justify: (['start', 'center', 'end', 'between', 'around'] as const).includes(
              l.justify as FrameJustify
            )
              ? (l.justify as FrameJustify)
              : 'start',
            wrap: !!l.wrap,
            dir: l.dir === 'ltr' ? 'ltr' : 'rtl'
          }
        }
      : {}),
    ...(sz ? { sizing: { w: sizing(sz.w), h: sizing(sz.h) } } : {}),
    ...(typeof f.iconOf === 'string' ? { iconOf: f.iconOf } : {})
  }
}

function cleanTokenGroup(raw: unknown, depth = 0): TokenGroup {
  if (!raw || typeof raw !== 'object' || depth > 6) return {}
  const out: TokenGroup = {}
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const t = v as Record<string, unknown>
    if ('$value' in t) {
      const type = t.$type
      const ok =
        type === 'color' ||
        type === 'dimension' ||
        type === 'fontFamily' ||
        type === 'fontWeight' ||
        type === 'duration' ||
        type === 'number' ||
        type === 'shadow'
      if (!ok) continue
      // a colour token that is not a hex could reach an SVG attribute
      if (type === 'color' && !HEX.test(String(t.$value))) continue
      const val = typeof t.$value === 'number' ? t.$value : String(t.$value)
      out[key] = {
        $value: val,
        $type: type,
        ...(typeof t.$description === 'string' ? { $description: t.$description } : {})
      }
    } else {
      const sub = cleanTokenGroup(v, depth + 1)
      if (Object.keys(sub).length) out[key] = sub
    }
  }
  return out
}

function cleanPageKind(raw: unknown): PageKind | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (p.kind === 'icon') return { kind: 'icon', grid: Math.max(1, num(p.grid, 24)), preset: str(p.preset, 'material') }
  if (p.kind === 'device') {
    const w = num(p.w, 0)
    const h = num(p.h, 0)
    if (w <= 0 || h <= 0) return null
    return { kind: 'device', device: str(p.device, 'custom'), w, h }
  }
  if (p.kind === 'free') return { kind: 'free' }
  return null
}

/** Parse a `studio` block out of a sidecar. Returns undefined when there is
 * nothing usable, so the caller keeps writing plain v3. */
export function cleanStudioDoc(raw: unknown): StudioDoc | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as Record<string, unknown>
  if (s.schema !== 'exelmj-studio/1') return undefined
  const doc = emptyStudioDoc()

  if (s.frames && typeof s.frames === 'object') {
    for (const [page, list] of Object.entries(s.frames as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const clean = list.map((f, i) => cleanFrame(f, i)).filter((f): f is Frame => !!f)
      if (clean.length) doc.frames[page] = clean
    }
  }
  doc.interactions = cleanInteractions(s.interactions)
  if (s.groups && typeof s.groups === 'object') {
    for (const [page, list] of Object.entries(s.groups as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const clean: Group[] = []
      for (const [i, raw2] of list.entries()) {
        if (!raw2 || typeof raw2 !== 'object') continue
        const g = raw2 as Record<string, unknown>
        const children = Array.isArray(g.children)
          ? g.children.filter((c): c is string => typeof c === 'string')
          : []
        // A group of one is not a group, and a group of none is a leak from a
        // deletion that did not tidy up after itself.
        if (children.length < 2) continue
        clean.push({ id: str(g.id, `group-${i + 1}`), name: str(g.name, ''), children })
      }
      if (clean.length) doc.groups[page] = clean
    }
  }
  if (s.instances && typeof s.instances === 'object') {
    for (const [page, list] of Object.entries(s.instances as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const clean: ComponentInstance[] = []
      for (const [i, raw2] of list.entries()) {
        if (!raw2 || typeof raw2 !== 'object') continue
        const inst = raw2 as Record<string, unknown>
        const defId = str(inst.defId)
        if (!defId) continue
        clean.push({
          id: str(inst.id, `inst-${i + 1}`),
          defId,
          x: num(inst.x, 0),
          y: num(inst.y, 0),
          ...(inst.overrides && typeof inst.overrides === 'object'
            ? {
                overrides: Object.fromEntries(
                  Object.entries(inst.overrides as Record<string, unknown>)
                    .filter(([, v]) => typeof v === 'string')
                    .map(([k, v]) => [k, String(v)])
                )
              }
            : {})
        })
      }
      if (clean.length) doc.instances[page] = clean
    }
  }
  if (s.pageKind && typeof s.pageKind === 'object') {
    for (const [page, v] of Object.entries(s.pageKind as Record<string, unknown>)) {
      const pk = cleanPageKind(v)
      if (pk) doc.pageKind[page] = pk
    }
  }
  if (s.tokens && typeof s.tokens === 'object') {
    const t = s.tokens as Record<string, unknown>
    doc.tokens.base = cleanTokenGroup(t.base)
    const dark = cleanTokenGroup(t.dark)
    if (Object.keys(dark).length) doc.tokens.dark = dark
    if (Array.isArray(t.locked)) {
      const locked = t.locked.filter((v) => typeof v === 'string') as string[]
      if (locked.length) doc.tokens.locked = locked
    }
  }
  if (Array.isArray(s.components)) {
    for (const [i, raw2] of s.components.entries()) {
      if (!raw2 || typeof raw2 !== 'object') continue
      const c = raw2 as Record<string, unknown>
      const content = c.content as Record<string, unknown> | undefined
      if (!content || typeof content !== 'object') continue
      doc.components.push({
        id: str(c.id, `def-${i + 1}`),
        name: str(c.name, `component ${i + 1}`),
        type: str(c.type, 'generic'),
        content: {
          boxes: Array.isArray(content.boxes) ? content.boxes : [],
          shapes: Array.isArray(content.shapes) ? content.shapes : [],
          images: Array.isArray(content.images) ? content.images : [],
          ...(Array.isArray(content.frames)
            ? {
                frames: content.frames
                  .map((f, j) => cleanFrame(f, j))
                  .filter((f): f is Frame => !!f)
              }
            : {})
        },
        ...(Array.isArray(c.slots)
          ? {
              slots: c.slots
                .filter((sl): sl is Record<string, unknown> => !!sl && typeof sl === 'object')
                .map((sl) => ({
                  id: str(sl.id),
                  label: str(sl.label),
                  kind:
                    sl.kind === 'image' || sl.kind === 'color'
                      ? (sl.kind as 'image' | 'color')
                      : ('text' as const)
                }))
                .filter((sl) => !!sl.id)
            }
          : {}),
        ...(typeof c.source === 'string' ? { source: c.source } : {})
      })
    }
  }
  if (s.icons && typeof s.icons === 'object') {
    for (const [frameId, v] of Object.entries(s.icons as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue
      const m = v as Record<string, unknown>
      doc.icons[frameId] = {
        grid: Math.max(1, num(m.grid, 24)),
        preset: str(m.preset, 'material'),
        strokeWidth: Math.max(0, num(m.strokeWidth, 2)),
        targets: Array.isArray(m.targets)
          ? m.targets.map((t) => Math.max(1, num(t, 24))).slice(0, 12)
          : [16, 24, 32, 48]
      }
    }
  }
  if (Array.isArray(s.captures)) {
    for (const [i, raw2] of s.captures.entries()) {
      if (!raw2 || typeof raw2 !== 'object') continue
      const c = raw2 as Record<string, unknown>
      doc.captures.push({
        id: str(c.id, `cap-${i + 1}`),
        url: str(c.url),
        host: str(c.host),
        capturedAt: str(c.capturedAt),
        degraded: Array.isArray(c.degraded) ? c.degraded.filter((d) => typeof d === 'string') : []
      })
    }
  }

  return isEmptyStudioDoc(doc) ? undefined : doc
}
