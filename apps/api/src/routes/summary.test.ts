import { RangeSummarySchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, entryInput, ITEM, json, resetDb } from '../test/helpers'

beforeEach(resetDb)

describe('GET /api/summary', () => {
  it('totales por día dentro del rango y promedio sobre días registrados', async () => {
    const one = [ITEM] // 130 kcal
    await json('/api/entries', 'POST', entryInput({ localDate: '2026-11-01', items: one }))
    await json('/api/entries', 'POST', entryInput({ localDate: '2026-11-01', items: one }))
    await json('/api/entries', 'POST', entryInput({ localDate: '2026-11-03', items: one }))
    await json('/api/entries', 'POST', entryInput({ localDate: '2026-11-09', items: one }))
    const res = await api('/api/summary?from=2026-11-01&to=2026-11-07')
    expect(res.status).toBe(200)
    const s = RangeSummarySchema.parse(await res.json())
    expect(s.loggedDays).toBe(2)
    expect(s.days.map((d) => [d.localDate, d.kcal, d.entryCount])).toEqual([
      ['2026-11-01', 260, 2],
      ['2026-11-03', 130, 1],
    ])
    expect(s.averages.kcal).toBe(195)
  })

  it('rango inválido → 400', async () => {
    expect((await api('/api/summary?from=2026-11-07&to=2026-11-01')).status).toBe(400)
    expect((await api('/api/summary?from=2024-01-01&to=2026-11-01')).status).toBe(400)
    expect((await api('/api/summary')).status).toBe(400)
  })
})
