import { env } from 'cloudflare:test'
import { EntrySchema, ExportJsonSchema, HealthSchema, UsageSchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../app'
import { maxImageBytes } from '../middleware/body-limit'
import {
  AI_OUTPUT,
  api,
  entryInput,
  geminiResponse,
  ITEM,
  json,
  mockFetch,
  resetDb,
  TOKEN,
} from '../test/helpers'
import { dailyLimit } from './analyze'

beforeEach(async () => {
  await resetDb()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

describe('contrato de shared', () => {
  it('health y usage cumplen HealthSchema y UsageSchema', async () => {
    HealthSchema.parse(await (await api('/api/health', { token: null })).json())
    UsageSchema.parse(await (await api('/api/usage')).json())
  })

  it('export JSON cumple ExportJsonSchema con y sin rango', async () => {
    await json('/api/entries', 'POST', entryInput())
    const ranged = ExportJsonSchema.parse(
      await (await api('/api/export?format=json&from=2026-11-01&to=2026-11-30')).json(),
    )
    expect([ranged.from, ranged.to]).toEqual(['2026-11-01', '2026-11-30'])
    expect(ranged.entries).toHaveLength(1)
    const all = ExportJsonSchema.parse(await (await api('/api/export?format=json')).json())
    expect([all.from, all.to]).toEqual([null, null])
  })

  it('export con rango > 366 días → 400', async () => {
    expect((await api('/api/export?format=csv&from=2025-01-01&to=2026-11-01')).status).toBe(400)
    expect((await api('/api/export?format=csv&from=2025-11-02&to=2026-11-02')).status).toBe(200)
  })
})

describe('variables de entorno', () => {
  it('DAILY_ANALYZE_LIMIT y MAX_IMAGE_BYTES vacíos, basura o < 1 → valores por defecto', () => {
    for (const v of ['', 'abc', '0', '-3', '1.5', ' ']) {
      expect(dailyLimit({ ...env, DAILY_ANALYZE_LIMIT: v }), v).toBe(60)
      expect(maxImageBytes({ ...env, MAX_IMAGE_BYTES: v }), v).toBe(1_048_576)
    }
    expect(dailyLimit({ ...env, DAILY_ANALYZE_LIMIT: '5' })).toBe(5)
  })
})

describe('límite diario atómico', () => {
  it('5 análisis en paralelo con límite 1 → exactamente 1 pasa y el contador queda en 1', async () => {
    const spy = mockFetch(async () => {
      await new Promise((r) => setTimeout(r, 20))
      return geminiResponse(AI_OUTPUT)
    })
    const send = () =>
      app.request(
        '/api/analyze',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
          body: '{"text":"tacos"}',
        },
        { ...env, DAILY_ANALYZE_LIMIT: '1' },
      )
    const rs = await Promise.all(Array.from({ length: 5 }, send))
    const statuses = rs.map((r) => r.status).sort()
    expect(statuses).toEqual([200, 429, 429, 429, 429])
    expect(spy).toHaveBeenCalledTimes(1)
    const row = await env.DB.prepare('SELECT SUM(calls) AS n FROM ai_usage').first<{ n: number }>()
    expect(row?.n).toBe(1)
  })
})

describe('content-type de los cuerpos JSON', () => {
  it('POST/PUT/PATCH sin application/json → 415', async () => {
    const res = await api('/api/entries', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify(entryInput()),
    })
    expect(res.status).toBe(415)
    expect(await errorCode(res)).toBe('UNSUPPORTED_MEDIA')
    const noType = await api('/api/weights', {
      method: 'POST',
      body: new Blob([JSON.stringify({ localDate: '2026-11-04', weightKg: 80 })]),
    })
    expect(noType.status).toBe(415)
  })

  it('multipart fuera de /api/analyze no recibe el tope de imagen (256 KB)', async () => {
    const res = await api('/api/favorites', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: 'x'.repeat(300 * 1024),
    })
    expect(res.status).toBe(413)
  })
})

describe('UUID en mayúsculas', () => {
  it('POST, PATCH y DELETE tratan el mismo UUID sin importar mayúsculas', async () => {
    const input = entryInput()
    const upper = input.id.toUpperCase()
    const created = EntrySchema.parse(
      await (await json('/api/entries', 'POST', { ...input, id: upper })).json(),
    )
    expect(created.id).toBe(input.id)
    expect((await json('/api/entries', 'POST', input)).status).toBe(200)
    expect((await json(`/api/entries/${upper}`, 'PATCH', { mealType: 'snack' })).status).toBe(200)
    expect((await api(`/api/entries/${upper}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('favoritos: POST con mayúsculas es idempotente y /use acepta mayúsculas', async () => {
    const id = crypto.randomUUID()
    expect(
      (await json('/api/favorites', 'POST', { id: id.toUpperCase(), name: 'A', items: [ITEM] }))
        .status,
    ).toBe(201)
    expect((await json('/api/favorites', 'POST', { id, name: 'A', items: [ITEM] })).status).toBe(
      200,
    )
    expect((await api(`/api/favorites/${id.toUpperCase()}/use`, { method: 'POST' })).status).toBe(
      200,
    )
    expect((await api(`/api/favorites/${id.toUpperCase()}`, { method: 'DELETE' })).status).toBe(204)
  })
})

describe('textos invisibles', () => {
  it('title o name hechos solo de U+200B–U+200D/U+FEFF → 400', async () => {
    for (const s of ['​', '‌‍', ' ﻿ ', '​ ​']) {
      expect((await json('/api/entries', 'POST', entryInput({ title: s }))).status).toBe(400)
      const items = [{ ...ITEM, name: s }]
      expect((await json('/api/entries', 'POST', entryInput({ items }))).status).toBe(400)
      expect(
        (await json('/api/favorites', 'POST', { id: crypto.randomUUID(), name: s, items: [ITEM] }))
          .status,
      ).toBe(400)
    }
  })

  it('los invisibles dentro de texto visible se conservan', async () => {
    const res = await json('/api/entries', 'POST', entryInput({ title: 'pan​dulce' }))
    expect(res.status).toBe(201)
    expect(EntrySchema.parse(await res.json()).title).toBe('pan​dulce')
  })
})
