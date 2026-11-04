import { z } from 'zod'
import { LIMITS } from '../constants'
import { daysBetween } from '../utils/dates'
import { LocalDateSchema, MacroTotalsSchema } from './common'

export const DaySummarySchema = z.object({
  localDate: LocalDateSchema,
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  entryCount: z.number().int().min(0),
})
export type DaySummary = z.infer<typeof DaySummarySchema>

/** `GET /api/summary?from=&to=` (v0.2). */
export const RangeSummarySchema = z.object({
  from: LocalDateSchema,
  to: LocalDateSchema,
  /** Solo días con registros, en orden ascendente. */
  days: z.array(DaySummarySchema),
  loggedDays: z.number().int().min(0),
  /** Promedio sobre días registrados (0 si no hay). */
  averages: MacroTotalsSchema,
})
export type RangeSummary = z.infer<typeof RangeSummarySchema>

/** Rango inclusivo `from ≤ to`, máximo 366 días. */
export const DateRangeQuerySchema = z
  .object({ from: LocalDateSchema, to: LocalDateSchema })
  .refine((v) => v.from <= v.to, { error: 'La fecha inicial debe ser anterior a la final' })
  .refine((v) => daysBetween(v.from, v.to) + 1 <= LIMITS.summaryMaxRangeDays, {
    error: `El rango máximo es de ${LIMITS.summaryMaxRangeDays} días`,
  })
export type DateRangeQuery = z.infer<typeof DateRangeQuerySchema>

/** Totales del día para el Atajo de iOS → Apple Salud (v1.0). */
export const ShortcutDaySummarySchema = z.object({
  localDate: LocalDateSchema,
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
  targetKcal: z.number().int().nullable(),
  /** targetKcal − kcal (puede ser negativo si se excedió); null sin perfil. */
  remainingKcal: z.number().nullable(),
})
export type ShortcutDaySummary = z.infer<typeof ShortcutDaySummarySchema>
