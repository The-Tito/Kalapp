import { describe, expect, it } from 'vitest'
import { addDays, toLocalDate } from '../utils/dates'
import { AnalyzePhotoFieldsSchema, AnalyzeTextRequestSchema } from './analysis'
import { API_ERROR_STATUS, ApiErrorSchema, apiError, ExportQuerySchema } from './api'
import { BarcodeProductSchema } from './barcode'
import { IsoDateTimeSchema, LocalDateSchema } from './common'
import { EntryInputSchema, EntryPatchSchema, EntrySchema } from './entry'
import { FavoriteInputSchema } from './favorite'
import { ProfileInputSchema, ProfileSchema } from './profile'
import { DateRangeQuerySchema } from './summary'
import { WeightInputSchema } from './weight'

const UUID = '3f1c2b7e-9a4d-4c1e-8f2a-6b5d4e3c2a10'
const todayUtc = new Date().toISOString().slice(0, 10)
const todayMx = toLocalDate(new Date(), 'America/Mexico_City')
const yearsAgo = (n: number) => `${Number(todayMx.slice(0, 4)) - n}${todayMx.slice(4)}`

const profile = {
  sex: 'male',
  birthDate: '1998-06-15',
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  trainingDays: 3,
  goal: 'deficit',
  intensity: 'moderate',
}

const item = {
  name: 'Tortilla de maíz',
  grams: 60,
  kcal: 130,
  proteinG: 3.4,
  carbsG: 27,
  fatG: 1.4,
}

const entry = {
  id: UUID,
  localDate: '2026-11-04',
  eatenAt: '2026-11-04T14:05:00-06:00',
  mealType: 'lunch',
  source: 'photo',
  items: [item],
  aiModel: 'gemini-flash-latest',
  aiConfidence: 'high',
}

const issues = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? []

describe('ProfileInputSchema', () => {
  it('aplica defaults (timezone, manualTargetKcal)', () => {
    const p = ProfileInputSchema.parse(profile)
    expect(p.timezone).toBe('America/Mexico_City')
    expect(p.manualTargetKcal).toBeNull()
    expect(p.bodyFatPct).toBeUndefined()
  })
  it('acepta % de grasa null y zona válida', () => {
    const p = ProfileInputSchema.parse({ ...profile, bodyFatPct: null, timezone: 'Europe/Madrid' })
    expect(p.bodyFatPct).toBeNull()
  })
  it('rechaza fecha de nacimiento futura', () => {
    const r = ProfileInputSchema.safeParse({ ...profile, birthDate: addDays(todayUtc, 5) })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toMatch(/futura/)
  })
  it('rechaza fecha inexistente', () => {
    expect(ProfileInputSchema.safeParse({ ...profile, birthDate: '1998-02-30' }).success).toBe(
      false,
    )
  })
  it('edad 14–100', () => {
    expect(ProfileInputSchema.safeParse({ ...profile, birthDate: yearsAgo(14) }).success).toBe(true)
    expect(
      ProfileInputSchema.safeParse({ ...profile, birthDate: addDays(yearsAgo(14), 2) }).success,
    ).toBe(false)
    expect(ProfileInputSchema.safeParse({ ...profile, birthDate: yearsAgo(101) }).success).toBe(
      false,
    )
  })
  it('rechaza zona horaria inválida', () => {
    const r = ProfileInputSchema.safeParse({ ...profile, timezone: 'Mexico/Narnia' })
    expect(issues(r)).toEqual(['timezone'])
  })
  it('rechaza altura 0, NaN, fuera de rango y días no enteros', () => {
    expect(issues(ProfileInputSchema.safeParse({ ...profile, heightCm: 0 }))).toEqual(['heightCm'])
    expect(issues(ProfileInputSchema.safeParse({ ...profile, weightKg: Number.NaN }))).toEqual([
      'weightKg',
    ])
    expect(issues(ProfileInputSchema.safeParse({ ...profile, weightKg: Infinity }))).toEqual([
      'weightKg',
    ])
    expect(issues(ProfileInputSchema.safeParse({ ...profile, bodyFatPct: 2 }))).toEqual([
      'bodyFatPct',
    ])
    expect(issues(ProfileInputSchema.safeParse({ ...profile, trainingDays: 2.5 }))).toEqual([
      'trainingDays',
    ])
    expect(issues(ProfileInputSchema.safeParse({ ...profile, trainingDays: 8 }))).toEqual([
      'trainingDays',
    ])
    expect(issues(ProfileInputSchema.safeParse({ ...profile, heightCm: '175' }))).toEqual([
      'heightCm',
    ])
  })
  it('manualTargetKcal 800–6000', () => {
    expect(ProfileInputSchema.safeParse({ ...profile, manualTargetKcal: 799 }).success).toBe(false)
    expect(ProfileInputSchema.safeParse({ ...profile, manualTargetKcal: 6001 }).success).toBe(false)
    expect(ProfileInputSchema.safeParse({ ...profile, manualTargetKcal: 1800 }).success).toBe(true)
  })
  it('rechaza enums desconocidos', () => {
    expect(ProfileInputSchema.safeParse({ ...profile, goal: 'bulk' }).success).toBe(false)
    expect(ProfileInputSchema.safeParse({ ...profile, activityLevel: 'extreme' }).success).toBe(
      false,
    )
  })
})

describe('ProfileSchema', () => {
  it('perfil completo', () => {
    const r = ProfileSchema.safeParse({
      ...profile,
      timezone: 'America/Mexico_City',
      manualTargetKcal: null,
      bmr: 1759,
      tdee: 2726,
      bmrFormula: 'mifflin',
      adjustPct: -20,
      targetKcal: 2200,
      proteinG: 176,
      fatG: 61,
      carbsG: 236,
      expectedKgPerWeek: -0.48,
      safetyFloorApplied: false,
      isManualOverride: false,
      warnings: [],
      explanation: ['…'],
      updatedAt: '2026-11-04T18:00:00.000Z',
    })
    expect(r.success).toBe(true)
  })
})

describe('EntryInputSchema', () => {
  it('acepta un registro válido y recorta strings', () => {
    const e = EntryInputSchema.parse({
      ...entry,
      note: '  con salsa  ',
      items: [{ ...item, name: '  Tortilla  ' }],
    })
    expect(e.note).toBe('con salsa')
    expect(e.items[0]?.name).toBe('Tortilla')
  })
  it('acepta registro manual sin IA', () => {
    expect(
      EntryInputSchema.safeParse({ ...entry, source: 'manual', aiModel: null, aiConfidence: null })
        .success,
    ).toBe(true)
  })
  it('rechaza uuid inválido', () => {
    expect(issues(EntryInputSchema.safeParse({ ...entry, id: 'abc-123' }))).toEqual(['id'])
  })
  it('rechaza 0 y 31 ingredientes', () => {
    expect(issues(EntryInputSchema.safeParse({ ...entry, items: [] }))).toEqual(['items'])
    const many = Array.from({ length: 31 }, () => item)
    expect(issues(EntryInputSchema.safeParse({ ...entry, items: many }))).toEqual(['items'])
    expect(
      EntryInputSchema.safeParse({ ...entry, items: Array.from({ length: 30 }, () => item) })
        .success,
    ).toBe(true)
  })
  it('rechaza nombres vacíos o solo espacios', () => {
    expect(
      issues(EntryInputSchema.safeParse({ ...entry, items: [{ ...item, name: '   ' }] })),
    ).toEqual(['items.0.name'])
  })
  it('rechaza límites de ítem', () => {
    const bad = (patch: Record<string, unknown>) =>
      EntryInputSchema.safeParse({ ...entry, items: [{ ...item, ...patch }] }).success
    expect(bad({ grams: 5001 })).toBe(false)
    expect(bad({ grams: -1 })).toBe(false)
    expect(bad({ kcal: 10001 })).toBe(false)
    expect(bad({ proteinG: 1001 })).toBe(false)
    expect(bad({ fatG: Number.NaN })).toBe(false)
    expect(bad({ name: 'x'.repeat(121) })).toBe(false)
    expect(bad({ confidence: 'low' })).toBe(true)
  })
  it('rechaza nota > 500, fecha sin zona y fecha local inválida', () => {
    expect(issues(EntryInputSchema.safeParse({ ...entry, note: 'x'.repeat(501) }))).toEqual([
      'note',
    ])
    expect(
      issues(EntryInputSchema.safeParse({ ...entry, eatenAt: '2026-11-04T14:05:00' })),
    ).toEqual(['eatenAt'])
    expect(issues(EntryInputSchema.safeParse({ ...entry, localDate: '04/11/2026' }))).toEqual([
      'localDate',
    ])
  })
  it('Entry agrega totales y createdAt', () => {
    expect(
      EntrySchema.safeParse({
        ...entry,
        totals: { kcal: 130, proteinG: 3.4, carbsG: 27, fatG: 1.4 },
        createdAt: '2026-11-04T20:05:01.123Z',
      }).success,
    ).toBe(true)
  })
})

describe('EntryPatchSchema', () => {
  it('parcial, pero al menos un campo', () => {
    expect(EntryPatchSchema.safeParse({ mealType: 'dinner' }).success).toBe(true)
    expect(EntryPatchSchema.safeParse({ note: null }).success).toBe(true)
    expect(EntryPatchSchema.safeParse({}).success).toBe(false)
    expect(EntryPatchSchema.safeParse({ items: [] }).success).toBe(false)
  })
})

describe('otros esquemas', () => {
  it('AnalyzeTextRequest', () => {
    expect(
      AnalyzeTextRequestSchema.safeParse({ text: '2 tacos al pastor', localHour: 14 }).success,
    ).toBe(true)
    expect(AnalyzeTextRequestSchema.safeParse({ text: '   ' }).success).toBe(false)
    expect(AnalyzeTextRequestSchema.safeParse({ text: 'x'.repeat(501) }).success).toBe(false)
    expect(AnalyzeTextRequestSchema.safeParse({ text: 'taco', localHour: 24 }).success).toBe(false)
  })
  it('AnalyzePhotoFields convierte localHour del multipart', () => {
    expect(AnalyzePhotoFieldsSchema.parse({ localHour: '9' }).localHour).toBe(9)
    expect(AnalyzePhotoFieldsSchema.parse({ localHour: '' }).localHour).toBeUndefined()
    expect(AnalyzePhotoFieldsSchema.parse({ localHour: '   ' }).localHour).toBeUndefined()
    expect(AnalyzePhotoFieldsSchema.parse({}).localHour).toBeUndefined()
    expect(AnalyzePhotoFieldsSchema.safeParse({ localHour: 'abc' }).success).toBe(false)
    expect(AnalyzePhotoFieldsSchema.safeParse({ localHour: '9.5' }).success).toBe(false)
  })
  it('FavoriteInput y WeightInput', () => {
    expect(
      FavoriteInputSchema.safeParse({ id: UUID, name: 'Mi desayuno', items: [item] }).success,
    ).toBe(true)
    expect(FavoriteInputSchema.safeParse({ id: UUID, name: '', items: [item] }).success).toBe(false)
    expect(WeightInputSchema.safeParse({ localDate: '2026-11-04', weightKg: 79.6 }).success).toBe(
      true,
    )
    expect(WeightInputSchema.safeParse({ localDate: '2026-11-04', weightKg: 29 }).success).toBe(
      false,
    )
  })
  it('DateRangeQuery', () => {
    expect(DateRangeQuerySchema.safeParse({ from: '2026-11-01', to: '2026-11-07' }).success).toBe(
      true,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2026-11-07', to: '2026-11-01' }).success).toBe(
      false,
    )
    expect(DateRangeQuerySchema.safeParse({ from: '2025-01-01', to: '2026-11-01' }).success).toBe(
      false,
    )
  })
  it('BarcodeProduct', () => {
    const p = {
      code: '7501055300075',
      name: 'Galletas',
      per100g: { kcal: 433, proteinG: 7, carbsG: 73, fatG: 12 },
    }
    expect(BarcodeProductSchema.safeParse(p).success).toBe(true)
    expect(BarcodeProductSchema.safeParse({ ...p, code: 'abc' }).success).toBe(false)
    expect(
      BarcodeProductSchema.safeParse({ ...p, per100g: { ...p.per100g, fatG: 101 } }).success,
    ).toBe(false)
  })
  it('ApiError y ExportQuery', () => {
    const body = apiError('DAILY_LIMIT')
    expect(body.error.message).toMatch(/límite diario/)
    expect(API_ERROR_STATUS[body.error.code]).toBe(429)
    expect(ApiErrorSchema.safeParse(apiError('VALIDATION', 'x', [{ path: 'a' }])).success).toBe(
      true,
    )
    expect(ApiErrorSchema.safeParse({ error: { code: 'TEAPOT', message: 'x' } }).success).toBe(
      false,
    )
    expect(ExportQuerySchema.safeParse({ format: 'csv' }).success).toBe(true)
    expect(ExportQuerySchema.safeParse({ format: 'xml' }).success).toBe(false)
  })
  it('primitivos', () => {
    expect(LocalDateSchema.safeParse('2026-11-04').success).toBe(true)
    expect(IsoDateTimeSchema.safeParse('2026-11-04T14:05:00Z').success).toBe(true)
    expect(IsoDateTimeSchema.safeParse('2026-11-04T14:05:00.123-06:00').success).toBe(true)
    expect(IsoDateTimeSchema.safeParse('2026-11-04').success).toBe(false)
  })
})
