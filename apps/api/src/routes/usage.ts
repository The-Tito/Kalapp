import { Hono } from 'hono'
import { getUsageCalls } from '../db/usage'
import type { AppEnv } from '../env'
import { dailyLimit, usageDate } from './analyze'

export const usageRoutes = new Hono<AppEnv>()

/** Análisis usados hoy (fecha del contador: zona predeterminada, ver `usageDate`) y el límite. */
usageRoutes.get('/', async (c) => {
  const date = usageDate()
  return c.json({ date, calls: await getUsageCalls(c.env.DB, date), limit: dailyLimit(c.env) })
})
