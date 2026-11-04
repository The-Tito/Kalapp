import { type BarcodeProduct, BarcodeProductSchema, LIMITS, roundTo } from '@kalapp/shared'
import { Hono } from 'hono'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'

export const OFF_TIMEOUT_MS = 8_000
const OFF_FIELDS = 'code,product_name,product_name_es,brands,nutriments,serving_quantity'
const KJ_PER_KCAL = 4.184

export function openFoodFactsUrl(code: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=${OFF_FIELDS}`
}

type Nutriments = Record<string, unknown>

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null
}

const notFound = () =>
  new HttpError('NOT_FOUND', 'No encontramos ese producto o no tiene información de calorías')

/** Normaliza la respuesta de Open Food Facts a `BarcodeProduct` (o null si no sirve). */
export function normalizeOffProduct(code: string, body: unknown): BarcodeProduct | null {
  if (typeof body !== 'object' || body === null) return null
  const b = body as { status?: unknown; product?: Record<string, unknown> }
  const p = b.product
  if (b.status === 0 || !p || typeof p !== 'object') return null
  const n = (typeof p.nutriments === 'object' && p.nutriments ? p.nutriments : {}) as Nutriments
  // `energy_100g` de OFF está normalizado en kJ.
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g)
  const kcalRaw = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / KJ_PER_KCAL : null)
  if (kcalRaw === null || kcalRaw < 0) return null
  const macro = (key: string) => Math.max(0, roundTo(num(n[key]) ?? 0, 1))
  const name = str(p.product_name_es) ?? str(p.product_name) ?? `Producto ${code}`
  const brand = str(typeof p.brands === 'string' ? p.brands.split(',')[0] : null)
  const serving = num(p.serving_quantity)
  const candidate = {
    code,
    name: name.slice(0, LIMITS.nameMaxLength).trim(),
    brand: brand ? brand.slice(0, 120).trim() : null,
    per100g: {
      kcal: Math.round(kcalRaw),
      proteinG: macro('proteins_100g'),
      carbsG: macro('carbohydrates_100g'),
      fatG: macro('fat_100g'),
    },
    servingGrams:
      serving !== null && serving > 0 && serving <= LIMITS.itemGrams.max
        ? roundTo(serving, 1)
        : null,
  }
  const r = BarcodeProductSchema.safeParse(candidate)
  return r.success ? r.data : null
}

export const barcodeRoutes = new Hono<AppEnv>()

barcodeRoutes.get('/:code', async (c) => {
  const code = c.req.param('code').trim()
  if (!/^\d{6,14}$/.test(code)) {
    throw new HttpError('VALIDATION', 'Código de barras inválido (6 a 14 dígitos)', [
      { path: 'code', message: 'Código de barras inválido' },
    ])
  }
  let res: Response
  try {
    res = await fetch(openFoodFactsUrl(code), {
      headers: { 'User-Agent': 'Kalapp/1.0 (personal app)', Accept: 'application/json' },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    })
  } catch {
    throw new HttpError('AI_UNAVAILABLE', 'Open Food Facts no responde; intenta más tarde')
  }
  if (res.status === 404) throw notFound()
  if (!res.ok) {
    throw new HttpError('AI_UNAVAILABLE', 'Open Food Facts no responde; intenta más tarde')
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new HttpError('AI_UNAVAILABLE', 'Open Food Facts devolvió una respuesta inválida')
  }
  const product = normalizeOffProduct(code, body)
  if (!product) throw notFound()
  return c.json(product)
})
