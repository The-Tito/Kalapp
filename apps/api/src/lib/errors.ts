import { API_ERROR_STATUS, type ApiErrorCode, apiError } from '@kalapp/shared'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ZodError } from 'zod'

/** Error de negocio que el `onError` global convierte en `{ error: { code, message, details? } }`. */
export class HttpError extends Error {
  readonly code: ApiErrorCode
  readonly status: ContentfulStatusCode
  readonly details: unknown
  /** Mensaje para el cliente; si falta se usa `API_ERROR_MESSAGES[code]`. */
  readonly publicMessage: string | undefined

  constructor(code: ApiErrorCode, message?: string, details?: unknown, status?: number) {
    super(message ?? code)
    this.name = 'HttpError'
    this.code = code
    this.status = (status ?? API_ERROR_STATUS[code]) as ContentfulStatusCode
    this.details = details
    this.publicMessage = message
  }
}

/** Respuesta JSON de error con la forma estándar. */
export function errorResponse(
  c: Context,
  code: ApiErrorCode,
  message?: string,
  details?: unknown,
  status?: number,
): Response {
  return c.json(apiError(code, message, details), (status ?? API_ERROR_STATUS[code]) as never)
}

export interface IssueSummary {
  path: string
  message: string
}

/** Issues de Zod resumidos para `details` (sin valores de entrada). */
export function summarizeIssues(error: ZodError): IssueSummary[] {
  return error.issues.slice(0, 20).map((i) => ({
    path: i.path.map(String).join('.'),
    message: i.message,
  }))
}

export function validationError(error: ZodError): HttpError {
  return new HttpError('VALIDATION', undefined, summarizeIssues(error))
}
