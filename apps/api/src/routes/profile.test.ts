import { addDays, ProfileSchema, recommend } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, json, PROFILE_INPUT, resetDb } from '../test/helpers'

beforeEach(resetDb)

describe('/api/profile', () => {
  it('GET sin perfil → 404 NOT_FOUND', async () => {
    const res = await api('/api/profile')
    expect(res.status).toBe(404)
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('NOT_FOUND')
  })

  it('PUT válido recalcula con recommend() y GET devuelve lo guardado', async () => {
    const res = await json('/api/profile', 'PUT', {
      ...PROFILE_INPUT,
      // El cliente no puede imponer valores calculados: se ignoran.
      targetKcal: 999,
      bmr: 1,
    })
    expect(res.status).toBe(200)
    const profile = ProfileSchema.parse(await res.json())
    const expected = recommend({ ...PROFILE_INPUT }, new Date())
    expect(profile.targetKcal).toBe(expected.targetKcal)
    expect(profile.bmr).toBe(expected.bmr)
    expect(profile.explanation).toEqual(expected.explanation)
    expect(profile.timezone).toBe('America/Mexico_City')
    expect(profile.manualTargetKcal).toBeNull()
    expect(profile.bodyFatPct).toBeNull()

    const again = await api('/api/profile')
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(profile)
  })

  it('PUT sobrescribe la única fila y respeta la meta manual', async () => {
    await json('/api/profile', 'PUT', PROFILE_INPUT)
    const res = await json('/api/profile', 'PUT', {
      ...PROFILE_INPUT,
      bodyFatPct: 20,
      manualTargetKcal: 1900,
      timezone: 'America/Tijuana',
    })
    const p = ProfileSchema.parse(await res.json())
    expect(p.bmrFormula).toBe('katch')
    expect(p.isManualOverride).toBe(true)
    expect(p.targetKcal).toBe(1900)
    expect(p.timezone).toBe('America/Tijuana')
  })

  it('PUT inválido → 400 VALIDATION con details', async () => {
    const res = await json('/api/profile', 'PUT', { ...PROFILE_INPUT, heightCm: 0, goal: 'bulk' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { code: string; details: { path: string }[] } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.details.map((d) => d.path).sort()).toEqual(['goal', 'heightCm'])
    expect((await api('/api/profile')).status).toBe(404)
  })

  it('PUT con fecha de nacimiento futura → 400', async () => {
    const future = addDays(new Date().toISOString().slice(0, 10), 10)
    const res = await json('/api/profile', 'PUT', { ...PROFILE_INPUT, birthDate: future })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { details: { message: string }[] } }
    expect(body.error.details[0]?.message).toMatch(/futura/)
  })
})
