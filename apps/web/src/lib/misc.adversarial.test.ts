// @vitest-environment jsdom

import type { BarcodeProduct, Favorite } from '@kalapp/shared'
import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, memoryStorage } from '../test/fixtures'
import { ApiError, createApiClient } from './api'
import {
  BARCODE_NOT_FOUND_MESSAGE,
  BARCODE_UNAVAILABLE_MESSAGE,
  barcodeErrorMessage,
  buildBarcodeDraft,
  defaultGrams,
  normalizeBarcode,
  parseGrams,
} from './barcode'
import { deliverFile } from './exportFile'
import { buildEntryFromFavorite, filterFavorites } from './favorites'
import { averageLogged, buildHistoryDays, chartData, weeklyAverages } from './history'
import { maskToken } from './shortcut'
import { createTokenStore } from './token'
import { latestWeight, movingAverage, recalcSuggestion } from './weight'

const fav = (over: Partial<Favorite> = {}): Favorite => ({
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Café con leche',
  items: [{ name: 'Leche entera', grams: 200, kcal: 120, proteinG: 6.4, carbsG: 9.6, fatG: 6.4 }],
  mealType: 'breakfast',
  totals: { kcal: 120, proteinG: 6.4, carbsG: 9.6, fatG: 6.4 },
  usesCount: 0,
  createdAt: '2026-11-04T12:00:00Z',
  lastUsedAt: null,
  ...over,
})

const product = (over: Partial<BarcodeProduct> = {}): BarcodeProduct => ({
  code: '7501055300075',
  name: 'Galletas',
  brand: 'Marca',
  per100g: { kcal: 450, proteinG: 6, carbsG: 70, fatG: 16 },
  servingGrams: null,
  ...over,
})

describe('historial (adversarial)', () => {
  it('rango sin datos: días vacíos, promedio null, gráfica sin barras', () => {
    const days = buildHistoryDays([], '2026-11-01', '2026-11-07')
    expect(days).toHaveLength(7)
    expect(averageLogged(days).averages).toBeNull()
    expect(chartData(days).every((d) => d.kcal === null)).toBe(true)
    expect(weeklyAverages(days)).toHaveLength(1)
  })

  it('días con entryCount 0 o fuera de rango se ignoran', () => {
    const days = buildHistoryDays(
      [
        { localDate: '2026-11-02', entryCount: 0, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
        { localDate: '2026-12-25', entryCount: 3, kcal: 9000, proteinG: 0, carbsG: 0, fatG: 0 },
      ] as never,
      '2026-11-01',
      '2026-11-03',
    )
    expect(days.every((d) => d.totals === null)).toBe(true)
  })
})

describe('peso (adversarial)', () => {
  it('un solo peso: la tendencia es ese peso', () => {
    expect(movingAverage([{ localDate: '2026-11-04', weightKg: 80 }])).toEqual([
      { localDate: '2026-11-04', weightKg: 80, trendKg: 80 },
    ])
  })

  it('saltos absurdos (60→200 kg) se promedian sin NaN y el aviso de recálculo aparece', () => {
    const pts = movingAverage([
      { localDate: '2026-11-03', weightKg: 60 },
      { localDate: '2026-11-04', weightKg: 200 },
    ])
    expect(pts[1]?.trendKg).toBe(130)
    expect(recalcSuggestion(60, [{ localDate: '2026-11-04', weightKg: 200 }])).not.toBeNull()
  })

  it('media móvil con huecos: un peso de hace 8 días no cuenta', () => {
    const pts = movingAverage([
      { localDate: '2026-11-12', weightKg: 90 },
      { localDate: '2026-11-04', weightKg: 80 },
      { localDate: '2026-11-06', weightKg: 82 },
    ])
    expect(pts.map((p) => p.trendKg)).toEqual([80, 81, 86]) // el 12 promedia 6 y 12; el 4 queda fuera
  })

  it('pesos duplicados del mismo día no rompen latestWeight ni la media', () => {
    const w = [
      { localDate: '2026-11-04', weightKg: 80 },
      { localDate: '2026-11-04', weightKg: 81 },
    ]
    expect(latestWeight(w)?.localDate).toBe('2026-11-04')
    expect(movingAverage(w).every((p) => Number.isFinite(p.trendKg))).toBe(true)
  })

  it('banner de recálculo sin pesos o con perfil sin peso válido no aparece ni lanza', () => {
    expect(recalcSuggestion(80, [])).toBeNull()
    expect(recalcSuggestion(Number.NaN, [{ localDate: '2026-11-04', weightKg: 85 }])).toBeNull()
  })

  it('descartar el aviso es por peso: un peso nuevo lo vuelve a mostrar', () => {
    const s1 = recalcSuggestion(80, [{ localDate: '2026-11-04', weightKg: 85 }])
    expect(recalcSuggestion(80, [{ localDate: '2026-11-04', weightKg: 85 }], s1?.key)).toBeNull()
    expect(
      recalcSuggestion(80, [{ localDate: '2026-11-05', weightKg: 85 }], s1?.key),
    ).not.toBeNull()
  })
})

describe('favoritos (adversarial)', () => {
  const setupApi = (body: unknown) => {
    const tokens = createTokenStore(() => memoryStorage())
    tokens.set('secreto')
    return createApiClient({
      fetchFn: (async () => jsonResponse(body)) as unknown as typeof fetch,
      tokenStore: tokens,
    })
  }

  it('BUG: un favorito viejo con 0 items rompe toda la lista (INVALID_RESPONSE)', async () => {
    const api = setupApi([fav(), fav({ id: '7c9e6679-7425-40de-944b-e07fc1f90ae8', items: [] })])
    // Esperado: se muestran los favoritos válidos y se ignora (o marca) el dañado.
    const list = await api.listFavorites()
    expect(list.length).toBeGreaterThanOrEqual(1)
  })

  it('repetir un favorito sin items falla con mensaje (no POST inválido)', () => {
    const r = buildEntryFromFavorite({
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae9',
      favorite: fav({ items: [] }),
      now: new Date('2026-11-04T19:00:00Z'),
      timezone: 'America/Mexico_City',
    })
    expect(r.success).toBe(false)
  })

  it('nombre con emoji se busca y se repite', () => {
    const f = fav({ name: '🌮 Tacos del güero' })
    expect(filterFavorites([f], 'tacos')).toHaveLength(1)
    expect(filterFavorites([f], '🌮')).toHaveLength(1)
    const r = buildEntryFromFavorite({
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae9',
      favorite: f,
      now: new Date('2026-11-04T19:00:00Z'),
      timezone: 'America/Mexico_City',
    })
    expect(r.success && r.data.title).toBe('🌮 Tacos del güero')
  })

  it('búsqueda sin acentos ni mayúsculas, en ambos sentidos (NFC/NFD)', () => {
    const list = [fav({ name: 'Plátano con CREMA' }), fav({ name: 'Ñoquis' })]
    expect(filterFavorites(list, 'platano crema')).toHaveLength(0) // no hay "platano crema" literal
    expect(filterFavorites(list, 'PLATANO')).toHaveLength(1)
    expect(filterFavorites(list, 'plátano'.normalize('NFD'))).toHaveLength(1)
    expect(filterFavorites(list, 'leche')).toHaveLength(2) // por ingrediente
    expect(filterFavorites(list, 'noquis')).toHaveLength(1)
    expect(filterFavorites(list, '   ')).toHaveLength(2)
  })
})

describe('código de barras (adversarial)', () => {
  it('espacios, guiones y tabs se quitan; letras o longitud inválida → null', () => {
    expect(normalizeBarcode(' 750-1055 300075 ')).toBe('7501055300075')
    expect(normalizeBarcode('750\t1055300075')).toBe('7501055300075')
    expect(normalizeBarcode('75010A5300075')).toBeNull()
    expect(normalizeBarcode('12345')).toBeNull()
    expect(normalizeBarcode('123456789012345')).toBeNull()
    expect(normalizeBarcode('')).toBeNull()
    expect(normalizeBarcode('７５０１０５５３０００７５')).toBeNull() // dígitos de ancho completo
  })

  it('404 y 503 dan mensajes específicos', () => {
    expect(barcodeErrorMessage(new ApiError('NOT_FOUND', undefined, 404))).toBe(
      BARCODE_NOT_FOUND_MESSAGE,
    )
    expect(barcodeErrorMessage(new ApiError('UPSTREAM_UNAVAILABLE', undefined, 503))).toBe(
      BARCODE_UNAVAILABLE_MESSAGE,
    )
    expect(barcodeErrorMessage(new Error('x'))).toMatch(/inesperado/)
  })

  it('servingGrams 0 o null → 100 g; la API rechaza servingGrams 0', async () => {
    expect(defaultGrams(product({ servingGrams: null }))).toBe(100)
    expect(defaultGrams(product({ servingGrams: 0 }))).toBe(100)
    const tokens = createTokenStore(() => memoryStorage())
    tokens.set('t')
    const api = createApiClient({
      fetchFn: (async () => jsonResponse(product({ servingGrams: 0 }))) as unknown as typeof fetch,
      tokenStore: tokens,
    })
    await expect(api.getBarcode('7501055300075')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    })
  })

  it('gramos 0, negativos, texto y > 5000 se rechazan', () => {
    for (const g of ['0', '-10', 'abc', '5001', '', '1e9']) expect(parseGrams(g).ok).toBe(false)
    expect(parseGrams('12,5')).toEqual({ ok: true, grams: 12.5 })
  })

  it('producto que excede límites con muchos gramos lanza RangeError (la UI lo atrapa)', () => {
    const p = product({ per100g: { kcal: 900, proteinG: 0, carbsG: 0, fatG: 100 } })
    expect(() =>
      buildBarcodeDraft({
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        product: p,
        grams: 5000,
        localHour: 13,
      }),
    ).toThrow(RangeError)
  })
})

describe('exportar (adversarial)', () => {
  it('navigator.share lanza AbortError (usuario cancela) → "cancelled", no descarga ni error', async () => {
    const create = vi.fn(() => 'blob:x')
    const r = await deliverFile(new Blob(['a']), 'k.csv', {
      navigator: {
        canShare: () => true,
        share: async () => {
          throw new DOMException('cancel', 'AbortError')
        },
      },
      createObjectURL: create,
      revokeObjectURL: vi.fn(),
    })
    expect(r).toBe('cancelled')
    expect(create).not.toHaveBeenCalled()
  })

  it('canShare false o que lanza → descarga', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    for (const canShare of [
      () => false,
      () => {
        throw new TypeError('files no soportado')
      },
    ]) {
      const share = vi.fn()
      const r = await deliverFile(new Blob(['a']), 'k.csv', {
        navigator: { canShare, share },
        createObjectURL: () => 'blob:x',
        revokeObjectURL: vi.fn(),
      })
      expect(r).toBe('downloaded')
      expect(share).not.toHaveBeenCalled()
    }
    click.mockRestore()
  })
})

describe('seguridad (adversarial)', () => {
  // Fuentes de la PWA (sin pruebas ni helpers de prueba), leídas como texto por Vite.
  const sources = (
    import.meta as unknown as {
      glob(p: string[], o: object): Record<string, string>
    }
  ).glob(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}', '!../test/**'], {
    query: '?raw',
    import: 'default',
    eager: true,
  })
  const files = Object.keys(sources)

  it('hay fuentes que revisar', () => {
    expect(files.length).toBeGreaterThan(30)
  })

  it('no hay dangerouslySetInnerHTML / innerHTML / eval en el código de la PWA', () => {
    for (const f of files) {
      const s = sources[f] ?? ''
      expect(s, f).not.toMatch(/dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/)
    }
  })

  it('el token no se manda a console ni a sessionStorage', () => {
    for (const f of files) {
      const s = sources[f] ?? ''
      expect(s, f).not.toMatch(/console\.\w+\([^)]*token/i)
      expect(s, f).not.toMatch(/sessionStorage[^\n]*token/i)
    }
  })

  it('maskToken no revela el token completo; tampoco la mayor parte en tokens medianos', () => {
    const long = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
    const masked = maskToken(long)
    expect(masked).not.toContain(long.slice(4, -4))
    expect(maskToken('12345678')).toBe('••••••••')
  })

  it('BUG: maskToken con token de 9–16 caracteres revela ≥ 50 % del token', () => {
    const t = '123456789' // 9 caracteres: se ven 8
    const visible = maskToken(t).replace(/•/g, '').length
    expect(visible / t.length).toBeLessThan(0.5)
  })
})
