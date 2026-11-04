import {
  type AnalysisProposal,
  type BarcodeProduct,
  LIMITS,
  productDisplayName,
  productToItem,
  sumTotals,
} from '@kalapp/shared'
import { ApiError, errorMessage } from './api'
import type { Draft } from './draft'
import { parseNumber } from './onboarding'

/** Etiqueta de origen (va en `model` de la propuesta sintética; no se envía como aiModel). */
export const BARCODE_SOURCE_LABEL = 'Open Food Facts'

/** Quita espacios/guiones; `null` si no son 6–14 dígitos. */
export function normalizeBarcode(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, '')
  return /^\d{6,14}$/.test(digits) ? digits : null
}

/** Gramos por defecto: la porción del producto o 100 g. */
export function defaultGrams(product: BarcodeProduct): number {
  return product.servingGrams && product.servingGrams > 0 ? product.servingGrams : 100
}

export type GramsCheck = { ok: true; grams: number } | { ok: false; message: string }

export function parseGrams(text: string): GramsCheck {
  const g = parseNumber(text)
  if (g === undefined || Number.isNaN(g) || g <= 0 || g > LIMITS.itemGrams.max) {
    return { ok: false, message: `Escribe los gramos (1 a ${LIMITS.itemGrams.max})` }
  }
  return { ok: true, grams: g }
}

/**
 * Borrador de Revisar para un producto empacado: un solo ingrediente con los gramos dados.
 * Lanza `RangeError` (de `productToItem`) si los valores salen de los límites.
 */
export function buildBarcodeDraft(p: {
  id: string
  product: BarcodeProduct
  grams: number
  localHour: number
  localDate?: string | null
}): Draft {
  const item = productToItem(p.product, p.grams)
  const proposal: AnalysisProposal = {
    title: productDisplayName(p.product.name, p.product.brand),
    items: [{ ...item, confidence: 'high' }],
    assumptions: [`Valores de ${BARCODE_SOURCE_LABEL} por 100 g (código ${p.product.code}).`],
    questions: [],
    totals: sumTotals([item]),
    energyMismatch: false,
    model: BARCODE_SOURCE_LABEL,
    confidence: 'high',
  }
  return {
    kind: 'new',
    id: p.id,
    proposal,
    source: 'barcode',
    note: null,
    photo: null,
    localHour: p.localHour,
    localDate: p.localDate ?? null,
  }
}

export const BARCODE_NOT_FOUND_MESSAGE =
  'Producto no encontrado en Open Food Facts; regístralo a mano o con foto'
export const BARCODE_UNAVAILABLE_MESSAGE =
  'Open Food Facts no responde en este momento. Intenta más tarde o regístralo con foto.'

/** Mensaje para errores de `GET /api/barcode/:code`. */
export function barcodeErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 404 || err.code === 'NOT_FOUND') return BARCODE_NOT_FOUND_MESSAGE
    if (
      err.status === 503 ||
      err.code === 'UPSTREAM_UNAVAILABLE' ||
      err.code === 'AI_UNAVAILABLE'
    ) {
      return BARCODE_UNAVAILABLE_MESSAGE
    }
    if (err.status === 400 || err.code === 'VALIDATION') {
      return 'Código de barras inválido: deben ser de 6 a 14 dígitos.'
    }
  }
  return errorMessage(err)
}

/** Mensaje si la cámara en vivo no está disponible (frecuente en la PWA instalada de iOS). */
export function cameraErrorMessage(err: unknown): string {
  const name =
    typeof err === 'object' && err !== null && 'name' in err
      ? String((err as { name: unknown }).name)
      : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'No hay permiso para usar la cámara en vivo (iOS a veces lo niega en apps instaladas). Escribe el código abajo.'
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No encontramos una cámara disponible. Escribe el código abajo.'
  }
  return 'No pudimos abrir la cámara. Escribe el código abajo.'
}
