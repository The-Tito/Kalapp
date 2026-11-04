import { env } from 'cloudflare:test'
import { addDays, DEFAULT_TIMEZONE, ProfileSchema, toLocalDate } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  api,
  entryInput,
  ITEM,
  json,
  jsonResponse,
  mockFetch,
  PROFILE_INPUT,
  resetDb,
} from '../test/helpers'
import { csvCell } from './export'

beforeEach(resetDb)

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

const yearsAgo = (years: number, extraDays = 0) => {
  const today = toLocalDate(new Date(), DEFAULT_TIMEZONE)
  const [y, m, d] = today.split('-')
  return addDays(`${Number(y) - years}-${m}-${d}`, extraDays)
}

describe('adversarial: PUT /api/profile', () => {
  const put = (body: unknown) => json('/api/profile', 'PUT', body)

  it('edad 13 → 400; edad 101 → 400; nacimiento futuro → 400', async () => {
    expect((await put({ ...PROFILE_INPUT, birthDate: yearsAgo(13) })).status).toBe(400)
    expect((await put({ ...PROFILE_INPUT, birthDate: yearsAgo(102) })).status).toBe(400)
    expect((await put({ ...PROFILE_INPUT, birthDate: yearsAgo(-1) })).status).toBe(400)
  })

  it('edad exacta 14 y 100 → 200', async () => {
    expect((await put({ ...PROFILE_INPUT, birthDate: yearsAgo(14, -2) })).status).toBe(200)
    expect((await put({ ...PROFILE_INPUT, birthDate: yearsAgo(100, 2) })).status).toBe(200)
  })

  it('% grasa 70 con 30 kg (masa magra 9 kg) → 200 con meta coherente o 400, nunca 500', async () => {
    const res = await put({ ...PROFILE_INPUT, weightKg: 30, bodyFatPct: 70, heightCm: 100 })
    expect([200, 400]).toContain(res.status)
    if (res.status === 200) {
      const p = ProfileSchema.parse(await res.json())
      expect(p.targetKcal).toBeGreaterThan(0)
      expect(p.carbsG).toBeGreaterThanOrEqual(0)
    }
  })

  it('extremos: 350 kg / 250 cm / grasa 3 % / very_active / gain aggressive → nunca 500', async () => {
    for (const extra of [
      {
        weightKg: 350,
        heightCm: 250,
        bodyFatPct: 3,
        activityLevel: 'very_active',
        goal: 'gain',
        intensity: 'aggressive',
      },
      {
        weightKg: 30,
        heightCm: 250,
        bodyFatPct: null,
        sex: 'female',
        goal: 'deficit',
        intensity: 'aggressive',
        activityLevel: 'sedentary',
      },
      { weightKg: 350, heightCm: 100, bodyFatPct: 70, goal: 'recomp', trainingDays: 0 },
    ]) {
      const res = await put({ ...PROFILE_INPUT, ...extra })
      expect([200, 400], JSON.stringify(extra)).toContain(res.status)
    }
  })

  it('meta manual 799 / 6001 / 1500.5 → 400; 800 y 6000 → 200 con override', async () => {
    expect((await put({ ...PROFILE_INPUT, manualTargetKcal: 799 })).status).toBe(400)
    expect((await put({ ...PROFILE_INPUT, manualTargetKcal: 6001 })).status).toBe(400)
    expect((await put({ ...PROFILE_INPUT, manualTargetKcal: 1500.5 })).status).toBe(400)
    for (const kcal of [800, 6000]) {
      const res = await put({ ...PROFILE_INPUT, manualTargetKcal: kcal })
      expect(res.status).toBe(200)
      const p = ProfileSchema.parse(await res.json())
      expect(p.isManualOverride).toBe(true)
    }
  })

  it('zona horaria inválida → 400; zona con espacios se recorta', async () => {
    for (const timezone of [
      'Mars/Olympus',
      '',
      "'; DROP TABLE profile;--",
      'America/Mexico_City/../x',
    ]) {
      const res = await put({ ...PROFILE_INPUT, timezone })
      expect(res.status, timezone).toBe(400)
    }
    const ok = await put({ ...PROFILE_INPUT, timezone: '  America/Tijuana  ' })
    expect(ok.status).toBe(200)
    expect(ProfileSchema.parse(await ok.json()).timezone).toBe('America/Tijuana')
  })

  it('tipos incorrectos (strings en números, bool en enum) → 400', async () => {
    for (const extra of [
      { weightKg: '80' },
      { heightCm: '175' },
      { trainingDays: 3.5 },
      { trainingDays: '3' },
      { sex: true },
      { bodyFatPct: '20' },
      { weightKg: null },
    ]) {
      const res = await put({ ...PROFILE_INPUT, ...extra })
      expect(res.status, JSON.stringify(extra)).toBe(400)
      expect(await code(res)).toBe('VALIDATION')
    }
  })

  it('body null / array / vacío / número → 400', async () => {
    for (const body of ['null', '[]', '', '1', `[${JSON.stringify(PROFILE_INPUT)}]`]) {
      expect((await put(body)).status, body).toBe(400)
    }
  })

  it('campos extra se ignoran (targetKcal, isManualOverride, id)', async () => {
    const res = await put({
      ...PROFILE_INPUT,
      id: 2,
      isManualOverride: true,
      targetKcal: 1,
      warnings: ['x'],
    })
    expect(res.status).toBe(200)
    const p = ProfileSchema.parse(await res.json())
    expect(p.isManualOverride).toBe(false)
    expect(p.targetKcal).toBeGreaterThan(800)
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM profile').first<{ n: number }>()
    expect(rows?.n).toBe(1)
  })

  it('peso 1e400 → 400', async () => {
    const body = JSON.stringify(PROFILE_INPUT).replace('"weightKg":80', '"weightKg":1e400')
    expect((await put(body)).status).toBe(400)
  })
})

describe('adversarial: rangos (summary / weights / export)', () => {
  it('summary: rango invertido, 10 años, fechas imposibles → 400', async () => {
    for (const q of [
      'from=2026-11-05&to=2026-11-01',
      'from=2016-01-01&to=2026-01-01',
      'from=2025-02-30&to=2025-03-01',
      'from=2026-11-01',
      '',
      `from=${encodeURIComponent("' OR 1=1--")}&to=2026-11-01`,
    ]) {
      const res = await api(`/api/summary?${q}`)
      expect(res.status, q).toBe(400)
    }
  })

  it('summary: rango de 366 días exacto → 200; vacío → días [] y promedios 0', async () => {
    const res = await api('/api/summary?from=2025-01-01&to=2026-01-01')
    expect(res.status).toBe(200)
    const s = (await res.json()) as {
      days: unknown[]
      loggedDays: number
      averages: { kcal: number }
    }
    expect(s.days).toEqual([])
    expect(s.loggedDays).toBe(0)
    expect(s.averages.kcal).toBe(0)
  })

  it('weights: rango invertido / 10 años → 400', async () => {
    expect((await api('/api/weights?from=2026-11-05&to=2026-11-01')).status).toBe(400)
    expect((await api('/api/weights?from=2016-01-01&to=2026-01-01')).status).toBe(400)
  })

  it('weights: 0 / −5 / 1000 / "80" / 1e400 → 400; 30 y 350 → 200', async () => {
    for (const weightKg of [0, -5, 1000, '80', 29.99, 350.01]) {
      const res = await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg })
      expect(res.status, String(weightKg)).toBe(400)
    }
    const inf = await json('/api/weights', 'POST', '{"localDate":"2026-11-04","weightKg":1e400}')
    expect(inf.status).toBe(400)
    for (const weightKg of [30, 350]) {
      expect(
        (await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg })).status,
      ).toBe(200)
    }
  })

  it('weights: DELETE con fecha basura / SQLi → 400; dos veces → 404', async () => {
    expect(
      (await api(`/api/weights/${encodeURIComponent("' OR 1=1--")}`, { method: 'DELETE' })).status,
    ).toBe(400)
    await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg: 80 })
    expect((await api('/api/weights/2026-11-04', { method: 'DELETE' })).status).toBe(204)
    expect((await api('/api/weights/2026-11-04', { method: 'DELETE' })).status).toBe(404)
  })

  it('export: formato inválido, rango invertido → 400; sin datos JSON y CSV válidos', async () => {
    expect((await api('/api/export?format=xml')).status).toBe(400)
    expect((await api('/api/export')).status).toBe(400)
    expect((await api('/api/export?format=csv&from=2026-11-05&to=2026-11-01')).status).toBe(400)
    const j = await api('/api/export?format=json')
    expect(j.status).toBe(200)
    expect(await j.json()).toMatchObject({ profile: null, entries: [], weights: [], favorites: [] })
    const c = await api('/api/export?format=csv&from=2000-01-01&to=2000-01-02')
    expect(c.status).toBe(200)
    const text = await c.text()
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(1)
    expect(c.headers.get('content-disposition')).toBe(
      'attachment; filename="kalapp-2000-01-01-2000-01-02.csv"',
    )
    expect(c.headers.get('cache-control')).toBe('no-store')
  })

  it('export: rango de 10 años rechazado (tope de 366 días) → 400', async () => {
    expect((await api('/api/export?format=json&from=2016-01-01&to=2026-01-01')).status).toBe(400)
  })
})

describe('adversarial: CSV', () => {
  it('csvCell neutraliza fórmulas y escapa', () => {
    expect(csvCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell('\tx')).toMatch(/^"'\tx"$|^'\tx$/)
    expect(csvCell('a"b')).toBe('"a""b"')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a\nb')).toBe('"a\nb"')
    expect(csvCell('=1,2')).toBe(`"'=1,2"`)
    expect(csvCell(-5)).toBe('-5')
    expect(csvCell(Number.NaN)).toBe('')
  })

  it('csvCell: fórmula tras salto de línea / CR inicial no ejecuta', () => {
    expect(csvCell('\r=1+1')).toBe(`"'\r=1+1"`)
    expect(csvCell('a\n=1+1')).toBe('"a\n=1+1"')
  })

  it('export CSV end-to-end con comillas, saltos de línea y fórmulas en nombres', async () => {
    const names = [
      "=cmd|' /C calc'!A0",
      '+SUM(1)',
      '-2+3',
      '@x',
      'a "b" c',
      'línea1\nlínea2',
      'x,y',
    ]
    const input = entryInput({
      title: '=HYPERLINK("http://evil")',
      items: names.map((name) => ({ ...ITEM, name })),
    })
    expect((await json('/api/entries', 'POST', input)).status).toBe(201)
    const res = await api('/api/export?format=csv')
    const bytes = new Uint8Array(await res.clone().arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // BOM UTF-8 (text() lo quita)
    const text = await res.text()
    // Ninguna celda empieza con = + - @ sin comilla de escape.
    const cells = text.match(/(?:^|,)("(?:[^"]|"")*"|[^,\r\n]*)/gm) ?? []
    for (const raw of cells) {
      const cell = raw.replace(/^,/, '').replace(/^"|"$/g, '')
      expect(/^[=+@]/.test(cell), cell).toBe(false)
    }
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`)
    expect(text).toContain('"línea1\nlínea2"')
    expect(text).toContain('"x,y"')
    // 1 encabezado + 7 ingredientes
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(8)
  })
})

describe('adversarial: favoritos', () => {
  const fav = (o: Record<string, unknown> = {}) => ({
    id: crypto.randomUUID(),
    name: 'Desayuno',
    items: [ITEM],
    ...o,
  })

  it('use sobre borrado → 404; borrar dos veces → 404', async () => {
    const f = fav()
    expect((await json('/api/favorites', 'POST', f)).status).toBe(201)
    expect((await api(`/api/favorites/${f.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/favorites/${f.id}/use`, { method: 'POST' })).status).toBe(404)
    expect((await api(`/api/favorites/${f.id}`, { method: 'DELETE' })).status).toBe(404)
  })

  it('SQLi en nombre se guarda literal; id SQLi en ruta → 404', async () => {
    const f = fav({ name: "'; DROP TABLE favorites;--" })
    expect((await json('/api/favorites', 'POST', f)).status).toBe(201)
    expect(
      (await api(`/api/favorites/${encodeURIComponent("1' OR '1'='1")}/use`, { method: 'POST' }))
        .status,
    ).toBe(404)
    const list = (await (await api('/api/favorites')).json()) as { name: string }[]
    expect(list[0]?.name).toBe("'; DROP TABLE favorites;--")
  })

  it('31 items / items vacíos / kcal negativa → 400', async () => {
    expect(
      (await json('/api/favorites', 'POST', fav({ items: Array.from({ length: 31 }, () => ITEM) })))
        .status,
    ).toBe(400)
    expect((await json('/api/favorites', 'POST', fav({ items: [] }))).status).toBe(400)
    expect(
      (await json('/api/favorites', 'POST', fav({ items: [{ ...ITEM, kcal: -1 }] }))).status,
    ).toBe(400)
  })

  it('concurrencia: 5 POST mismo favorito → 1 fila, un solo 201', async () => {
    const f = fav()
    const rs = await Promise.all(Array.from({ length: 5 }, () => json('/api/favorites', 'POST', f)))
    expect(rs.map((r) => r.status).filter((s) => s === 201)).toHaveLength(1)
    expect(rs.every((r) => r.status === 200 || r.status === 201)).toBe(true)
  })

  it('concurrencia: 10 use en paralelo → usesCount 10 (sin lost update)', async () => {
    const f = fav()
    await json('/api/favorites', 'POST', f)
    await Promise.all(
      Array.from({ length: 10 }, () => api(`/api/favorites/${f.id}/use`, { method: 'POST' })),
    )
    const list = (await (await api('/api/favorites')).json()) as { usesCount: number }[]
    expect(list[0]?.usesCount).toBe(10)
  })
})

describe('adversarial: barcode', () => {
  const product = (nutriments: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
    status: 1,
    product: { product_name: 'Prod', nutriments, ...extra },
  })

  it('código con letras, 5 y 15 dígitos, espacios internos, signo → 400 sin llamar a OFF', async () => {
    const spy = mockFetch(() => jsonResponse(product({ 'energy-kcal_100g': 100 })))
    for (const c of [
      'abc123',
      '12345',
      '123456789012345',
      '1234%205678',
      '-1234567',
      '1e10000',
      '１２３４５６７',
    ]) {
      expect((await api(`/api/barcode/${c}`)).status, c).toBe(400)
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('path traversal en el código no llega a OFF con otra ruta', async () => {
    const spy = mockFetch(() => jsonResponse(product({ 'energy-kcal_100g': 100 })))
    const res = await api('/api/barcode/123456%2F..%2F..%2Fadmin')
    expect([400, 404]).toContain(res.status)
    expect(spy).not.toHaveBeenCalled()
  })

  it('producto sin nutriments → 404', async () => {
    mockFetch(() => jsonResponse({ status: 1, product: { product_name: 'X' } }))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
  })

  it('solo energy_100g (kJ normalizado) → convierte', async () => {
    mockFetch(() => jsonResponse(product({ energy_100g: 418.4 })))
    const res = await api('/api/barcode/7501055300075')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { per100g: { kcal: number } }).per100g.kcal).toBe(100)
  })

  it('kcal absurdas (5000/100 g) → 404, no se propagan', async () => {
    mockFetch(() => jsonResponse(product({ 'energy-kcal_100g': 5000 })))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
  })

  it('macros > 100 g/100 g → 404 (documenta: se descarta el producto entero)', async () => {
    mockFetch(() => jsonResponse(product({ 'energy-kcal_100g': 400, proteins_100g: 150 })))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
  })

  it('kcal negativas / string basura / NaN → 404', async () => {
    for (const v of [-10, 'abc', 'NaN', null, {}]) {
      mockFetch(() => jsonResponse(product({ 'energy-kcal_100g': v })))
      expect((await api('/api/barcode/7501055300075')).status, String(v)).toBe(404)
    }
  })

  it('JSON malformado de OFF → 503 (no 500)', async () => {
    mockFetch(
      () => new Response('<html>oops', { status: 200, headers: { 'content-type': 'text/html' } }),
    )
    expect((await api('/api/barcode/7501055300075')).status).toBe(503)
  })

  it('OFF responde null / array → 404', async () => {
    mockFetch(() => jsonResponse(null))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
    mockFetch(() => jsonResponse([]))
    expect((await api('/api/barcode/7501055300075')).status).toBe(404)
  })

  it('timeout / AbortError / error de red → 503', async () => {
    for (const err of [
      new DOMException('t', 'TimeoutError'),
      new DOMException('a', 'AbortError'),
      new TypeError('net'),
    ]) {
      mockFetch(() => {
        throw err
      })
      expect((await api('/api/barcode/7501055300075')).status).toBe(503)
    }
  })

  it('OFF 500 → 503; 429 → 503', async () => {
    mockFetch(() => jsonResponse({}, 500))
    expect((await api('/api/barcode/7501055300075')).status).toBe(503)
    mockFetch(() => jsonResponse({}, 429))
    expect((await api('/api/barcode/7501055300075')).status).toBe(503)
  })

  it('nombre con HTML / 10 000 chars se recorta a 120', async () => {
    mockFetch(() =>
      jsonResponse(
        product({ 'energy-kcal_100g': 100 }, { product_name: `<b>${'x'.repeat(10_000)}` }),
      ),
    )
    const res = await api('/api/barcode/7501055300075')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { name: string }).name.length).toBeLessThanOrEqual(120)
  })
})

describe('adversarial: sin perfil', () => {
  it('shortcut/today → 200 con meta null', async () => {
    const res = await api('/api/shortcut/today')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { targetKcal: unknown }).targetKcal).toBeNull()
  })
  it('adaptive → 409 PROFILE_REQUIRED', async () => {
    const res = await api('/api/adaptive')
    expect(res.status).toBe(409)
    expect(await code(res)).toBe('PROFILE_REQUIRED')
  })
  it('usage → 200 con la zona predeterminada', async () => {
    const res = await api('/api/usage')
    expect(res.status).toBe(200)
    expect(((await res.json()) as { date: string }).date).toBe(
      toLocalDate(new Date(), DEFAULT_TIMEZONE),
    )
  })
  it('perfil con zona corrupta en BD → usa la predeterminada, sin 500', async () => {
    await json('/api/profile', 'PUT', PROFILE_INPUT)
    await env.DB.prepare("UPDATE profile SET timezone = 'Nope/Nope'").run()
    expect((await api('/api/usage')).status).toBe(200)
    expect((await api('/api/shortcut/today')).status).toBe(200)
    expect((await api('/api/adaptive')).status).toBe(200)
    expect((await api('/api/export?format=csv')).status).toBe(200)
  })
})
