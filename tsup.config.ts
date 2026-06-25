import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  minify: true,
  injectStyle: true,
  external: ['react', 'react-dom', 'react-router-dom', 'react-transition-group'],
})
