import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const dir = path.dirname(fileURLToPath(import.meta.url))
const libRoot = path.resolve(dir, '..')
const useSrc = process.env.DEMO_LIB === 'src'
const libEntry = useSrc
  ? path.resolve(libRoot, 'src/index.ts')
  : path.resolve(libRoot, 'dist/index.js')

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'demo-lib-mode',
      configureServer() {
        console.log(`[demo] react-router-dom-animate → ${useSrc ? 'src (Vite 会加载 anim.css)' : 'dist (样式由 JS injectStyle 注入)'}`)
        console.log(`[demo] ${libEntry}`)
      },
    },
  ],
  root: dir,
  resolve: {
    alias: [{ find: 'react-router-dom-animate', replacement: libEntry }],
    dedupe: ['react', 'react-dom', 'react-router-dom', 'react-transition-group'],
  },
  server: { port: 5180, strictPort: true },
  build: { outDir: path.resolve(dir, 'dist'), emptyOutDir: true },
})
