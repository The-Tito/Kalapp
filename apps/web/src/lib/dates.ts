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
