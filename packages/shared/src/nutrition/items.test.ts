import { describe, expect, it } from 'vitest'
import { AiAnalysisOutputSchema, AnalysisProposalSchema } from '../schemas/analysis'
import { BarcodeProductSchema } from '../schemas/barcode'
import { productToItem } from './barcode'
import {
  energyFromMacros,
  hasEnergyMismatch,
  recalcItemFromGrams,
  scaleItems,
  sumTotals,
  toAnalysisProposal,
} from './items'

const tortilla = {
  name: 'Tortilla de maíz',
  grams: 60,
  kcal: 130,
  proteinG: 3.4,
  carbsG: 27,
  fatG: 1.4,
  confidence: 'high' as const,
}
const carne = {
  name: 'Bistec de res',
  grams: 120,
  kcal: 250,
  proteinG: 31,
  carbsG: 0,
  fatG: 13.5,
  confidence: 'medium' as const,
}

describe('energyFromMacros / hasEnergyMismatch', () => {
  it('4/4/9', () => {
    expect(energyFromMacros({ proteinG: 10, carbsG: 20, fatG: 5 })).toBe(165)
  })
  it('sin discrepancia dentro del 15 %', () => {
    // 4·3.4 + 4·27 + 9·1.4 = 134.2 vs 130 → 3 %
    expect(hasEnergyMismatch(tortilla)).toBe(false)
  })
  it('discrepancia mayor al 15 %', () => {
    // 4·31 + 9·13.5 = 245.5; declarar 300 → 18 %
    expect(hasEnergyMismatch({ ...carne, kcal: 300 })).toBe(true)
    // con tolerancia 0.2 ya no
    expect(hasEnergyMismatch({ ...carne, kcal: 300 }, 0.2)).toBe(false)
  })
  it('ignora ítems con menos de 20 kcal', () => {
    expect(hasEnergyMismatch({ kcal: 19, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(false)
    expect(hasEnergyMismatch({ kcal: 20, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(true)
  })
})

describe('sumTotals', () => {
  it('suma y redondea', () => {
    expect(sumTotals([tortilla, carne])).toEqual({
      kcal: 380,
      proteinG: 34.4,
      carbsG: 27,
      fatG: 14.9,
    })
    expect(sumTotals([])).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 })
  })
  it('evita ruido de coma flotante', () => {
    const t = sumTotals([
      { kcal: 1, proteinG: 0.1, carbsG: 0.1, fatG: 0.1 },
      { kcal: 1, proteinG: 0.2, carbsG: 0.2, fatG: 0.2 },
    ])
    expect(t.proteinG).toBe(0.3)
  })
})

describe('scaleItems / recalcItemFromGrams', () => {
  it('½× redondea gramos/macros a 1 decimal y kcal a entero', () => {
    const [t] = scaleItems([tortilla], 0.5)
    expect(t).toEqual({ ...tortilla, grams: 30, kcal: 65, proteinG: 1.7, carbsG: 13.5, fatG: 0.7 })
  })
  it('1.5× conserva campos extra', () => {
    const [c] = scaleItems([carne], 1.5)
    expect(c).toEqual({
      ...carne,
      grams: 180,
      kcal: 375,
      proteinG: 46.5,
      carbsG: 0,
      fatG: 20.3, // 20.25 → 20.3
    })
    expect(c?.confidence).toBe('medium')
  })
  it('factor fuera de 0.25–10 lanza error', () => {
    expect(() => scaleItems([tortilla], 0.2)).toThrow(RangeError)
    expect(() => scaleItems([tortilla], 10.5)).toThrow(RangeError)
    expect(() => scaleItems([tortilla], Number.NaN)).toThrow(RangeError)
    expect(scaleItems([tortilla], 0.25)[0]?.grams).toBe(15)
    expect(scaleItems([tortilla], 10)[0]?.grams).toBe(600)
  })
  it('recalcula proporcionalmente a los gramos', () => {
    expect(recalcItemFromGrams(tortilla, 90)).toEqual({
      ...tortilla,
      grams: 90,
      kcal: 195,
      proteinG: 5.1,
      carbsG: 40.5,
      fatG: 2.1,
    })
    expect(recalcItemFromGrams(tortilla, 0)).toMatchObject({ grams: 0, kcal: 0, proteinG: 0 })
  })
  it('ítem con 0 g: solo cambian los gramos', () => {
    const zero = { ...tortilla, grams: 0 }
    expect(recalcItemFromGrams(zero, 50)).toEqual({ ...tortilla, grams: 50 })
    expect(() => recalcItemFromGrams(tortilla, -1)).toThrow(RangeError)
  })
})

describe('toAnalysisProposal', () => {
  it('agrega totales, energyMismatch y modelo; el resultado valida', () => {
    const output = AiAnalysisOutputSchema.parse({
      title: '  Tacos de bistec ',
      items: [tortilla, { ...carne, kcal: 300 }],
      confidence: 'medium',
    })
    expect(output.title).toBe('Tacos de bistec')
    expect(output.assumptions).toEqual([])
    const p = toAnalysisProposal(output, 'gemini-flash-latest')
    expect(p.totals).toEqual({ kcal: 430, proteinG: 34.4, carbsG: 27, fatG: 14.9 })
    expect(p.energyMismatch).toBe(true)
    expect(p.model).toBe('gemini-flash-latest')
    expect(AnalysisProposalSchema.safeParse(p).success).toBe(true)
    expect(toAnalysisProposal({ ...output, items: [tortilla] }, 'm').energyMismatch).toBe(false)
  })
})

describe('productToItem', () => {
  const product = BarcodeProductSchema.parse({
    code: '7501055300075',
    name: 'Galletas Marías',
    brand: 'Gamesa',
    per100g: { kcal: 433, proteinG: 7.3, carbsG: 73.3, fatG: 12.3 },
    servingGrams: 30,
  })
  it('escala por 100 g', () => {
    expect(productToItem(product, 30)).toEqual({
      name: 'Galletas Marías (Gamesa)',
      grams: 30,
      kcal: 130, // 129.9
      proteinG: 2.2, // 2.19
      carbsG: 22, // 21.99
      fatG: 3.7, // 3.69
      confidence: 'high',
    })
  })
  it('sin marca usa solo el nombre; gramos negativos lanzan error', () => {
    expect(productToItem({ ...product, brand: null }, 100).name).toBe('Galletas Marías')
    expect(() => productToItem(product, -5)).toThrow(RangeError)
  })
})
