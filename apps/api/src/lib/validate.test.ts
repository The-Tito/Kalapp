import { beforeEach, describe, expect, it } from 'vitest'
import { json, resetDb } from '../test/helpers'
import { jsonDepthExceeds } from './validate'

beforeEach(resetDb)

const nested = (n: number) => `${'['.repeat(n)}${']'.repeat(n)}`

describe('JSON anidado', () => {
  it('jsonDepthExceeds: cuenta niveles fuera de strings', () => {
    expect(jsonDepthExceeds(nested(32))).toBe(false)
    expect(jsonDepthExceeds(nested(33))).toBe(true)
    expect(jsonDepthExceeds(`{"a":"${'['.repeat(100)}"}`)).toBe(false)
    expect(jsonDepthExceeds(`{"a":"\\"${'{'.repeat(100)}"}`)).toBe(false)
  })

  it('10 000 niveles → 400 "JSON demasiado anidado" en todas las rutas JSON', async () => {
    const body = `{"text":${nested(10_000)}}`
    for (const [path, method] of [
      ['/api/analyze', 'POST'],
      ['/api/entries', 'POST'],
      ['/api/profile', 'PUT'],
      ['/api/favorites', 'POST'],
      ['/api/weights', 'POST'],
      [`/api/entries/${crypto.randomUUID()}`, 'PATCH'],
    ] as const) {
      const res = await json(path, method, body)
      expect(res.status, path).toBe(400)
      expect(await res.json()).toEqual({
        error: { code: 'VALIDATION', message: 'JSON demasiado anidado' },
      })
    }
  })

  it('anidado dentro del límite pero inválido para el esquema → 400 VALIDATION', async () => {
    const res = await json('/api/analyze', 'POST', `{"text":${nested(30)}}`)
    expect(res.status).toBe(400)
  })
})
