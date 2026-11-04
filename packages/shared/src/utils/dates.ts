/** Utilidades de fechas locales (YYYY-MM-DD) y zonas horarias. Sin dependencias. */

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

/** `true` si `value` es una zona IANA que entiende `Intl` (ej. "America/Mexico_City"). */
export function isValidTimeZone(value: string): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** `true` si `value` tiene forma YYYY-MM-DD y es una fecha de calendario real. */
export function isValidLocalDate(value: string): boolean {
  if (typeof value !== 'string') return false
  const m = LOCAL_DATE_RE.exec(value)
  if (!m) return false
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return false
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

function parseLocalDateToUtcMs(localDate: string): number {
  if (!isValidLocalDate(localDate)) throw new RangeError(`Fecha inválida: ${localDate}`)
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

function formatUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Fecha local YYYY-MM-DD de un instante en la zona indicada.
 * Lanza `RangeError` si la fecha o la zona no son válidas.
 */
export function toLocalDate(date: Date | string | number, timezone: string): string {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) throw new RangeError('Fecha inválida')
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Hora local (0–23) de un instante en la zona indicada. */
export function toLocalHour(date: Date | string | number, timezone: string): number {
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) throw new RangeError('Fecha inválida')
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  })
    .formatToParts(d)
    .find((p) => p.type === 'hour')?.value
  return Number(hour) % 24
}

/** Suma `n` días (puede ser negativo) a una fecha local. */
export function addDays(localDate: string, n: number): string {
  return formatUtcMs(parseLocalDateToUtcMs(localDate) + Math.trunc(n) * MS_PER_DAY)
}

/** Días de `a` a `b` (b − a). Positivo si `b` es posterior. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseLocalDateToUtcMs(b) - parseLocalDateToUtcMs(a)) / MS_PER_DAY)
}

/** Lista inclusiva de fechas locales de `from` a `to`. Vacía si `to < from`. */
export function eachDay(from: string, to: string): string[] {
  const n = daysBetween(from, to)
  const out: string[] = []
  for (let i = 0; i <= n; i++) out.push(addDays(from, i))
  return out
}
