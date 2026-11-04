import {
  BarcodeProductSchema,
  DEFAULT_TIMEZONE,
  ShortcutDaySummarySchema,
  toLocalDate,
} from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  api,
  entryInput,
  json,
  jsonResponse,
  mockFetch,
  PROFILE_INPUT,
  resetDb,
} from '../test/helpers'

beforeEach(resetDb)

const today = () => toLocalDate(new Date(), DEFAULT_TIMEZONE)

describe('GET /api/shortcut/today', () => {
  it('sin perfil ni registros → ceros y meta null', async () => {
    const res = await api('/api/shortcut/today')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      localDate: today(),
      kcal: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      targetKcal: null,
      remainingKcal: null,
    })
  })

  it('con perfil y registros de hoy → totales y restante', async () => {
    const profile = (await (await json('/api/profile', 'PUT', PROFILE_INPUT)).json()) as {
      targetKcal: number
    }
    await json('/api/entries', 'POST', entryInput({ localDate: today() }))
    await json('/api/entries', 'POST', entryInput({ localDate: '2020-01-01' }))
    const s = ShortcutDaySummarySchema.parse(await (await api('/api/shortcut/today')).json())
    expect(s.kcal).toBe(330)
    expect(s.targetKcal).toBe(profile.targetKcal)
    expect(s.remainingKcal).toBe(profile.targetKcal - 330)
  })

  it('exige token', async () => {
    expect((await api('/api/shortcut/today', { token: null })).status).toBe(401)
  })
})

describe('GET /api/barcode/:code', () => {
  const off = {
    code: '7501055300075',
    status: 1,
    product: {
      product_name: 'Galletas',
      product_name_es: 'Galletas Marías',
      brands: 'Gamesa, PepsiCo',
      serving_quantity: '30',
      nutriments: {
        'energy-kcal_100g': 433,
        proteins_100g: 7,
        carbohydrates_100g: 73.04,
        fat_100g: 12,
      },
    },
  }

  it('ok: normaliza Open Food Facts', async () => {
    const spy = mockFetch(() => jsonResponse(off))
    const res = await api('/api/barcode/7501055300075')
    expect(res.status).toBe(200)
    expect(BarcodeProductSchema.parse(await res.json())).toEqual({
      code: '7501055300075',
      name: 'Galletas Marías',
      brand: 'Gamesa',
      per100g: { kcal: 433, proteinG: 7, carbsG: 73, fatG: 12 },
      servingGrams: 30,
    })
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://world.openfoodfacts.org/api/v2/product/7501055300075.json?fields=code,product_name,product_name_es,brands,nutriments,serving_quantity',
    )
    expect(new Headers(init.headers).get('user-agent')).toBe('Kalapp/1.0 (personal app)')
  })

  it('solo kJ → convierte a kcal', async () => {
    mockFetch(() =>
      jsonResponse({ ...off, product: { ...off.product, nutriments: { 'energy-kj_100g': 1812 } } }),
    )
    const p = BarcodeProductSchema.parse(await (await api('/api/barcode/7501055300075')).json())
    expect(p.per100g.kcal).toBe(433)
    expect(p.per100g.fatG).toBe(0)
  })

  it('no existe o sin kcal → 404', async () => {
    mockFetch(() => jsonResponse({ status: 0, status_verbose: 'product not found' }, 404))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
  })

  it('sin kcal → 404', async () => {
    mockFetch(() => jsonResponse({ ...off, product: { ...off.product, nutriments: {} } }))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
  })

  it('código inválido → 400 sin llamar a OFF', async () => {
    const spy = mockFetch(() => jsonResponse(off))
    expect((await api('/api/barcode/12345')).status).toBe(400)
    expect((await api('/api/barcode/abc1234567')).status).toBe(400)
    expect((await api('/api/barcode/123456789012345')).status).toBe(400)
    expect(spy).not.toHaveBeenCalled()
  })

  it('OFF caído o timeout → 503', async () => {
    mockFetch(() => {
      throw new DOMException('timeout', 'TimeoutError')
    })
    expect((await api('/api/barcode/7501055300075')).status).toBe(503)
  })
})

describe('GET /api/usage', () => {
  it('devuelve fecha, llamadas y límite', async () => {
    expect(await (await api('/api/usage')).json()).toEqual({ date: today(), calls: 0, limit: 60 })
  })
})
