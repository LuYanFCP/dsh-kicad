import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.test.ts', 'packages/*/tests/**/*.test.tsx'],
    environmentMatchGlobs: [['packages/client-ui-kicad/**', 'jsdom']],
    testTimeout: 60_000,
  },
})
