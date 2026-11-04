import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, memoryStorage, referenceProfile } from '../test/fixtures'
import { ApiError, createApiClient, errorMessage } from './api'
import { createTokenStore, TOKEN_KEY } from './token'

function setup(
  impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  token = 'secreto',
) {
  const storage = memoryStorage()
  storage.setItem(TOKEN_KEY, token)
  const tokens = createTokenStore(() => storage)
  const fetchFn = vi.fn(impl)
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  return { api, tokens, fetchFn, storage }
}

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p
  } catch (err) {
    return err
  }
  throw new Error('se esperaba un error')
}

describe('cliente de API (adversarial)', () => {
  it('200 con cuerpo no JSON → INVALID_RESPONSE (no SyntaxError crudo)', async () => {
    const { api } = setup(async () => new Response('<html>proxy</html>', { status: 200 }))
    const err = await caught(api.getProfile())
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).code).toBe('INVALID_RESPONSE')
  })

  it('200 con JSON que no cumple el esquema → INVALID_RESPONSE con detalles', async () => {
    const { api } = setup(async () => jsonResponse({ ...referenceProfile, targetKcal: 'mucho' }))
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('INVALID_RESPONSE')
    expect(Array.isArray(err.details)).toBe(true)
  })

  it('204 donde se espera JSON → INVALID_RESPONSE', async () => {
    const { api } = setup(async () => new Response(null, { status: 204 }))
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('INVALID_RESPONSE')
  })

  it('500 sin cuerpo → INTERNAL con mensaje en español', async () => {
    const { api } = setup(async () => new Response(null, { status: 500 }))
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('INTERNAL')
    expect(err.status).toBe(500)
    expect(err.message).toMatch(/servidor/i)
  })

  it('error con forma inesperada (código desconocido / sin message) cae al estado HTTP', async () => {
    const { api } = setup(async () =>
      jsonResponse({ error: { code: 'TEAPOT', msg: 'x' }, extra: 1 }, 409),
    )
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('CONFLICT')
    expect(err.status).toBe(409)
  })

  it('error con message vacío usa el mensaje por defecto', async () => {
    const { api } = setup(async () =>
      jsonResponse({ error: { code: 'DAILY_LIMIT', message: '   ' } }, 429),
    )
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('DAILY_LIMIT')
    expect(err.message.trim()).not.toBe('')
  })

  it('estado raro (418) sin cuerpo → UNKNOWN con mensaje legible', async () => {
    const { api } = setup(async () => new Response('', { status: 418 }))
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('UNKNOWN')
    expect(errorMessage(err)).not.toBe('')
  })

  it('timeout del fetch (TimeoutError) se trata como falla de red (candidato a la cola)', async () => {
    const { api } = setup(async () => {
      throw new DOMException('timeout', 'TimeoutError')
    })
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('NETWORK')
  })

  it('abort a mitad de la lectura del cuerpo → ABORTED, no INVALID_RESPONSE', async () => {
    const controller = new AbortController()
    const { api } = setup(async () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('{"title":'))
        },
      })
      const res = new Response(stream, { status: 200 })
      // El cuerpo falla con AbortError cuando el usuario cancela.
      Object.defineProperty(res, 'json', {
        value: async () => {
          controller.abort()
          throw new DOMException('aborted', 'AbortError')
        },
      })
      return res
    })
    const err = (await caught(
      api.analyzeText({ text: 'tacos', localHour: 13 }, controller.signal),
    )) as ApiError
    expect(err.code).toBe('ABORTED')
  })

  it('abort antes de responder → ABORTED', async () => {
    const controller = new AbortController()
    const { api } = setup(
      (_i, init) =>
        new Promise((_r, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    const p = api.analyzeText({ text: 'tacos', localHour: 13 }, controller.signal)
    controller.abort()
    expect(((await caught(p)) as ApiError).code).toBe('ABORTED')
  })

  it('BUG: token con caracteres no válidos en un header (salto de línea / no Latin-1) lanza TypeError crudo en vez de ApiError', async () => {
    for (const bad of ['abc\ndef', 'tok€n', 'emoji🔑']) {
      const { api, fetchFn } = setup(async () => jsonResponse(referenceProfile), bad)
      const err = await caught(api.getProfile())
      expect(fetchFn).not.toHaveBeenCalled()
      // Esperado: un ApiError (UNAUTHORIZED/VALIDATION) con mensaje en español.
      expect(err).toBeInstanceOf(ApiError)
    }
  })

  it('BUG: verifyToken con token no Latin-1 debe fallar con ApiError (TokenScreen muestra "error inesperado")', async () => {
    const { api } = setup(async () => jsonResponse({}))
    const err = await caught(api.verifyToken('contraseña€'))
    expect(err).toBeInstanceOf(ApiError)
  })

  it('401 en mitad de una cola de peticiones: borra el token una vez por respuesta y no reintenta (sin bucle)', async () => {
    let n = 0
    const { api, tokens, fetchFn } = setup(async () => {
      n++
      if (n === 2) {
        return jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'x' } }, 401)
      }
      return jsonResponse(referenceProfile)
    })
    const listener = vi.fn()
    tokens.subscribe(listener)
    const results = await Promise.allSettled([
      api.getProfile(),
      api.getProfile(),
      api.getProfile(),
      api.getProfile(),
    ])
    // Las que ya salieron con token responden; tras el 401 el token queda borrado.
    expect(results.filter((r) => r.status === 'rejected').length).toBeGreaterThanOrEqual(1)
    expect(tokens.get()).toBeNull()
    // Una petición nueva sin token NO toca la red (no hay bucle de reintentos).
    const before = fetchFn.mock.calls.length
    const err = (await caught(api.getProfile())) as ApiError
    expect(err.code).toBe('UNAUTHORIZED')
    expect(fetchFn.mock.calls.length).toBe(before)
    expect(listener.mock.calls.length).toBeLessThan(10)
  })

  it('el token nunca va en la URL', async () => {
    const { api, fetchFn } = setup(async () => jsonResponse([]), 'super-secreto-123')
    await api.listEntries('2026-11-04').catch(() => {})
    await api.getSummary('2026-11-01', '2026-11-04').catch(() => {})
    await api.getBarcode('7501055300075').catch(() => {})
    await api.exportFile('csv').catch(() => {})
    for (const call of fetchFn.mock.calls) {
      expect(String(call[0])).not.toContain('super-secreto-123')
    }
  })

  it('ids y códigos con caracteres de ruta se codifican (no hay path traversal)', async () => {
    const { api, fetchFn } = setup(async () => new Response(null, { status: 204 }))
    await api.deleteEntry('../profile')
    await api.deleteFavorite('a/b?c#d')
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe('/api/entries/..%2Fprofile')
    expect(String(fetchFn.mock.calls[1]?.[0])).toBe('/api/favorites/a%2Fb%3Fc%23d')
  })

  it('export con 200 pero fallo al leer el blob → NETWORK', async () => {
    const { api } = setup(async () => {
      const res = new Response('a,b', { status: 200 })
      Object.defineProperty(res, 'blob', {
        value: async () => {
          throw new TypeError('stream')
        },
      })
      return res
    })
    expect(((await caught(api.exportFile('csv'))) as ApiError).code).toBe('NETWORK')
  })
})
