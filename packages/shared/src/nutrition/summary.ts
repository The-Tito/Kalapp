import { WEIGHT_DRIFT_RECALC_KG } from '../constants'
import type { MacroTotals } from '../schemas/common'
import type { DaySummary, RangeSummary, ShortcutDaySummary } from '../schemas/summary'
import { roundTo } from '../utils/math'
import { sumTotals } from './items'

export interface DatedTotals {
  localDate: string
  totals: MacroTotals
}

/**
 * Agrupa registros por día dentro de [from, to] (inclusivo) y calcula promedios sobre
 * los días con registro. Acepta `Entry[]` directamente.
 */
export function buildRangeSummary(
  entries: readonly DatedTotals[],
  from: string,
  to: string,
): RangeSummary {
  const byDay = new Map<string, MacroTotals[]>()
  for (const e of entries) {
    if (e.localDate < from || e.localDate > to) continue
    const list = byDay.get(e.localDate) ?? []
    list.push(e.totals)
    byDay.set(e.localDate, list)
  }
  const days: DaySummary[] = [...byDay.keys()].sort().map((localDate) => {
    const list = byDay.get(localDate) ?? []
    return { localDate, ...sumTotals(list), entryCount: list.length }
  })
  const count = days.length
  const total = sumTotals(days)
  const averages: MacroTotals =
    count === 0
      ? { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      : {
          kcal: Math.round(total.kcal / count),
          proteinG: roundTo(total.proteinG / count, 1),
          carbsG: roundTo(total.carbsG / count, 1),
          fatG: roundTo(total.fatG / count, 1),
        }
  return { from, to, days, loggedDays: count, averages }
}

/** Respuesta para el Atajo de iOS. `day` null = sin registros ese día. */
export function buildShortcutDaySummary(
  localDate: string,
  day: Pick<DaySummary, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'> | null,
  targetKcal: number | null,
): ShortcutDaySummary {
  const kcal = day?.kcal ?? 0
  return {
    localDate,
    kcal,
    proteinG: day?.proteinG ?? 0,
    carbsG: day?.carbsG ?? 0,
    fatG: day?.fatG ?? 0,
    targetKcal,
    remainingKcal: targetKcal === null ? null : targetKcal - kcal,
  }
}

/** `true` si el peso registrado difiere más de 2 kg del perfil (sugerir recalcular). */
export function shouldSuggestRecalc(profileWeightKg: number, latestWeightKg: number): boolean {
  return Math.abs(latestWeightKg - profileWeightKg) > WEIGHT_DRIFT_RECALC_KG
}
