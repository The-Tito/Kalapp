import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'

/** Las respuestas de la API nunca se guardan en caché (datos personales). */
export const apiHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  c.res.headers.set('Cache-Control', 'no-store')
  c.res.headers.set('X-Content-Type-Options', 'nosniff')
}
