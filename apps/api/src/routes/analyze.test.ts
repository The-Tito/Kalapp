import { env } from 'cloudflare:test'
import { AnalysisProposalSchema, DEFAULT_TIMEZONE, toLocalDate } from '@kalapp/shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_OUTPUT,
  api,
  geminiResponse,
  jpegBytes,
  json,
  jsonResponse,
  mockFetch,
  photoForm,
  resetDb,
} from '../test/helpers'

const today = () => toLocalDate(new Date(), DEFAULT_TIMEZONE)

beforeEach(async () => {
  await resetDb()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

const postPhoto = (form: FormData) => api('/api/analyze', { method: 'POST', body: form })

async function usageCalls() {
  const row = await env.DB.prepare('SELECT COALESCE(SUM(calls), 0) AS n FROM ai_usage').first<{
    n: number
  }>()
  return row?.n ?? 0
}

async function entryCount() {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM entries').first<{ n: number }>()
  return row?.n ?? 0
}

/** RequestInit de la llamada `i` al fetch simulado. */
function callInit(spy: ReturnType<typeof mockFetch>, i = 0): RequestInit {
  const init = spy.mock.calls[i]?.[1]
  if (!init) throw new Error(`fetch no recibió la llamada ${i}`)
  return init
}

const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code

describe('POST /api/analyze (foto)', () => {
  it('camino feliz: llama a Gemini y devuelve la propuesta sin guardar nada', async () => {
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    const res = await postPhoto(
      photoForm(jpegBytes(2000), 'image/jpeg', { note: 'con piña', localHour: '14' }),
    )
    expect(res.status).toBe(200)
    const proposal = AnalysisProposalSchema.parse(await res.json())
    expect(proposal.model).toBe('gemini-flash-latest')
    expect(proposal.totals).toEqual({ kcal: 330, proteinG: 21.4, carbsG: 30, fatG: 14.4 })
    expect(proposal.energyMismatch).toBe(false)
    expect(proposal).not.toHaveProperty('not_food')

    expect(spy).toHaveBeenCalledTimes(1)
    const [url, init] = spy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    )
    expect(new Headers(init.headers).get('x-goog-api-key')).toBe('test-key')
    const body = JSON.parse(init.body as string)
    expect(body.generationConfig.temperature).toBe(0)
    expect(body.contents[0].parts[0].text).toContain('con piña')
    expect(body.contents[0].parts[0].text).toContain('14:00')
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg')

    expect(await entryCount()).toBe(0)
    expect(await usageCalls()).toBe(1)
    const usage = await api('/api/usage')
    expect(await usage.json()).toEqual({ date: today(), calls: 1, limit: 60 })
  })

  it('marca energyMismatch si las kcal no cuadran con 4/4/9', async () => {
    mockFetch(() =>
      geminiResponse({
        ...AI_OUTPUT,
        items: [{ ...AI_OUTPUT.items[0], kcal: 400 }],
      }),
    )
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(((await res.json()) as { energyMismatch: boolean }).energyMismatch).toBe(true)
  })

  it('imagen de 1 MiB exacto (base64 grande) funciona', async () => {
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    const res = await postPhoto(photoForm(jpegBytes(1_048_576)))
    expect(res.status).toBe(200)
    const body = JSON.parse(callInit(spy).body as string)
    expect(body.contents[0].parts[1].inline_data.data).toHaveLength(Math.ceil(1_048_576 / 3) * 4)
  })

  it('tipo no permitido → 415 y no cuenta uso', async () => {
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    const gif = await postPhoto(photoForm(jpegBytes(100), 'image/gif'))
    expect(gif.status).toBe(415)
    expect(await errorCode(gif)).toBe('UNSUPPORTED_MEDIA')
    // Dice ser PNG pero los bytes son JPEG.
    const liar = await postPhoto(photoForm(jpegBytes(100), 'image/png'))
    expect(liar.status).toBe(415)
    expect(spy).not.toHaveBeenCalled()
    expect(await usageCalls()).toBe(0)
  })

  it('otro content-type → 415', async () => {
    const res = await api('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'tacos',
    })
    expect(res.status).toBe(415)
  })

  it('imagen > MAX_IMAGE_BYTES → 413', async () => {
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    const res = await postPhoto(photoForm(jpegBytes(1_048_577)))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({
      error: { code: 'PAYLOAD_TOO_LARGE', message: 'La imagen pesa más de 1 MB' },
    })
    // Cuerpo muy grande: lo corta el límite de cuerpo antes de parsear el multipart.
    const huge = await postPhoto(photoForm(jpegBytes(3 * 1_048_576)))
    expect(huge.status).toBe(413)
    expect(spy).not.toHaveBeenCalled()
  })

  it('imagen vacía (0 bytes) o ausente → 400', async () => {
    const empty = await postPhoto(photoForm(new Uint8Array()))
    expect(empty.status).toBe(400)
    expect(await errorCode(empty)).toBe('VALIDATION')
    const form = new FormData()
    form.append('note', 'sin foto')
    expect((await postPhoto(form)).status).toBe(400)
  })

  it('localHour inválido → 400', async () => {
    const res = await postPhoto(photoForm(jpegBytes(100), 'image/jpeg', { localHour: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('límite diario alcanzado → 429 DAILY_LIMIT sin llamar a Gemini', async () => {
    await env.DB.prepare('INSERT INTO ai_usage (date, model, calls) VALUES (?, ?, ?), (?, ?, ?)')
      .bind(today(), 'gemini-flash-latest', 50, today(), 'otro', 10)
      .run()
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(res.status).toBe(429)
    expect(await errorCode(res)).toBe('DAILY_LIMIT')
    expect(spy).not.toHaveBeenCalled()
  })

  it('429 del modelo principal → usa el de respaldo y cuenta un solo intento', async () => {
    const spy = mockFetch((url) =>
      url.includes('gemini-flash-latest')
        ? jsonResponse({ error: { code: 429 } }, 429)
        : geminiResponse(AI_OUTPUT),
    )
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { model: string }).model).toBe('gemini-flash-lite-latest')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(spy.mock.calls[1]?.[0]).toContain('gemini-flash-lite-latest')
    expect(await usageCalls()).toBe(1)
  })

  it('timeout del principal → respaldo; ambos caídos → 503 AI_UNAVAILABLE', async () => {
    mockFetch((url) => {
      if (url.includes('gemini-flash-latest')) {
        throw new DOMException('The operation timed out.', 'TimeoutError')
      }
      return geminiResponse(AI_OUTPUT)
    })
    expect((await postPhoto(photoForm(jpegBytes(100)))).status).toBe(200)

    vi.restoreAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const spy = mockFetch((url) => {
      if (url.includes('lite')) return new Response('caído', { status: 503 })
      throw new DOMException('The operation timed out.', 'TimeoutError')
    })
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(res.status).toBe(503)
    expect(await errorCode(res)).toBe('AI_UNAVAILABLE')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('cada llamada lleva un AbortSignal (timeout de 25 s)', async () => {
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    await postPhoto(photoForm(jpegBytes(100)))
    expect(callInit(spy).signal).toBeInstanceOf(AbortSignal)
  })

  it('JSON inválido de la IA en ambos modelos → 502 AI_INVALID_RESPONSE', async () => {
    const spy = mockFetch(() => geminiResponse('{"title": "Tacos", "items": ['))
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(res.status).toBe(502)
    expect(await errorCode(res)).toBe('AI_INVALID_RESPONSE')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('respuesta inválida del principal → el respaldo la corrige', async () => {
    mockFetch((url) =>
      url.includes('gemini-flash-latest')
        ? geminiResponse({ ...AI_OUTPUT, items: [{ ...AI_OUTPUT.items[0], kcal: -5 }] })
        : geminiResponse(AI_OUTPUT),
    )
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(res.status).toBe(200)
  })

  it('bloqueo de seguridad / sin candidatos → 502', async () => {
    mockFetch(() => jsonResponse({ promptFeedback: { blockReason: 'SAFETY' } }))
    expect((await postPhoto(photoForm(jpegBytes(100)))).status).toBe(502)
  })

  it('400 de Gemini (configuración) → 503 sin intentar el respaldo', async () => {
    const spy = mockFetch(() => jsonResponse({ error: { code: 400 } }, 400))
    expect((await postPhoto(photoForm(jpegBytes(100)))).status).toBe(503)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('no es comida → 422 NOT_FOOD', async () => {
    const spy = mockFetch(() =>
      geminiResponse({
        not_food: true,
        title: 'No se detectó comida',
        items: [],
        confidence: 'low',
      }),
    )
    const res = await postPhoto(photoForm(jpegBytes(100)))
    expect(res.status).toBe(422)
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOOD', message: 'No se detectó comida en la foto' },
    })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/analyze (texto)', () => {
  it('camino feliz: sin imagen, con el texto en el prompt', async () => {
    const spy = mockFetch(() => geminiResponse(AI_OUTPUT))
    const res = await json('/api/analyze', 'POST', { text: '3 tacos al pastor', localHour: 21 })
    expect(res.status).toBe(200)
    AnalysisProposalSchema.parse(await res.json())
    const body = JSON.parse(callInit(spy).body as string)
    expect(body.contents[0].parts).toHaveLength(1)
    expect(body.contents[0].parts[0].text).toContain('3 tacos al pastor')
    expect(body.contents[0].parts[0].text).toContain('21:00')
    expect(await entryCount()).toBe(0)
  })

  it('texto vacío → 400; JSON malformado → 400', async () => {
    expect((await json('/api/analyze', 'POST', { text: '  ' })).status).toBe(400)
    expect((await json('/api/analyze', 'POST', '{"text":')).status).toBe(400)
    expect(await usageCalls()).toBe(0)
  })
})
