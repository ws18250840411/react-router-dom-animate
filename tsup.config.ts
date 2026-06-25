import { cpSync, readFileSync, writeFileSync } from 'node:fs'

import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  external: ['react', 'react-dom', 'react-router-dom', 'react-transition-group'],
  onSuccess: () => {
    cpSync('src/anim.css', 'dist/anim.css')

    const esm = readFileSync('dist/index.js', 'utf8')
    if (!esm.includes("import './index.css'")) {
      writeFileSync('dist/index.js', "import './index.css'\n" + esm)
    }

    const cjs = readFileSync('dist/index.cjs', 'utf8')
    if (!cjs.includes("require('./index.css')")) {
      writeFileSync('dist/index.cjs', "require('./index.css')\n" + cjs)
    }
  },
})
