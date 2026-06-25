import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['**/node_modules/**', '**/dist/**', 'demo/**'],
    environmentMatchGlobs: [['src/__tests__/outlet.test.tsx', 'jsdom']],
  },
})
