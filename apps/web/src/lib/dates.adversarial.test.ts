import { toLocalDate } from '@kalapp/shared'
import { describe, expect, it } from 'vitest'
import { entryTiming, moveEatenAt, toIsoWithOffset, zonedIso } from './dates'

const sameLocalDate = (iso: string, tz: string) => toLocalDate(new Date(iso), tz)

describe('fechas (adversarial)', () => {
  it('NY 2026-03-08 02:30 (hora inexistente) cae el mismo día y es ISO válido', () => {
    const iso = zonedIso('2026-03-08', { h: 2, m: 30, s: 0 }, 'America/New_York')
    expect(iso).toMatch(/^2026-03-08T0[13]:30:00-0[45]:00$/)
    expect(sameLocalDate(iso, 'America/New_York')).toBe('2026-03-08')
  })

  it('NY 2026-11-01 01:30 (hora duplicada) se resuelve de forma determinista', () => {
    const iso = zonedIso('2026-11-01', { h: 1, m: 30, s: 0 }, 'America/New_York')
    expect(['2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00']).toContain(iso)
  })

  it('medianoche exacta y 23:59:59 en UTC+14 y UTC−11 no cambian de día', () => {
    for (const tz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      for (const t of [
        { h: 0, m: 0, s: 0 },
        { h: 23, m: 59, s: 59 },
      ]) {
        const iso = zonedIso('2026-11-04', t, tz)
        expect(sameLocalDate(iso, tz)).toBe('2026-11-04')
      }
    }
  })

  it('toIsoWithOffset con offset de media hora (India) y milisegundos', () => {
    expect(toIsoWithOffset(new Date('2026-11-04T10:00:00.999Z'), 'Asia/Kolkata')).toBe(
      '2026-11-04T15:30:00+05:30',
    )
  })

  it('BUG: Santiago, inicio de horario de verano a medianoche: 00:15 del 2026-09-06 cae en el día anterior', () => {
    // En Chile el reloj salta de 00:00 a 01:00; zonedIso retrocede a 23:15 del día 5.
    const iso = zonedIso('2026-09-06', { h: 0, m: 15, s: 0 }, 'America/Santiago')
    expect(sameLocalDate(iso, 'America/Santiago')).toBe('2026-09-06')
  })

  it('BUG: registrar "en este día" en un día con salto a medianoche deja eatenAt en otro día que localDate', () => {
    // Ahora: 2026-09-10 00:20 en Santiago; registrar para el 2026-09-06.
    const now = new Date('2026-09-10T03:20:00Z')
    const t = entryTiming(now, 'America/Santiago', '2026-09-06')
    expect(t.localDate).toBe('2026-09-06')
    expect(sameLocalDate(t.eatenAt, 'America/Santiago')).toBe(t.localDate)
  })

  it('registrar en un día pasado cerca de medianoche (CDMX 23:58) conserva el día elegido', () => {
    const now = new Date('2026-11-05T05:58:00Z') // 23:58 del 4 en CDMX
    const t = entryTiming(now, 'America/Mexico_City', '2026-11-02')
    expect(t.localDate).toBe('2026-11-02')
    expect(t.eatenAt).toBe('2026-11-02T23:58:00-06:00')
  })

  it('a las 00:01 "hoy" ya es el día nuevo (sin targetDate)', () => {
    const now = new Date('2026-11-05T06:01:00Z') // 00:01 del 5 en CDMX
    expect(entryTiming(now, 'America/Mexico_City').localDate).toBe('2026-11-05')
  })

  it('moveEatenAt con eatenAt basura cae a mediodía del nuevo día', () => {
    expect(moveEatenAt('no-es-fecha', '2026-11-01', 'America/Mexico_City')).toBe(
      '2026-11-01T12:00:00-06:00',
    )
  })

  it('moveEatenAt a través de un cambio de horario conserva la hora local', () => {
    const iso = moveEatenAt('2026-11-04T08:15:00-05:00', '2026-10-30', 'America/New_York')
    expect(iso).toBe('2026-10-30T08:15:00-04:00')
  })
})
