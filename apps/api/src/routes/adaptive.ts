import { ADAPTIVE_WINDOW_DAYS, adaptiveTdee, addDays } from '@kalapp/shared'
import { Hono } from 'hono'
import { listEntryTotals } from '../db/entries'
import { getProfile } from '../db/profile'
import { listWeights } from '../db/weights'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'
import { todayIn } from '../lib/time'

/** Ventana del gasto adaptativo: ADAPTIVE_WINDOW_DAYS días que terminan hoy (zona del perfil). */
export { ADAPTIVE_WINDOW_DAYS }

export const adaptiveRoutes = new Hono<AppEnv>()

adaptiveRoutes.get('/', async (c) => {
  const profile = await getProfile(c.env.DB)
  if (!profile) throw new HttpError('PROFILE_REQUIRED')
  const to = todayIn(profile.timezone)
  const from = addDays(to, -(ADAPTIVE_WINDOW_DAYS - 1))
  const [totals, weights] = await Promise.all([
    listEntryTotals(c.env.DB, from, to),
    listWeights(c.env.DB, from, to),
  ])
  const byDay = new Map<string, number>()
  for (const t of totals) byDay.set(t.localDate, (byDay.get(t.localDate) ?? 0) + t.totals.kcal)
  return c.json(
    adaptiveTdee({
      days: [...byDay].map(([localDate, kcal]) => ({ localDate, kcal })),
      weights,
      from,
      to,
      currentTargetKcal: profile.targetKcal,
      goal: profile.goal,
      intensity: profile.intensity,
      sex: profile.sex,
      bmr: profile.bmr,
    }),
  )
})
