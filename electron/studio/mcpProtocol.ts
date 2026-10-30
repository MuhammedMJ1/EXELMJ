// The MCP surface for EXELMJ Studio, as pure data + pure handlers.
//
// SHAPE OF THE DECISION
// The server runs INSIDE the Electron main process, over Streamable HTTP bound
// to 127.0.0.1, with a per-launch bearer token. Two facts force this and both
// are worth recording so it is not re-litigated:
//   1. Every tool needs a live `webContents`, an attached CDP session, and the
//      project on disk — all of which live in main. Out-of-process would add an
//      IPC hop to every call and orphan in-flight calls on quit.
//   2. Electron's `utilityProcess` CANNOT use stdio: its docs state that
//      configuring `stdin` to anything but `ignore` is unsupported and errors.
//      So a stdio MCP server cannot live in a utility process at all.
// Claude Code speaks stdio, so a ~40-line shim bridges stdio to the local HTTP
// endpoint and reports a clean "EXELMJ is not running" instead of hanging.
//
// LOOPBACK IS NOT AN AUTHORIZATION BOUNDARY. Any local process can reach
// 127.0.0.1, so the token is not optional.
//
// This file is deliberately free of Electron imports so the tool schemas and
// the dispatch logic can be unit-tested in node.

export const PROTOCOL_VERSION = '2025-06-18'
export const SERVER_NAME = 'exelmj-studio'

export interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

/**
 * The tool surface.
 *
 * Two deliberate absences, both security decisions rather than omissions:
 *  - There is NO `picker.click` and no `picker.type`. A tool that lets a model
 *    click arbitrary things on the user's logged-in pages is the worst version
 *    of the automation problem. If input driving is ever added it will be
 *    scoped to `studio://` origins and named so.
 *  - No tool returns raw image BYTES. Screenshots return a PATH; a base64 PNG
 *    of a 1440x900 page is megabytes of context for something the client can
 *    read from disk.
 */
export const TOOLS: ToolDef[] = [
  {
    name: 'studio_status',
    description:
      'Whether EXELMJ is running, which document is open, and what the Studio can currently do. Call this first.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'studio_describe_design',
    description:
      'The open design as structured Markdown: artboards, colour tokens, typography, components and icons. This is the design handoff — read it before generating any UI code.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: 'Artboard id; omitted means every artboard.' },
        budgetTokens: {
          type: 'number',
          description: 'Approximate cap on the returned text. Anything dropped is listed explicitly.'
        }
      }
    }
  },
  {
    name: 'studio_get_tokens',
    description:
      'The design system as W3C DTCG tokens, or as CSS custom properties. Use this rather than reading hex codes out of the description.',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['dtcg', 'css'], description: 'Defaults to dtcg.' }
      }
    }
  },
  {
    name: 'studio_export_bundle',
    description:
      'Write the whole design to a folder as a self-describing bundle (manifest, tokens, assets, previews, spec) and return the paths.',
    inputSchema: {
      type: 'object',
      properties: {
        outDir: { type: 'string', description: 'Destination folder. Created if missing.' },
        includePreviews: { type: 'boolean', description: 'Render PNG previews. Defaults to true.' }
      },
      required: ['outDir']
    }
  },
  {
    name: 'studio_list_components',
    description: 'Every reusable component, template and captured web component in the open document.',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', description: 'Filter by component type.' },
        query: { type: 'string', description: 'Substring match on the name.' }
      }
    }
  },
  {
    name: 'studio_get_component',
    description: 'One component in full: geometry, colours, text, states and where it came from.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        budgetTokens: { type: 'number' }
      },
      required: ['id']
    }
  },
  {
    name: 'studio_place_component',
    description: 'Place a component onto an artboard at a position, and return the new instance id.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string' },
        page: { type: 'string' },
        x: { type: 'number', description: 'pt from the artboard left edge' },
        y: { type: 'number', description: 'pt from the artboard top edge' }
      },
      required: ['componentId', 'page', 'x', 'y']
    }
  },
  {
    name: 'studio_make_scale',
    description:
      'Generate an 11-step colour scale from one seed colour and store it as tokens. Every step is equally light across hues, so contrast stays consistent when a hue is swapped.',
    inputSchema: {
      type: 'object',
      properties: {
        seed: { type: 'string', description: 'Hex, e.g. #185abd' },
        name: { type: 'string', description: 'Token group name. Defaults to "brand".' },
        dark: { type: 'boolean', description: 'Also derive the dark theme.' }
      },
      required: ['seed']
    }
  },
  {
    name: 'studio_check_contrast',
    description:
      'WCAG 2.x contrast for a foreground/background pair, as a verdict (AAA / AA / AA Large / Fail), and a corrected colour when it fails.',
    inputSchema: {
      type: 'object',
      properties: {
        foreground: { type: 'string' },
        background: { type: 'string' },
        target: { type: 'number', description: 'Ratio to solve for when it fails. Defaults to 4.5.' }
      },
      required: ['foreground', 'background']
    }
  },
  {
    name: 'browser_open',
    description:
      'Open a page in the embedded browser. Only studio:// project URLs and http://localhost are allowed without explicit user confirmation.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' } },
      required: ['url']
    }
  },
  {
    name: 'browser_set_device',
    description:
      'Switch the embedded browser between desktop, tablet and mobile. This sets the real viewport, device pixel ratio, touch support and user agent — not just the width.',
    inputSchema: {
      type: 'object',
      properties: {
        device: { type: 'string', description: 'desktop | tablet | mobile | a catalogue id' },
        rotate: { type: 'boolean' },
        colorScheme: { type: 'string', enum: ['light', 'dark'] },
        dir: { type: 'string', enum: ['rtl', 'ltr'] }
      },
      required: ['device']
    }
  },
  {
    name: 'browser_screenshot',
    description:
      'Screenshot the embedded browser and return the FILE PATH of the PNG. Bytes are never returned inline.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'Crop to one element.' },
        fullPage: { type: 'boolean' }
      }
    }
  },
  {
    name: 'picker_pick',
    description:
      'Capture the element the user picked (or one named by selector) from the embedded browser: markup, resolved styles, fonts, and a stable selector. Read-only — this never clicks or types.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string' },
        budgetTokens: { type: 'number' }
      }
    }
  },
  {
    name: 'picker_import',
    description: 'Turn a captured element into editable objects on the canvas and return what could not be reproduced.',
    inputSchema: {
      type: 'object',
      properties: {
        captureId: { type: 'string' },
        page: { type: 'string' },
        x: { type: 'number' },
        y: { type: 'number' }
      },
      required: ['captureId', 'page']
    }
  }
]

/** Every tool result is a VALUE, never a thrown error across the boundary. */
export type ToolResult =
  | { ok: true; data: unknown; dropped?: string[] }
  | { ok: false; code: ErrorCode; detail: string }

export type ErrorCode =
  | 'NOT_RUNNING'
  | 'NO_DOCUMENT'
  | 'NOT_FOUND'
  | 'BAD_INPUT'
  | 'BLOCKED'
  | 'UNSUPPORTED'
  | 'INTERNAL'

export function ok(data: unknown, dropped?: string[]): ToolResult {
  return dropped?.length ? { ok: true, data, dropped } : { ok: true, data }
}

export function err(code: ErrorCode, detail: string): ToolResult {
  return { ok: false, code, detail }
}

/**
 * MCP wants tool output as content blocks. Structured data goes back as
 * pretty-printed JSON in a text block: every current client renders it, and it
 * survives a client that does not understand a richer type.
 */
export function toContent(result: ToolResult): {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
} {
  if (!result.ok) {
    return {
      content: [{ type: 'text', text: `${result.code}: ${result.detail}` }],
      isError: true
    }
  }
  const text =
    typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)
  const note = result.dropped?.length
    ? `\n\n---\nOmitted (say so rather than guess): ${result.dropped.join(', ')}`
    : ''
  return { content: [{ type: 'text', text: text + note }] }
}

/**
 * Which URLs the embedded browser may load without asking.
 *
 * An ALLOWLIST, not a blocklist. The extension this was modelled on used a
 * blocklist because it had to work on the whole web; we only ever need our own
 * output and the user's own dev server, and everything else should require an
 * explicit yes.
 */
export function isAllowedUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'studio:') return true
  if ((u.protocol === 'http:' || u.protocol === 'https:') && isLocalHost(u.hostname)) return true
  return false
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1'
}

/** Schemes that must never be loaded, even with a user's yes. */
export function isForbiddenUrl(url: string): boolean {
  const lower = url.trim().toLowerCase()
  return (
    lower.startsWith('devtools:') ||
    lower.startsWith('chrome:') ||
    lower.startsWith('file:') ||
    lower.startsWith('javascript:') ||
    lower.startsWith('data:text/html')
  )
}

/**
 * Trim text to an approximate token budget.
 *
 * ~4 characters per token is the usual English rule of thumb and roughly holds
 * for Arabic in UTF-8. The point is not precision: it is that a document too
 * big for the caller's context comes back TRUNCATED AND SAID SO, rather than
 * arriving whole and blowing the window, or arriving silently cut mid-table.
 */
export function fitToBudget(text: string, budgetTokens?: number): { text: string; dropped?: string } {
  if (!budgetTokens || budgetTokens <= 0) return { text }
  const limit = Math.max(200, Math.floor(budgetTokens * 4))
  if (text.length <= limit) return { text }
  // cut at a section boundary so the result is never a half-written table
  const cut = text.lastIndexOf('\n## ', limit)
  const at = cut > limit * 0.5 ? cut : limit
  return {
    text: text.slice(0, at),
    dropped: `${text.length - at} characters (~${Math.round((text.length - at) / 4)} tokens) after this point`
  }
}
