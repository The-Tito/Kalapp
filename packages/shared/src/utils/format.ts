const LOCALE = 'es-MX'

const integerFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const oneDecimalFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 })

/** Número con separadores es-MX y hasta `maxDecimals` decimales (ej. 2726.4 → "2,726"). */
export function formatNumber(value: number, maxDecimals = 0): string {
  if (maxDecimals === 0) return integerFormat.format(value)
  if (maxDecimals === 1) return oneDecimalFormat.format(value)
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: maxDecimals }).format(value)
}

/** "2,200 kcal" */
export function formatKcal(value: number): string {
  return `${integerFormat.format(value)} kcal`
}

/** "176 g", "3.4 g" (hasta 1 decimal). */
export function formatGrams(value: number): string {
  return `${oneDecimalFormat.format(value)} g`
}

/** Signo menos tipográfico (U+2212) para mostrar negativos en la UI. */
export const MINUS_SIGN = '−'

/**
 * Número con signo explícito: "+" para positivos, "−" (U+2212) para negativos, sin signo para 0.
 * `decimals` = máximo de decimales (es-MX). Ej. (-0.25, 2) → "−0.25"; (1500, 0) → "+1,500".
 */
export function formatSignedNumber(value: number, decimals = 0): string {
  const abs = formatNumber(Math.abs(value), decimals)
  // Si redondea a 0 (ej. -0.001 con 0 decimales) no lleva signo.
  if (abs === formatNumber(0, decimals)) return abs
  return `${value < 0 ? MINUS_SIGN : '+'}${abs}`
}

/** Porcentaje con signo: (-20) → "−20 %", (15) → "+15 %", (0) → "0 %". Hasta 1 decimal. */
export function formatSignedPct(value: number): string {
  return `${formatSignedNumber(value, 1)} %`
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** Tamaño en bytes con base 1024 (es-MX, hasta 1 decimal): 1_048_576 → "1 MB", 524_288 → "512 KB". */
export function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${oneDecimalFormat.format(value)} ${BYTE_UNITS[unit]}`
}
