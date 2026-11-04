import { z } from 'zod'
import { LIMITS } from '../constants'
import { IsoDateTimeSchema, LocalDateSchema, rangeNumber } from './common'

const weightInputShape = {
  localDate: LocalDateSchema,
  weightKg: rangeNumber(LIMITS.weightKg.min, LIMITS.weightKg.max, 'Peso (kg)'),
}

/** `POST /api/weights` (v0.3). Un peso por día: el último sustituye al anterior (upsert por localDate). */
export const WeightInputSchema = z.object(weightInputShape)
export type WeightInput = z.infer<typeof WeightInputSchema>

export const WeightSchema = z.object({
  ...weightInputShape,
  id: z.string().min(1),
  createdAt: IsoDateTimeSchema,
})
export type Weight = z.infer<typeof WeightSchema>
