import { z } from 'zod'
import { ExportFormatSchema, LocalDateSchema } from './common'

export const ApiErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'VALIDATION',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'DAILY_LIMIT',
  'AI_UNAVAILABLE',
  'AI_INVALID_RESPONSE',
  'PROFILE_REQUIRED',
  'CONFLICT',
  'INTERNAL',
  'NOT_FOOD',
  'UPSTREAM_UNAVAILABLE',
])
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>

/** Estado HTTP sugerido por código. */
export const API_ERROR_STATUS = {
  UNAUTHORIZED: 401,
  VALIDATION: 400,
  NOT_FOUND: 404,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  DAILY_LIMIT: 429,
  AI_UNAVAILABLE: 503,
  AI_INVALID_RESPONSE: 502,
  PROFILE_REQUIRED: 409,
  CONFLICT: 409,
  INTERNAL: 500,
  NOT_FOOD: 422,
  UPSTREAM_UNAVAILABLE: 503,
} as const satisfies Record<ApiErrorCode, number>

/** Mensaje por defecto (es-MX) por código. */
export const API_ERROR_MESSAGES = {
  UNAUTHORIZED: 'Token inválido o ausente',
  VALIDATION: 'Los datos enviados no son válidos',
  NOT_FOUND: 'No se encontró el recurso',
  PAYLOAD_TOO_LARGE: 'La imagen o los datos son demasiado grandes',
  UNSUPPORTED_MEDIA: 'Formato de archivo no soportado',
  DAILY_LIMIT: 'Llegaste al límite diario de análisis',
  AI_UNAVAILABLE: 'El servicio de IA no está disponible; intenta más tarde',
  AI_INVALID_RESPONSE: 'La IA devolvió una respuesta inválida; intenta de nuevo',
  PROFILE_REQUIRED: 'Primero crea tu perfil',
  CONFLICT: 'El recurso ya existe con otros datos',
  INTERNAL: 'Error interno del servidor',
  NOT_FOOD: 'No se detectó comida; intenta con otra foto o descríbela',
  UPSTREAM_UNAVAILABLE: 'El servicio externo no responde; intenta más tarde',
} as const satisfies Record<ApiErrorCode, string>

export const ApiErrorSchema = z.object({
  error: z.object({
    code: ApiErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
  }),
})
export type ApiError = z.infer<typeof ApiErrorSchema>

/** Construye el cuerpo de error estándar. */
export function apiError(code: ApiErrorCode, message?: string, details?: unknown): ApiError {
  const body: ApiError = { error: { code, message: message ?? API_ERROR_MESSAGES[code] } }
  if (details !== undefined) body.error.details = details
  return body
}

/** `GET /api/export?format=csv|json&from=&to=` (v0.3). Sin rango = todo. */
export const ExportQuerySchema = z.object({
  format: ExportFormatSchema,
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
})
export type ExportQuery = z.infer<typeof ExportQuerySchema>
