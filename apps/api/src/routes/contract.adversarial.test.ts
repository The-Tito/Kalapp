import { env } from 'cloudflare:test'
import { ExportJsonSchema, HealthSchema, UsageSchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { app } from '../app'
import { api, entryInput, geminiResponse, json, mockFetch, resetDb, TOKEN } from '../test/helpers'

beforeEach(resetDb)

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

/** Contrato de @kalapp/shared (63519f5) contra las respuestas reales del Worker. */
describe('contrato shared ↔ API', () => {
  it('GET /api/health cumple HealthSchema', async () => {
    expect(
      HealthSchema.safeParse(await (await api('/api/health', { token: null })).json()).success,
    ).toBe(true)
  })

  it('GET /api/usage cumple UsageSchema', async () => {
    expect(UsageSchema.safeParse(await (await api('/api/usage')).json()).success).toBe(true)
  })

  it('BUG: (baja) GET /api/usage con DAILY_ANALYZE_LIMIT=0 viola UsageSchema (limit ≥ 1)', async () => {
    const res = await app.request(
      '/api/usage',
      { headers: { authorization: `Bearer ${TOKEN}` } },
      { ...env, DAILY_ANALYZE_LIMIT: '0' },
    )
    expect(UsageSchema.safeParse(await res.json()).success).toBe(true)
  })

  it('BUG: (media) GET /api/export?format=json no cumple ExportJsonSchema (faltan exportedAt/from/to)', async () => {
    await json('/api/entries', 'POST', entryInput())
    const res = await api('/api/export?format=json&from=2026-11-01&to=2026-11-30')
    const r = ExportJsonSchema.safeParse(await res.json())
    expect(r.success, JSON.stringify(r.error?.issues.map((i) => i.path))).toBe(true)
  })

  it('BUG: (media) no-comida responde code VALIDATION en vez de NOT_FOOD', async () => {
    mockFetch(() => geminiResponse({ not_food: true }))
    const res = await json('/api/analyze', 'POST', { text: 'una piedra' })
    expect(res.status).toBe(422)
    expect(await code(res)).toBe('NOT_FOOD')
  })

  it('BUG: (baja) Open Food Facts caído responde AI_UNAVAILABLE en vez de UPSTREAM_UNAVAILABLE', async () => {
    mockFetch(() => new Response('x', { status: 500 }))
    const res = await api('/api/barcode/7501055300075')
    expect(res.status).toBe(503)
    expect(await code(res)).toBe('UPSTREAM_UNAVAILABLE')
  })
})
