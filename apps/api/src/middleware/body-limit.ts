import { formatBytes, MAX_IMAGE_BYTES } from '@kalapp/shared'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv, Env } from '../env'
import { errorResponse } from '../lib/errors'

/** Tope de los cuerpos JSON. */
export const MAX_JSON_BODY_BYTES = 256 * 1024
/** Margen para los encabezados del multipart y los campos de texto (`note`, `localHour`). */
export const MULTIPART_OVERHEAD_BYTES = 16 * 1024
/** Única ruta que acepta multipart (foto). */
const ANALYZE_PATH = '/api/analyze'

/** Entero positivo de una variable de entorno; vacío, basura o < 1 → `fallback`. */
export function positiveIntVar(value: string | undefined, fallback: number): number {
  const s = value?.trim() ?? ''
  if (!/^\d+$/.test(s)) return fallback
  const n = Number(s)
  return Number.isSafeInteger(n) && n >= 1 ? n : fallback
}

/** MAX_IMAGE_BYTES del entorno (por defecto 1 MiB). */
export function maxImageBytes(env: Env): number {
  return positiveIntVar(env.MAX_IMAGE_BYTES, MAX_IMAGE_BYTES)
}

export function imageTooLargeMessage(max: number): string {
  return `La imagen pesa más de ${formatBytes(max)}`
}

/**
 * Limita el cuerpo antes de leerlo: usa Content-Length si viene y, si no, cuenta los bytes del
 * stream. Solo multipart en /api/analyze → MAX_IMAGE_BYTES + margen; todo lo demás → 256 KB,
 * sin importar el content-type declarado.
 */
export const limitBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  const isPhoto =
    c.req.path === ANALYZE_PATH &&
    (c.req.header('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')
  const maxImage = maxImageBytes(c.env)
  const limiter = bodyLimit({
    maxSize: isPhoto ? maxImage + MULTIPART_OVERHEAD_BYTES : MAX_JSON_BODY_BYTES,
    onError: (ctx) =>
      errorResponse(
        ctx,
        'PAYLOAD_TOO_LARGE',
        isPhoto
          ? imageTooLargeMessage(maxImage)
          : `El cuerpo de la petición pesa más de ${formatBytes(MAX_JSON_BODY_BYTES)}`,
      ),
  })
  return limiter(c, next)
}
