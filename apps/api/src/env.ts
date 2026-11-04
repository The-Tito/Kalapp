export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  GEMINI_MODEL: string
  GEMINI_FALLBACK_MODEL: string
  DAILY_ANALYZE_LIMIT: string
  MAX_IMAGE_BYTES: string
  /** Secreto (`wrangler secret put`); puede faltar si no se configuró. */
  GEMINI_API_KEY?: string
  /** Secreto (`wrangler secret put`); ≥ 16 caracteres o el Worker responde 500 (fail closed). */
  APP_TOKEN?: string
}

export type AppEnv = { Bindings: Env }
