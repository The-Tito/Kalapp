import type { AiAnalysisOutput } from '@kalapp/shared'
import type { AnalyzePromptInput } from './prompt'
import {
  buildGeminiRequest,
  GEMINI_TIMEOUT_MS,
  type GeminiImage,
  parseGeminiResponse,
} from './request'

export type AttemptResult =
  | { kind: 'ok'; output: AiAnalysisOutput; model: string }
  | { kind: 'not_food'; model: string }
  /** 429, 5xx, 404 (modelo retirado), timeout o error de red: vale la pena el respaldo. */
  | { kind: 'unavailable'; model: string; reason: string }
  /** Respuesta que no es JSON o no cumple el esquema. */
  | { kind: 'invalid'; model: string; reason: string }
  /** 400/401/403: problema de configuración o de la petición; el respaldo no lo arreglaría. */
  | { kind: 'rejected'; model: string; reason: string }

export interface GeminiCallOptions {
  apiKey: string
  prompt: AnalyzePromptInput
  image?: GeminiImage | undefined
  timeoutMs?: number
  fetchFn?: typeof fetch
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 404 || status >= 500
}

/** `error.message` de una respuesta de error de Gemini, recortado y sin la clave. */
async function geminiErrorMessage(res: Response, apiKey: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } }
    const msg = body?.error?.message
    if (typeof msg !== 'string') return ''
    const clean = apiKey ? msg.split(apiKey).join('[clave]') : msg
    return clean.replace(/\s+/g, ' ').slice(0, 500)
  } catch {
    return ''
  }
}

/** Un intento contra un modelo. Nunca lanza; clasifica el resultado. */
export async function callGeminiOnce(
  model: string,
  opts: GeminiCallOptions,
): Promise<AttemptResult> {
  const fetchFn = opts.fetchFn ?? fetch
  const { url, init } = buildGeminiRequest(model, opts.apiKey, opts.prompt, opts.image)
  let res: Response
  try {
    res = await fetchFn(url, {
      ...init,
      signal: AbortSignal.timeout(opts.timeoutMs ?? GEMINI_TIMEOUT_MS),
    })
  } catch (err) {
    const name = err instanceof Error ? err.name : 'Error'
    return {
      kind: 'unavailable',
      model,
      reason: name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'error de red',
    }
  }
  if (!res.ok) {
    const detail = await geminiErrorMessage(res, opts.apiKey)
    const reason = `HTTP ${res.status}`
    // Visible en `wrangler tail`; solo `error.message` de Gemini, sin la clave ni la petición.
    console.error(`Gemini ${model}: ${reason}${detail ? ` — ${detail}` : ''}`)
    return isRetriableStatus(res.status)
      ? { kind: 'unavailable', model, reason }
      : { kind: 'rejected', model, reason }
  }
  let body: unknown
  try {
    body = await res.json()
  } catch {
    return { kind: 'invalid', model, reason: 'cuerpo no es JSON' }
  }
  const parsed = parseGeminiResponse(body)
  if (parsed.kind === 'ok') return { kind: 'ok', output: parsed.output, model }
  if (parsed.kind === 'not_food') return { kind: 'not_food', model }
  return { kind: 'invalid', model, reason: parsed.reason }
}

/**
 * Modelo principal y, si falla por disponibilidad (429/5xx/404/timeout/red) o devuelve algo
 * inválido, una vez el de respaldo. Devuelve el último intento y la lista de intentos.
 */
export async function analyzeWithFallback(
  models: { primary: string; fallback?: string | undefined },
  opts: GeminiCallOptions,
): Promise<{ result: AttemptResult; attempts: AttemptResult[] }> {
  const attempts: AttemptResult[] = []
  const first = await callGeminiOnce(models.primary, opts)
  attempts.push(first)
  const fallback = models.fallback?.trim()
  const shouldRetry = first.kind === 'unavailable' || first.kind === 'invalid'
  if (!shouldRetry || !fallback || fallback === models.primary) {
    return { result: first, attempts }
  }
  const second = await callGeminiOnce(fallback, opts)
  attempts.push(second)
  return { result: second, attempts }
}
