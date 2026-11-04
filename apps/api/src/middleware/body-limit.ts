import { API_ERROR_MESSAGES, MAX_IMAGE_BYTES } from '@kalapp/shared'
import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { AppEnv, Env } from '../env'
import { errorResponse } from '../lib/errors'

/** Tope de los cuerpos JSON. */
export const MAX_JSON_BODY_BYTES = 256 * 1024
/** Margen para los encabezados del multipart y los campos de texto (`note`, `localHour`). */
export const MULTIPART_OVERHEAD_BYTES = 16 * 1024

/** MAX_IMAGE_BYTES del entorno (por defecto 1 MiB). */
export function maxImageBytes(env: Env): number {
  const n = Number(env.MAX_IMAGE_BYTES)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : MAX_IMAGE_BYTES
}

export function imageTooLargeMessage(max: number): string {
  if (max === 1_048_576) return API_ERROR_MESSAGES.PAYLOAD_TOO_LARGE
  const mb = Math.round((max / 1_048_576) * 10) / 10
  return `La imagen pesa más de ${mb} MB`
}

/**
 * Limita el cuerpo antes de leerlo: usa Content-Length si viene y, si no, cuenta los bytes del
 * stream. Multipart (foto) → MAX_IMAGE_BYTES + margen; el resto → 256 KB.
 */
export const limitBody: MiddlewareHandler<AppEnv> = async (c, next) => {
  const isMultipart = (c.req.header('content-type') ?? '')
    .toLowerCase()
    .startsWith('multipart/form-data')
  const maxImage = maxImageBytes(c.env)
  const limiter = bodyLimit({
    maxSize: isMultipart ? maxImage + MULTIPART_OVERHEAD_BYTES : MAX_JSON_BODY_BYTES,
    onError: (ctx) =>
      errorResponse(
        ctx,
        'PAYLOAD_TOO_LARGE',
        isMultipart
          ? imageTooLargeMessage(maxImage)
          : 'El cuerpo de la petición es demasiado grande',
      ),
  })
  return limiter(c, next)
}
