import { buildRangeSummary, DateRangeQuerySchema } from '@kalapp/shared'
import { Hono } from 'hono'
import { listEntryTotals } from '../db/entries'
import type { AppEnv } from '../env'
import { readQuery } from '../lib/validate'

export const summaryRoutes = new Hono<AppEnv>()

summaryRoutes.get('/', async (c) => {
  const { from, to } = readQuery(c, DateRangeQuerySchema)
  return c.json(buildRangeSummary(await listEntryTotals(c.env.DB, from, to), from, to))
})
