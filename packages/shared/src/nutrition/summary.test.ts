import { describe, expect, it } from 'vitest'
import { RangeSummarySchema, ShortcutDaySummarySchema } from '../schemas/summary'
import { buildRangeSummary, buildShortcutDaySummary, shouldSuggestRecalc } from './summary'

const t = (kcal: number, proteinG = 10, carbsG = 20, fatG = 5) => ({ kcal, proteinG, carbsG, fatG })

describe('buildRangeSummary', () => {
  it('agrupa por día, solo días con registros, promedia sobre días registrados', () => {
    const r = buildRangeSummary(
      [
        { localDate: '2026-11-03', totals: t(500) },
        { localDate: '2026-11-01', totals: t(700) },
        { localDate: '2026-11-01', totals: t(800) },
        { localDate: '2026-10-31', totals: t(9999) }, // fuera del rango
      ],
      '2026-11-01',
      '2026-11-07',
    )
    expect(r.days.map((d) => [d.localDate, d.kcal, d.entryCount])).toEqual([
      ['2026-11-01', 1500, 2],
      ['2026-11-03', 500, 1],
    ])
    expect(r.loggedDays).toBe(2)
    expect(r.averages).toEqual({ kcal: 1000, proteinG: 15, carbsG: 30, fatG: 7.5 })
    expect(RangeSummarySchema.safeParse(r).success).toBe(true)
  })
  it('sin registros', () => {
    const r = buildRangeSummary([], '2026-11-01', '2026-11-07')
    expect(r).toEqual({
      from: '2026-11-01',
      to: '2026-11-07',
      days: [],
      loggedDays: 0,
      averages: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    })
  })
})

describe('buildShortcutDaySummary', () => {
  it('calcula lo restante', () => {
    const s = buildShortcutDaySummary('2026-11-04', t(1800), 2200)
    expect(s).toEqual({ localDate: '2026-11-04', ...t(1800), targetKcal: 2200, remainingKcal: 400 })
    expect(ShortcutDaySummarySchema.safeParse(s).success).toBe(true)
  })
  it('sin perfil ni registros', () => {
    expect(buildShortcutDaySummary('2026-11-04', null, null)).toEqual({
      localDate: '2026-11-04',
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      targetKcal: null,
      remainingKcal: null,
    })
  })
})

describe('shouldSuggestRecalc', () => {
  it('> 2 kg de diferencia', () => {
    expect(shouldSuggestRecalc(80, 82)).toBe(false)
    expect(shouldSuggestRecalc(80, 82.1)).toBe(true)
    expect(shouldSuggestRecalc(80, 77.9)).toBe(true)
  })
})
