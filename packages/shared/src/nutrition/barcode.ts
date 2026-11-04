import { LIMITS } from '../constants'
import type { BarcodeProduct } from '../schemas/barcode'
import type { EntryItemInput } from '../schemas/entry'
import { roundTo } from '../utils/math'

/** "Nombre (Marca)" en ≤ 120 caracteres: recorta la marca o la quita; nunca deja " (" colgando. */
export function productDisplayName(name: string, brand?: string | null): string {
  const max = LIMITS.nameMaxLength
  const cleanName = name.trim()
  const cleanBrand = brand?.trim() ?? ''
  if (cleanBrand === '') return cleanName.slice(0, max).trim()
  const full = `${cleanName} (${cleanBrand})`
  if (full.length <= max) return full
  const room = max - cleanName.length - 3 // " (" + ")"
  const cut = room > 0 ? cleanBrand.slice(0, room).trim() : ''
  return cut === '' ? cleanName.slice(0, max).trim() : `${cleanName} (${cut})`
}

function assertWithin(value: number, max: number, label: string): void {
  if (value > max) throw new RangeError(`${label} excede el máximo (${max}): ${value}`)
}

/**
 * Ingrediente a partir de un producto empacado y los gramos consumidos (0–5,000).
 * Lanza `RangeError` si los gramos no son válidos o si las kcal/macros resultantes exceden
 * los límites de `EntryItemInputSchema`.
 */
export function productToItem(product: BarcodeProduct, grams: number): EntryItemInput {
  if (!Number.isFinite(grams) || grams < LIMITS.itemGrams.min || grams > LIMITS.itemGrams.max) {
    throw new RangeError(
      `Gramos fuera de rango (${LIMITS.itemGrams.min}–${LIMITS.itemGrams.max}): ${grams}`,
    )
  }
  const f = grams / 100
  const item: EntryItemInput = {
    name: productDisplayName(product.name, product.brand),
    grams: roundTo(grams, 1),
    kcal: Math.round(product.per100g.kcal * f),
    proteinG: roundTo(product.per100g.proteinG * f, 1),
    carbsG: roundTo(product.per100g.carbsG * f, 1),
    fatG: roundTo(product.per100g.fatG * f, 1),
    confidence: 'high',
  }
  assertWithin(item.kcal, LIMITS.itemKcal.max, 'Calorías')
  assertWithin(item.proteinG, LIMITS.itemMacroG.max, 'Proteína')
  assertWithin(item.carbsG, LIMITS.itemMacroG.max, 'Carbohidratos')
  assertWithin(item.fatG, LIMITS.itemMacroG.max, 'Grasa')
  return item
}
