import { describe, expect, it } from 'vitest'
import { adaptiveProgress, latestWeight, movingAverage, recalcSuggestion } from './weight'

const w = (localDate: string, weightKg: number) => ({ localDate, weightKg })

describe('media móvil del peso', () => {
  it('promedia los pesos de los 7 días de calendario que terminan en cada fecha', () => {
    const points = movingAverage([
      w('2026-11-08', 79),
      w('2026-11-01', 81),
      w('2026-11-02', 80),
      w('2026-11-07', 80.5),
    ])
    expect(points.map((p) => p.localDate)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-07',
      '2026-11-08',
    ])
    expect(points.map((p) => p.trendKg)).toEqual([
      81,
      80.5,
      80.5, // 01, 02 y 07 (01→07 son 6 días)
      79.83, // 02, 07, 08 (01 queda fuera: 7 días antes)
    ])
  })

  it('vacío → vacío; un solo peso → su mismo valor', () => {
    expect(movingAverage([])).toEqual([])
    expect(movingAverage([w('2026-11-01', 80)])[0]?.trendKg).toBe(80)
  })

  it('último peso por fecha', () => {
    expect(latestWeight([w('2026-11-02', 80), w('2026-11-05', 78), w('2026-11-03', 79)])).toEqual(
      w('2026-11-05', 78),
    )
    expect(latestWeight([])).toBeNull()
  })
})

describe('banner de recálculo', () => {
  it('solo si el último peso difiere más de 2 kg del perfil', () => {
    expect(recalcSuggestion(80, [w('2026-11-01', 77), w('2026-11-04', 82)])).toBeNull()
    expect(recalcSuggestion(80, [w('2026-11-01', 80), w('2026-11-04', 82.1)])).toMatchObject({
      weightKg: 82.1,
      localDate: '2026-11-04',
    })
    expect(recalcSuggestion(80, [w('2026-11-04', 77.9)])?.weightKg).toBe(77.9)
    expect(recalcSuggestion(80, [])).toBeNull()
  })

  it('no vuelve a salir si se descartó ese mismo peso, pero sí con uno nuevo', () => {
    const s = recalcSuggestion(80, [w('2026-11-04', 83)])
    expect(s).not.toBeNull()
    expect(recalcSuggestion(80, [w('2026-11-04', 83)], s?.key)).toBeNull()
    expect(recalcSuggestion(80, [w('2026-11-05', 83.4)], s?.key)).not.toBeNull()
  })
})

describe('progreso del gasto adaptativo', () => {
  it('días registrados que faltan', () => {
    const p = adaptiveProgress(
      { status: 'insufficient_data', reason: 'LOW_LOGGING', message: 'x', daysNeeded: 3 },
      [],
      '2026-11-04',
    )
    expect(p).toEqual({
      value: 20,
      max: 23,
      label: null, // el `message` de la API ("… de 28 días") es la fuente de verdad
    })
  })

  it('pesos insuficientes: cuenta los de la ventana y su separación', () => {
    const p = adaptiveProgress(
      { status: 'insufficient_data', reason: 'NOT_ENOUGH_WEIGHTS', message: 'x' },
      [w('2026-09-01', 80), w('2026-11-01', 80), w('2026-11-04', 79)],
      '2026-11-04',
    )
    expect(p).toMatchObject({ value: 3, max: 7 })
    expect(p?.label).toBe('2 pesos; 3 de 7 días entre el primero y el último')
  })

  it('ok o resultado no creíble → sin barra', () => {
    expect(
      adaptiveProgress(
        { status: 'insufficient_data', reason: 'IMPLAUSIBLE_RESULT', message: 'x' },
        [],
        '2026-11-04',
      ),
    ).toBeNull()
  })
})
