import {
  ACTIVITY_FACTORS,
  BMI_ADJUST_THRESHOLD,
  BMI_ADJUSTED_TARGET,
  BMR_FORMULA_LABELS,
  DEFAULT_TIMEZONE,
  FAT_MIN_G_PER_KG,
  FAT_PCT_OF_KCAL,
  GAIN_HIGH_BODY_FAT_PCT,
  GOAL_CONFIG,
  getAdjustPct,
  getIntensityLabel,
  KCAL_PER_GRAM,
  KCAL_PER_KG_BODY_WEIGHT,
  LIMITS,
  TARGET_ROUNDING_KCAL,
} from '../constants'
import type { ProfileInput, Recommendation, RecommendationWarning } from '../schemas/profile'
import { resolveLocalDate } from '../utils/dates'
import { formatNumber as n } from '../utils/format'
import { roundTo, roundToStep } from '../utils/math'
import { ageOn } from './age'
import { bmi, bmr, safetyFloorKcal, tdee } from './energy'

/** Datos mínimos para calcular (ProfileInput validado; timezone/manualTargetKcal opcionales). */
export type RecommendInput = Omit<ProfileInput, 'timezone' | 'manualTargetKcal'> & {
  timezone?: string
  manualTargetKcal?: number | null
}

function assertInRange(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${label} fuera de rango (${min}–${max}): ${String(value)}`)
  }
}

/** Rechaza entradas numéricas imposibles (NaN, Infinity, negativas o fuera de LIMITS). */
function assertRecommendInput(input: RecommendInput): void {
  assertInRange(input.heightCm, LIMITS.heightCm.min, LIMITS.heightCm.max, 'Estatura (cm)')
  assertInRange(input.weightKg, LIMITS.weightKg.min, LIMITS.weightKg.max, 'Peso (kg)')
  if (input.bodyFatPct != null) {
    assertInRange(input.bodyFatPct, LIMITS.bodyFatPct.min, LIMITS.bodyFatPct.max, '% de grasa')
  }
  assertInRange(
    input.trainingDays,
    LIMITS.trainingDays.min,
    LIMITS.trainingDays.max,
    'Días de entrenamiento',
  )
  if (!Number.isInteger(input.trainingDays)) {
    throw new RangeError('Días de entrenamiento: debe ser entero')
  }
  if (input.manualTargetKcal != null) {
    assertInRange(
      input.manualTargetKcal,
      LIMITS.manualTargetKcal.min,
      LIMITS.manualTargetKcal.max,
      'Meta manual (kcal)',
    )
  }
}

function signedPct(pct: number): string {
  return pct > 0 ? `+${pct}` : `−${Math.abs(pct)}`
}

/**
 * Recomendación diaria (función pura). `asOf` es la fecha en la que se calcula la edad:
 * YYYY-MM-DD o un instante (que se convierte a fecha local con `input.timezone`).
 * Lanza `RangeError` con fechas inexistentes o números imposibles (NaN, Infinity, fuera de
 * LIMITS). No revisa la edad 14–100 (eso lo hace `ProfileInputSchema`).
 */
export function recommend(input: RecommendInput, asOf: Date | string): Recommendation {
  assertRecommendInput(input)
  const timezone = input.timezone ?? DEFAULT_TIMEZONE
  const asOfDate = resolveLocalDate(asOf, timezone)
  const age = ageOn(input.birthDate, asOfDate)
  const { sex, weightKg, heightCm, activityLevel, goal, intensity, trainingDays } = input
  const bodyFatPct = input.bodyFatPct ?? null
  const warnings: RecommendationWarning[] = []
  const explanation: string[] = []

  // 1. Metabolismo en reposo
  const b = bmr({ sex, weightKg, heightCm, age, bodyFatPct })
  const bmrKcal = Math.round(b.value)
  if (b.formula === 'katch') {
    explanation.push(
      `Metabolismo en reposo (${BMR_FORMULA_LABELS.katch}): masa magra ${n(b.leanMassKg ?? 0, 1)} kg ` +
        `(${n(weightKg, 1)} kg × (1 − ${n(bodyFatPct ?? 0, 1)} %)); 370 + 21.6 × ${n(b.leanMassKg ?? 0, 1)} = ${n(bmrKcal)} kcal.`,
    )
  } else {
    explanation.push(
      `Metabolismo en reposo (${BMR_FORMULA_LABELS.mifflin}): 10 × ${n(weightKg, 1)} + 6.25 × ${n(heightCm, 1)} ` +
        `− 5 × ${age} ${sex === 'male' ? '+ 5' : '− 161'} = ${n(bmrKcal)} kcal.`,
    )
  }

  // 2. Gasto diario total
  const activity = ACTIVITY_FACTORS[activityLevel]
  const tdeeRaw = tdee(b.value, activityLevel)
  const tdeeKcal = Math.round(tdeeRaw)
  explanation.push(
    `Gasto diario total: ${n(bmrKcal)} × ${activity.factor} (${activity.label}) = ${n(tdeeKcal)} kcal.`,
  )

  // 3. Ajuste por objetivo
  const goalCfg = GOAL_CONFIG[goal]
  const adjustPct = getAdjustPct(goal, intensity)
  const rawTarget = tdeeRaw * (1 + adjustPct / 100)
  const computedTarget = roundToStep(rawTarget, TARGET_ROUNDING_KCAL)
  explanation.push(
    `Objetivo ${goalCfg.label} (${getIntensityLabel(goal, intensity)}): ${signedPct(adjustPct)} % → ` +
      `${n(rawTarget)} kcal, redondeado a ${n(computedTarget)} kcal.`,
  )

  // 4. Piso de seguridad / meta manual
  const floor = safetyFloorKcal(sex, b.value)
  let targetKcal = computedTarget
  let safetyFloorApplied = false
  const manual = input.manualTargetKcal ?? null
  const isManualOverride = manual !== null
  if (isManualOverride) {
    targetKcal = manual
    explanation.push(
      `Usas una meta manual de ${n(manual)} kcal (la calculada era ${n(computedTarget)} kcal).`,
    )
    if (manual < floor) {
      warnings.push({
        code: 'BELOW_SAFETY_FLOOR',
        message: `Tu meta manual (${n(manual)} kcal) está por debajo del mínimo seguro recomendado (${n(floor)} kcal).`,
      })
    }
  } else if (computedTarget < floor) {
    targetKcal = floor
    safetyFloorApplied = true
    explanation.push(
      `Mínimo de seguridad: nunca menos de ${n(floor)} kcal (el mayor entre ${sex === 'male' ? '1,500' : '1,200'} kcal y tu metabolismo en reposo); la meta sube a ${n(floor)} kcal.`,
    )
    warnings.push({
      code: 'SAFETY_FLOOR_APPLIED',
      message: `La meta calculada (${n(computedTarget)} kcal) quedaba debajo del mínimo seguro; se ajustó a ${n(floor)} kcal.`,
    })
    if (goal === 'deficit' && targetKcal >= tdeeKcal) {
      warnings.push({
        code: 'DEFICIT_NOT_POSSIBLE',
        message:
          'Con tu gasto actual no es posible un déficit sin bajar del mínimo seguro; aumenta tu actividad o consulta a un profesional.',
      })
    }
  }

  // 5. Proteína (peso ajustado a IMC 25 si IMC > 30)
  const currentBmi = bmi(weightKg, heightCm)
  const heightM = heightCm / 100
  const useAdjusted = currentBmi > BMI_ADJUST_THRESHOLD
  const proteinWeightKg = useAdjusted ? BMI_ADJUSTED_TARGET * heightM * heightM : weightKg
  const proteinG = Math.round(goalCfg.proteinGPerKg * proteinWeightKg)
  const proteinKcal = proteinG * KCAL_PER_GRAM.protein
  explanation.push(
    useAdjusted
      ? `Proteína: tu IMC es ${n(currentBmi, 1)} (> ${BMI_ADJUST_THRESHOLD}), así que se usa el peso equivalente a IMC ${BMI_ADJUSTED_TARGET} ` +
          `(${n(proteinWeightKg, 1)} kg): ${goalCfg.proteinGPerKg} g/kg × ${n(proteinWeightKg, 1)} kg = ${proteinG} g (${n(proteinKcal)} kcal).`
      : `Proteína: ${goalCfg.proteinGPerKg} g/kg × ${n(weightKg, 1)} kg = ${proteinG} g (${n(proteinKcal)} kcal).`,
  )

  // 6. Grasa: 25 % de las kcal, mínimo 0.6 g/kg
  const fatKcalFromPct = targetKcal * FAT_PCT_OF_KCAL
  const fatMinG = FAT_MIN_G_PER_KG * weightKg
  const fatKcal = Math.max(fatKcalFromPct, fatMinG * KCAL_PER_GRAM.fat)
  const fatG = Math.round(fatKcal / KCAL_PER_GRAM.fat)
  explanation.push(
    fatKcalFromPct >= fatMinG * KCAL_PER_GRAM.fat
      ? `Grasa: 25 % de ${n(targetKcal)} kcal = ${n(fatKcal)} kcal ÷ 9 = ${fatG} g.`
      : `Grasa: el 25 % (${n(fatKcalFromPct / KCAL_PER_GRAM.fat)} g) queda bajo el mínimo de ${FAT_MIN_G_PER_KG} g/kg, así que se usan ${fatG} g (${n(fatKcal)} kcal).`,
  )

  // 7. Carbohidratos: el resto (hacia abajo para no exceder la meta), nunca negativo
  const restKcal = targetKcal - proteinKcal - fatKcal
  let carbsG = Math.floor(Number((restKcal / KCAL_PER_GRAM.carbs).toFixed(9)))
  if (restKcal < 0) {
    carbsG = 0
    warnings.push({
      code: 'CARBS_CLAMPED',
      message:
        'La proteína y la grasa mínimas ya superan tu meta; los carbohidratos quedan en 0 g.',
    })
    explanation.push(
      `Carbohidratos: ${n(targetKcal)} − ${n(proteinKcal)} − ${n(fatKcal)} es negativo, así que quedan en 0 g.`,
    )
  } else {
    explanation.push(
      `Carbohidratos: (${n(targetKcal)} − ${n(proteinKcal)} − ${n(fatKcal)}) ÷ 4 = ${carbsG} g.`,
    )
  }

  // 8. Cambio esperado
  const expectedKgPerWeek = roundTo(((targetKcal - tdeeKcal) * 7) / KCAL_PER_KG_BODY_WEIGHT, 2) || 0
  explanation.push(
    `Cambio esperado: (${n(targetKcal)} − ${n(tdeeKcal)}) × 7 ÷ 7,700 ≈ ${expectedKgPerWeek > 0 ? '+' : ''}${n(expectedKgPerWeek, 2)} kg/semana.`,
  )

  // Avisos contextuales
  if (goal === 'recomp' && trainingDays === 0) {
    warnings.push({
      code: 'RECOMP_NO_TRAINING',
      message:
        'La recomposición requiere entrenamiento de fuerza. Agrega días de pesas o elige déficit.',
    })
  }
  if (goal === 'gain' && bodyFatPct != null && bodyFatPct > GAIN_HIGH_BODY_FAT_PCT[sex]) {
    warnings.push({
      code: 'GAIN_HIGH_BODY_FAT',
      message: `Con ${n(bodyFatPct, 1)} % de grasa conviene primero un déficit o una recomposición antes de buscar ganancia muscular.`,
    })
  }

  return {
    bmr: bmrKcal,
    tdee: tdeeKcal,
    bmrFormula: b.formula,
    adjustPct,
    targetKcal,
    proteinG,
    fatG,
    carbsG,
    expectedKgPerWeek,
    safetyFloorApplied,
    isManualOverride,
    warnings,
    explanation,
  }
}
