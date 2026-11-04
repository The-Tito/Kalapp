import { env } from 'cloudflare:test'
import { AdaptiveTdeeResultSchema, addDays, DEFAULT_TIMEZONE, toLocalDate } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, entryInput, json, PROFILE_INPUT, resetDb } from '../test/helpers'

beforeEach(resetDb)

const today = () => toLocalDate(new Date(), DEFAULT_TIMEZONE)

/** Inserta registros directo en D1 (más rápido que 28 POST) con `kcal` totales por día. */
async function seedDays(dates: string[], kcal: number) {
  await env.DB.batch(
    dates.map((d) =>
      env.DB.prepare(
        `INSERT INTO entries (id, local_date, eaten_at, meal_type, source, total_kcal,
           total_protein_g, total_carbs_g, total_fat_g, created_at)
         VALUES (?, ?, ?, 'lunch', 'manual', ?, 0, 0, 0, ?)`,
      ).bind(crypto.randomUUID(), d, `${d}T14:00:00-06:00`, kcal, new Date().toISOString()),
    ),
  )
}

describe('GET /api/adaptive', () => {
  it('sin perfil → 409 PROFILE_REQUIRED', async () => {
    const res = await api('/api/adaptive')
    expect(res.status).toBe(409)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('PROFILE_REQUIRED')
  })

  it('datos insuficientes → insufficient_data', async () => {
    await json('/api/profile', 'PUT', PROFILE_INPUT)
    await json('/api/entries', 'POST', entryInput({ localDate: today() }))
    const res = await api('/api/adaptive')
    expect(res.status).toBe(200)
    const r = AdaptiveTdeeResultSchema.parse(await res.json())
    expect(r.status).toBe('insufficient_data')
    if (r.status === 'insufficient_data') expect(r.reason).toBe('LOW_LOGGING')
  })

  it('28 días registrados y pesos separados → ok con gasto estimado', async () => {
    await json('/api/profile', 'PUT', PROFILE_INPUT)
    const to = today()
    const from = addDays(to, -27)
    await seedDays(
      Array.from({ length: 28 }, (_, i) => addDays(from, i)),
      2200,
    )
    // Un registro fuera de la ventana no cuenta.
    await seedDays([addDays(from, -1)], 9000)
    await json('/api/weights', 'POST', { localDate: from, weightKg: 80 })
    await json('/api/weights', 'POST', { localDate: to, weightKg: 79 })
    const res = await api('/api/adaptive')
    const r = AdaptiveTdeeResultSchema.parse(await res.json())
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    // 2200 + (1/27 kg/día × 7700) ≈ 2485 → 2490
    expect(r.estimatedTdee).toBe(2490)
    expect(r.avgIntakeKcal).toBe(2200)
    expect(r.loggedDaysRatio).toBe(1)
  })
})
