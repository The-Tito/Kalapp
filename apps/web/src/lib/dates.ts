import { addDays, DEFAULT_TIMEZONE, isValidTimeZone, toLocalDate } from '@kalapp/shared'

/** Zona horaria del dispositivo, o la predeterminada si Intl no la da o no es válida. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && isValidTimeZone(tz)) return tz
  } catch {
    // Intl incompleto
  }
  return DEFAULT_TIMEZONE
}

export function todayIn(timezone: string, now: Date = new Date()): string {
  return toLocalDate(now, timezone)
}

/** Minutos de diferencia entre la hora local de `timezone` y UTC en el instante `date`. */
export function timeZoneOffsetMinutes(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  )
  const instant = Math.floor(date.getTime() / 1000) * 1000
  return Math.round((asUtc - instant) / 60_000)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** ISO 8601 en la hora local de `timezone` con su offset (ej. 2026-11-04T13:05:00-06:00). */
export function toIsoWithOffset(date: Date, timezone: string): string {
  const offset = timeZoneOffsetMinutes(date, timezone)
  const local = new Date(Math.floor(date.getTime() / 1000) * 1000 + offset * 60_000)
  const base = local.toISOString().slice(0, 19)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return `${base}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

const dayFormat = new Intl.DateTimeFormat('es-MX', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
})

/** "Hoy", "Ayer" o "lunes, 2 de noviembre". */
export function formatDayLabel(localDate: string, today: string): string {
  if (localDate === today) return 'Hoy'
  if (localDate === addDays(today, -1)) return 'Ayer'
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number]
  const label = dayFormat.format(new Date(Date.UTC(y, m - 1, d)))
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** Hora local "13:05" de un ISO en la zona del perfil. */
export function formatTime(iso: string, timezone: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

/** Hora local (h, m, s) de un instante en `timezone`. */
export function localTimeParts(date: Date, timezone: string): { h: number; m: number; s: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0')
  return { h: get('hour') % 24, m: get('minute'), s: get('second') }
}

/**
 * Instante ISO con offset para la fecha local `localDate` a la hora `h:m:s` de `timezone`
 * (respeta el offset de ESE día, por si hay horario de verano).
 * - Hora duplicada (se atrasa el reloj): la primera ocurrencia.
 * - Hora inexistente (se adelanta el reloj): avanza lo que dure el salto (02:30 → 03:30;
 *   00:15 → 01:15), nunca retrocede al día anterior.
 * Garantiza `toLocalDate(resultado, timezone) === localDate`.
 */
export function zonedIso(
  localDate: string,
  time: { h: number; m: number; s: number },
  timezone: string,
): string {
  const [y, mo, d] = localDate.split('-').map(Number) as [number, number, number]
  const wall = Date.UTC(y, mo - 1, d, time.h, time.m, time.s)
  const wallOf = (instant: number) =>
    instant + timeZoneOffsetMinutes(new Date(instant), timezone) * 60_000
  // Offsets alrededor de la hora pedida (antes y después de un posible cambio).
  const before = timeZoneOffsetMinutes(new Date(wall - 12 * 3_600_000), timezone)
  const after = timeZoneOffsetMinutes(new Date(wall + 12 * 3_600_000), timezone)
  const candidates = [wall - before * 60_000, wall - after * 60_000].sort((a, b) => a - b)
  let instant = candidates.find((c) => wallOf(c) === wall)
  // Hora inexistente: con el offset de antes del salto cae justo después del salto.
  if (instant === undefined) instant = wall - before * 60_000
  let iso = toIsoWithOffset(new Date(instant), timezone)
  if (toLocalDate(new Date(instant), timezone) !== localDate) {
    // Último recurso: mediodía de ese día (nunca hay cambios de horario a mediodía).
    const noon = Date.UTC(y, mo - 1, d, 12, 0, 0)
    iso = toIsoWithOffset(
      new Date(noon - timeZoneOffsetMinutes(new Date(noon), timezone) * 60_000),
      timezone,
    )
  }
  return iso
}

/**
 * `localDate` y `eatenAt` de un registro nuevo. Sin `targetDate` (o si es hoy) es el instante
 * actual; con un día pasado es ese día a la hora local actual.
 */
export function entryTiming(
  now: Date,
  timezone: string,
  targetDate?: string | null,
): { localDate: string; eatenAt: string } {
  const today = toLocalDate(now, timezone)
  if (!targetDate || targetDate === today) {
    return { localDate: today, eatenAt: toIsoWithOffset(now, timezone) }
  }
  return {
    localDate: targetDate,
    eatenAt: zonedIso(targetDate, localTimeParts(now, timezone), timezone),
  }
}

/** Mueve `eatenAt` a otra fecha local conservando la hora local. */
export function moveEatenAt(eatenAt: string, newDate: string, timezone: string): string {
  const d = new Date(eatenAt)
  if (Number.isNaN(d.getTime())) return zonedIso(newDate, { h: 12, m: 0, s: 0 }, timezone)
  return zonedIso(newDate, localTimeParts(d, timezone), timezone)
}

/** "4 nov" (fecha corta para gráficas y listas). */
export function formatShortDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d)))
    .replace('.', '')
}
