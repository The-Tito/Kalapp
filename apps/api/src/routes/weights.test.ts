import { WeightSchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, json, resetDb } from '../test/helpers'

beforeEach(resetDb)

describe('/api/weights', () => {
  it('POST hace upsert por localDate (conserva el id) y GET ordena asc', async () => {
    const first = WeightSchema.parse(
      await (await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg: 80 })).json(),
    )
    const res = await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg: 79.4 })
    expect(res.status).toBe(200)
    const second = WeightSchema.parse(await res.json())
    expect(second.id).toBe(first.id)
    expect(second.weightKg).toBe(79.4)
    await json('/api/weights', 'POST', { localDate: '2026-11-01', weightKg: 81 })
    await json('/api/weights', 'POST', { localDate: '2026-12-01', weightKg: 78 })
    const list = (await (await api('/api/weights?from=2026-11-01&to=2026-11-30')).json()) as {
      localDate: string
      weightKg: number
    }[]
    expect(list.map((w) => [w.localDate, w.weightKg])).toEqual([
      ['2026-11-01', 81],
      ['2026-11-04', 79.4],
    ])
  })

  it('DELETE /:localDate → 204 / 404 / 400', async () => {
    await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg: 80 })
    expect((await api('/api/weights/2026-11-04', { method: 'DELETE' })).status).toBe(204)
    expect((await api('/api/weights/2026-11-04', { method: 'DELETE' })).status).toBe(404)
    expect((await api('/api/weights/ayer', { method: 'DELETE' })).status).toBe(400)
  })

  it('GET sin rango → 400', async () => {
    expect((await api('/api/weights')).status).toBe(400)
  })
})
