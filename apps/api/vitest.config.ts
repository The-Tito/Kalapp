import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig(async () => {
  // Relativo al cwd (apps/api): así lo ejecutan `pnpm --filter @kalapp/api test` y Vitest.
  const migrations = await readD1Migrations('../../migrations')
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: '../../wrangler.jsonc' },
        miniflare: {
          // Valores ficticios solo para pruebas; nunca claves reales.
          bindings: {
            GEMINI_API_KEY: 'test-key',
            APP_TOKEN: 'test-token-0123456789abcdef',
            TEST_MIGRATIONS: migrations,
          },
        },
      }),
    ],
    test: {
      include: ['src/**/*.test.ts'],
      setupFiles: ['./src/test/apply-migrations.ts'],
    },
  }
})
