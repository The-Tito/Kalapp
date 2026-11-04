/** Redondea a `decimals` decimales evitando errores típicos de coma flotante. */
export function roundTo(value: number, decimals = 0): number {
  const f = 10 ** decimals
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f
}

/** Cociente limpio de ruido de coma flotante (ej. 161.49999999999997 → 161.5). */
function cleanRatio(value: number, step: number): number {
  return Number((value / step).toFixed(9))
}

/** Redondea al múltiplo de `step` más cercano (las mitades hacia arriba). */
export function roundToStep(value: number, step: number): number {
  return Math.round(cleanRatio(value, step)) * step
}

/** Redondea hacia arriba al múltiplo de `step`. */
export function ceilToStep(value: number, step: number): number {
  return Math.ceil(cleanRatio(value, step)) * step
}
