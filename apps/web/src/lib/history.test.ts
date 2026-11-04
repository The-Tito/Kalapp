import { describe, expect, it } from 'vitest'
import {
  averageLogged,
  buildHistoryDays,
  chartData,
  historyRange,
  summaryMatches,
  weeklyAverages,
} from './history'

const day = (localDate: string, kcal: number, entryCount = 1) => ({
  localDate,
  kcal,
  proteinG: kcal / 20,
  carbsG: kcal / 10,
  fatG: kcal / 40,
  entryCount,
})

describe('historial', () => {
  it('rango inclusivo que termina hoy', () => {
    expect(historyRange('2026-11-04', 7)).toEqual({ from: '2026-10-29', to: '2026-11-04' })
    expect(historyRange('2026-03-01', 30)).toEqual({ from: '2026-01-31', to: '2026-03-01' })
    expect(historyRange('2026-11-04', 1)).toEqual({ from: '2026-11-04', to: '2026-11-04' })
  })

  it('rellena los días sin registro como vacíos (null), no como cero', () => {
    const days = buildHistoryDays(
      [day('2026-11-02', 2000), day('2026-11-04', 1800)],
      '2026-11-01',
      '2026-11-04',
    )
    expect(days.map((d) => d.localDate)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
    ])
    expect(days.map((d) => d.totals?.kcal ?? null)).toEqual([null, 2000, null, 1800])
    expect(chartData(days).map((d) => d.kcal)).toEqual([null, 2000, null, 1800])
  })

  it('ignora días con 0 registros y días fuera del rango', () => {
    const days = buildHistoryDays(
      [day('2026-11-02', 0, 0), day('2026-10-01', 999)],
      '2026-11-01',
      '2026-11-03',
    )
    expect(days.every((d) => d.totals === null)).toBe(true)
  })

  it('promedia solo sobre días registrados', () => {
    const days = buildHistoryDays(
      [day('2026-11-01', 2000), day('2026-11-03', 1500)],
      '2026-11-01',
      '2026-11-07',
    )
    const avg = averageLogged(days)
    expect(avg.loggedDays).toBe(2)
    expect(avg.totalDays).toBe(7)
    expect(avg.averages).toEqual({ kcal: 1750, proteinG: 87.5, carbsG: 175, fatG: 43.8 })
  })

  it('sin registros → promedio null', () => {
    const avg = averageLogged(buildHistoryDays([], '2026-11-01', '2026-11-07'))
    expect(avg).toEqual({ averages: null, loggedDays: 0, totalDays: 7 })
  })

  it('promedios semanales en bloques de 7 que terminan hoy (el último parcial)', () => {
    const days = buildHistoryDays(
      [day('2026-10-26', 3000), day('2026-11-04', 2000), day('2026-11-01', 1000)],
      '2026-10-26',
      '2026-11-04',
    )
    const weeks = weeklyAverages(days)
    expect(weeks.map((w) => [w.from, w.to])).toEqual([
      ['2026-10-29', '2026-11-04'],
      ['2026-10-26', '2026-10-28'],
    ])
    expect(weeks[0]?.averages?.kcal).toBe(1500)
    expect(weeks[0]?.loggedDays).toBe(2)
    expect(weeks[1]?.totalDays).toBe(3)
    expect(weeks[1]?.averages?.kcal).toBe(3000)
  })

  it('detecta si el resumen en pantalla es de otro rango', () => {
    const s = {
      from: 'a',
      to: 'b',
      days: [],
      loggedDays: 0,
      averages: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    }
    expect(summaryMatches(s, 'a', 'b')).toBe(true)
    expect(summaryMatches(s, 'a', 'c')).toBe(false)
    expect(summaryMatches(undefined, 'a', 'b')).toBe(false)
  })
})
