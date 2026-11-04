import { describe, expect, it } from 'vitest'
import {
  formatDayLabel,
  formatTime,
  timeZoneOffsetMinutes,
  todayIn,
  toIsoWithOffset,
} from './dates'

describe('fechas locales', () => {
  it('offset de la zona en el instante', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-11-04T18:00:00Z'), 'America/Mexico_City')).toBe(
      -360,
    )
    expect(timeZoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'), 'America/Tijuana')).toBe(-420)
    expect(timeZoneOffsetMinutes(new Date('2026-01-01T12:00:00Z'), 'Asia/Kolkata')).toBe(330)
  })

  it('toIsoWithOffset da la hora local con su offset', () => {
    const d = new Date('2026-11-04T19:05:42.123Z')
    expect(toIsoWithOffset(d, 'America/Mexico_City')).toBe('2026-11-04T13:05:42-06:00')
    expect(toIsoWithOffset(d, 'UTC')).toBe('2026-11-04T19:05:42+00:00')
    expect(toIsoWithOffset(d, 'Asia/Kolkata')).toBe('2026-11-05T00:35:42+05:30')
  })

  it('el ISO generado representa el mismo instante', () => {
    const d = new Date('2026-03-08T09:59:59Z')
    expect(new Date(toIsoWithOffset(d, 'America/New_York')).getTime()).toBe(
      new Date('2026-03-08T09:59:59Z').getTime(),
    )
  })

  it('todayIn usa la zona del perfil', () => {
    const now = new Date('2026-11-05T03:00:00Z')
    expect(todayIn('America/Mexico_City', now)).toBe('2026-11-04')
    expect(todayIn('UTC', now)).toBe('2026-11-05')
  })

  it('etiquetas de día en español', () => {
    expect(formatDayLabel('2026-11-04', '2026-11-04')).toBe('Hoy')
    expect(formatDayLabel('2026-11-03', '2026-11-04')).toBe('Ayer')
    expect(formatDayLabel('2026-11-02', '2026-11-04')).toBe('Lunes, 2 de noviembre')
  })

  it('formatTime en 24 h', () => {
    expect(formatTime('2026-11-04T19:05:00Z', 'America/Mexico_City')).toBe('13:05')
  })
})
