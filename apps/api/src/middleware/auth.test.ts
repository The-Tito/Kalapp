import { env } from 'cloudflare:test'
import { describe, expect, it, vi } from 'vitest'
import { app, createApp } from '../app'
import { api, json, TOKEN } from '../test/helpers'
import { bearerToken, timingSafeEqualStrings } from './auth'

describe('token', () => {
  it('sin Authorization → 401 UNAUTHORIZED', async () => {
    const res = await api('/api/usage', { token: null })
    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual({
      error: { code: 'UNAUTHORIZED', message: 'Token inválido o ausente' },
    })
  })

  it('token incorrecto de la misma longitud → 401', async () => {
    const bad = `${TOKEN.slice(0, -1)}x`
    expect(bad).toHaveLength(TOKEN.length)
    expect((await api('/api/usage', { token: bad })).status).toBe(401)
  })

  it('token de otra longitud (prefijo y extendido) → 401', async () => {
    expect((await api('/api/usage', { token: TOKEN.slice(0, 5) })).status).toBe(401)
    expect((await api('/api/usage', { token: `${TOKEN}extra` })).status).toBe(401)
  })

  it('esquema distinto de Bearer → 401', async () => {
    const res = await api('/api/usage', {
      token: null,
      headers: { authorization: `Basic ${TOKEN}` },
    })
    expect(res.status).toBe(401)
  })

  it('token correcto → 200 (Bearer sin distinguir mayúsculas)', async () => {
    expect((await api('/api/usage')).status).toBe(200)
    const res = await api('/api/usage', {
      token: null,
      headers: { authorization: `bearer ${TOKEN}` },
    })
    expect(res.status).toBe(200)
  })

  it('APP_TOKEN ausente o corto → 500 "Servidor sin configurar" (fail closed)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const headers = { authorization: 'Bearer cualquier-cosa' }
    for (const APP_TOKEN of [undefined, '', 'corto-123']) {
      const res = await app.request('/api/usage', { headers }, { ...env, APP_TOKEN })
      expect(res.status).toBe(500)
      expect(await res.json()).toEqual({
        error: { code: 'INTERNAL', message: 'Servidor sin configurar' },
      })
    }
    // Health sigue respondiendo para diagnosticar el despliegue.
    const health = await app.request('/api/health', {}, { ...env, APP_TOKEN: undefined })
    expect(health.status).toBe(200)
  })

  it('helpers de comparación', async () => {
    expect(bearerToken('Bearer abc')).toBe('abc')
    expect(bearerToken('Bearer ')).toBeNull()
    expect(bearerToken('Bearer a b')).toBeNull()
    expect(bearerToken(undefined)).toBeNull()
    expect(await timingSafeEqualStrings('abc', 'abc')).toBe(true)
    expect(await timingSafeEqualStrings('abc', 'abcd')).toBe(false)
  })
})

describe('errores genéricos', () => {
  it('onError → 500 INTERNAL sin filtrar el mensaje original', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const a = createApp()
    a.get('/boom', () => {
      throw new Error('detalle secreto de la BD')
    })
    const res = await a.request('/api/boom', { headers: { authorization: `Bearer ${TOKEN}` } }, env)
    expect(res.status).toBe(500)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = await res.text()
    expect(text).not.toContain('secreto')
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL', message: 'Error interno del servidor' },
    })
    expect(errSpy).toHaveBeenCalled()
  })

  it('JSON malformado → 400 VALIDATION', async () => {
    const res = await json('/api/entries', 'POST', '{"id": ')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      error: { code: 'VALIDATION', message: 'El cuerpo no es JSON válido' },
    })
  })

  it('errores de Zod → 400 VALIDATION con details resumidos', async () => {
    const res = await json('/api/weights', 'POST', { localDate: '2026-13-01', weightKg: 10 })
    expect(res.status).toBe(400)
    const body = (await res.json()) as {
      error: { code: string; details: { path: string; message: string }[] }
    }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.details.map((d) => d.path).sort()).toEqual(['localDate', 'weightKg'])
  })

  it('cuerpo JSON > 256 KB → 413 PAYLOAD_TOO_LARGE', async () => {
    const big = JSON.stringify({ text: 'x'.repeat(300 * 1024) })
    const res = await json('/api/entries', 'POST', big)
    expect(res.status).toBe(413)
    const body = (await res.json()) as { error: { code: string } }
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE')
  })
})
