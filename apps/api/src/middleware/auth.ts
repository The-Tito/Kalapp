import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../env'
import { errorResponse } from '../lib/errors'

/** Longitud mínima de APP_TOKEN; si no se cumple el Worker no atiende (fail closed). */
export const MIN_APP_TOKEN_LENGTH = 16

const encoder = new TextEncoder()

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
}

/**
 * Compara dos secretos en tiempo constante. Se comparan los digest SHA-256 (siempre 32 bytes),
 * así ni el contenido ni la longitud del token esperado se filtran por tiempo.
 */
export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([sha256(a), sha256(b)])
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual?: (x: ArrayBufferView, y: ArrayBufferView) => boolean
  }
  if (typeof subtle.timingSafeEqual === 'function') return subtle.timingSafeEqual(da, db)
  let diff = 0
  for (let i = 0; i < da.length; i++) diff |= (da[i] ?? 0) ^ (db[i] ?? 0)
  return diff === 0
}

/** Extrae el token de `Authorization: Bearer <token>`. */
export function bearerToken(header: string | undefined): string | null {
  if (!header) return null
  const m = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(header)
  return m?.[1] ?? null
}

/** Exige `Authorization: Bearer <APP_TOKEN>` (todo /api excepto /api/health). */
export const requireToken: MiddlewareHandler<AppEnv> = async (c, next) => {
  const expected = c.env.APP_TOKEN
  if (typeof expected !== 'string' || expected.length < MIN_APP_TOKEN_LENGTH) {
    console.error('APP_TOKEN ausente o demasiado corto: el Worker no atiende peticiones')
    return errorResponse(c, 'INTERNAL', 'Servidor sin configurar')
  }
  const given = bearerToken(c.req.header('authorization'))
  const ok = await timingSafeEqualStrings(given ?? '', expected)
  if (given === null || !ok) return errorResponse(c, 'UNAUTHORIZED')
  await next()
}
