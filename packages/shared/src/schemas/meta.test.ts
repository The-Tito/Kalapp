import { describe, expect, it } from 'vitest'
import { recommend } from '../nutrition/recommend'
import { API_ERROR_MESSAGES, API_ERROR_STATUS, ApiErrorCodeSchema, apiError } from './api'
import { ExportJsonSchema, HealthSchema, UsageSchema } from './meta'
import { ProfileInputSchema } from './profile'

const UUID = '3f1c2b7e-9a4d-4c1e-8f2a-6b5d4e3c2a10'
const NOW = '2026-11-04T13:05:00-06:00'

const item = {
  name: 'Tortilla de maíz',
  grams: 60,
  kcal: 130,
  proteinG: 3.4,
  carbsG: 27,
  fatG: 1.4,
}
const totals = { kcal: 130, proteinG: 3.4, carbsG: 27, fatG: 1.4 }

const entry = {
  id: UUID,
  localDate: '2026-11-04',
  eatenAt: NOW,
  mealType: 'lunch',
  source: 'text',
  items: [item],
  aiModel: null,
  aiConfidence: null,
  totals,
  createdAt: NOW,
}
const weight = { id: 'w1', localDate: '2026-11-04', weightKg: 80, createdAt: NOW }
const favorite = {
  id: UUID,
  name: 'Tacos',
  items: [item],
  totals,
  usesCount: 2,
  createdAt: NOW,
  lastUsedAt: null,
}

function buildProfile() {
  const input = ProfileInputSchema.parse({
    sex: 'male',
    birthDate: '1998-06-15',
    heightCm: 175,
    weightKg: 80,
    activityLevel: 'moderate',
    trainingDays: 3,
    goal: 'deficit',
    intensity: 'moderate',
  })
  return { ...input, ...recommend(input, '2026-11-04'), updatedAt: NOW }
}

describe('HealthSchema', () => {
  it('acepta ok y rechaza otro estado', () => {
    expect(HealthSchema.parse({ status: 'ok', app: 'Kalapp' })).toEqual({
      status: 'ok',
      app: 'Kalapp',
    })
    expect(HealthSchema.safeParse({ status: 'down', app: 'Kalapp' }).success).toBe(false)
    expect(HealthSchema.safeParse({ status: 'ok' }).success).toBe(false)
  })
})

describe('UsageSchema', () => {
  it('valida enteros y límites', () => {
    expect(UsageSchema.safeParse({ date: '2026-11-04', calls: 0, limit: 1 }).success).toBe(true)
    expect(UsageSchema.safeParse({ date: '2026-11-04', calls: -1, limit: 30 }).success).toBe(false)
    expect(UsageSchema.safeParse({ date: '2026-11-04', calls: 1.5, limit: 30 }).success).toBe(false)
    expect(UsageSchema.safeParse({ date: '2026-11-04', calls: 0, limit: 0 }).success).toBe(false)
    expect(UsageSchema.safeParse({ date: '2026-02-30', calls: 0, limit: 30 }).success).toBe(false)
  })
})

describe('ExportJsonSchema', () => {
  it('acepta exportación completa', () => {
    const body = {
      exportedAt: NOW,
      from: '2026-11-01',
      to: '2026-11-04',
      profile: buildProfile(),
      entries: [entry],
      weights: [weight],
      favorites: [favorite],
    }
    expect(ExportJsonSchema.safeParse(body).success).toBe(true)
  })
  it('acepta nulls y listas vacías', () => {
    const body = {
      exportedAt: '2026-11-04T19:05:00Z',
      from: null,
      to: null,
      profile: null,
      entries: [],
      weights: [],
      favorites: [],
    }
    expect(ExportJsonSchema.safeParse(body).success).toBe(true)
  })
  it('rechaza campos faltantes o inválidos', () => {
    const base = {
      exportedAt: NOW,
      from: null,
      to: null,
      profile: null,
      entries: [],
      weights: [],
      favorites: [],
    }
    expect(ExportJsonSchema.safeParse({ ...base, exportedAt: '2026-11-04' }).success).toBe(false)
    expect(ExportJsonSchema.safeParse({ ...base, from: undefined }).success).toBe(false)
    expect(
      ExportJsonSchema.safeParse({ ...base, entries: [{ ...entry, totals: undefined }] }).success,
    ).toBe(false)
  })
})

describe('códigos de error nuevos', () => {
  it('NOT_FOOD y UPSTREAM_UNAVAILABLE', () => {
    expect(ApiErrorCodeSchema.options).toContain('NOT_FOOD')
    expect(ApiErrorCodeSchema.options).toContain('UPSTREAM_UNAVAILABLE')
    expect(API_ERROR_STATUS.NOT_FOOD).toBe(422)
    expect(API_ERROR_STATUS.UPSTREAM_UNAVAILABLE).toBe(503)
    expect(apiError('NOT_FOOD').error.message).toBe(
      'No se detectó comida; intenta con otra foto o descríbela',
    )
    expect(API_ERROR_MESSAGES.UPSTREAM_UNAVAILABLE).toBe(
      'El servicio externo no responde; intenta más tarde',
    )
  })
  it('PAYLOAD_TOO_LARGE no fija el tamaño', () => {
    expect(API_ERROR_MESSAGES.PAYLOAD_TOO_LARGE).toBe('La imagen o los datos son demasiado grandes')
    expect(API_ERROR_MESSAGES.PAYLOAD_TOO_LARGE).not.toMatch(/MB/)
  })
  it('todos los códigos tienen estado y mensaje', () => {
    for (const code of ApiErrorCodeSchema.options) {
      expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400)
      expect(API_ERROR_MESSAGES[code].length).toBeGreaterThan(0)
    }
  })
})
