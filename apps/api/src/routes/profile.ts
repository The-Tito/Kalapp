import { ProfileInputSchema, type Recommendation, recommend } from '@kalapp/shared'
import { Hono } from 'hono'
import { getProfile, saveProfile } from '../db/profile'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'
import { nowIso } from '../lib/time'
import { readJson } from '../lib/validate'

export const profileRoutes = new Hono<AppEnv>()

profileRoutes.get('/', async (c) => {
  const profile = await getProfile(c.env.DB)
  if (!profile) throw new HttpError('NOT_FOUND', 'Todavía no hay perfil')
  return c.json(profile)
})

/** Recibe datos crudos; el servidor recalcula con `recommend()` y guarda. */
profileRoutes.put('/', async (c) => {
  const input = await readJson(c, ProfileInputSchema)
  let rec: Recommendation
  try {
    rec = recommend(input, new Date())
  } catch (err) {
    if (err instanceof RangeError) {
      throw new HttpError('VALIDATION', 'Los datos del perfil no permiten calcular la meta')
    }
    throw err
  }
  return c.json(await saveProfile(c.env.DB, input, rec, nowIso()))
})
