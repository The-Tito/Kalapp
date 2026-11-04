// Tipado de `exports` (cloudflare:workers) y `env` (cloudflare:test) en las pruebas.
type KalappEnv = import('./env').Env

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index')
  }
  interface Env extends KalappEnv {
    /** Solo en pruebas: migraciones leídas por vitest.config.ts. */
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[]
  }
}
