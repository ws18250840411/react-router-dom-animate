import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default to node; test files that need DOM use the
    // `@vitest-environment jsdom` inline pragma at the top of the file.
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', '**/demo/**'],
  },
})
