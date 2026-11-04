import type { Context } from 'hono'
import type { z } from 'zod'
import { HttpError, validationError } from './errors'

/** Valida con un esquema Zod; si falla lanza 400 VALIDATION con `details`. */
export function parseWith<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value)
  if (!r.success) throw validationError(r.error)
  return r.data
}

/** Lee el cuerpo como JSON (JSON malformado → 400 VALIDATION) y lo valida. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const text = await c.req.text()
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new HttpError('VALIDATION', 'El cuerpo no es JSON válido')
  }
  return parseWith(schema, value)
}

/** Valida los parámetros de la query string. */
export function readQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parseWith(schema, c.req.query())
}
