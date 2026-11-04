import { applyD1Migrations, env } from 'cloudflare:test'
import { afterEach, vi } from 'vitest'

// Se ejecuta antes de cada archivo de prueba; applyD1Migrations es idempotente.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)

afterEach(() => {
  vi.restoreAllMocks()
})
