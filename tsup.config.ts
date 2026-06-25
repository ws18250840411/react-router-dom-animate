import { readFileSync, writeFileSync } from 'node:fs'

import { transformSync } from 'esbuild'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  external: ['react', 'react-dom', 'react-router-dom', 'react-transition-group'],
  // onSuccess: () => {
  //   const css = readFileSync('src/anim.css', 'utf8')
  //   writeFileSync('dist/anim.css', transformSync(css, { loader: 'css', minify: true }).code)

  //   const esm = readFileSync('dist/index.js', 'utf8')
  //   if (!esm.includes("import './anim.css'")) {
  //     writeFileSync('dist/index.js', "import './anim.css'\n" + esm)
  //   }

  //   const cjs = readFileSync('dist/index.cjs', 'utf8')
  //   if (!cjs.includes("require('./anim.css')")) {
  //     writeFileSync('dist/index.cjs', "require('./anim.css')\n" + cjs)
  //   }
  // },
})
