import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, memoryStorage, referenceProfile, tacosProposal } from '../test/fixtures'
import { ApiError, CLIENT_ERROR_MESSAGES, createApiClient, NOT_FOOD_MESSAGE } from './api'
import { createTokenStore, TOKEN_KEY } from './token'

function setup(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const storage = memoryStorage()
  storage.setItem(TOKEN_KEY, 'secreto')
  const tokens = createTokenStore(() => storage)
  const fetchFn = vi.fn(impl)
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  return { api, tokens, fetchFn, storage }
}

async function catchError(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('se esperaba un error')
}

describe('cliente de API', () => {
  it('envía el token como Bearer y valida la respuesta', async () => {
    const { api, fetchFn } = setup(async () => jsonResponse(referenceProfile))
    const profile = await api.getProfile()
    expect(profile.targetKcal).toBe(referenceProfile.targetKcal)
    const init = fetchFn.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secreto')
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/profile')
  })

  it('un 401 borra el token y lanza UNAUTHORIZED', async () => {
    const { api, tokens, storage } = setup(async () =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Token inválido o ausente' } }, 401),
    )
    const listener = vi.fn()
    tokens.subscribe(listener)
    const err = await catchError(api.getUsage())
    expect(err.code).toBe('UNAUTHORIZED')
    expect(err.status).toBe(401)
    expect(tokens.get()).toBeNull()
    expect(storage.getItem(TOKEN_KEY)).toBeNull()
    expect(listener).toHaveBeenCalled()
  })

  it('verifyToken con 401 no borra el token guardado', async () => {
    const { api, tokens, fetchFn } = setup(async () =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'x' } }, 401),
    )
    const err = await catchError(api.verifyToken('otro'))
    expect(err.code).toBe('UNAUTHORIZED')
    expect(tokens.get()).toBe('secreto')
    const init = fetchFn.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer otro')
  })

  it('sin token no llama a la red', async () => {
    const { api, tokens, fetchFn } = setup(async () => jsonResponse({}))
    tokens.clear()
    const err = await catchError(api.getProfile())
    expect(err.code).toBe('UNAUTHORIZED')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('red caída → NETWORK con mensaje en español', async () => {
    const { api } = setup(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await catchError(api.listEntries('2026-11-04'))
    expect(err.code).toBe('NETWORK')
    expect(err.message).toBe('Sin conexión. Revisa tu internet.')
    expect(err.status).toBe(0)
  })

  it('cancelación → ABORTED', async () => {
    const { api } = setup(async () => {
      throw new DOMException('aborted', 'AbortError')
    })
    const err = await catchError(api.analyzeText({ text: 'tacos' }))
    expect(err.code).toBe('ABORTED')
  })

  it('usa el código y mensaje del error estándar', async () => {
    const { api } = setup(async () =>
      jsonResponse({ error: { code: 'DAILY_LIMIT', message: 'Usaste 50 de 50' } }, 429),
    )
    const err = await catchError(api.analyzeText({ text: 'tacos' }))
    expect(err.code).toBe('DAILY_LIMIT')
    expect(err.status).toBe(429)
    expect(err.message).toBe('Usaste 50 de 50')
    expect(err.isClientError).toBe(true)
  })

  it('error sin cuerpo estándar → código por estado y mensaje de respaldo', async () => {
    const { api } = setup(async () => new Response('Bad gateway', { status: 503 }))
    const err = await catchError(api.getUsage())
    expect(err.code).toBe('AI_UNAVAILABLE')
    expect(err.message).toBe('El servicio de IA no está disponible; intenta más tarde')
  })

  it('422 sin mensaje → "no parece comida"', async () => {
    const { api } = setup(async () => new Response('', { status: 422 }))
    const err = await catchError(api.analyzeText({ text: 'una piedra' }))
    expect(err.status).toBe(422)
    expect(err.message).toBe(NOT_FOOD_MESSAGE)
  })

  it('perfil inexistente → NOT_FOUND (404)', async () => {
    const { api } = setup(async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'No hay perfil' } }, 404),
    )
    const err = await catchError(api.getProfile())
    expect(err.code).toBe('NOT_FOUND')
  })

  it('respuesta que no cumple el esquema → INVALID_RESPONSE', async () => {
    const { api } = setup(async () => jsonResponse({ targetKcal: 'mucho' }))
    const err = await catchError(api.getProfile())
    expect(err.code).toBe('INVALID_RESPONSE')
    expect(err.message).toBe(CLIENT_ERROR_MESSAGES.INVALID_RESPONSE)
  })

  it('JSON roto → INVALID_RESPONSE', async () => {
    const { api } = setup(async () => new Response('<html>', { status: 200 }))
    const err = await catchError(api.getUsage())
    expect(err.code).toBe('INVALID_RESPONSE')
  })

  it('DELETE acepta 204 sin cuerpo', async () => {
    const { api, fetchFn } = setup(async () => new Response(null, { status: 204 }))
    await expect(api.deleteEntry('abc')).resolves.toBeUndefined()
    expect(fetchFn.mock.calls[0]?.[1]?.method).toBe('DELETE')
  })

  it('analyzePhoto envía multipart con image, note y localHour', async () => {
    const { api, fetchFn } = setup(async () => jsonResponse(tacosProposal))
    const blob = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: 'image/jpeg' })
    const proposal = await api.analyzePhoto(blob, { note: 'Frito', localHour: 13 })
    expect(proposal.title).toBe('Tacos al pastor')
    const body = fetchFn.mock.calls[0]?.[1]?.body
    expect(body).toBeInstanceOf(FormData)
    const form = body as FormData
    expect(form.get('image')).toBeInstanceOf(Blob)
    expect(form.get('note')).toBe('Frito')
    expect(form.get('localHour')).toBe('13')
  })

  it('analyzeText envía JSON', async () => {
    const { api, fetchFn } = setup(async () => jsonResponse(tacosProposal))
    await api.analyzeText({ text: '2 tacos', localHour: 9 })
    const init = fetchFn.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ text: '2 tacos', localHour: 9 })
  })

  it('health no envía token', async () => {
    const { api, fetchFn } = setup(async () => jsonResponse({ status: 'ok', app: 'Kalapp' }))
    await api.health()
    const init = fetchFn.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).has('Authorization')).toBe(false)
  })
})

describe('tokenStore', () => {
  it('sobrevive a un localStorage que lanza (modo privado)', () => {
    const tokens = createTokenStore(() => {
      throw new Error('SecurityError')
    })
    tokens.set('abc')
    expect(tokens.get()).toBe('abc')
    tokens.clear()
    expect(tokens.get()).toBeNull()
  })
})
