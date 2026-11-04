import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

describe('GET /api/health', () => {
  it('responde ok sin token', async () => {
    const res = await exports.default.fetch('https://kalapp.test/api/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok', app: 'Kalapp' })
  })

  it('devuelve error con forma estándar en rutas inexistentes', async () => {
    const res = await exports.default.fetch('https://kalapp.test/api/no-existe')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' },
    })
  })
})
