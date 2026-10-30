// Dev runner: bundles electron files, starts the Vite dev server for the
// renderer, then launches Electron pointed at it. Ctrl+C or closing the app
// window stops everything. (Main-process changes need a dev restart.)
import { spawn } from 'node:child_process'
import { createServer } from 'vite'
import electronPath from 'electron'

await import('./build-electron.mjs')

const server = await createServer({ configFile: 'vite.config.ts' })
await server.listen()
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/'
console.log(`[dev] renderer: ${url}`)

const child = spawn(String(electronPath), ['.'], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RENDERER_URL: url }
})

child.on('exit', async (code) => {
  await server.close()
  process.exit(code ?? 0)
})
