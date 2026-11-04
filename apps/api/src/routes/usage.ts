import { Hono } from 'hono'
import { getProfileTimezone } from '../db/profile'
import { getUsageCalls } from '../db/usage'
import type { AppEnv } from '../env'
import { todayIn } from '../lib/time'
import { dailyLimit } from './analyze'

export const usageRoutes = new Hono<AppEnv>()

/** Análisis usados hoy (zona del perfil o la predeterminada) y el límite diario. */
usageRoutes.get('/', async (c) => {
  const date = todayIn(await getProfileTimezone(c.env.DB))
  return c.json({ date, calls: await getUsageCalls(c.env.DB, date), limit: dailyLimit(c.env) })
})
