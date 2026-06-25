import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dir = path.dirname(fileURLToPath(import.meta.url))
const libRoot = path.resolve(dir, '..')

export default defineConfig({
  plugins: [react()],
  root: dir,
  resolve: {
    alias: [
      { find: 'react-router-dom-animate', replacement: path.resolve(libRoot, 'src/index.ts') },
    ],
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-transition-group'],
  },
  server: { port: 5180, strictPort: true },
  build: { outDir: path.resolve(dir, 'dist'), emptyOutDir: true },
})
