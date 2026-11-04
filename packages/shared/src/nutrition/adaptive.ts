import {
  ADAPTIVE_TDEE,
  type GoalValue,
  getAdjustPct,
  type IntensityValue,
  KCAL_PER_KG_BODY_WEIGHT,
  type SexValue,
  TARGET_ROUNDING_KCAL,
} from '../constants'
import type { AdaptiveTdeeResult } from '../schemas/adaptive'
import { daysBetween } from '../utils/dates'
import { formatNumber } from '../utils/format'
import { roundTo, roundToStep } from '../utils/math'
import { safetyFloorKcal } from './energy'

export interface AdaptiveTdeeInput {
  /** Solo días con registro: kcal totales del día. Fuera de [from, to] se ignoran. */
  days: readonly { localDate: string; kcal: number }[]
  weights: readonly { localDate: string; weightKg: number }[]
  from: string
  to: string
  currentTargetKcal: number
  goal: GoalValue
  intensity: IntensityValue
  /** Para el piso de seguridad (igual que `recommend`). */
  sex: SexValue
  /** Metabolismo en reposo del perfil (kcal). */
  bmr: number
}

/** Pendiente por mínimos cuadrados (y por unidad de x). */
export function linearSlope(points: readonly { x: number; y: number }[]): number {
  const count = points.length
  if (count < 2) return 0
  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  const mx = sx / count
  const my = sy / count
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? 0 : num / den
}

/**
 * Gasto adaptativo: ingesta media − pendiente de peso (kg/día) × 7,700.
 * Requiere rango ≥ 14 días, ≥ 80 % de días registrados y ≥ 2 pesos separados ≥ 7 días.
 * Solo propone; nunca cambia la meta.
 * Lanza `RangeError` si `from > to`, si hay fechas inexistentes o si alguna kcal o peso no es
 * un número finito ≥ 0. Si el gasto estimado queda fuera de 800–6,000 kcal devuelve
 * `insufficient_data` con `IMPLAUSIBLE_RESULT`.
 */
export function adaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult {
  const { from, to } = input
  if (daysBetween(from, to) < 0) {
    throw new RangeError(`Rango invertido: ${from} > ${to}`)
  }
  for (const d of input.days) {
    if (!Number.isFinite(d.kcal) || d.kcal < 0) {
      throw new RangeError(`kcal inválidas el ${d.localDate}: ${d.kcal}`)
    }
  }
  for (const w of input.weights) {
    if (!Number.isFinite(w.weightKg) || w.weightKg <= 0) {
      throw new RangeError(`Peso inválido el ${w.localDate}: ${w.weightKg}`)
    }
  }
  const rangeDays = daysBetween(from, to) + 1
  if (rangeDays < ADAPTIVE_TDEE.minRangeDays) {
    const daysNeeded = Math.max(0, ADAPTIVE_TDEE.minRangeDays - rangeDays)
    return {
      status: 'insufficient_data',
      reason: 'RANGE_TOO_SHORT',
      daysNeeded,
      message: `Se necesitan al menos ${ADAPTIVE_TDEE.minRangeDays} días de datos; faltan ${daysNeeded}.`,
    }
  }

  const intake = new Map<string, number>()
  for (const d of input.days) {
    if (d.localDate < from || d.localDate > to) continue
    intake.set(d.localDate, (intake.get(d.localDate) ?? 0) + d.kcal)
  }
  const loggedDays = intake.size
  const ratio = loggedDays / rangeDays
  if (ratio < ADAPTIVE_TDEE.minLoggedRatio) {
    const daysNeeded = Math.ceil(ADAPTIVE_TDEE.minLoggedRatio * rangeDays - 1e-9) - loggedDays
    return {
      status: 'insufficient_data',
      reason: 'LOW_LOGGING',
      daysNeeded,
      message: `Registraste ${loggedDays} de ${rangeDays} días; se necesita al menos el 80 % (faltan ${daysNeeded}).`,
    }
  }

  const weightByDay = new Map<string, number>()
  for (const w of input.weights) {
    if (w.localDate < from || w.localDate > to) continue
    weightByDay.set(w.localDate, w.weightKg) // el último sustituye
  }
  const weightDates = [...weightByDay.keys()].sort()
  const first = weightDates[0]
  const last = weightDates[weightDates.length - 1]
  if (
    weightDates.length < ADAPTIVE_TDEE.minWeights ||
    first === undefined ||
    last === undefined ||
    daysBetween(first, last) < ADAPTIVE_TDEE.minWeightSpanDays
  ) {
    return {
      status: 'insufficient_data',
      reason: 'NOT_ENOUGH_WEIGHTS',
      message: `Registra tu peso al menos 2 veces con ${ADAPTIVE_TDEE.minWeightSpanDays} días o más de diferencia.`,
    }
  }

  const slopeKgPerDay = linearSlope(
    weightDates.map((d) => ({ x: daysBetween(from, d), y: weightByDay.get(d) ?? 0 })),
  )
  let sum = 0
  for (const k of intake.values()) sum += k
  const avgIntake = sum / loggedDays
  const estimatedTdee = roundToStep(
    avgIntake - slopeKgPerDay * KCAL_PER_KG_BODY_WEIGHT,
    ADAPTIVE_TDEE.roundingKcal,
  )
  const plausible = ADAPTIVE_TDEE.plausibleTdeeKcal
  if (estimatedTdee < plausible.min || estimatedTdee > plausible.max) {
    return {
      status: 'insufficient_data',
      reason: 'IMPLAUSIBLE_RESULT',
      message:
        'Los registros de comida y peso no dan un gasto creíble; revisa que estén completos y vuelve a intentarlo en unos días.',
    }
  }
  const adjustPct = getAdjustPct(input.goal, input.intensity)
  const computed = roundToStep(estimatedTdee * (1 + adjustPct / 100), TARGET_ROUNDING_KCAL)
  const floor = safetyFloorKcal(input.sex, input.bmr)
  const safetyFloorApplied = computed < floor
  const suggestedTargetKcal = safetyFloorApplied ? floor : computed
  const deltaKcal = suggestedTargetKcal - input.currentTargetKcal

  const fmt = (v: number) => formatNumber(v)
  const message =
    deltaKcal === 0
      ? `Tu gasto real parece ser ~${fmt(estimatedTdee)} kcal; tu meta actual (${fmt(input.currentTargetKcal)} kcal) va bien.`
      : `Tu gasto real parece ser ~${fmt(estimatedTdee)} kcal. ¿Actualizar tu meta de ${fmt(input.currentTargetKcal)} a ${fmt(suggestedTargetKcal)} kcal?`

  return {
    status: 'ok',
    estimatedTdee,
    avgIntakeKcal: Math.round(avgIntake),
    weightTrendKgPerWeek: roundTo(slopeKgPerDay * 7, 2) || 0,
    loggedDaysRatio: roundTo(ratio, 2),
    suggestedTargetKcal,
    deltaKcal,
    safetyFloorApplied,
    message,
  }
}
