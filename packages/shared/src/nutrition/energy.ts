import {
  ACTIVITY_FACTORS,
  type ActivityLevelValue,
  SAFETY_FLOOR_KCAL,
  type SexValue,
  TARGET_ROUNDING_KCAL,
} from '../constants'
import { ceilToStep } from '../utils/math'

export interface BmrParams {
  sex: SexValue
  weightKg: number
  heightCm: number
  age: number
  bodyFatPct?: number | null
}

export interface BmrResult {
  /** kcal/día sin redondear. */
  value: number
  formula: 'mifflin' | 'katch'
  /** Masa magra (kg) cuando se usa Katch-McArdle. */
  leanMassKg?: number
}

/**
 * Metabolismo en reposo. Katch-McArdle (370 + 21.6·masa magra) si hay % de grasa;
 * si no, Mifflin-St Jeor (10·peso + 6.25·estatura − 5·edad + 5 H / −161 M).
 */
export function bmr(params: BmrParams): BmrResult {
  const { sex, weightKg, heightCm, age, bodyFatPct } = params
  if (bodyFatPct != null) {
    const leanMassKg = weightKg * (1 - bodyFatPct / 100)
    return { value: 370 + 21.6 * leanMassKg, formula: 'katch', leanMassKg }
  }
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return { value: base + (sex === 'male' ? 5 : -161), formula: 'mifflin' }
}

/** Gasto diario total = metabolismo en reposo × factor de actividad (sin redondear). */
export function tdee(bmrValue: number, activityLevel: ActivityLevelValue): number {
  return bmrValue * ACTIVITY_FACTORS[activityLevel].factor
}

/** Piso de seguridad: max(1,500 H / 1,200 M, BMR redondeado hacia arriba a 50). */
export function safetyFloorKcal(sex: SexValue, bmrValue: number): number {
  return Math.max(SAFETY_FLOOR_KCAL[sex], ceilToStep(bmrValue, TARGET_ROUNDING_KCAL))
}

/** Índice de masa corporal. */
export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100
  return weightKg / (m * m)
}
