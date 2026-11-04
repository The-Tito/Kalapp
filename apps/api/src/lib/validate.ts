import type { Context } from 'hono'
import type { z } from 'zod'
import { HttpError, validationError } from './errors'

/** Caracteres invisibles que no cuentan como contenido (ZWSP, ZWNJ, ZWJ, BOM). */
const INVISIBLE_RE = /[\u200B-\u200D\uFEFF]/g
/** Campos de texto que no pueden quedar "visualmente vacíos". */
const VISIBLE_TEXT_KEYS = new Set(['name', 'title'])

/**
 * Normaliza el cuerpo antes de validar (recursivo):
 * - `name`/`title` hechos solo de espacios y caracteres invisibles (U+200B–U+200D, U+FEFF) se
 *   vuelven "" para que el esquema los rechace; si tienen texto visible se conservan tal cual
 *   (un U+200B dentro de "pan​dulce" no se toca).
 * - `id` (UUID) se pasa a minúsculas: el mismo UUID en mayúsculas es el mismo registro.
 */
export function normalizeInput(value: unknown, key?: string): unknown {
  if (typeof value === 'string') {
    if (key === 'id') return value.trim().toLowerCase()
    if (key && VISIBLE_TEXT_KEYS.has(key) && value.replace(INVISIBLE_RE, '').trim() === '') {
      return ''
    }
    return value
  }
  if (Array.isArray(value)) return value.map((v) => normalizeInput(v))
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = normalizeInput(v, k)
    return out
  }
  return value
}

/** Id de ruta (UUID) normalizado a minúsculas. */
export function normalizeId(raw: string): string {
  return raw.trim().toLowerCase()
}

/** Valida con un esquema Zod; si falla lanza 400 VALIDATION con `details`. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value)
  if (!r.success) throw validationError(r.error)
  return r.data
}

/** Profundidad máxima de objetos/arreglos en un cuerpo JSON. */
export const MAX_JSON_DEPTH = 32

/**
 * Profundidad máxima de `{`/`[` en un texto JSON, ignorando lo que está dentro de strings.
 * Escaneo lineal sin recursión: corta en cuanto pasa de `limit`.
 */
export function jsonDepthExceeds(text: string, limit = MAX_JSON_DEPTH): boolean {
  let depth = 0
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    if (inString) {
      if (ch === 0x5c)
        i++ // \ escapa el siguiente carácter
      else if (ch === 0x22) inString = false
      continue
    }
    if (ch === 0x22) inString = true
    else if (ch === 0x7b || ch === 0x5b) {
      if (++depth > limit) return true
    } else if (ch === 0x7d || ch === 0x5d) depth--
  }
  return false
}

/**
 * Lee el cuerpo como JSON y lo valida. Exige `Content-Type: application/json` (si no → 415).
 * JSON malformado, demasiado anidado (> 32 niveles) o cualquier fallo al parsear/normalizar/
 * validar → 400 VALIDATION (nunca 500).
 */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const type = (c.req.header('content-type') ?? '').toLowerCase().split(';')[0]?.trim()
  if (type !== 'application/json') {
    throw new HttpError('UNSUPPORTED_MEDIA', 'Envía el cuerpo como application/json')
  }
  const text = await c.req.text()
  if (jsonDepthExceeds(text)) throw new HttpError('VALIDATION', 'JSON demasiado anidado')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new HttpError('VALIDATION', 'El cuerpo no es JSON válido')
  }
  try {
    return parseWith(schema, normalizeInput(value))
  } catch (err) {
    if (err instanceof HttpError) throw err
    // p. ej. RangeError por pila agotada en estructuras patológicas.
    throw new HttpError('VALIDATION')
  }
}

/** Valida los parámetros de la query string. */
export function readQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parseWith(schema, normalizeInput(c.req.query()))
}
