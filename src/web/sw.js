/* EXELMJ web edition: the offline service worker.
 *
 * The web build (vite.web.config.ts) writes the real dist/web/sw.js from this
 * file, filling in VERSION (a hash of every built file) and ASSETS (every
 * built file). A version is cached whole when it installs. The next deploy
 * installs beside it and takes over only once every window of the app is
 * closed, so a running app never mixes files from two versions.
 */
const VERSION = '__EXELMJ_VERSION__'
const ASSETS = __EXELMJ_ASSETS__
const CACHE = `exelmj-web-${VERSION}`

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('exelmj-web-') && key !== CACHE) await caches.delete(key)
      }
      await self.clients.claim()
    })()
  )
})

// A file shared INTO the installed app (manifest share_target): keep it for
// the page, which picks it up at boot (webBridge.getPendingOpenFile). Its own
// cache name, outside the versioned ones, so an update never drops it.
const SHARED = 'exelmj-shared'

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    event.respondWith(
      (async () => {
        try {
          const form = await req.formData()
          const file = form.getAll('file').find((f) => f && typeof f === 'object' && 'arrayBuffer' in f)
          if (file) {
            const cache = await caches.open(SHARED)
            await cache.put(
              './shared-file',
              new Response(file, { headers: { 'x-name': encodeURIComponent(file.name || 'shared') } })
            )
          }
        } catch (err) {
          console.warn('[sw] share target', err)
        }
        return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303)
      })()
    )
    return
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      // Every navigation gets this version's app page — offline too.
      // ignoreVary: servers answer with "Vary: Origin", and a module script
      // (sent WITH an Origin header) must still match the copy cached at
      // install (fetched WITHOUT one) — else the app page loads offline but
      // its code does not.
      const navigate = req.mode === 'navigate'
      const hit = await cache.match(navigate ? './' : req, { ignoreSearch: navigate, ignoreVary: true })
      return hit ?? fetch(req)
    })()
  )
})
