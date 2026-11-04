import {
  ANALYZE_IMAGE_FIELD,
  ANALYZE_LOCAL_HOUR_FIELD,
  ANALYZE_NOTE_FIELD,
  type AnalysisProposal,
  AnalysisProposalSchema,
  type AnalyzeTextRequest,
  API_ERROR_MESSAGES,
  type ApiErrorCode,
  ApiErrorSchema,
  type Entry,
  type EntryInput,
  type EntryPatch,
  EntrySchema,
  LocalDateSchema,
  type Profile,
  type ProfileInputPayload,
  ProfileSchema,
} from '@kalapp/shared'
import { z } from 'zod'
import { tokenStore as defaultTokenStore, type TokenStore } from './token'

// ---------------------------------------------------------------------------
// Esquemas de respuestas que aún no están en @kalapp/shared (ver reporte).
// ---------------------------------------------------------------------------
export const UsageSchema = z.object({
  date: LocalDateSchema,
  calls: z.number().int().min(0),
  limit: z.number().int().min(0),
})
export type Usage = z.infer<typeof UsageSchema>

export const HealthSchema = z.object({ status: z.string(), app: z.string() })
export type Health = z.infer<typeof HealthSchema>

// ---------------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------------
export type ClientErrorCode = ApiErrorCode | 'NETWORK' | 'INVALID_RESPONSE' | 'ABORTED' | 'UNKNOWN'

export const CLIENT_ERROR_MESSAGES = {
  NETWORK: 'Sin conexión. Revisa tu internet.',
  INVALID_RESPONSE: 'El servidor respondió algo inesperado. Intenta de nuevo.',
  ABORTED: 'Se canceló la solicitud.',
  UNKNOWN: 'Ocurrió un error inesperado. Intenta de nuevo.',
} as const

/** 422 en /api/analyze: la foto o el texto no parecen comida. */
export const NOT_FOOD_MESSAGE = 'No parece comida. Intenta con otra foto o descríbela con texto.'

function defaultMessage(code: ClientErrorCode): string {
  if (code in CLIENT_ERROR_MESSAGES) {
    return CLIENT_ERROR_MESSAGES[code as keyof typeof CLIENT_ERROR_MESSAGES]
  }
  return API_ERROR_MESSAGES[code as ApiErrorCode]
}

export class ApiError extends Error {
  readonly code: ClientErrorCode
  /** Estado HTTP; 0 si no hubo respuesta (red, cancelación, respuesta inválida). */
  readonly status: number
  readonly details?: unknown

  constructor(code: ClientErrorCode, message?: string, status = 0, details?: unknown) {
    super(message ?? defaultMessage(code))
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.details = details
  }

  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500
  }
}

/** Mensaje en español para cualquier error (para mostrar en pantalla). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return CLIENT_ERROR_MESSAGES.UNKNOWN
}

export function statusToCode(status: number): ClientErrorCode {
  switch (status) {
    case 400:
    case 422:
      return 'VALIDATION'
    case 401:
      return 'UNAUTHORIZED'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 413:
      return 'PAYLOAD_TOO_LARGE'
    case 415:
      return 'UNSUPPORTED_MEDIA'
    case 429:
      return 'DAILY_LIMIT'
    case 502:
      return 'AI_INVALID_RESPONSE'
    case 503:
      return 'AI_UNAVAILABLE'
    default:
      return status >= 500 ? 'INTERNAL' : 'UNKNOWN'
  }
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name: unknown }).name === 'AbortError'
  )
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    // cuerpo vacío o no JSON
  }
  const parsed = ApiErrorSchema.safeParse(body)
  if (parsed.success) {
    const { code, message, details } = parsed.data.error
    const fallback = res.status === 422 ? NOT_FOOD_MESSAGE : API_ERROR_MESSAGES[code]
    return new ApiError(code, message.trim() !== '' ? message : fallback, res.status, details)
  }
  const code = statusToCode(res.status)
  return new ApiError(
    code,
    res.status === 422 ? NOT_FOOD_MESSAGE : defaultMessage(code),
    res.status,
  )
}

// ---------------------------------------------------------------------------
// Cliente
// ---------------------------------------------------------------------------
export interface ApiClientOptions {
  fetchFn?: typeof fetch
  baseUrl?: string
  tokenStore?: TokenStore
}

export interface RequestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Objeto → JSON; FormData se envía tal cual (multipart). */
  body?: unknown
  /** Esquema para validar la respuesta. Sin esquema se espera 204/sin cuerpo. */
  schema?: z.ZodType<T>
  signal?: AbortSignal
  /** `false` para rutas públicas (health). */
  auth?: boolean
  /** Token explícito (para probarlo antes de guardarlo). */
  token?: string
  /** Si es `false`, un 401 no borra el token guardado. */
  clearTokenOnUnauthorized?: boolean
}

export function createApiClient(options: ApiClientOptions = {}) {
  const fetchFn: typeof fetch = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init))
  const baseUrl = options.baseUrl ?? ''
  const tokens = options.tokenStore ?? defaultTokenStore

  async function request<T = void>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' })
    const auth = opts.auth ?? true
    if (auth) {
      const token = opts.token ?? tokens.get()
      if (!token) {
        if (opts.clearTokenOnUnauthorized !== false) tokens.clear()
        throw new ApiError('UNAUTHORIZED', undefined, 401)
      }
      headers.set('Authorization', `Bearer ${token}`)
    }

    let body: BodyInit | undefined
    if (opts.body instanceof FormData) {
      body = opts.body
    } else if (opts.body !== undefined) {
      headers.set('Content-Type', 'application/json')
      body = JSON.stringify(opts.body)
    }

    let res: Response
    try {
      res = await fetchFn(`${baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body,
        signal: opts.signal,
      })
    } catch (err) {
      if (isAbortError(err) || opts.signal?.aborted) throw new ApiError('ABORTED')
      throw new ApiError('NETWORK')
    }

    if (!res.ok) {
      const error = await toApiError(res)
      if (res.status === 401 && auth && opts.clearTokenOnUnauthorized !== false) tokens.clear()
      throw error
    }

    if (!opts.schema) return undefined as T

    let json: unknown
    try {
      json = await res.json()
    } catch (err) {
      if (isAbortError(err) || opts.signal?.aborted) throw new ApiError('ABORTED')
      throw new ApiError('INVALID_RESPONSE', undefined, res.status)
    }
    const parsed = opts.schema.safeParse(json)
    if (!parsed.success) {
      throw new ApiError('INVALID_RESPONSE', undefined, res.status, parsed.error.issues)
    }
    return parsed.data
  }

  return {
    request,

    health: () => request('/api/health', { auth: false, schema: HealthSchema }),

    /** Prueba un token sin guardarlo ni borrar el actual. */
    verifyToken: (token: string) =>
      request('/api/usage', { token, schema: UsageSchema, clearTokenOnUnauthorized: false }),

    getUsage: () => request('/api/usage', { schema: UsageSchema }),

    getProfile: (): Promise<Profile> => request('/api/profile', { schema: ProfileSchema }),

    putProfile: (input: ProfileInputPayload): Promise<Profile> =>
      request('/api/profile', { method: 'PUT', body: input, schema: ProfileSchema }),

    analyzePhoto: (
      image: Blob,
      params: { note?: string; localHour?: number; signal?: AbortSignal } = {},
    ): Promise<AnalysisProposal> => {
      const form = new FormData()
      form.append(ANALYZE_IMAGE_FIELD, image, 'comida.jpg')
      if (params.note) form.append(ANALYZE_NOTE_FIELD, params.note)
      if (params.localHour !== undefined) {
        form.append(ANALYZE_LOCAL_HOUR_FIELD, String(params.localHour))
      }
      return request('/api/analyze', {
        method: 'POST',
        body: form,
        schema: AnalysisProposalSchema,
        signal: params.signal,
      })
    },

    analyzeText: (input: AnalyzeTextRequest, signal?: AbortSignal): Promise<AnalysisProposal> =>
      request('/api/analyze', {
        method: 'POST',
        body: input,
        schema: AnalysisProposalSchema,
        signal,
      }),

    listEntries: (date: string): Promise<Entry[]> =>
      request(`/api/entries?date=${encodeURIComponent(date)}`, { schema: z.array(EntrySchema) }),

    createEntry: (input: EntryInput): Promise<Entry> =>
      request('/api/entries', { method: 'POST', body: input, schema: EntrySchema }),

    updateEntry: (id: string, patch: EntryPatch): Promise<Entry> =>
      request(`/api/entries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: patch,
        schema: EntrySchema,
      }),

    deleteEntry: (id: string): Promise<void> =>
      request(`/api/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

export const api = createApiClient()
