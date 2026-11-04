import { type AiAnalysisOutput, AiAnalysisOutputSchema, LIMITS, roundTo } from '@kalapp/shared'
import { type AnalyzePromptInput, buildAnalyzePrompt } from './prompt'
import { GEMINI_RESPONSE_SCHEMA } from './schema'

export const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const GEMINI_TIMEOUT_MS = 25_000

export interface GeminiImage {
  mimeType: string
  /** Bytes en base64 (sin prefijo data:). */
  base64: string
}

/** Base64 por bloques: `String.fromCharCode(...bytes)` de golpe revienta la pila con ~1 MB. */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[])
  }
  return btoa(binary)
}

export function geminiUrl(model: string): string {
  return `${GEMINI_API_BASE}/models/${encodeURIComponent(model)}:generateContent`
}

/** Cuerpo de `generateContent` (prompt + imagen opcional + salida JSON forzada, temperatura 0). */
export function buildGeminiBody(prompt: AnalyzePromptInput, image?: GeminiImage) {
  const parts: Record<string, unknown>[] = [{ text: buildAnalyzePrompt(prompt) }]
  if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } })
  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_RESPONSE_SCHEMA,
    },
  }
}

/** Petición HTTP completa (la clave va en `x-goog-api-key`, nunca en la URL). */
export function buildGeminiRequest(
  model: string,
  apiKey: string,
  prompt: AnalyzePromptInput,
  image?: GeminiImage,
): { url: string; init: RequestInit } {
  return {
    url: geminiUrl(model),
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(buildGeminiBody(prompt, image)),
    },
  }
}

export type ParsedGemini =
  | { kind: 'ok'; output: AiAnalysisOutput }
  | { kind: 'not_food' }
  | { kind: 'invalid'; reason: string }

interface GeminiPart {
  text?: unknown
  thought?: unknown
}

/** Texto JSON de la respuesta: une las partes de texto del primer candidato (sin "thoughts"). */
function extractText(body: unknown): { text: string } | { reason: string } {
  if (typeof body !== 'object' || body === null) return { reason: 'respuesta no es un objeto' }
  const b = body as {
    candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[]
    promptFeedback?: { blockReason?: string }
  }
  if (b.promptFeedback?.blockReason) return { reason: `bloqueado: ${b.promptFeedback.blockReason}` }
  const cand = b.candidates?.[0]
  if (!cand) return { reason: 'sin candidatos' }
  const parts = cand.content?.parts ?? []
  const text = parts
    .filter((p) => p.thought !== true && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('')
  if (text.trim() === '') return { reason: `sin texto (finishReason ${cand.finishReason ?? '?'})` }
  return { text }
}

/** Quita cercas ```json … ``` por si el modelo las agrega. */
function stripFences(text: string): string {
  const m = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text)
  return m?.[1] ?? text
}

/** Gramos y macros a 1 decimal; kcal a entero (después de validar). */
function tidy(output: AiAnalysisOutput): AiAnalysisOutput {
  return {
    ...output,
    items: output.items.map((it) => ({
      ...it,
      grams: roundTo(it.grams, 1),
      kcal: Math.round(it.kcal),
      proteinG: roundTo(it.proteinG, 1),
      carbsG: roundTo(it.carbsG, 1),
      fatG: roundTo(it.fatG, 1),
    })),
  }
}

export const MERGED_ITEMS_ASSUMPTION = 'Se combinaron ingredientes menores'

/**
 * Ajustes antes de Zod (el responseSchema ya no lleva límites): con más de 30 ingredientes se
 * conservan los 30 de más kcal y se agrega un supuesto; `assumptions`/`questions` se recortan
 * a 20. Los valores fuera de rango NO se corrigen: los rechaza Zod (→ 502).
 */
export function trimAiOutput(json: unknown): unknown {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return json
  const out: Record<string, unknown> = { ...(json as Record<string, unknown>) }
  const maxItems = LIMITS.itemsPerEntry.max
  const maxList = LIMITS.listMaxItems
  let merged = false
  if (Array.isArray(out.items) && out.items.length > maxItems) {
    const kcalOf = (it: unknown) => {
      const k = (it as { kcal?: unknown } | null)?.kcal
      return typeof k === 'number' && Number.isFinite(k) ? k : 0
    }
    out.items = out.items
      .map((it, i) => ({ it, i }))
      .sort((a, b) => kcalOf(b.it) - kcalOf(a.it) || a.i - b.i)
      .slice(0, maxItems)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.it)
    merged = true
  }
  if (merged) {
    const prev = Array.isArray(out.assumptions) ? out.assumptions : []
    out.assumptions = [MERGED_ITEMS_ASSUMPTION, ...prev]
  }
  for (const key of ['assumptions', 'questions'] as const) {
    const list = out[key]
    if (Array.isArray(list) && list.length > maxList) out[key] = list.slice(0, maxList)
  }
  return out
}

/** Interpreta el JSON de `generateContent` y lo valida con `AiAnalysisOutputSchema`. */
export function parseGeminiResponse(body: unknown): ParsedGemini {
  const extracted = extractText(body)
  if ('reason' in extracted) return { kind: 'invalid', reason: extracted.reason }
  let json: unknown
  try {
    json = JSON.parse(stripFences(extracted.text))
  } catch {
    return { kind: 'invalid', reason: 'JSON inválido' }
  }
  if (
    typeof json === 'object' &&
    json !== null &&
    (json as { not_food?: unknown }).not_food === true
  ) {
    return { kind: 'not_food' }
  }
  const r = AiAnalysisOutputSchema.safeParse(trimAiOutput(json))
  if (!r.success) {
    const where = r.error.issues
      .slice(0, 3)
      .map((i) => i.path.join('.') || '(raíz)')
      .join(', ')
    return { kind: 'invalid', reason: `no cumple el esquema (${where})` }
  }
  return { kind: 'ok', output: tidy(r.data) }
}
