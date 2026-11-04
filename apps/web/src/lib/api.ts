import {
  type AdaptiveTdeeResult,
  AdaptiveTdeeResultSchema,
  ANALYZE_IMAGE_FIELD,
  ANALYZE_LOCAL_HOUR_FIELD,
  ANALYZE_NOTE_FIELD,
  type AnalysisProposal,
  AnalysisProposalSchema,
  type AnalyzeTextRequest,
  API_ERROR_MESSAGES,
  type ApiErrorCode,
  ApiErrorSchema,
  type BarcodeProduct,
  BarcodeProductSchema,
  type Entry,
  type EntryInput,
  type EntryPatch,
  EntrySchema,
  type ExportFormat,
  type Favorite,
  type FavoriteInput,
  FavoriteSchema,
  HealthSchema,
  type Profile,
  type ProfileInputPayload,
  ProfileSchema,
  type RangeSummary,
  RangeSummarySchema,
  type ShortcutDaySummary,
  ShortcutDaySummarySchema,
  UsageSchema,
  type Weight,
  type WeightInput,
  WeightSchema,
} from '@kalapp/shared'
import { z } from 'zod'
import { tokenStore as defaultTokenStore, type TokenStore } from './token'

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
export const NOT_FOOD_MESSAGE = API_ERROR_MESSAGES.NOT_FOOD

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

  /** Falla de red (sin respuesta): candidata a la cola sin internet. */
  get isNetwork(): boolean {
    return this.code === 'NETWORK'
  }
}

/** `true` si el error es "no es comida": `NOT_FOOD` o cualquier 422 (versiones viejas: VALIDATION). */
export function isNotFoodError(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'NOT_FOOD' || err.status === 422)
}

/** Mensaje en español para cualquier error (para mostrar en pantalla). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  return CLIENT_ERROR_MESSAGES.UNKNOWN
}

export function statusToCode(status: number): ClientErrorCode {
  switch (status) {
    case 400:
      return 'VALIDATION'
    case 422:
      return 'NOT_FOOD'
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
    // Un 422 siempre es "no es comida" (las versiones viejas mandaban VALIDATION).
    if (res.status === 422 || code === 'NOT_FOOD') {
      const text = code === 'NOT_FOOD' && message.trim() !== '' ? message : NOT_FOOD_MESSAGE
      return new ApiError('NOT_FOOD', text, res.status, details)
    }
    return new ApiError(
      code,
      message.trim() !== '' ? message : API_ERROR_MESSAGES[code],
      res.status,
      details,
    )
  }
  const code = statusToCode(res.status)
  return new ApiError(code, defaultMessage(code), res.status)
}

/** Nombre del archivo en `Content-Disposition` (o null). */
export function filenameFromDisposition(header: string | null): string | null {
  if (!header) return null
  const star = /filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i.exec(header)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      // cae al nombre simple
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain?.[1]?.trim() || null
}

export interface DownloadedFile {
  blob: Blob
  filename: string
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

  /** Hace la petición y devuelve la respuesta OK (o lanza ApiError). */
  async function send(path: string, opts: Omit<RequestOptions<unknown>, 'schema'>, accept: string) {
    const headers = new Headers({ Accept: accept })
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
    return res
  }

  async function request<T = void>(path: string, opts: RequestOptions<T> = {}): Promise<T> {
    const res = await send(path, opts, 'application/json')
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

  const q = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined) sp.set(k, v)
    const str = sp.toString()
    return str ? `?${str}` : ''
  }
  const seg = encodeURIComponent

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

    // v0.2 ---------------------------------------------------------------
    getSummary: (from: string, to: string): Promise<RangeSummary> =>
      request(`/api/summary${q({ from, to })}`, { schema: RangeSummarySchema }),

    listFavorites: (): Promise<Favorite[]> =>
      request('/api/favorites', { schema: z.array(FavoriteSchema) }),

    createFavorite: (input: FavoriteInput): Promise<Favorite> =>
      request('/api/favorites', { method: 'POST', body: input, schema: FavoriteSchema }),

    deleteFavorite: (id: string): Promise<void> =>
      request(`/api/favorites/${seg(id)}`, { method: 'DELETE' }),

    markFavoriteUsed: (id: string): Promise<Favorite> =>
      request(`/api/favorites/${seg(id)}/use`, { method: 'POST', schema: FavoriteSchema }),

    // v0.3 ---------------------------------------------------------------
    listWeights: (from: string, to: string): Promise<Weight[]> =>
      request(`/api/weights${q({ from, to })}`, { schema: z.array(WeightSchema) }),

    saveWeight: (input: WeightInput): Promise<Weight> =>
      request('/api/weights', { method: 'POST', body: input, schema: WeightSchema }),

    deleteWeight: (localDate: string): Promise<void> =>
      request(`/api/weights/${seg(localDate)}`, { method: 'DELETE' }),

    getAdaptive: (): Promise<AdaptiveTdeeResult> =>
      request('/api/adaptive', { schema: AdaptiveTdeeResultSchema }),

    /** Descarga la exportación (CSV o JSON) como Blob con su nombre de archivo. */
    exportFile: async (
      format: ExportFormat,
      range: { from?: string; to?: string } = {},
    ): Promise<DownloadedFile> => {
      const accept = format === 'csv' ? 'text/csv' : 'application/json'
      const res = await send(
        `/api/export${q({ format, from: range.from, to: range.to })}`,
        {},
        accept,
      )
      let blob: Blob
      try {
        blob = await res.blob()
      } catch {
        throw new ApiError('NETWORK')
      }
      const filename =
        filenameFromDisposition(res.headers.get('Content-Disposition')) ?? `kalapp.${format}`
      const type = blob.type || (format === 'csv' ? 'text/csv' : 'application/json')
      return { blob: blob.type ? blob : new Blob([blob], { type }), filename }
    },

    // v1.0 ---------------------------------------------------------------
    getShortcutToday: (): Promise<ShortcutDaySummary> =>
      request('/api/shortcut/today', { schema: ShortcutDaySummarySchema }),

    getBarcode: (code: string, signal?: AbortSignal): Promise<BarcodeProduct> =>
      request(`/api/barcode/${seg(code)}`, { schema: BarcodeProductSchema, signal }),
  }
}

export type ApiClient = ReturnType<typeof createApiClient>

export const api = createApiClient()
