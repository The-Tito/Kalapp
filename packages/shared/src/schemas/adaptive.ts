import { z } from 'zod'

export const AdaptiveTdeeReasonSchema = z.enum([
  'RANGE_TOO_SHORT',
  'LOW_LOGGING',
  'NOT_ENOUGH_WEIGHTS',
])
export type AdaptiveTdeeReason = z.infer<typeof AdaptiveTdeeReasonSchema>

export const AdaptiveTdeeInsufficientSchema = z.object({
  status: z.literal('insufficient_data'),
  reason: AdaptiveTdeeReasonSchema,
  /** Mensaje es-MX listo para mostrar. */
  message: z.string(),
  /** Días (de rango o de registro) que faltan, cuando aplica. */
  daysNeeded: z.number().int().min(0).optional(),
})

export const AdaptiveTdeeOkSchema = z.object({
  status: z.literal('ok'),
  estimatedTdee: z.number().int(),
  avgIntakeKcal: z.number().int(),
  weightTrendKgPerWeek: z.number(),
  /** Días con registro ÷ días del rango (0–1, 2 decimales). */
  loggedDaysRatio: z.number().min(0).max(1),
  suggestedTargetKcal: z.number().int(),
  /** suggestedTargetKcal − currentTargetKcal. */
  deltaKcal: z.number().int(),
  safetyFloorApplied: z.boolean(),
  /** Mensaje es-MX (ej. "Tu gasto real parece ser ~2,550 kcal…"). */
  message: z.string(),
})

/** Resultado del gasto adaptativo (v0.3). Nunca cambia la meta solo: es una propuesta. */
export const AdaptiveTdeeResultSchema = z.discriminatedUnion('status', [
  AdaptiveTdeeInsufficientSchema,
  AdaptiveTdeeOkSchema,
])
export type AdaptiveTdeeResult = z.infer<typeof AdaptiveTdeeResultSchema>
