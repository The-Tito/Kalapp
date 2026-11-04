import { describe, expect, it } from 'vitest'
import { AdaptiveTdeeResultSchema } from '../schemas/adaptive'
import { addDays } from '../utils/dates'
import { type AdaptiveTdeeInput, adaptiveTdee, linearSlope } from './adaptive'

const FROM = '2026-01-01'
const TO = '2026-01-21' // 21 días

function base(overrides: Partial<AdaptiveTdeeInput> = {}): AdaptiveTdeeInput {
  return {
    days: Array.from({ length: 21 }, (_, i) => ({ localDate: addDays(FROM, i), kcal: 2000 })),
    weights: [
      { localDate: '2026-01-01', weightKg: 80 },
      { localDate: '2026-01-08', weightKg: 79.7 },
      { localDate: '2026-01-15', weightKg: 79.4 },
    ],
    from: FROM,
    to: TO,
    currentTargetKcal: 2200,
    goal: 'deficit',
    intensity: 'moderate',
    sex: 'male',
    bmr: 1759,
    ...overrides,
  }
}

describe('linearSlope', () => {
  it('pendiente exacta de una recta', () => {
    expect(
      linearSlope([
        { x: 0, y: 1 },
        { x: 2, y: 5 },
      ]),
    ).toBe(2)
    expect(linearSlope([{ x: 0, y: 1 }])).toBe(0)
    expect(
      linearSlope([
        { x: 3, y: 1 },
        { x: 3, y: 2 },
      ]),
    ).toBe(0)
  })
})

describe('adaptiveTdee', () => {
  it('rango menor a 14 días', () => {
    const r = adaptiveTdee(base({ to: '2026-01-10' }))
    expect(r).toMatchObject({
      status: 'insufficient_data',
      reason: 'RANGE_TOO_SHORT',
      daysNeeded: 4,
    })
  })

  it('menos del 80 % de días registrados', () => {
    // 16 de 21 = 76 %; se necesitan ceil(16.8) = 17 → falta 1
    const r = adaptiveTdee(base({ days: base().days.slice(0, 16) }))
    expect(r).toMatchObject({ status: 'insufficient_data', reason: 'LOW_LOGGING', daysNeeded: 1 })
    // 17 de 21 = 81 % → suficiente
    expect(adaptiveTdee(base({ days: base().days.slice(0, 17) })).status).toBe('ok')
  })

  it('ignora días fuera del rango', () => {
    const outside = Array.from({ length: 30 }, (_, i) => ({
      localDate: addDays('2025-12-01', i),
      kcal: 2000,
    }))
    const r = adaptiveTdee(base({ days: [...outside, ...base().days.slice(0, 10)] }))
    expect(r).toMatchObject({ reason: 'LOW_LOGGING' })
  })

  it('pesos insuficientes o muy juntos', () => {
    expect(adaptiveTdee(base({ weights: [{ localDate: FROM, weightKg: 80 }] }))).toMatchObject({
      reason: 'NOT_ENOUGH_WEIGHTS',
    })
    expect(
      adaptiveTdee(
        base({
          weights: [
            { localDate: '2026-01-01', weightKg: 80 },
            { localDate: '2026-01-07', weightKg: 79.5 }, // 6 días
          ],
        }),
      ),
    ).toMatchObject({ reason: 'NOT_ENOUGH_WEIGHTS' })
  })

  it('caso ok, tendencia lineal exacta (verificado a mano)', () => {
    // pendiente −0.3 kg / 7 días; gasto = 2000 + (0.3/7)·7700 = 2330
    // meta déficit moderado: 2330 · 0.8 = 1864 → 1850 (≥ piso 1800)
    const r = adaptiveTdee(base())
    expect(r).toEqual({
      status: 'ok',
      estimatedTdee: 2330,
      avgIntakeKcal: 2000,
      weightTrendKgPerWeek: -0.3,
      loggedDaysRatio: 1,
      suggestedTargetKcal: 1850,
      deltaKcal: -350,
      safetyFloorApplied: false,
      message: 'Tu gasto real parece ser ~2,330 kcal. ¿Actualizar tu meta de 2,200 a 1,850 kcal?',
    })
    expect(AdaptiveTdeeResultSchema.safeParse(r).success).toBe(true)
  })

  it('caso ok con ruido (regresión verificada a mano)', () => {
    // x = 0, 7, 14, 20; y = 80, 79.5, 79.4, 79.0 → pendiente = −10.375 / 224.75 = −0.046162 kg/día
    // ingesta: 20 de 21 días, 10×1900 + 10×2100 → 2000
    // gasto = 2000 + 0.046162·7700 = 2355.45 → 2360; tendencia −0.323 → −0.32 kg/sem
    // déficit suave: 2360 · 0.85 = 2006 → 2000
    const days = Array.from({ length: 20 }, (_, i) => ({
      localDate: addDays(FROM, i + 1),
      kcal: i % 2 === 0 ? 1900 : 2100,
    }))
    const r = adaptiveTdee(
      base({
        days,
        intensity: 'mild',
        currentTargetKcal: 2000,
        weights: [
          { localDate: '2026-01-01', weightKg: 80 },
          { localDate: '2026-01-08', weightKg: 79.5 },
          { localDate: '2026-01-15', weightKg: 79.6 },
          { localDate: '2026-01-15', weightKg: 79.4 }, // el último sustituye
          { localDate: '2026-01-21', weightKg: 79.0 },
        ],
      }),
    )
    expect(r).toMatchObject({
      status: 'ok',
      estimatedTdee: 2360,
      avgIntakeKcal: 2000,
      weightTrendKgPerWeek: -0.32,
      loggedDaysRatio: 0.95,
      suggestedTargetKcal: 2000,
      deltaKcal: 0,
    })
    if (r.status === 'ok') expect(r.message).toContain('va bien')
  })

  it('aplica el mismo piso de seguridad que recommend', () => {
    // 2330 · 0.8 = 1850 < ceil50(1900) = 1900
    const r = adaptiveTdee(base({ bmr: 1900 }))
    expect(r).toMatchObject({ status: 'ok', suggestedTargetKcal: 1900, safetyFloorApplied: true })
  })

  it('ganancia: peso subiendo reduce el gasto estimado', () => {
    const r = adaptiveTdee(
      base({
        goal: 'gain',
        weights: [
          { localDate: '2026-01-01', weightKg: 80 },
          { localDate: '2026-01-15', weightKg: 80.7 },
        ],
      }),
    )
    // pendiente 0.05 kg/día → 2000 − 385 = 1615 → 1620; +10 % = 1782 → 1800 (piso 1800)
    expect(r).toMatchObject({ status: 'ok', estimatedTdee: 1620, suggestedTargetKcal: 1800 })
  })
})
