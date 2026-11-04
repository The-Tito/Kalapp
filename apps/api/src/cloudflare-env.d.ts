// Tipado de `exports` (cloudflare:workers) y `env` (cloudflare:test) en las pruebas.
type KalappEnv = import('./env').Env

declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import('./index')
  }
  interface Env extends KalappEnv {}
}
