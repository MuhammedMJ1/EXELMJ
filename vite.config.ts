import { defineConfig } from 'vite'

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 6000
  },
  server: {
    port: 5173,
    strictPort: false
  }
})
