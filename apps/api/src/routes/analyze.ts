import {
  ALLOWED_IMAGE_TYPES,
  ANALYZE_IMAGE_FIELD,
  ANALYZE_LOCAL_HOUR_FIELD,
  ANALYZE_NOTE_FIELD,
  AnalyzePhotoFieldsSchema,
  AnalyzeTextRequestSchema,
  toAnalysisProposal,
  toLocalHour,
} from '@kalapp/shared'
import { Hono } from 'hono'
import { getProfileTimezone } from '../db/profile'
import { getUsageCalls, incrementUsage } from '../db/usage'
import type { AppEnv, Env } from '../env'
import { analyzeWithFallback } from '../gemini/client'
import type { AnalyzePromptInput } from '../gemini/prompt'
import { bytesToBase64, type GeminiImage } from '../gemini/request'
import { HttpError } from '../lib/errors'
import { safeTimeZone, todayIn } from '../lib/time'
import { parseWith, readJson } from '../lib/validate'
import { imageTooLargeMessage, maxImageBytes } from '../middleware/body-limit'

export const DEFAULT_DAILY_ANALYZE_LIMIT = 60

export function dailyLimit(env: Env): number {
  const n = Number(env.DAILY_ANALYZE_LIMIT)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_ANALYZE_LIMIT
}

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number]

function isAllowedType(type: string): type is AllowedImageType {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type)
}

/** Comprueba la firma del archivo para que el tipo declarado no mienta. */
function matchesSignature(type: AllowedImageType, b: Uint8Array): boolean {
  const at = (i: number) => b[i] ?? -1
  switch (type) {
    case 'image/jpeg':
      return at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff
    case 'image/png':
      return at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47
    case 'image/webp':
      return at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57
  }
}

const unsupportedImage = () =>
  new HttpError('UNSUPPORTED_MEDIA', 'Formato de imagen no soportado; usa JPEG, PNG o WebP')

async function readPhotoRequest(
  req: Request,
  env: Env,
): Promise<{ prompt: AnalyzePromptInput; image: GeminiImage }> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new HttpError('VALIDATION', 'El formulario (multipart) no es válido')
  }
  const file = form.get(ANALYZE_IMAGE_FIELD)
  if (!(file instanceof File)) {
    throw new HttpError('VALIDATION', 'Falta la imagen', [
      { path: ANALYZE_IMAGE_FIELD, message: 'Falta la imagen' },
    ])
  }
  if (file.size === 0) {
    throw new HttpError('VALIDATION', 'La imagen está vacía', [
      { path: ANALYZE_IMAGE_FIELD, message: 'La imagen está vacía' },
    ])
  }
  const type = file.type.toLowerCase().split(';')[0]?.trim() ?? ''
  if (!isAllowedType(type)) throw unsupportedImage()
  const max = maxImageBytes(env)
  if (file.size > max) throw new HttpError('PAYLOAD_TOO_LARGE', imageTooLargeMessage(max))

  const text = (name: string) => {
    const v = form.get(name)
    return typeof v === 'string' ? v : undefined
  }
  const fields = parseWith(AnalyzePhotoFieldsSchema, {
    note: text(ANALYZE_NOTE_FIELD),
    localHour: text(ANALYZE_LOCAL_HOUR_FIELD),
  })
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!matchesSignature(type, bytes)) throw unsupportedImage()
  return {
    prompt: { mode: 'photo', note: fields.note || undefined, localHour: fields.localHour },
    image: { mimeType: type, base64: bytesToBase64(bytes) },
  }
}

export const analyzeRoutes = new Hono<AppEnv>()

/**
 * `POST /api/analyze`: foto (multipart) o texto (JSON). Valida → cuenta el intento del día →
 * Gemini (principal y respaldo) → Zod → 4/4/9 y totales. Nunca guarda en `entries`.
 */
analyzeRoutes.post('/', async (c) => {
  const contentType = (c.req.header('content-type') ?? '').toLowerCase()
  let prompt: AnalyzePromptInput
  let image: GeminiImage | undefined
  if (contentType.startsWith('multipart/form-data')) {
    ;({ prompt, image } = await readPhotoRequest(c.req.raw, c.env))
  } else if (contentType.startsWith('application/json')) {
    const body = await readJson(c, AnalyzeTextRequestSchema)
    prompt = {
      mode: 'text',
      text: body.text,
      note: body.note || undefined,
      localHour: body.localHour,
    }
  } else {
    throw new HttpError(
      'UNSUPPORTED_MEDIA',
      'Envía la foto como multipart/form-data o el texto como application/json',
    )
  }

  const apiKey = c.env.GEMINI_API_KEY
  const primary = c.env.GEMINI_MODEL?.trim()
  if (!apiKey || !primary) {
    console.error('Falta GEMINI_API_KEY o GEMINI_MODEL')
    throw new HttpError('INTERNAL', 'Servidor sin configurar')
  }

  const tz = safeTimeZone(await getProfileTimezone(c.env.DB))
  if (prompt.localHour === undefined) prompt.localHour = toLocalHour(new Date(), tz)
  const date = todayIn(tz)
  const limit = dailyLimit(c.env)
  if ((await getUsageCalls(c.env.DB, date)) >= limit) throw new HttpError('DAILY_LIMIT')
  // Se cuenta antes de llamar: un intento = principal + respaldo.
  await incrementUsage(c.env.DB, date, primary)

  const { result, attempts } = await analyzeWithFallback(
    { primary, fallback: c.env.GEMINI_FALLBACK_MODEL },
    { apiKey, prompt, image },
  )
  for (const a of attempts) {
    if (a.kind !== 'ok' && a.kind !== 'not_food') {
      console.warn(`Gemini ${a.model}: ${a.kind} (${a.reason})`)
    }
  }
  switch (result.kind) {
    case 'ok':
      return c.json(toAnalysisProposal(result.output, result.model))
    case 'not_food':
      throw new HttpError(
        'VALIDATION',
        prompt.mode === 'photo'
          ? 'No se detectó comida en la foto'
          : 'No se reconoció comida en la descripción',
        undefined,
        422,
      )
    case 'invalid':
      throw new HttpError('AI_INVALID_RESPONSE')
    default:
      throw new HttpError('AI_UNAVAILABLE')
  }
})
