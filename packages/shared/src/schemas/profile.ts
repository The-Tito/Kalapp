import { z } from 'zod'
import { LIMITS } from '../constants'
import { ageOn } from '../nutrition/age'
import { addDays, isValidLocalDate } from '../utils/dates'
import {
  ActivityLevelSchema,
  BmrFormulaSchema,
  GoalSchema,
  IntensitySchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  rangeNumber,
  SexSchema,
  TimeZoneWithDefaultSchema,
} from './common'

/** "Hoy" más adelantado del planeta (UTC+14) para no rechazar fechas válidas por zona. */
function latestPossibleToday(): string {
  return addDays(new Date().toISOString().slice(0, 10), 1)
}

/** Fecha de nacimiento: válida, no futura y con edad resultante 14–100 años (al día de hoy). */
export const BirthDateSchema = LocalDateSchema.superRefine((value, ctx) => {
  if (!isValidLocalDate(value)) return // ya reportado por LocalDateSchema
  const today = latestPossibleToday()
  if (value > today) {
    ctx.addIssue({ code: 'custom', message: 'La fecha de nacimiento no puede ser futura' })
    return
  }
  const age = ageOn(value, new Date())
  if (age < LIMITS.ageYears.min || age > LIMITS.ageYears.max) {
    ctx.addIssue({
      code: 'custom',
      message: `La edad debe estar entre ${LIMITS.ageYears.min} y ${LIMITS.ageYears.max} años`,
    })
  }
})

export const profileInputShape = {
  sex: SexSchema,
  birthDate: BirthDateSchema,
  heightCm: rangeNumber(LIMITS.heightCm.min, LIMITS.heightCm.max, 'Estatura (cm)'),
  weightKg: rangeNumber(LIMITS.weightKg.min, LIMITS.weightKg.max, 'Peso (kg)'),
  bodyFatPct: rangeNumber(LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max, '% de grasa')
    .nullable()
    .optional(),
  activityLevel: ActivityLevelSchema,
  trainingDays: z
    .number({ error: 'Días de entrenamiento: debe ser un número' })
    .int({ error: 'Días de entrenamiento: debe ser entero' })
    .min(LIMITS.trainingDays.min, { error: 'Días de entrenamiento: mínimo 0' })
    .max(LIMITS.trainingDays.max, { error: 'Días de entrenamiento: máximo 7' }),
  goal: GoalSchema,
  intensity: IntensitySchema,
  timezone: TimeZoneWithDefaultSchema,
  manualTargetKcal: rangeNumber(
    LIMITS.manualTargetKcal.min,
    LIMITS.manualTargetKcal.max,
    'Meta manual (kcal)',
  )
    .int({ error: 'Meta manual (kcal): debe ser entero' })
    .nullable()
    .default(null),
}

/** Lo que envía la web en `PUT /api/profile` (datos crudos; el servidor recalcula). */
export const ProfileInputSchema = z.object(profileInputShape)
/** Ya validado (con defaults aplicados). */
export type ProfileInput = z.infer<typeof ProfileInputSchema>
/** Lo que se puede enviar (timezone y manualTargetKcal opcionales). */
export type ProfileInputPayload = z.input<typeof ProfileInputSchema>

export const RecommendationWarningCodeSchema = z.enum([
  'RECOMP_NO_TRAINING',
  'GAIN_HIGH_BODY_FAT',
  'SAFETY_FLOOR_APPLIED',
  'BELOW_SAFETY_FLOOR',
  'CARBS_CLAMPED',
])
export type RecommendationWarningCode = z.infer<typeof RecommendationWarningCodeSchema>

export const RecommendationWarningSchema = z.object({
  code: RecommendationWarningCodeSchema,
  message: z.string(),
})
export type RecommendationWarning = z.infer<typeof RecommendationWarningSchema>

export const recommendationShape = {
  bmr: z.number().int(),
  tdee: z.number().int(),
  bmrFormula: BmrFormulaSchema,
  /** Ajuste del objetivo en % (ej. −20). */
  adjustPct: z.number(),
  targetKcal: z.number().int(),
  proteinG: z.number().int().min(0),
  fatG: z.number().int().min(0),
  carbsG: z.number().int().min(0),
  expectedKgPerWeek: z.number(),
  safetyFloorApplied: z.boolean(),
  isManualOverride: z.boolean(),
  warnings: z.array(RecommendationWarningSchema),
  /** Pasos del cálculo en español, listos para mostrarse. */
  explanation: z.array(z.string()),
}

export const RecommendationSchema = z.object(recommendationShape)
export type Recommendation = z.infer<typeof RecommendationSchema>

/** `GET/PUT /api/profile` → Profile. */
export const ProfileSchema = z.object({
  ...profileInputShape,
  ...recommendationShape,
  updatedAt: IsoDateTimeSchema,
})
export type Profile = z.infer<typeof ProfileSchema>
