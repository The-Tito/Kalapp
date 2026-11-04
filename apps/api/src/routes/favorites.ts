import { FavoriteInputSchema, UuidSchema } from '@kalapp/shared'
import { Hono } from 'hono'
import { deleteFavorite, insertFavorite, listFavorites, useFavorite } from '../db/favorites'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'
import { nowIso } from '../lib/time'
import { readJson } from '../lib/validate'

export const favoritesRoutes = new Hono<AppEnv>()

const notFound = () => new HttpError('NOT_FOUND', 'No se encontró el favorito')

function favoriteId(raw: string): string {
  const r = UuidSchema.safeParse(raw)
  if (!r.success) throw notFound()
  return r.data
}

favoritesRoutes.get('/', async (c) => c.json(await listFavorites(c.env.DB)))

/** Idempotente por id: 201 si se creó, 200 con el existente si ya estaba. */
favoritesRoutes.post('/', async (c) => {
  const input = await readJson(c, FavoriteInputSchema)
  const { favorite, created } = await insertFavorite(c.env.DB, input, nowIso())
  return c.json(favorite, created ? 201 : 200)
})

favoritesRoutes.delete('/:id', async (c) => {
  if (!(await deleteFavorite(c.env.DB, favoriteId(c.req.param('id'))))) throw notFound()
  return c.body(null, 204)
})

favoritesRoutes.post('/:id/use', async (c) => {
  const fav = await useFavorite(c.env.DB, favoriteId(c.req.param('id')), nowIso())
  if (!fav) throw notFound()
  return c.json(fav)
})
