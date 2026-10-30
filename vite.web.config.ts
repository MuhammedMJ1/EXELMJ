// Vite config for the WEB edition: Sheets + Documents as an installable phone
// app (see docs/web-edition-plan.md). The desktop renderer keeps vite.config.ts.
// Usage: npm run dev:web | npm run build:web  (output: dist/web)
import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const pkg = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')) as { version: string }

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listFiles(full))
    else out.push(full)
  }
  return out
}

/**
 * Writes dist/web/sw.js from src/web/sw.js with this build's version (a hash
 * of every built file, so any change ships a new worker) and file list.
 */
function serviceWorker(): Plugin {
  let outDir = ''
  return {
    name: 'exelmj-web-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = listFiles(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort()
      const hash = createHash('sha256')
      for (const f of files) {
        hash.update(f)
        hash.update(readFileSync(join(outDir, f)))
      }
      const version = hash.digest('hex').slice(0, 16)
      const assets = ['./', ...files.map((f) => `./${f}`)]
      const source = readFileSync(join(here, 'src/web/sw.js'), 'utf8')
        .replace("'__EXELMJ_VERSION__'", JSON.stringify(version))
        .replace('__EXELMJ_ASSETS__', JSON.stringify(assets))
      writeFileSync(join(outDir, 'sw.js'), source)
      console.log(`[web] sw.js: ${assets.length} files cached, version ${version}`)
    }
  }
}

export default defineConfig({
  root: 'src/web',
  base: './',
  define: {
    // Build-time flags: main.ts drops Design/Photo/Studio from this bundle.
    'import.meta.env.VITE_WEB': JSON.stringify('1'),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version)
  },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000
  },
  server: { port: 5198, strictPort: false },
  preview: { port: 5197, strictPort: false },
  plugins: [serviceWorker()]
})
