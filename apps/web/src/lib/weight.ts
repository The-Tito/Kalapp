import {
  ADAPTIVE_TDEE,
  ADAPTIVE_WINDOW_DAYS,
  type AdaptiveTdeeResult,
  addDays,
  daysBetween,
  formatNumber,
  roundTo,
  shouldSuggestRecalc,
  type Weight,
} from '@kalapp/shared'

export interface WeightPoint {
  localDate: string
  weightKg: number
  /** Media móvil de los pesos registrados en los 7 días que terminan en esta fecha. */
  trendKg: number
}

/**
 * Media móvil por calendario: para cada peso promedia los registrados en
 * `[fecha − (window − 1), fecha]`. Los días sin peso no cuentan. Entrada en cualquier orden.
 */
export function movingAverage(
  weights: readonly Pick<Weight, 'localDate' | 'weightKg'>[],
  window = 7,
): WeightPoint[] {
  const sorted = [...weights].sort((a, b) => a.localDate.localeCompare(b.localDate))
  return sorted.map((w, i) => {
    let sum = 0
    let n = 0
    for (let j = i; j >= 0; j--) {
      const prev = sorted[j]
      if (!prev || daysBetween(prev.localDate, w.localDate) >= window) break
      sum += prev.weightKg
      n++
    }
    return { localDate: w.localDate, weightKg: w.weightKg, trendKg: roundTo(sum / n, 2) }
  })
}

/** Último peso registrado (por fecha). */
export function latestWeight<T extends Pick<Weight, 'localDate'>>(weights: readonly T[]): T | null {
  let latest: T | null = null
  for (const w of weights) if (!latest || w.localDate > latest.localDate) latest = w
  return latest
}

/**
 * ¿Mostrar "Tu peso cambió; ¿actualizar tu perfil?"? Solo si el último peso difiere más de
 * 2 kg del perfil y el usuario no descartó ya ese mismo peso.
 */
export function recalcSuggestion(
  profileWeightKg: number,
  weights: readonly Pick<Weight, 'localDate' | 'weightKg'>[],
  dismissedKey: string | null = null,
): { weightKg: number; localDate: string; key: string } | null {
  const latest = latestWeight(weights)
  if (!latest) return null
  if (!shouldSuggestRecalc(profileWeightKg, latest.weightKg)) return null
  const key = `${latest.localDate}:${latest.weightKg}`
  if (key === dismissedKey) return null
  return { weightKg: latest.weightKg, localDate: latest.localDate, key }
}

export interface AdaptiveProgress {
  /** Texto bajo la barra; null cuando el `message` de la API ya lo dice (fuente de verdad). */
  label: string | null
  value: number
  max: number
}

/** Progreso hacia el gasto adaptativo cuando aún faltan datos. */
export function adaptiveProgress(
  result: AdaptiveTdeeResult,
  weights: readonly Pick<Weight, 'localDate'>[],
  today: string,
): AdaptiveProgress | null {
  if (result.status !== 'insufficient_data') return null
  if (
    (result.reason === 'LOW_LOGGING' || result.reason === 'RANGE_TOO_SHORT') &&
    result.daysNeeded !== undefined
  ) {
    // Barra: días registrados hacia los necesarios (80 % de la ventana). El conteo en texto lo
    // da el `message` de la API ("Registraste X de 28 días…"); aquí no se repite.
    const max = Math.ceil(ADAPTIVE_TDEE.minLoggedRatio * ADAPTIVE_WINDOW_DAYS - 1e-9)
    const value = Math.max(0, Math.min(max, max - result.daysNeeded))
    return { label: null, value, max }
  }
  if (result.reason === 'NOT_ENOUGH_WEIGHTS') {
    const from = addDays(today, -(ADAPTIVE_WINDOW_DAYS - 1))
    const dates = weights
      .map((w) => w.localDate)
      .filter((d) => d >= from && d <= today)
      .sort()
    const max = ADAPTIVE_TDEE.minWeightSpanDays
    const first = dates[0]
    const last = dates[dates.length - 1]
    const span = first && last ? daysBetween(first, last) : 0
    const value = Math.min(max, span)
    const label =
      dates.length === 0
        ? 'Aún no hay pesos en las últimas 4 semanas'
        : `${formatNumber(dates.length)} ${dates.length === 1 ? 'peso' : 'pesos'}; ${formatNumber(value)} de ${formatNumber(max)} días entre el primero y el último`
    return { label, value, max }
  }
  return null
}
