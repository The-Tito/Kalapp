import { LIMITS } from '../constants'
import type { BarcodeProduct } from '../schemas/barcode'
import type { EntryItemInput } from '../schemas/entry'
import { roundTo } from '../utils/math'

/** Ingrediente a partir de un producto empacado y los gramos consumidos. */
export function productToItem(product: BarcodeProduct, grams: number): EntryItemInput {
  if (!Number.isFinite(grams) || grams < 0) throw new RangeError('Gramos inválidos')
  const f = grams / 100
  const fullName = product.brand ? `${product.name} (${product.brand})` : product.name
  return {
    name: fullName.slice(0, LIMITS.nameMaxLength).trim(),
    grams: roundTo(grams, 1),
    kcal: Math.round(product.per100g.kcal * f),
    proteinG: roundTo(product.per100g.proteinG * f, 1),
    carbsG: roundTo(product.per100g.carbsG * f, 1),
    fatG: roundTo(product.per100g.fatG * f, 1),
    confidence: 'high',
  }
}
