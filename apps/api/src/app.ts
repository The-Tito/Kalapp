import { APP_NAME } from '@kalapp/shared'
import { Hono } from 'hono'
import type { Env } from './env'

export const app = new Hono<{ Bindings: Env }>().basePath('/api')

app.get('/health', (c) => c.json({ status: 'ok', app: APP_NAME }))

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } }, 404))

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: { code: 'INTERNAL', message: 'Error interno' } }, 500)
})
