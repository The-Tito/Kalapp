import {
  addDays,
  type DaySummary,
  eachDay,
  type MacroTotals,
  type RangeSummary,
} from '@kalapp/shared'

export const HISTORY_RANGES = [7, 30, 90] as const
export type HistoryRange = (typeof HISTORY_RANGES)[number]

/** Rango inclusivo de `days` días que termina en `today`. */
export function historyRange(today: string, days: number): { from: string; to: string } {
  return { from: addDays(today, -(Math.max(1, Math.trunc(days)) - 1)), to: today }
}

/** Un día del historial: `totals` null = sin registro (no es un cero). */
export interface HistoryDay {
  localDate: string
  totals: MacroTotals | null
  entryCount: number
}

/** Todos los días del rango, en orden ascendente; los que no vienen en el resumen quedan vacíos. */
export function buildHistoryDays(
  days: readonly DaySummary[],
  from: string,
  to: string,
): HistoryDay[] {
  const byDate = new Map<string, DaySummary>()
  for (const d of days) if (d.entryCount > 0) byDate.set(d.localDate, d)
  return eachDay(from, to).map((localDate) => {
    const d = byDate.get(localDate)
    return d
      ? {
          localDate,
          totals: { kcal: d.kcal, proteinG: d.proteinG, carbsG: d.carbsG, fatG: d.fatG },
          entryCount: d.entryCount,
        }
      : { localDate, totals: null, entryCount: 0 }
  })
}

export interface LoggedAverage {
  /** Promedio por día registrado; null si no hay días registrados. */
  averages: MacroTotals | null
  loggedDays: number
  totalDays: number
}

/** Promedio sobre los días con registro (los vacíos no cuentan como cero). */
export function averageLogged(days: readonly HistoryDay[]): LoggedAverage {
  const logged = days.filter((d) => d.totals !== null)
  if (logged.length === 0) return { averages: null, loggedDays: 0, totalDays: days.length }
  const sum = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  for (const d of logged) {
    const t = d.totals as MacroTotals
    sum.kcal += t.kcal
    sum.proteinG += t.proteinG
    sum.carbsG += t.carbsG
    sum.fatG += t.fatG
  }
  const n = logged.length
  return {
    averages: {
      kcal: Math.round(sum.kcal / n),
      proteinG: Math.round((sum.proteinG / n) * 10) / 10,
      carbsG: Math.round((sum.carbsG / n) * 10) / 10,
      fatG: Math.round((sum.fatG / n) * 10) / 10,
    },
    loggedDays: n,
    totalDays: days.length,
  }
}

export interface WeekAverage extends LoggedAverage {
  from: string
  to: string
}

/** Bloques de 7 días que terminan en el último día del rango (el más antiguo puede ser parcial). */
export function weeklyAverages(days: readonly HistoryDay[]): WeekAverage[] {
  const out: WeekAverage[] = []
  for (let end = days.length; end > 0; end -= 7) {
    const chunk = days.slice(Math.max(0, end - 7), end)
    const first = chunk[0]
    const last = chunk[chunk.length - 1]
    if (!first || !last) continue
    out.push({ from: first.localDate, to: last.localDate, ...averageLogged(chunk) })
  }
  return out
}

/** Datos para la gráfica: `kcal` null en días vacíos (Recharts no dibuja barra). */
export function chartData(
  days: readonly HistoryDay[],
): { localDate: string; kcal: number | null }[] {
  return days.map((d) => ({
    localDate: d.localDate,
    kcal: d.totals ? Math.round(d.totals.kcal) : null,
  }))
}

/** Rango del resumen esperado (útil para detectar un resumen de otro rango en caché). */
export function summaryMatches(
  summary: RangeSummary | undefined,
  from: string,
  to: string,
): boolean {
  return summary !== undefined && summary.from === from && summary.to === to
}
