import { describe, expect, it, vi } from 'vitest'
import { jsonResponse, memoryStorage } from '../test/fixtures'
import { createApiClient } from './api'
import { createTokenStore, TOKEN_KEY } from './token'

function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('QuotaExceededError', 'QuotaExceededError')
  }
  return {
    length: 0,
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  } as unknown as Storage
}

describe('token store (adversarial)', () => {
  it('localStorage que lanza en todo (Safari privado): set/get/clear no revientan y usan memoria', () => {
    const store = createTokenStore(() => throwingStorage())
    expect(store.get()).toBeNull()
    expect(() => store.set('abc')).not.toThrow()
    expect(store.get()).toBe('abc')
    expect(() => store.clear()).not.toThrow()
    expect(store.get()).toBeNull()
  })

  it('el getter del almacenamiento lanza (SecurityError al acceder a localStorage)', () => {
    const store = createTokenStore(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    store.set('abc')
    expect(store.get()).toBe('abc')
  })

  it('valor de solo espacios cuenta como sin token', () => {
    const s = memoryStorage()
    s.setItem(TOKEN_KEY, '   \t ')
    expect(createTokenStore(() => s).get()).toBeNull()
  })

  it('BUG: token guardado con espacios al inicio/fin se devuelve sin recortar (valor corrupto/heredado)', () => {
    const s = memoryStorage()
    s.setItem(TOKEN_KEY, '  abc123 \n')
    expect(createTokenStore(() => s).get()).toBe('abc123')
  })

  it('BUG: set() con espacios guarda el token tal cual (solo TokenScreen recorta)', () => {
    const s = memoryStorage()
    const store = createTokenStore(() => s)
    store.set(' abc123 ')
    expect(s.getItem(TOKEN_KEY)).toBe('abc123')
  })

  it('BUG: token guardado con espacio inicial: el header Authorization no lleva doble espacio', async () => {
    const s = memoryStorage()
    s.setItem(TOKEN_KEY, ' abc123')
    const fetchFn = vi.fn(async (_i: RequestInfo | URL, _init?: RequestInit) => jsonResponse({}))
    const api = createApiClient({
      fetchFn: fetchFn as unknown as typeof fetch,
      tokenStore: createTokenStore(() => s),
    })
    await api.getUsage().catch(() => {})
    const h = new Headers(fetchFn.mock.calls[0]?.[1]?.headers).get('Authorization')
    expect(h).toBe('Bearer abc123')
  })

  it('el token nunca se escribe en sessionStorage', () => {
    const local = memoryStorage()
    const session = memoryStorage()
    const original = globalThis.sessionStorage
    Object.defineProperty(globalThis, 'sessionStorage', { value: session, configurable: true })
    try {
      createTokenStore(() => local).set('tok-secreto')
      for (let i = 0; i < session.length; i++) {
        const k = session.key(i) ?? ''
        expect(session.getItem(k)).not.toContain('tok-secreto')
      }
      expect(session.length).toBe(0)
    } finally {
      Object.defineProperty(globalThis, 'sessionStorage', {
        value: original,
        configurable: true,
      })
    }
  })
})
