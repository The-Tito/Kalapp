import { DEFAULT_TIMEZONE, isValidTimeZone, toLocalDate } from '@kalapp/shared'

/** Instante actual en ISO 8601 UTC (con milisegundos). */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Zona válida o la predeterminada (America/Mexico_City). */
export function safeTimeZone(tz: string | null | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE
}

/** Fecha local de hoy en la zona dada. */
export function todayIn(tz: string | null | undefined): string {
  return toLocalDate(new Date(), safeTimeZone(tz))
}
