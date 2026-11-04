import { APP_NAME } from '@kalapp/shared'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { ZodError } from 'zod'
import type { AppEnv } from './env'
import { errorResponse, HttpError, summarizeIssues } from './lib/errors'
import { requireToken } from './middleware/auth'
import { limitBody } from './middleware/body-limit'
import { apiHeaders } from './middleware/headers'
import { adaptiveRoutes } from './routes/adaptive'
import { analyzeRoutes } from './routes/analyze'
import { barcodeRoutes } from './routes/barcode'
import { entriesRoutes } from './routes/entries'
import { exportRoutes } from './routes/export'
import { favoritesRoutes } from './routes/favorites'
import { profileRoutes } from './routes/profile'
import { shortcutRoutes } from './routes/shortcut'
import { summaryRoutes } from './routes/summary'
import { usageRoutes } from './routes/usage'
import { weightsRoutes } from './routes/weights'

/**
 * Crea la app (fábrica para que las pruebas puedan montar rutas extra antes del primer uso).
 * Orden: encabezados → health (sin token) → token → límite de cuerpo → rutas.
 */
export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api')

  app.use('*', apiHeaders)
  app.get('/health', (c) => c.json({ status: 'ok', app: APP_NAME }))
  app.use('*', requireToken)
  app.use('*', limitBody)

  app.route('/profile', profileRoutes)
  app.route('/analyze', analyzeRoutes)
  app.route('/entries', entriesRoutes)
  app.route('/summary', summaryRoutes)
  app.route('/favorites', favoritesRoutes)
  app.route('/weights', weightsRoutes)
  app.route('/adaptive', adaptiveRoutes)
  app.route('/export', exportRoutes)
  app.route('/shortcut', shortcutRoutes)
  app.route('/barcode', barcodeRoutes)
  app.route('/usage', usageRoutes)

  app.notFound((c) => errorResponse(c, 'NOT_FOUND', 'Ruta no encontrada'))

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return errorResponse(c, err.code, err.publicMessage, err.details, err.status)
    }
    if (err instanceof ZodError) {
      return errorResponse(c, 'VALIDATION', undefined, summarizeIssues(err))
    }
    if (err instanceof HTTPException && err.status < 500) {
      return errorResponse(c, 'VALIDATION', undefined, undefined, err.status)
    }
    // Nunca se filtra err.message al cliente.
    console.error(err)
    return errorResponse(c, 'INTERNAL')
  })

  return app
}

export const app = createApp()
