// Bundles the Electron main process + preload with esbuild.
// Output: dist-electron/main.cjs + dist-electron/preload.cjs
// Usage: node scripts/build-electron.mjs [--watch]
import { build, context } from 'esbuild'
import { copyFile, mkdir } from 'node:fs/promises'

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const options = {
  // The GUEST preload is a third entry point: it runs inside the previewed
  // page, in its own isolated world, and must not share a bundle with the
  // app's own preload.
  entryPoints: ['electron/main.ts', 'electron/preload.ts', 'electron/studio/guestPreload.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  sourcemap: true,
  outdir: 'dist-electron',
  outExtension: { '.js': '.cjs' },
  logLevel: 'info'
}

/**
 * The MCP stdio shim ships as a plain script, not a bundle: Claude Code
 * launches it with the system Node, so it must not depend on anything in
 * node_modules (electron-builder packages only dist/, dist-electron/ and
 * package.json). Copying it into dist-electron is what gets it included.
 */
async function copyShim() {
  await mkdir('dist-electron', { recursive: true })
  await copyFile('scripts/mcp-shim.mjs', 'dist-electron/mcp-shim.mjs')
  console.log('[build-electron] copied mcp-shim.mjs')
}

if (watch) {
  const ctx = await context(options)
  await copyShim()
  await ctx.watch()
  console.log('[build-electron] watching electron/ …')
} else {
  await build(options)
  await copyShim()
}
