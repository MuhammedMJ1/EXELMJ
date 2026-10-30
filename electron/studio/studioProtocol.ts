// Serving a generated project to the embedded browser, offline.
//
// NOT a dev server, and NOT file://.
//
// A local HTTP server would mean a port, a firewall prompt on Windows, and
// something reachable by anything else on the machine. file:// is worse: it is
// an OPAQUE origin, so the page gets no localStorage, no IndexedDB, no modules
// without CORS pain, and no secure context — and then the project behaves
// completely differently the moment it is deployed to https://, which is the
// worst possible time to find out.
//
// A privileged custom scheme gives the page a real origin AND a secure
// context, with no port and no server process. `studio://<projectId>/<path>`.

import { protocol, type Session } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const SCHEME = 'studio'

/**
 * Must be called BEFORE app.whenReady().
 *
 * `standard` gives the page a real origin (so storage and CORS behave as they
 * will in production), `secure` gives it a secure context (modules, crypto,
 * service workers), and `supportFetchAPI` lets the project's own fetch() work.
 */
export function registerStudioScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true
      }
    }
  ])
}

export interface ProjectResolver {
  /** Absolute directory for a project id, or null when there is no such id. */
  (projectId: string): string | null
}

/**
 * Resolve a studio:// URL to a file inside the project directory.
 *
 * Exported for tests because this is the security boundary: the guest can ask
 * for any path it likes, and the ONLY thing stopping `studio://p/../../../../
 * Windows/System32/config/SAM` is the containment check below. `path.relative`
 * is used rather than a string prefix test because a prefix test is defeated
 * by a sibling directory whose name starts with the project's own.
 */
export function resolveStudioPath(root: string, urlPath: string): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  // A NUL byte truncates a path in some syscalls; refuse rather than normalise.
  if (decoded.includes('\0')) return null
  const rel = decoded.replace(/^\/+/, '')
  const target = path.resolve(root, rel || 'index.html')
  const inside = path.relative(root, target)
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null
  return target
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
}

export function mimeFor(file: string): string {
  // application/octet-stream, never a guess: a mistyped script is either
  // refused by the browser or, worse, executed as something it is not.
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
}

/** Install the handler on the GUEST session only — the app's own session has
 * no business resolving this scheme. */
export function serveStudioProtocol(guest: Session, resolve: ProjectResolver): void {
  guest.protocol.handle(SCHEME, async (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('bad request', { status: 400 })
    }
    const root = resolve(url.hostname)
    if (!root) return new Response('no such project', { status: 404 })
    const file = resolveStudioPath(root, url.pathname)
    if (!file) return new Response('forbidden', { status: 403 })
    try {
      const bytes = await fs.readFile(file)
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-type': mimeFor(file),
          // A generated project is ours, but it is still untrusted output: a
          // strict CSP means a mistake in the emitter cannot become a script
          // that reaches the network.
          'content-security-policy':
            "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'",
          'cache-control': 'no-store'
        }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })
}
