import { buildShortcutDaySummary, sumTotals } from '@kalapp/shared'
import { Hono } from 'hono'
import { listEntryTotals } from '../db/entries'
import { getProfile } from '../db/profile'
import type { AppEnv } from '../env'
import { todayIn } from '../lib/time'

export const shortcutRoutes = new Hono<AppEnv>()

/** Totales de hoy para el Atajo de iOS (→ Apple Salud). */
shortcutRoutes.get('/today', async (c) => {
  const profile = await getProfile(c.env.DB)
  const date = todayIn(profile?.timezone)
  const totals = await listEntryTotals(c.env.DB, date, date)
  const day = totals.length > 0 ? sumTotals(totals.map((t) => t.totals)) : null
  return c.json(buildShortcutDaySummary(date, day, profile?.targetKcal ?? null))
})
