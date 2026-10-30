// The renderer half of the MCP surface: where a tool call meets the open
// document.
//
// Everything here is a pure function of a DocumentView, so the whole tool
// surface is testable in node without Electron, a window, or a running app.
// designApp supplies the view; this file never touches the DOM.

import { contrastRatio, fixContrast, readableOn, verdict } from './color/contrast'
import { darkFrom, scaleFrom } from './color/scale'
import { scaleToGroup, toCssVars, toDtcg } from './color/tokens'
import { buildManifest, toMarkdown, type HandoffInput } from './handoff'
import { bundleFiles } from './bundle'
import { defSize } from './template'
import { deviceById, PINNED } from './devices'
import type { TokenGroup } from './model'

/** What the renderer exposes to the tool layer. Deliberately small. */
export interface DocumentView {
  /** null when no design is open. */
  handoff(): HandoffInput | null
  /** Mutations report success so a tool can say what actually happened. */
  placeComponent(componentId: string, page: string, x: number, y: number): string | null
  /** Persist after a mutation. */
  markDirty(): void
  /**
   * The embedded browser, or null when the app cannot reach it (no preload
   * bridge — the dev preview in a plain tab). Async because every one of these
   * crosses to the main process.
   */
  browser?: {
    open(url: string): Promise<{ ok: boolean; reason?: string }>
    setDevice(
      device: string,
      opts: { rotate?: boolean; colorScheme?: 'light' | 'dark' }
    ): Promise<{ ok: boolean; reason?: string }>
    screenshot(selector?: string): Promise<{ ok: boolean; path?: string; reason?: string }>
    /** The most recent capture, or null when nothing has been picked. */
    lastCapture(): Record<string, unknown> | null
    importCapture(page: string, x: number, y: number): { ok: boolean; detail: string }
  } | null
}

export type ToolResult =
  | { ok: true; data: unknown; dropped?: string[] }
  | { ok: false; code: string; detail: string }

const ok = (data: unknown, dropped?: string[]): ToolResult =>
  dropped?.length ? { ok: true, data, dropped } : { ok: true, data }
const fail = (code: string, detail: string): ToolResult => ({ ok: false, code, detail })

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Run one tool.
 *
 * Every branch returns a VALUE. Nothing throws across this boundary: a thrown
 * error reaches the model as a transport failure it can only give up on, while
 * a returned failure carries a code and a sentence it can act on.
 */
export async function runStudioTool(
  view: DocumentView,
  name: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const doc = view.handoff()

  switch (name) {
    case 'studio_status': {
      return ok({
        running: true,
        hasDocument: !!doc,
        name: doc?.name ?? null,
        artboards: doc ? Object.keys(doc.pages).length : 0,
        components: doc?.studio.components.length ?? 0,
        devices: PINNED.map((d) => ({ id: d.id, label: d.label, w: d.w, h: d.h, dpr: d.dpr })),
        // Say what is NOT wired yet rather than letting the model discover it
        // by calling a tool that returns an empty answer.
        notes: doc
          ? []
          : ['No design is open. Open or create one in EXELMJ, then call this again.']
      })
    }

    case 'studio_describe_design': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const page = typeof args.page === 'string' ? args.page : null
      const scoped = page
        ? {
            ...doc,
            pages: doc.pages[page] ? { [page]: doc.pages[page] } : {},
            shapes: doc.shapes[page] ? { [page]: doc.shapes[page] } : {},
            images: doc.images[page] ? { [page]: doc.images[page] } : {}
          }
        : doc
      if (page && !Object.keys(scoped.pages).length && !Object.keys(scoped.shapes).length) {
        return fail('NOT_FOUND', `No artboard "${page}".`)
      }
      const md = toMarkdown(scoped)
      const budget = typeof args.budgetTokens === 'number' ? args.budgetTokens : undefined
      if (!budget || md.length <= budget * 4) return ok(md)
      const limit = Math.max(200, Math.floor(budget * 4))
      const cut = md.lastIndexOf('\n## ', limit)
      const at = cut > limit * 0.5 ? cut : limit
      return ok(md.slice(0, at), [
        `${md.length - at} characters after this point. Call again with a page filter for the rest.`
      ])
    }

    case 'studio_get_tokens': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const format = args.format === 'css' ? 'css' : 'dtcg'
      const empty = !Object.keys(doc.studio.tokens.base).length
      if (empty) {
        return fail(
          'NOT_FOUND',
          'This design has no tokens yet. Use studio_make_scale to create one from a brand colour.'
        )
      }
      return ok(format === 'css' ? toCssVars(doc.studio.tokens) : toDtcg(doc.studio.tokens))
    }

    case 'studio_list_components': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const kind = typeof args.kind === 'string' ? args.kind : null
      const query = typeof args.query === 'string' ? args.query.toLowerCase() : null
      const list = doc.studio.components
        .filter((c) => (!kind || c.type === kind) && (!query || c.name.toLowerCase().includes(query)))
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          size: defSize(c),
          slots: c.slots?.length ?? 0,
          source: c.source ?? null
        }))
      return ok({ components: list, total: doc.studio.components.length })
    }

    case 'studio_get_component': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const id = String(args.id ?? '')
      const c = doc.studio.components.find((x) => x.id === id)
      if (!c) return fail('NOT_FOUND', `No component "${id}".`)
      return ok({
        ...c,
        size: defSize(c),
        units: 'pt',
        note: 'Coordinates are points from the component top-left. Multiply by 1.3333 for CSS pixels.'
      })
    }

    case 'studio_place_component': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const componentId = String(args.componentId ?? '')
      const page = String(args.page ?? '')
      const x = Number(args.x)
      const y = Number(args.y)
      if (!componentId || !page) return fail('BAD_INPUT', 'componentId and page are required.')
      if (!Number.isFinite(x) || !Number.isFinite(y)) return fail('BAD_INPUT', 'x and y must be numbers.')
      if (!doc.studio.components.some((c) => c.id === componentId)) {
        return fail('NOT_FOUND', `No component "${componentId}".`)
      }
      const instanceId = view.placeComponent(componentId, page, x, y)
      if (!instanceId) return fail('INTERNAL', 'The component could not be placed.')
      view.markDirty()
      return ok({ instanceId, page, x, y })
    }

    case 'studio_make_scale': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const seed = String(args.seed ?? '')
      if (!HEX.test(seed)) return fail('BAD_INPUT', 'seed must be a hex colour like #185abd.')
      const scale = scaleFrom(seed)
      if (!scale) return fail('BAD_INPUT', `Could not read "${seed}" as a colour.`)
      const group = typeof args.name === 'string' && args.name ? args.name : 'brand'
      const color = (doc.studio.tokens.base.color as TokenGroup | undefined) ?? {}
      color[group] = scaleToGroup(scale, group)
      doc.studio.tokens.base.color = color
      if (args.dark === true) {
        const dark = darkFrom(scale)
        doc.studio.tokens.dark = {
          ...(doc.studio.tokens.dark ?? {}),
          color: { ...((doc.studio.tokens.dark?.color as TokenGroup) ?? {}), [group]: scaleToGroup(dark) }
        }
      }
      view.markDirty()
      return ok({
        group,
        scale,
        ...(args.dark === true ? { dark: darkFrom(scale) } : {}),
        note: 'Every step is equally light across hues, so swapping a hue cannot change a contrast verdict.'
      })
    }

    case 'studio_check_contrast': {
      const fg = String(args.foreground ?? '')
      const bg = String(args.background ?? '')
      if (!HEX.test(fg) || !HEX.test(bg)) {
        return fail('BAD_INPUT', 'foreground and background must be hex colours like #185abd.')
      }
      const ratio = contrastRatio(fg, bg)
      if (ratio === null) return fail('BAD_INPUT', 'Could not read those colours.')
      const v = verdict(ratio)
      const target = typeof args.target === 'number' ? args.target : 4.5
      const suggestion = v === 'Fail' || ratio < target ? fixContrast(fg, bg, target) : null
      return ok({
        ratio: Math.round(ratio * 100) / 100,
        verdict: v,
        standard: 'WCAG 2.x',
        passesBody: ratio >= 4.5,
        passesLargeText: ratio >= 3,
        ...(suggestion ? { suggested: suggestion, suggestedFor: target } : {}),
        ...(suggestion === null && ratio < target
          ? { note: `No colour of that hue reaches ${target}:1 on this background.` }
          : {}),
        readableForeground: readableOn(bg)
      })
    }

    case 'studio_export_bundle': {
      if (!doc) return fail('NO_DOCUMENT', 'No design is open in EXELMJ.')
      const outDir = String(args.outDir ?? '')
      if (!outDir) return fail('BAD_INPUT', 'outDir is required.')
      // Returning the CONTENT rather than writing it: the renderer has no
      // filesystem, and giving it one for this would be a second path to disk
      // alongside main's. The caller (main) writes what it is handed.
      const files = bundleFiles(doc)
      return ok({
        outDir,
        files: files.map((f) => ({
          path: f.path,
          bytes: f.bytes ? Array.from(f.bytes) : undefined,
          text: f.text
        })),
        note: 'Read README.md first — it declares the units and the text direction.'
      })
    }

    case 'browser_open': {
      const b = view.browser
      if (!b) return fail('UNSUPPORTED', 'The embedded browser is not available in this window.')
      const url = String(args.url ?? '')
      if (!url) return fail('BAD_INPUT', 'url is required.')
      const res = await b.open(url)
      return res.ok
        ? ok({ url, note: 'Call browser_set_device next — a fresh page starts with no emulation.' })
        : fail('BLOCKED', res.reason ?? 'That address could not be opened.')
    }

    case 'browser_set_device': {
      const b = view.browser
      if (!b) return fail('UNSUPPORTED', 'The embedded browser is not available in this window.')
      const id = String(args.device ?? '')
      const known = deviceById(id)
      if (!known && !/^\d+\s*[x*]\s*\d+$/i.test(id)) {
        return fail(
          'NOT_FOUND',
          `Unknown device "${id}". Try desktop, tablet, mobile, a catalogue id, or a size like 390x844.`
        )
      }
      const res = await b.setDevice(id, {
        rotate: args.rotate === true,
        colorScheme: args.colorScheme === 'dark' ? 'dark' : 'light'
      })
      if (!res.ok) return fail('INTERNAL', res.reason ?? 'The device could not be applied.')
      const d = known ?? deviceById('desktop')!
      return ok({
        device: id,
        ...(known ? { w: d.w, h: d.h, dpr: d.dpr, touch: d.touch, mobile: d.mobile } : {}),
        note: 'The page now reports this viewport, pixel ratio, touch support and user agent — not just a narrower window.'
      })
    }

    case 'browser_screenshot': {
      const b = view.browser
      if (!b) return fail('UNSUPPORTED', 'The embedded browser is not available in this window.')
      const res = await b.screenshot(typeof args.selector === 'string' ? args.selector : undefined)
      return res.ok
        ? ok({ path: res.path, note: 'A file path, not bytes — read it from disk.' })
        : fail('INTERNAL', res.reason ?? 'Nothing to capture.')
    }

    case 'picker_pick': {
      const b = view.browser
      if (!b) return fail('UNSUPPORTED', 'The embedded browser is not available in this window.')
      const last = b.lastCapture()
      if (!last) {
        // The pick is a USER gesture by design — see guestPreload.ts for why
        // this tool cannot arm-and-click on the model's behalf.
        return fail(
          'NOT_FOUND',
          'Nothing has been picked yet. Press "Pick element" in the browser panel and click an element, then call this again.'
        )
      }
      return ok(last)
    }

    case 'picker_import': {
      const b = view.browser
      if (!b) return fail('UNSUPPORTED', 'The embedded browser is not available in this window.')
      const page = String(args.page ?? '')
      if (!page) return fail('BAD_INPUT', 'page is required.')
      const x = Number.isFinite(Number(args.x)) ? Number(args.x) : 0
      const y = Number.isFinite(Number(args.y)) ? Number(args.y) : 0
      const res = b.importCapture(page, x, y)
      if (!res.ok) return fail('NOT_FOUND', res.detail)
      view.markDirty()
      return ok({ page, x, y, detail: res.detail })
    }

    default:
      return fail('NOT_FOUND', `Unknown tool: ${name}`)
  }
}

/** The manifest a bundle writer would emit, exposed for tests and for the UI. */
export function manifestFor(doc: HandoffInput, files: string[]): ReturnType<typeof buildManifest> {
  return buildManifest(doc, files)
}
