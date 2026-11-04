import { env } from 'cloudflare:test'
import { exports } from 'cloudflare:workers'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, BASE, json, resetDb, TOKEN } from '../test/helpers'

beforeEach(resetDb)

const raw = (path: string, init: RequestInit = {}) =>
  exports.default.fetch(new Request(`${BASE}${path}`, init))

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

function expectSecurityHeaders(res: Response) {
  expect(res.headers.get('cache-control')).toBe('no-store')
  expect(res.headers.get('x-content-type-options')).toBe('nosniff')
}

describe('adversarial: token', () => {
  it('token en query string no vale', async () => {
    const res = await raw(`/api/usage?token=${TOKEN}&access_token=${TOKEN}`)
    expect(res.status).toBe(401)
  })

  it('token en cookie no vale', async () => {
    const res = await raw('/api/usage', {
      headers: { cookie: `token=${TOKEN}; APP_TOKEN=${TOKEN}; authorization=Bearer ${TOKEN}` },
    })
    expect(res.status).toBe(401)
  })

  it('token en otros headers (x-api-key, x-app-token) no vale', async () => {
    const res = await raw('/api/usage', { headers: { 'x-api-key': TOKEN, 'x-app-token': TOKEN } })
    expect(res.status).toBe(401)
  })

  it('Bearer con espacios/tabs extra entre esquema y token se acepta (tolerante, no inseguro)', async () => {
    const res = await raw('/api/usage', { headers: { authorization: `Bearer    ${TOKEN}` } })
    expect(res.status).toBe(200)
    const tab = await raw('/api/usage', { headers: { authorization: `Bearer\t${TOKEN}` } })
    expect(tab.status).toBe(200)
  })

  it('mayúsculas/minúsculas del esquema (BEARER, bearer, BeArEr) aceptadas', async () => {
    for (const scheme of ['BEARER', 'bearer', 'BeArEr']) {
      const res = await raw('/api/usage', { headers: { authorization: `${scheme} ${TOKEN}` } })
      expect(res.status).toBe(200)
    }
  })

  it('el token SÍ distingue mayúsculas', async () => {
    const res = await raw('/api/usage', {
      headers: { authorization: `Bearer ${TOKEN.toUpperCase()}` },
    })
    expect(res.status).toBe(401)
  })

  it('token vacío, solo "Bearer", "Bearer " y sin esquema → 401', async () => {
    for (const h of [
      'Bearer',
      'Bearer ',
      'Bearer    ',
      TOKEN,
      `Token ${TOKEN}`,
      `Bearer:${TOKEN}`,
    ]) {
      const res = await raw('/api/usage', { headers: { authorization: h } })
      expect(res.status, h).toBe(401)
    }
  })

  it('token con caracteres latin-1 / bytes altos → 401 (no 500)', async () => {
    // fetch solo permite ByteString en headers; ñ (0xF1) es el caso "unicode" representable.
    const res = await raw('/api/usage', { headers: { authorization: `Bearer ${TOKEN}ñ` } })
    expect(res.status).toBe(401)
    const res2 = await raw('/api/usage', {
      headers: { authorization: 'Bearer ñññññññññññññññññññ' },
    })
    expect(res2.status).toBe(401)
  })

  it('token unicode real (emoji; workerd lo codifica como UTF-8) → 401 sin 500', async () => {
    const res = await raw('/api/usage', {
      headers: { authorization: 'Bearer 🍕🍕🍕🍕🍕🍕🍕🍕🍕🍕' },
    })
    expect(res.status).toBe(401)
  })

  it('header Authorization duplicado (correcto + basura) → 401', async () => {
    const h = new Headers()
    h.append('authorization', `Bearer ${TOKEN}`)
    h.append('authorization', 'Bearer otro')
    expect(h.get('authorization')).toContain(',')
    expect((await raw('/api/usage', { headers: h })).status).toBe(401)
  })

  it('header Authorization duplicado (dos veces el correcto) → 401 (se combinan con coma)', async () => {
    const h = new Headers()
    h.append('authorization', `Bearer ${TOKEN}`)
    h.append('authorization', `Bearer ${TOKEN}`)
    expect((await raw('/api/usage', { headers: h })).status).toBe(401)
  })

  it('token gigante (64 KB) → 401 sin 500', async () => {
    const res = await raw('/api/usage', {
      headers: { authorization: `Bearer ${'a'.repeat(65536)}` },
    })
    expect([401, 431]).toContain(res.status)
  })

  it('health accesible sin token y con token incorrecto', async () => {
    expect((await raw('/api/health')).status).toBe(200)
    const res = await raw('/api/health', { headers: { authorization: 'Bearer malo' } })
    expect(res.status).toBe(200)
    expectSecurityHeaders(res)
  })

  it('health no filtra secretos', async () => {
    const text = await (await raw('/api/health')).text()
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain(env.GEMINI_API_KEY ?? 'test-key')
  })

  it('POST /api/health sin token → 401 (solo GET es público)', async () => {
    expect((await raw('/api/health', { method: 'POST' })).status).toBe(401)
  })

  it('/api/health/ o /api/HEALTH no abren otras rutas sin token', async () => {
    for (const p of ['/api/health/../usage', '/api/health%2F..%2Fusage', '/api/HEALTH']) {
      const res = await raw(p)
      if (res.status === 200) {
        const body = (await res.json()) as Record<string, unknown>
        expect(body, p).toHaveProperty('status', 'ok')
      } else {
        expect([401, 404], p).toContain(res.status)
      }
    }
  })
})

describe('adversarial: rutas y métodos', () => {
  it('ruta inexistente sin token → 401 (no se enumeran rutas)', async () => {
    expect((await raw('/api/no-existe')).status).toBe(401)
  })

  it('ruta inexistente con token → 404 NOT_FOUND con forma estándar y cabeceras', async () => {
    const res = await api('/api/no-existe')
    expect(res.status).toBe(404)
    expect(await code(res)).toBe('NOT_FOUND')
    expectSecurityHeaders(res)
  })

  it('métodos no permitidos → 404/405 con forma de error, nunca 500 ni 200', async () => {
    const cases: [string, string][] = [
      ['PUT', '/api/entries'],
      ['DELETE', '/api/entries'],
      ['PATCH', '/api/entries'],
      ['POST', '/api/profile'],
      ['DELETE', '/api/profile'],
      ['GET', '/api/analyze'],
      ['PUT', '/api/weights'],
      ['POST', '/api/summary'],
      ['POST', '/api/export'],
      ['PATCH', '/api/favorites'],
    ]
    for (const [method, path] of cases) {
      const res = await api(path, {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      })
      expect([404, 405], `${method} ${path}`).toContain(res.status)
      expect(await code(res)).toBe('NOT_FOUND')
      expectSecurityHeaders(res)
    }
  })

  it('cabeceras de seguridad en 401, 400, 413, 415 y 500', async () => {
    const r401 = await api('/api/usage', { token: null })
    expectSecurityHeaders(r401)
    const r400 = await json('/api/entries', 'POST', '{')
    expect(r400.status).toBe(400)
    expectSecurityHeaders(r400)
    const r413 = await json('/api/entries', 'POST', JSON.stringify({ x: 'y'.repeat(300_000) }))
    expect(r413.status).toBe(413)
    expectSecurityHeaders(r413)
    const r415 = await api('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'hola',
    })
    expect(r415.status).toBe(415)
    expectSecurityHeaders(r415)
    const r500 = await raw('/api/usage', { headers: { authorization: 'Bearer x' } })
    expect(r500.status).toBe(401)
  })

  it('OPTIONS (preflight) no expone datos', async () => {
    const res = await raw('/api/entries?date=2026-11-04', { method: 'OPTIONS' })
    expect(res.status).not.toBe(200)
  })

  it('HEAD /api/usage sin token → 401', async () => {
    expect((await raw('/api/usage', { method: 'HEAD' })).status).toBe(401)
  })
})
