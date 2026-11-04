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
