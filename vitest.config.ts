import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 60_000,
    projects: [
      { extends: true, test: { name: 'host', environment: 'node', include: ['packages/*/tests/**/*.test.ts'], exclude: ['packages/client-ui-kicad/**'] } },
      { extends: true, test: { name: 'client', environment: 'jsdom', include: ['packages/client-ui-kicad/tests/**/*.test.{ts,tsx}'] } },
    ],
  },
})
