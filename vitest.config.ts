import { defineConfig } from 'vitest/config'

// Standalone config: keeps vitest independent from vite.config.ts
// (whose root points at src/ for the renderer build).
export default defineConfig({
  resolve: {
    alias: [
      // `?worker&inline` is a Vite loader suffix; node cannot resolve it, and
      // without this the whole PDF layer would stay untestable.
      {
        find: /^pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?worker&inline$/,
        replacement: new URL('./tests/stubs/pdfWorker.ts', import.meta.url).pathname
      },
      // the browser build reaches for DOMMatrix at import time; the legacy one
      // is the same library built to survive node
      { find: /^pdfjs-dist$/, replacement: 'pdfjs-dist/legacy/build/pdf.mjs' }
    ]
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
})
