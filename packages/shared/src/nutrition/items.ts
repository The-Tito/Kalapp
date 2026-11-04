import {
  ENERGY_MISMATCH_MIN_KCAL,
  ENERGY_MISMATCH_TOLERANCE,
  KCAL_PER_GRAM,
  SCALE_FACTOR_MAX,
  SCALE_FACTOR_MIN,
} from '../constants'
import type { AiAnalysisOutput, AnalysisProposal } from '../schemas/analysis'
import type { MacroTotals } from '../schemas/common'
import { roundTo } from '../utils/math'

export interface Macros {
  proteinG: number
  carbsG: number
  fatG: number
}

export interface NutritionItem extends Macros {
  grams: number
  kcal: number
}

/** kcal a partir de macros: 4·P + 4·C + 9·G. */
export function energyFromMacros(m: Macros): number {
  return (
    m.proteinG * KCAL_PER_GRAM.protein + m.carbsG * KCAL_PER_GRAM.carbs + m.fatG * KCAL_PER_GRAM.fat
  )
}

/**
 * `true` si las kcal declaradas difieren de 4/4/9 más que `tolerance` (relativo a las kcal
 * declaradas). Se ignoran ítems con menos de 20 kcal.
 */
export function hasEnergyMismatch(
  item: Macros & { kcal: number },
  tolerance = ENERGY_MISMATCH_TOLERANCE,
): boolean {
  if (item.kcal < ENERGY_MISMATCH_MIN_KCAL) return false
  return Math.abs(energyFromMacros(item) - item.kcal) / item.kcal > tolerance
}

/** Suma de kcal (entero) y macros (1 decimal). */
export function sumTotals(items: readonly (Macros & { kcal: number })[]): MacroTotals {
  let kcal = 0
  let proteinG = 0
  let carbsG = 0
  let fatG = 0
  for (const it of items) {
    kcal += it.kcal
    proteinG += it.proteinG
    carbsG += it.carbsG
    fatG += it.fatG
  }
  return {
    kcal: Math.round(kcal),
    proteinG: roundTo(proteinG, 1),
    carbsG: roundTo(carbsG, 1),
    fatG: roundTo(fatG, 1),
  }
}

function scaleOne<T extends NutritionItem>(item: T, factor: number, grams?: number): T {
  return {
    ...item,
    grams: grams ?? roundTo(item.grams * factor, 1),
    kcal: Math.round(item.kcal * factor),
    proteinG: roundTo(item.proteinG * factor, 1),
    carbsG: roundTo(item.carbsG * factor, 1),
    fatG: roundTo(item.fatG * factor, 1),
  }
}

/**
 * Multiplica porciones (½×, 2×…). `factor` entre 0.25 y 10; si no, lanza `RangeError`.
 * Gramos y macros a 1 decimal; kcal a entero. Conserva el resto de los campos.
 */
export function scaleItems<T extends NutritionItem>(items: readonly T[], factor: number): T[] {
  if (!Number.isFinite(factor) || factor < SCALE_FACTOR_MIN || factor > SCALE_FACTOR_MAX) {
    throw new RangeError(`El factor debe estar entre ${SCALE_FACTOR_MIN} y ${SCALE_FACTOR_MAX}`)
  }
  return items.map((it) => scaleOne(it, factor))
}

/**
 * Recalcula kcal y macros proporcionalmente a `newGrams`. Si el ítem tenía 0 g no hay base
 * para escalar: solo cambian los gramos.
 */
export function recalcItemFromGrams<T extends NutritionItem>(item: T, newGrams: number): T {
  if (!Number.isFinite(newGrams) || newGrams < 0) throw new RangeError('Gramos inválidos')
  if (item.grams <= 0) return { ...item, grams: newGrams }
  return scaleOne(item, newGrams / item.grams, newGrams)
}

/** Convierte la salida del modelo en la propuesta que responde `/api/analyze`. */
export function toAnalysisProposal(output: AiAnalysisOutput, model: string): AnalysisProposal {
  return {
    title: output.title,
    items: output.items,
    assumptions: output.assumptions,
    questions: output.questions,
    totals: sumTotals(output.items),
    energyMismatch: output.items.some((it) => hasEnergyMismatch(it)),
    model,
    confidence: output.confidence,
  }
}
