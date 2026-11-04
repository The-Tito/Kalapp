export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  GEMINI_MODEL: string
  GEMINI_FALLBACK_MODEL: string
  DAILY_ANALYZE_LIMIT: string
  MAX_IMAGE_BYTES: string
  GEMINI_API_KEY: string
  APP_TOKEN: string
}
