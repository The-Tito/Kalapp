import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { api } from './test/helpers'

describe('GET /api/health', () => {
  it('responde ok sin token y sin caché', async () => {
    const res = await exports.default.fetch('https://kalapp.test/api/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({ status: 'ok', app: 'Kalapp' })
  })

  it('devuelve error con forma estándar en rutas inexistentes (con token)', async () => {
    const res = await api('/api/no-existe')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' },
    })
  })

  it('una ruta inexistente sin token responde 401 (no revela qué rutas existen)', async () => {
    const res = await exports.default.fetch('https://kalapp.test/api/no-existe')
    expect(res.status).toBe(401)
  })
})
