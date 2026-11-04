/**
 * Casos límite y entradas imposibles en las funciones públicas de @kalapp/shared (QA, M1).
 * Las pruebas marcadas con "BUG" fallan a propósito: documentan un defecto real.
 * Datos ficticios (ex:reference-male y variantes); nunca datos del usuario.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ADAPTIVE_TDEE,
  AdaptiveTdeeResultSchema,
  AnalyzePhotoFieldsSchema,
  adaptiveTdee,
  addDays,
  ageOn,
  BirthDateSchema,
  bmi,
  buildRangeSummary,
  DateRangeQuerySchema,
  daysBetween,
  EntryItemInputSchema,
  eachDay,
  hasEnergyMismatch,
  isValidLocalDate,
  isValidTimeZone,
  ProfileInputSchema,
  productToItem,
  RangeSummarySchema,
  RecommendationSchema,
  recalcItemFromGrams,
  recommend,
  scaleItems,
  toAnalysisProposal,
  toLocalDate,
  toLocalHour,
} from './index'

const AS_OF = '2026-11-04'
const base = {
  sex: 'male' as const,
  birthDate: '1998-06-15',
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate' as const,
  trainingDays: 3,
  goal: 'deficit' as const,
  intensity: 'moderate' as const,
}
const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code)

/** Contrato: o lanza RangeError, o devuelve algo que cumple el esquema publicado. */
function expectValidOrRangeError<T>(
  fn: () => T,
  schema: { safeParse: (v: unknown) => { success: boolean } },
) {
  let result: T
  try {
    result = fn()
  } catch (e) {
    expect(e).toBeInstanceOf(RangeError)
    return
  }
  expect(schema.safeParse(result).success).toBe(true)
}

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Fechas, zonas horarias, bisiestos y horario de verano
// ---------------------------------------------------------------------------
describe('fechas y zonas', () => {
  it('isValidLocalDate: bisiestos y fechas inexistentes', () => {
    expect(isValidLocalDate('2024-02-29')).toBe(true)
    expect(isValidLocalDate('2000-02-29')).toBe(true)
    expect(isValidLocalDate('2025-02-29')).toBe(false)
    expect(isValidLocalDate('2100-02-29')).toBe(false)
    expect(isValidLocalDate('2024-13-01')).toBe(false)
    expect(isValidLocalDate('2024-00-10')).toBe(false)
    expect(isValidLocalDate('2024-01-00')).toBe(false)
    expect(isValidLocalDate('2024-04-31')).toBe(false)
    expect(isValidLocalDate('2024-1-01')).toBe(false)
    expect(isValidLocalDate(' 2024-01-01')).toBe(false)
  })

  it('addDays / daysBetween / eachDay cruzan bisiestos y años', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(addDays('2025-02-28', 1)).toBe('2025-03-01')
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29')
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366)
    expect(daysBetween('2025-01-01', '2026-01-01')).toBe(365)
    expect(eachDay('2024-01-02', '2024-01-01')).toEqual([])
    expect(eachDay('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
    expect(() => addDays('2025-02-29', 1)).toThrow(RangeError)
    expect(() => daysBetween('2024-13-01', '2024-12-01')).toThrow(RangeError)
    expect(() => addDays('2024-01-01', Number.NaN)).toThrow(RangeError)
  })

  it('daysBetween no se altera por horario de verano (fechas locales en UTC)', () => {
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2)
  })

  it('toLocalDate / toLocalHour con cambios de horario', () => {
    // Nueva York: salto de primavera 2026-03-08 02:00 → 03:00
    expect(toLocalHour('2026-03-08T07:30:00Z', 'America/New_York')).toBe(3)
    expect(toLocalDate('2026-03-08T07:30:00Z', 'America/New_York')).toBe('2026-03-08')
    // Regreso de otoño 2026-11-01: la 1:30 ocurre dos veces
    expect(toLocalHour('2026-11-01T05:30:00Z', 'America/New_York')).toBe(1)
    expect(toLocalHour('2026-11-01T06:30:00Z', 'America/New_York')).toBe(1)
    // CDMX ya no tiene horario de verano (desde 2023): UTC−6 todo el año
    expect(toLocalHour('2026-07-01T05:30:00Z', 'America/Mexico_City')).toBe(23)
    expect(toLocalDate('2026-07-01T05:30:00Z', 'America/Mexico_City')).toBe('2026-06-30')
    // UTC+14 y UTC−11 el mismo instante
    expect(toLocalDate('2026-11-04T10:30:00Z', 'Pacific/Kiritimati')).toBe('2026-11-05')
    expect(toLocalDate('2026-11-04T10:30:00Z', 'Pacific/Pago_Pago')).toBe('2026-11-03')
  })

  it('zonas inválidas lanzan RangeError', () => {
    expect(isValidTimeZone('Mars/Base')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(() => toLocalDate(new Date('2026-11-04T12:00:00Z'), 'Mars/Base')).toThrow(RangeError)
    expect(() => toLocalHour(new Date('2026-11-04T12:00:00Z'), '')).toThrow(RangeError)
    expect(() => toLocalDate('no es fecha', 'UTC')).toThrow(RangeError)
    expect(() => ageOn('2000-01-01', new Date('2026-11-04T12:00:00Z'), 'Nope/Nope')).toThrow(
      RangeError,
    )
    expect(() =>
      recommend({ ...base, timezone: 'Mars/Base' }, new Date('2026-11-04T12:00:00Z')),
    ).toThrow(RangeError)
  })

  it('ageOn: nacidos un 29 de febrero, birthDate = hoy', () => {
    expect(ageOn('2000-02-29', '2025-02-28')).toBe(24)
    expect(ageOn('2000-02-29', '2025-03-01')).toBe(25)
    expect(ageOn('2000-02-29', '2024-02-29')).toBe(24)
    expect(ageOn(AS_OF, AS_OF)).toBe(0)
    expect(ageOn('2012-11-04', AS_OF)).toBe(14)
    expect(ageOn('2012-11-05', AS_OF)).toBe(13)
    expect(ageOn('1926-11-04', AS_OF)).toBe(100)
    expect(ageOn('1926-11-05', AS_OF)).toBe(99)
  })

  it('BUG ageOn: asOf con fecha inexistente debe lanzar RangeError (hoy la corrige en silencio)', () => {
    // new Date('2025-02-29') → 2025-03-01; ageOn devuelve 25 en vez de rechazar la fecha.
    expect(() => ageOn('2000-01-01', '2025-02-29')).toThrow(RangeError)
  })

  it('BUG recommend: asOf con fecha inexistente debe lanzar RangeError', () => {
    expect(() => recommend(base, '2025-02-29')).toThrow(RangeError)
  })

  it('recommend: asOf 2024-13-01 lanza RangeError', () => {
    expect(() => recommend(base, '2024-13-01')).toThrow(RangeError)
  })

  it('recommend: asOf instante se convierte con la zona del perfil (cumpleaños a medianoche)', () => {
    const p = { ...base, birthDate: '1998-11-04' }
    // 05:00Z = 23:00 del 3 de noviembre en CDMX → aún 27 años
    expect(recommend(p, '2026-11-04T05:00:00Z').bmr).toBe(1764)
    expect(recommend(p, '2026-11-04T07:00:00Z').bmr).toBe(1759)
    expect(recommend({ ...p, timezone: 'UTC' }, '2026-11-04T05:00:00Z').bmr).toBe(1759)
  })
})

// ---------------------------------------------------------------------------
// Esquema de fecha de nacimiento: bordes 14 / 100 años, hoy, futuro
// ---------------------------------------------------------------------------
describe('BirthDateSchema en los bordes de edad', () => {
  it('14 y 100 exactos pasan; 13 y 101 no; hoy y futuro no', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
    expect(BirthDateSchema.safeParse('2012-11-04').success).toBe(true) // 14 hoy
    expect(BirthDateSchema.safeParse('2012-11-05').success).toBe(false) // 13
    expect(BirthDateSchema.safeParse('1926-11-04').success).toBe(true) // 100 hoy
    expect(BirthDateSchema.safeParse('1925-11-05').success).toBe(true) // 100 (cumple 101 mañana)
    expect(BirthDateSchema.safeParse('1925-11-04').success).toBe(false) // 101
    expect(BirthDateSchema.safeParse('2026-11-04').success).toBe(false) // 0 años
    expect(BirthDateSchema.safeParse('2026-11-06').success).toBe(false) // futura
    expect(BirthDateSchema.safeParse('2025-02-29').success).toBe(false)
    expect(BirthDateSchema.safeParse('2024-13-01').success).toBe(false)
  })

  it('29 de febrero bisiesto válido como fecha de nacimiento', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T12:00:00Z'))
    expect(BirthDateSchema.safeParse('2000-02-29').success).toBe(true)
    expect(BirthDateSchema.safeParse('2001-02-29').success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// recommend: entradas imposibles y bordes
// ---------------------------------------------------------------------------
describe('recommend con entradas imposibles', () => {
  it('BUG: NaN en peso no debe producir una Recommendation inválida', () => {
    expectValidOrRangeError(
      () => recommend({ ...base, weightKg: Number.NaN }, AS_OF),
      RecommendationSchema,
    )
  })
  it('BUG: peso negativo no debe producir proteína negativa', () => {
    expectValidOrRangeError(
      () => recommend({ ...base, weightKg: -80 }, AS_OF),
      RecommendationSchema,
    )
  })
  it('BUG: estatura Infinity no debe producir NaN', () => {
    expectValidOrRangeError(
      () => recommend({ ...base, heightCm: Number.POSITIVE_INFINITY }, AS_OF),
      RecommendationSchema,
    )
  })

  it('% de grasa 70 con 30 kg: masa magra 9 kg, BMR 564, el piso sube a 1,500', () => {
    const r = recommend({ ...base, weightKg: 30, bodyFatPct: 70 }, AS_OF)
    expect(r.bmrFormula).toBe('katch')
    expect(r.bmr).toBe(564)
    expect(r.targetKcal).toBe(1500)
    expect(r.safetyFloorApplied).toBe(true)
    expect(RecommendationSchema.safeParse(r).success).toBe(true)
  })

  it('% de grasa 3 (mínimo del esquema) con 350 kg sigue siendo coherente', () => {
    const r = recommend({ ...base, weightKg: 350, heightCm: 250, bodyFatPct: 3 }, AS_OF)
    expect(r.bmr).toBe(Math.round(370 + 21.6 * 350 * 0.97))
    expect(RecommendationSchema.safeParse(r).success).toBe(true)
  })

  it('IMC extremo (350 kg, 100 cm): proteína sobre 25 kg; grasa por mínimo 0.6 g/kg del peso real', () => {
    const r = recommend({ ...base, weightKg: 350, heightCm: 100 }, AS_OF)
    expect(r.proteinG).toBe(55) // 2.2 × 25 kg
    expect(r.fatG).toBe(210) // 0.6 × 350
    expect(r.carbsG).toBeGreaterThanOrEqual(0)
    expect(RecommendationSchema.safeParse(r).success).toBe(true)
  })

  it('IMC extremo bajo (30 kg, 250 cm)', () => {
    const r = recommend({ ...base, weightKg: 30, heightCm: 250 }, AS_OF)
    expect(r.proteinG).toBe(66)
    expect(r.fatG).toBe(60)
    expect(RecommendationSchema.safeParse(r).success).toBe(true)
  })

  it('IMC exactamente 30 no usa peso ajustado (91.875 kg, 175 cm)', () => {
    expect(bmi(91.875, 175)).toBe(30)
    expect(recommend({ ...base, weightKg: 91.875 }, AS_OF).proteinG).toBe(Math.round(2.2 * 91.875))
  })

  it('IMC 30 exacto con valores capturables no cruza el umbral por coma flotante', () => {
    // 109 cm, 35.643 kg → IMC 30 (sin ruido que active el peso ajustado)
    const w = 35.643
    expect(bmi(w, 109)).toBeLessThanOrEqual(30)
  })

  it('birthDate = asOf (0 años) y birthDate futura no lanzan pero el esquema las rechaza antes', () => {
    expect(recommend({ ...base, birthDate: AS_OF }, AS_OF).bmr).toBe(1899)
    expect(ProfileInputSchema.safeParse({ ...base, birthDate: '2030-01-01' }).success).toBe(false)
  })

  it('edades 14 y 100 exactas', () => {
    expect(recommend({ ...base, birthDate: '2012-11-04' }, AS_OF).bmr).toBe(
      Math.round(800 + 1093.75 - 70 + 5),
    )
    expect(recommend({ ...base, birthDate: '1926-11-04' }, AS_OF).bmr).toBe(
      Math.round(800 + 1093.75 - 500 + 5),
    )
  })
})

describe('recommend: meta manual en los bordes', () => {
  it('800 (mínimo del esquema): avisa bajo el piso y carbs en 0', () => {
    const r = recommend({ ...base, manualTargetKcal: 800 }, AS_OF)
    expect(r.targetKcal).toBe(800)
    expect(r.isManualOverride).toBe(true)
    expect(r.safetyFloorApplied).toBe(false)
    expect(codes(r)).toEqual(['BELOW_SAFETY_FLOOR', 'CARBS_CLAMPED'])
    expect(r.carbsG).toBe(0)
  })
  it('6000 (máximo del esquema)', () => {
    const r = recommend({ ...base, manualTargetKcal: 6000 }, AS_OF)
    expect(r.targetKcal).toBe(6000)
    expect(r.proteinG).toBe(176)
    expect(r.fatG).toBe(167)
    expect(r.carbsG).toBe(949)
    expect(codes(r)).toEqual([])
    expect(r.expectedKgPerWeek).toBeCloseTo(((6000 - 2726) * 7) / 7700, 2)
  })
  it('exactamente en el piso (1,800 = BMR 1,758.75 redondeado a 50): sin aviso', () => {
    expect(codes(recommend({ ...base, manualTargetKcal: 1800 }, AS_OF))).toEqual([])
    expect(codes(recommend({ ...base, manualTargetKcal: 1799 }, AS_OF))).toEqual([
      'BELOW_SAFETY_FLOOR',
    ])
  })
  it('meta manual igual al TDEE: cambio esperado 0 (no −0)', () => {
    expect(
      Object.is(recommend({ ...base, manualTargetKcal: 2726 }, AS_OF).expectedKgPerWeek, 0),
    ).toBe(true)
  })
  it('esquema: 799, 6001 y 800.5 se rechazan; 800 y 6000 pasan', () => {
    const m = ProfileInputSchema.shape.manualTargetKcal
    expect(m.safeParse(799).success).toBe(false)
    expect(m.safeParse(6001).success).toBe(false)
    expect(m.safeParse(800.5).success).toBe(false)
    expect(m.safeParse(800).success).toBe(true)
    expect(m.safeParse(6000).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Ítems: 0 g / 0 kcal, energyMismatch, escalado
// ---------------------------------------------------------------------------
const item = { name: 'Arroz', grams: 100, kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3 }

describe('ítems en los bordes', () => {
  it('scaleItems: 0.25 y 10 inclusivos; fuera, NaN e Infinity lanzan', () => {
    expect(scaleItems([item], 0.25)[0]).toMatchObject({ grams: 25, kcal: 33, carbsG: 7 })
    expect(scaleItems([item], 10)[0]).toMatchObject({ grams: 1000, kcal: 1300, carbsG: 280 })
    for (const f of [0.2499, 10.0001, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => scaleItems([item], f)).toThrow(RangeError)
    }
    expect(scaleItems([], 2)).toEqual([])
  })

  it('scaleItems con ítem de 0 g / 0 kcal se queda en 0', () => {
    const zero = { ...item, grams: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
    expect(scaleItems([zero], 2)[0]).toMatchObject({ grams: 0, kcal: 0, proteinG: 0 })
  })

  it('recalcItemFromGrams: 0 g, NaN, negativos', () => {
    expect(recalcItemFromGrams(item, 0)).toMatchObject({ grams: 0, kcal: 0, proteinG: 0 })
    expect(() => recalcItemFromGrams(item, Number.NaN)).toThrow(RangeError)
    expect(() => recalcItemFromGrams(item, -1)).toThrow(RangeError)
    expect(() => recalcItemFromGrams(item, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  it('hasEnergyMismatch: borde del 15 % y de 20 kcal', () => {
    // 100 kcal declaradas; 4/4/9 = 115 → justo 15 % (no supera)
    expect(hasEnergyMismatch({ kcal: 100, proteinG: 0, carbsG: 28.75, fatG: 0 })).toBe(false)
    expect(hasEnergyMismatch({ kcal: 100, proteinG: 0, carbsG: 28.76, fatG: 0 })).toBe(true)
    expect(hasEnergyMismatch({ kcal: 100, proteinG: 0, carbsG: 21.25, fatG: 0 })).toBe(false)
    expect(hasEnergyMismatch({ kcal: 19.9, proteinG: 50, carbsG: 0, fatG: 0 })).toBe(false)
    expect(hasEnergyMismatch({ kcal: 20, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(true)
  })

  it('BUG: 0 kcal declaradas con macros de 850 kcal debe marcar discrepancia', () => {
    // El filtro "< 20 kcal" mira solo las kcal declaradas; un ítem con kcal 0 y
    // macros grandes (error típico del modelo) pasa sin alerta.
    expect(hasEnergyMismatch({ kcal: 0, proteinG: 50, carbsG: 50, fatG: 50 })).toBe(true)
  })

  it('toAnalysisProposal con ítem de 0 g y 0 kcal valida', () => {
    const p = toAnalysisProposal(
      {
        title: 'Agua',
        items: [
          { name: 'Agua', grams: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, confidence: 'high' },
        ],
        assumptions: [],
        questions: [],
        confidence: 'high',
      },
      'gemini-test',
    )
    expect(p.totals).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
    expect(p.energyMismatch).toBe(false)
  })
})

describe('productToItem en los bordes', () => {
  const product = {
    code: '7501234567890',
    name: 'Galletas',
    brand: null,
    per100g: { kcal: 480, proteinG: 6, carbsG: 70, fatG: 20 },
  }
  it('0 g produce un ítem en ceros que valida', () => {
    const it0 = productToItem(product, 0)
    expect(it0).toMatchObject({ grams: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
    expect(EntryItemInputSchema.safeParse(it0).success).toBe(true)
  })
  it('NaN e Infinity lanzan', () => {
    expect(() => productToItem(product, Number.NaN)).toThrow(RangeError)
    expect(() => productToItem(product, Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })
  it('BUG menor: gramos sobre el máximo del esquema (5,000) deben rechazarse', () => {
    expectValidOrRangeError(() => productToItem(product, 6000), EntryItemInputSchema)
  })
})

// ---------------------------------------------------------------------------
// Multipart: localHour vacío
// ---------------------------------------------------------------------------
describe('AnalyzePhotoFieldsSchema', () => {
  it('BUG: localHour vacío ("") no debe convertirse en 0 (medianoche)', () => {
    const r = AnalyzePhotoFieldsSchema.safeParse({ localHour: '' })
    expect(r.success && r.data.localHour === 0).toBe(false)
  })
  it('localHour "23" pasa, "24" y "abc" no', () => {
    expect(AnalyzePhotoFieldsSchema.parse({ localHour: '23' }).localHour).toBe(23)
    expect(AnalyzePhotoFieldsSchema.safeParse({ localHour: '24' }).success).toBe(false)
    expect(AnalyzePhotoFieldsSchema.safeParse({ localHour: 'abc' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Resúmenes: 366 / 367 días
// ---------------------------------------------------------------------------
describe('rangos de resumen', () => {
  it('DateRangeQuery: 366 días (año bisiesto completo) pasa, 367 no', () => {
    expect(DateRangeQuerySchema.safeParse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(
      true,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2024-01-01', to: '2025-01-01' }).success).toBe(
      false,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-01' }).success).toBe(
      true,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success).toBe(
      false,
    )
  })
  it('DateRangeQuery con fechas inexistentes no lanza: devuelve error', () => {
    expect(() =>
      DateRangeQuerySchema.safeParse({ from: '2024-13-01', to: '2025-01-01' }),
    ).not.toThrow()
    expect(DateRangeQuerySchema.safeParse({ from: '2024-13-01', to: '2025-01-01' }).success).toBe(
      false,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2025-02-29' }).success).toBe(
      false,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2025-02-01', to: '2025-01-01' }).success).toBe(
      false,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2025-01-01' }).success).toBe(
      true,
    )
  })
  it('buildRangeSummary: rango invertido da vacío; rango de 367 días se construye', () => {
    const e = { localDate: '2024-01-15', totals: { kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 } }
    expect(buildRangeSummary([e], '2024-02-01', '2024-01-01').days).toEqual([])
    const s = buildRangeSummary([e], '2024-01-01', '2025-01-01')
    expect(s.loggedDays).toBe(1)
    expect(RangeSummarySchema.safeParse(s).success).toBe(true)
  })
  it('buildRangeSummary incluye los extremos del rango', () => {
    const t = { kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 }
    const s = buildRangeSummary(
      [
        { localDate: '2023-12-31', totals: t },
        { localDate: '2024-01-01', totals: t },
        { localDate: '2024-12-31', totals: t },
        { localDate: '2025-01-01', totals: t },
      ],
      '2024-01-01',
      '2024-12-31',
    )
    expect(s.days.map((d) => d.localDate)).toEqual(['2024-01-01', '2024-12-31'])
  })
})

// ---------------------------------------------------------------------------
// adaptiveTdee
// ---------------------------------------------------------------------------
const adBase = {
  currentTargetKcal: 2200,
  goal: 'deficit' as const,
  intensity: 'moderate' as const,
  sex: 'male' as const,
  bmr: 1759,
}
const daysFrom = (from: string, n: number, kcal = 2500) =>
  Array.from({ length: n }, (_, i) => ({ localDate: addDays(from, i), kcal }))

describe('adaptiveTdee en los bordes', () => {
  it('ratio exacto 0.8 (12 de 15, 16 de 20) se acepta', () => {
    const w = [
      { localDate: '2026-01-01', weightKg: 80 },
      { localDate: '2026-01-15', weightKg: 80 },
    ]
    const r15 = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 12),
      weights: w,
      from: '2026-01-01',
      to: '2026-01-15',
    })
    expect(r15.status).toBe('ok')
    const r20 = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 16),
      weights: w,
      from: '2026-01-01',
      to: '2026-01-20',
    })
    expect(r20.status).toBe('ok')
    const r14 = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 11),
      weights: w,
      from: '2026-01-01',
      to: '2026-01-14',
    })
    expect(r14).toMatchObject({ status: 'insufficient_data', reason: 'LOW_LOGGING', daysNeeded: 1 })
  })

  it('rango de exactamente 14 días pasa; 13 no', () => {
    const w = [
      { localDate: '2026-01-01', weightKg: 80 },
      { localDate: '2026-01-13', weightKg: 80 },
    ]
    expect(
      adaptiveTdee({
        ...adBase,
        days: daysFrom('2026-01-01', 13),
        weights: w,
        from: '2026-01-01',
        to: '2026-01-13',
      }),
    ).toMatchObject({ reason: 'RANGE_TOO_SHORT', daysNeeded: 1 })
    expect(
      adaptiveTdee({
        ...adBase,
        days: daysFrom('2026-01-01', 14),
        weights: w,
        from: '2026-01-01',
        to: '2026-01-14',
      }).status,
    ).toBe('ok')
  })

  it('todos los pesos el mismo día → NOT_ENOUGH_WEIGHTS', () => {
    const r = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 14),
      weights: [
        { localDate: '2026-01-05', weightKg: 80 },
        { localDate: '2026-01-05', weightKg: 81 },
        { localDate: '2026-01-05', weightKg: 79 },
      ],
      from: '2026-01-01',
      to: '2026-01-14',
    })
    expect(r).toMatchObject({ status: 'insufficient_data', reason: 'NOT_ENOUGH_WEIGHTS' })
  })

  it('pesos separados 7 días exactos pasan; 6 no', () => {
    const run = (to: string) =>
      adaptiveTdee({
        ...adBase,
        days: daysFrom('2026-01-01', 14),
        weights: [
          { localDate: '2026-01-01', weightKg: 80 },
          { localDate: to, weightKg: 79.3 },
        ],
        from: '2026-01-01',
        to: '2026-01-14',
      }).status
    expect(run('2026-01-08')).toBe('ok')
    expect(run('2026-01-07')).toBe('insufficient_data')
  })

  it('pesos fuera de rango se ignoran (no cuentan para el span de 7 días)', () => {
    const r = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 14),
      weights: [
        { localDate: '2025-12-01', weightKg: 85 },
        { localDate: '2026-01-08', weightKg: 79.3 },
      ],
      from: '2026-01-01',
      to: '2026-01-14',
    })
    expect(r).toMatchObject({ reason: 'NOT_ENOUGH_WEIGHTS' })
  })

  it('pesos repetidos el mismo día: el último de la lista sustituye', () => {
    const r = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 14, 2000),
      weights: [
        { localDate: '2026-01-01', weightKg: 90 },
        { localDate: '2026-01-01', weightKg: 80 },
        { localDate: '2026-01-14', weightKg: 80 },
      ],
      from: '2026-01-01',
      to: '2026-01-14',
    })
    expect(r).toMatchObject({ status: 'ok', estimatedTdee: 2000, weightTrendKgPerWeek: 0 })
  })

  it('varios registros el mismo día se suman como un solo día', () => {
    const r = adaptiveTdee({
      ...adBase,
      days: [...daysFrom('2026-01-01', 14, 1000), ...daysFrom('2026-01-01', 14, 1500)],
      weights: [
        { localDate: '2026-01-01', weightKg: 80 },
        { localDate: '2026-01-14', weightKg: 80 },
      ],
      from: '2026-01-01',
      to: '2026-01-14',
    })
    expect(r).toMatchObject({ status: 'ok', avgIntakeKcal: 2500, loggedDaysRatio: 1 })
  })

  it('días fuera de rango no cuentan para el 80 %', () => {
    const r = adaptiveTdee({
      ...adBase,
      days: [...daysFrom('2026-01-01', 10), ...daysFrom('2025-12-01', 10)],
      weights: [],
      from: '2026-01-01',
      to: '2026-01-14',
    })
    expect(r).toMatchObject({ reason: 'LOW_LOGGING', daysNeeded: 2 })
  })

  it('fechas inexistentes en el rango lanzan RangeError', () => {
    expect(() =>
      adaptiveTdee({ ...adBase, days: [], weights: [], from: '2025-02-29', to: '2025-03-31' }),
    ).toThrow(RangeError)
  })

  it('BUG: rango invertido no debe decir que faltan más de 14 días', () => {
    let r: ReturnType<typeof adaptiveTdee>
    try {
      r = adaptiveTdee({ ...adBase, days: [], weights: [], from: '2026-01-31', to: '2026-01-01' })
    } catch (e) {
      expect(e).toBeInstanceOf(RangeError)
      return
    }
    // Hoy: { reason: 'RANGE_TOO_SHORT', daysNeeded: 43, message: '… faltan 43.' }
    expect(r.status === 'insufficient_data' ? (r.daysNeeded ?? 0) : 0).toBeLessThanOrEqual(
      ADAPTIVE_TDEE.minRangeDays,
    )
  })

  it('BUG: kcal NaN no debe producir un resultado inválido ("~NaN kcal")', () => {
    expectValidOrRangeError(
      () =>
        adaptiveTdee({
          ...adBase,
          days: daysFrom('2026-01-01', 14, Number.NaN),
          weights: [
            { localDate: '2026-01-01', weightKg: 80 },
            { localDate: '2026-01-14', weightKg: 80 },
          ],
          from: '2026-01-01',
          to: '2026-01-14',
        }),
      AdaptiveTdeeResultSchema,
    )
  })

  it('BUG: nunca muestra un gasto estimado negativo al usuario', () => {
    // Ingesta 0 y +10 kg en 13 días → estimatedTdee −5,920; el mensaje dice "~-5,920 kcal".
    const r = adaptiveTdee({
      ...adBase,
      days: daysFrom('2026-01-01', 14, 0),
      weights: [
        { localDate: '2026-01-01', weightKg: 80 },
        { localDate: '2026-01-14', weightKg: 90 },
      ],
      from: '2026-01-01',
      to: '2026-01-14',
    })
    if (r.status === 'ok') expect(r.estimatedTdee).toBeGreaterThan(0)
  })
})
