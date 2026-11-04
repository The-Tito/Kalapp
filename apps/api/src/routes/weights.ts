import { DateRangeQuerySchema, LocalDateSchema, WeightInputSchema } from '@kalapp/shared'
import { Hono } from 'hono'
import { deleteWeight, listWeights, upsertWeight } from '../db/weights'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'
import { nowIso } from '../lib/time'
import { parseWith, readJson, readQuery } from '../lib/validate'

export const weightsRoutes = new Hono<AppEnv>()

weightsRoutes.get('/', async (c) => {
  const { from, to } = readQuery(c, DateRangeQuerySchema)
  return c.json(await listWeights(c.env.DB, from, to))
})

/** Upsert por localDate: un peso por día (el último sustituye al anterior). */
weightsRoutes.post('/', async (c) => {
  const input = await readJson(c, WeightInputSchema)
  return c.json(await upsertWeight(c.env.DB, input, crypto.randomUUID(), nowIso()))
})

weightsRoutes.delete('/:localDate', async (c) => {
  const localDate = parseWith(LocalDateSchema, c.req.param('localDate'))
  if (!(await deleteWeight(c.env.DB, localDate))) {
    throw new HttpError('NOT_FOUND', 'No hay peso registrado ese día')
  }
  return c.body(null, 204)
})
