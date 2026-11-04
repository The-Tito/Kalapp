import type { BarcodeProduct } from '@kalapp/shared'
import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import {
  BARCODE_NOT_FOUND_MESSAGE,
  BARCODE_UNAVAILABLE_MESSAGE,
  barcodeErrorMessage,
  buildBarcodeDraft,
  cameraErrorMessage,
  defaultGrams,
  normalizeBarcode,
  parseGrams,
} from './barcode'
import { buildEntryInput, initReviewFromProposal } from './review'

const product: BarcodeProduct = {
  code: '7501055300075',
  name: 'Yogur natural',
  brand: 'Marca',
  per100g: { kcal: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3 },
  servingGrams: 150,
}

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('código de barras', () => {
  it('normaliza el código capturado a mano', () => {
    expect(normalizeBarcode(' 7501 0553-00075 ')).toBe('7501055300075')
    expect(normalizeBarcode('12345')).toBeNull()
    expect(normalizeBarcode('abc123456')).toBeNull()
  })

  it('gramos por defecto: porción o 100 g', () => {
    expect(defaultGrams(product)).toBe(150)
    expect(defaultGrams({ ...product, servingGrams: null })).toBe(100)
    expect(parseGrams('0')).toMatchObject({ ok: false })
    expect(parseGrams('125,5')).toEqual({ ok: true, grams: 125.5 })
  })

  it('arma el borrador de Revisar con productToItem', () => {
    const draft = buildBarcodeDraft({ id: ID, product, grams: 150, localHour: 9, localDate: null })
    expect(draft.kind).toBe('new')
    if (draft.kind !== 'new') return
    expect(draft.source).toBe('barcode')
    expect(draft.proposal.title).toBe('Yogur natural (Marca)')
    expect(draft.proposal.items[0]).toMatchObject({ grams: 150, kcal: 92, proteinG: 5.3 })
    expect(draft.proposal.totals.kcal).toBe(92)
  })

  it('la entrada desde código no lleva modelo ni confianza de IA', () => {
    const draft = buildBarcodeDraft({ id: ID, product, grams: 100, localHour: 9 })
    if (draft.kind !== 'new') throw new Error('borrador inesperado')
    const r = buildEntryInput({
      id: draft.id,
      state: initReviewFromProposal(draft.proposal, draft.localHour, null, null),
      source: 'barcode',
      aiModel: null,
      aiConfidence: null,
      timezone: 'America/Mexico_City',
      now: new Date('2026-11-04T15:00:00Z'),
    })
    expect(r.success).toBe(true)
    expect(r.data).toMatchObject({ source: 'barcode', aiModel: null, mealType: 'breakfast' })
    expect(r.data?.items[0]?.kcal).toBe(61)
  })

  it('cantidades fuera de rango lanzan RangeError', () => {
    expect(() => buildBarcodeDraft({ id: ID, product, grams: 6000, localHour: 9 })).toThrow(
      RangeError,
    )
  })

  it('mensajes de error', () => {
    expect(barcodeErrorMessage(new ApiError('NOT_FOUND', 'x', 404))).toBe(BARCODE_NOT_FOUND_MESSAGE)
    expect(barcodeErrorMessage(new ApiError('UPSTREAM_UNAVAILABLE', 'x', 503))).toBe(
      BARCODE_UNAVAILABLE_MESSAGE,
    )
    expect(barcodeErrorMessage(new ApiError('AI_UNAVAILABLE', 'x', 503))).toBe(
      BARCODE_UNAVAILABLE_MESSAGE,
    )
    expect(barcodeErrorMessage(new ApiError('VALIDATION', 'x', 400))).toMatch(/inválido/)
    expect(cameraErrorMessage({ name: 'NotAllowedError' })).toMatch(/Escribe el código/)
    expect(cameraErrorMessage({ name: 'NotFoundError' })).toMatch(/cámara disponible/)
  })
})
