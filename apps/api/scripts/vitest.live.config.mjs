import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Solo para scripts/gemini-live.ts (Node, red real). Nunca lo usa `pnpm test`.
export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: {
    include: ['scripts/gemini-live.ts'],
    environment: 'node',
    testTimeout: 120_000,
    silent: false,
  },
})
