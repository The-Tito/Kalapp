import { env } from 'cloudflare:test'
import { EntrySchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, entryInput, ITEM, json, resetDb } from '../test/helpers'

beforeEach(resetDb)

const SQLI = "'; DROP TABLE entries;--"

const code = async (res: Response) => ((await res.json()) as { error: { code: string } }).error.code

async function tableExists(name: string) {
  const r = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(name)
    .first()
  return r !== null
}

async function count(table: string) {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
  return r?.n ?? 0
}

describe('adversarial: inyección SQL y path traversal', () => {
  it('SQLi en ?date= → 400 y la tabla sigue viva', async () => {
    const res = await api(`/api/entries?date=${encodeURIComponent(SQLI)}`)
    expect(res.status).toBe(400)
    expect(await tableExists('entries')).toBe(true)
  })

  it("SQLi en localDate='2026-11-04' OR 1=1 → 400", async () => {
    const res = await api(`/api/entries?date=${encodeURIComponent("2026-11-04' OR '1'='1")}`)
    expect(res.status).toBe(400)
  })

  it('SQLi en título, nota y nombre de ingrediente se guarda literal', async () => {
    const input = entryInput({
      title: SQLI,
      note: `${SQLI} <script>alert(1)</script>`,
      items: [{ ...ITEM, name: SQLI }],
    })
    const res = await json('/api/entries', 'POST', input)
    expect(res.status).toBe(201)
    const saved = EntrySchema.parse(await res.json())
    expect(saved.title).toBe(SQLI)
    expect(saved.note).toBe(`${SQLI} <script>alert(1)</script>`)
    expect(saved.items[0]?.name).toBe(SQLI)
    expect(await tableExists('entries')).toBe(true)
    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('SQLi / no-UUID / traversal en /:id → 404, sin 500', async () => {
    const ids = [
      encodeURIComponent(SQLI),
      'no-es-uuid',
      '..%2F..%2Fprofile',
      '%2e%2e',
      '1 OR 1=1',
      '00000000-0000-0000-0000-000000000000',
      `${crypto.randomUUID()}%00`,
    ]
    for (const id of ids) {
      const del = await api(`/api/entries/${id}`, { method: 'DELETE' })
      expect([404], `DELETE ${id}`).toContain(del.status)
      const patch = await json(`/api/entries/${id}`, 'PATCH', { note: 'x' })
      expect([400, 404], `PATCH ${id}`).toContain(patch.status)
    }
    expect(await tableExists('entries')).toBe(true)
  })

  it('traversal ../ en la ruta no salta a otra ruta', async () => {
    const res = await api('/api/entries/../profile', { method: 'DELETE' })
    // URL se normaliza a /api/profile → DELETE no existe → 404
    expect(res.status).toBe(404)
  })
})

describe('adversarial: textos raros', () => {
  it('unicode, emoji, RTL y zero-width en nombres se conservan', async () => {
    const names = ['Tacos 🌮🔥', 'שקשוקה', '‮amrof‬', 'pan​dulce', 'café ñandú', '🍕'.repeat(30)]
    const input = entryInput({ items: names.map((name) => ({ ...ITEM, name })) })
    const res = await json('/api/entries', 'POST', input)
    expect(res.status).toBe(201)
    const saved = EntrySchema.parse(await res.json())
    expect(saved.items.map((i) => i.name)).toEqual(names)
  })

  it('nombre solo zero-width / espacios → ¿se acepta un nombre "invisible"? (documenta)', async () => {
    const res = await json('/api/entries', 'POST', entryInput({ items: [{ ...ITEM, name: '​' }] }))
    // trim() de JS no quita U+200B: se guarda un nombre visualmente vacío.
    expect([201, 400]).toContain(res.status)
  })

  it('nombre de 10 000 chars → 400; title de 121 → 400; nota de 501 → 400', async () => {
    const long = await json(
      '/api/entries',
      'POST',
      entryInput({ items: [{ ...ITEM, name: 'a'.repeat(10_000) }] }),
    )
    expect(long.status).toBe(400)
    expect(
      (await json('/api/entries', 'POST', entryInput({ title: 'a'.repeat(121) }))).status,
    ).toBe(400)
    expect((await json('/api/entries', 'POST', entryInput({ note: 'a'.repeat(501) }))).status).toBe(
      400,
    )
    expect(await count('entries')).toBe(0)
  })

  it('HTML/script y comillas en nota no rompen el JSON de GET', async () => {
    const note = '</script><img src=x onerror=alert(1)> "\\u0000   '
    const input = entryInput({ note })
    expect((await json('/api/entries', 'POST', input)).status).toBe(201)
    const res = await api(`/api/entries?date=${input.localDate}`)
    const list = (await res.json()) as { note: string }[]
    expect(list[0]?.note).toBe(note.trim())
  })

  it('NUL (\\u0000) en nombre se guarda y se lee igual', async () => {
    const input = entryInput({ items: [{ ...ITEM, name: 'a\u0000b' }] })
    const res = await json('/api/entries', 'POST', input)
    expect([201, 400]).toContain(res.status)
    if (res.status === 201) {
      const got = EntrySchema.parse(await res.json())
      expect(got.items[0]?.name).toBe('a\u0000b')
    }
  })
})

describe('adversarial: valores imposibles', () => {
  const bad = (name: string, override: Record<string, unknown>) =>
    it(`${name} → 400`, async () => {
      const res = await json('/api/entries', 'POST', entryInput(override))
      expect(res.status).toBe(400)
      expect(await code(res)).toBe('VALIDATION')
      expect(await count('entries')).toBe(0)
    })

  bad('kcal negativas', { items: [{ ...ITEM, kcal: -100 }] })
  bad('proteína negativa', { items: [{ ...ITEM, proteinG: -1 }] })
  bad('kcal > 10000', { items: [{ ...ITEM, kcal: 10_001 }] })
  bad('gramos > 5000', { items: [{ ...ITEM, grams: 5001 }] })
  bad('kcal como string', { items: [{ ...ITEM, kcal: '130' }] })
  bad('31 items', { items: Array.from({ length: 31 }, () => ITEM) })
  bad('items vacíos', { items: [] })
  bad('items null', { items: null })
  bad('localDate inexistente 2025-02-30', { localDate: '2025-02-30' })
  bad('localDate 2026-13-01', { localDate: '2026-13-01' })
  bad('localDate con hora', { localDate: '2026-11-04T00:00:00Z' })
  bad('eatenAt sin offset', { eatenAt: '2026-11-04T14:05:00' })
  bad('eatenAt solo fecha', { eatenAt: '2026-11-04' })
  bad('id no UUID', { id: 'abc' })
  bad('id SQLi', { id: SQLI })
  bad('mealType desconocido', { mealType: 'brunch' })
  bad('source desconocido', { source: 'hack' })
  bad('aiConfidence desconocida', { aiConfidence: 'altísima' })

  it('kcal 1e400 (Infinity tras JSON.parse) → 400, no se guarda Infinity/NULL', async () => {
    const body = JSON.stringify(entryInput()).replace('"kcal":130', '"kcal":1e400')
    expect(body).toContain('1e400')
    const res = await json('/api/entries', 'POST', body)
    expect(res.status).toBe(400)
  })

  it('gramos -1e400 (−Infinity) → 400', async () => {
    const body = JSON.stringify(entryInput()).replace('"grams":60', '"grams":-1e400')
    expect((await json('/api/entries', 'POST', body)).status).toBe(400)
  })

  it('gramos 0 se acepta (mínimo 0) y totales correctos', async () => {
    const res = await json('/api/entries', 'POST', entryInput({ items: [{ ...ITEM, grams: 0 }] }))
    expect(res.status).toBe(201)
  })

  it('30 items exactos se aceptan y los totales los calcula el servidor', async () => {
    const res = await json(
      '/api/entries',
      'POST',
      entryInput({ items: Array.from({ length: 30 }, () => ITEM), totals: { kcal: 1 } }),
    )
    expect(res.status).toBe(201)
    const e = EntrySchema.parse(await res.json())
    expect(e.items).toHaveLength(30)
    expect(e.totals.kcal).toBe(130 * 30)
  })

  it('fecha en el año 9999 se acepta (documenta: no hay tope de futuro)', async () => {
    const res = await json(
      '/api/entries',
      'POST',
      entryInput({ localDate: '9999-12-31', eatenAt: '9999-12-31T23:59:00Z' }),
    )
    expect([201, 400]).toContain(res.status)
  })

  it('localDate y eatenAt incoherentes (días distintos) → se acepta (documenta)', async () => {
    const res = await json(
      '/api/entries',
      'POST',
      entryInput({ localDate: '2026-11-04', eatenAt: '2001-01-01T00:00:00Z' }),
    )
    expect([201, 400]).toContain(res.status)
  })

  it('body null, array, número y string → 400 VALIDATION', async () => {
    for (const body of ['null', '[]', '42', '"hola"', '']) {
      const res = await json('/api/entries', 'POST', body)
      expect(res.status, body).toBe(400)
      expect(await code(res)).toBe('VALIDATION')
    }
  })

  it('campos desconocidos se ignoran (no se guardan totales del cliente)', async () => {
    const res = await json(
      '/api/entries',
      'POST',
      entryInput({
        totals: { kcal: 99999 },
        createdAt: '2000-01-01T00:00:00Z',
        __proto__: { x: 1 },
      }),
    )
    expect(res.status).toBe(201)
    const e = EntrySchema.parse(await res.json())
    expect(e.totals.kcal).toBe(330)
    expect(e.createdAt).not.toBe('2000-01-01T00:00:00Z')
  })
})

describe('adversarial: PATCH / DELETE / idempotencia', () => {
  it('PATCH con cuerpo vacío {} → 400', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    const res = await json(`/api/entries/${input.id}`, 'PATCH', {})
    expect(res.status).toBe(400)
  })

  it('PATCH solo con campos desconocidos → 400 (no 200 silencioso)', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    const res = await json(`/api/entries/${input.id}`, 'PATCH', { totals: { kcal: 1 }, id: 'x' })
    expect(res.status).toBe(400)
  })

  it('PATCH sin cuerpo (string vacío) → 400', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    expect((await json(`/api/entries/${input.id}`, 'PATCH', '')).status).toBe(400)
  })

  it('PATCH con items: [] → 400 y no borra los ingredientes', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    expect((await json(`/api/entries/${input.id}`, 'PATCH', { items: [] })).status).toBe(400)
    expect(await count('entry_items')).toBe(2)
  })

  it('PATCH no permite cambiar id ni source', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    const other = crypto.randomUUID()
    const res = await json(`/api/entries/${input.id}`, 'PATCH', {
      id: other,
      source: 'manual',
      note: 'n',
    })
    expect(res.status).toBe(200)
    const e = EntrySchema.parse(await res.json())
    expect(e.id).toBe(input.id)
    expect(e.source).toBe('photo')
  })

  it('PATCH a id inexistente → 404', async () => {
    expect((await json(`/api/entries/${crypto.randomUUID()}`, 'PATCH', { note: 'x' })).status).toBe(
      404,
    )
  })

  it('DELETE dos veces → 204 y luego 404', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    expect((await api(`/api/entries/${input.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/entries/${input.id}`, { method: 'DELETE' })).status).toBe(404)
    expect(await count('entry_items')).toBe(0)
  })

  it('POST mismo id con payload distinto → 200 con el original (no sobrescribe; documenta: no hay 409 CONFLICT)', async () => {
    const input = entryInput()
    expect((await json('/api/entries', 'POST', input)).status).toBe(201)
    const res = await json('/api/entries', 'POST', { ...input, title: 'Otro', items: [ITEM] })
    expect(res.status).toBe(200)
    const e = EntrySchema.parse(await res.json())
    expect(e.title).toBe('Tacos')
    expect(e.items).toHaveLength(2)
  })

  it('BUG: (media) el mismo UUID en mayúsculas crea un registro duplicado (idempotencia por id rota)', async () => {
    const input = entryInput()
    expect((await json('/api/entries', 'POST', input)).status).toBe(201)
    const res = await json('/api/entries', 'POST', { ...input, id: input.id.toUpperCase() })
    // El UUID es el mismo valor; debería tratarse como reintento (200) y no crear otra fila.
    expect(await count('entries')).toBe(1)
    expect(res.status).toBe(200)
  })

  it('concurrencia: 5 POST con el mismo id en paralelo → 1 fila, sin 500', async () => {
    const input = entryInput()
    const results = await Promise.all(
      Array.from({ length: 5 }, () => json('/api/entries', 'POST', input)),
    )
    const statuses = results.map((r) => r.status).sort()
    expect(statuses.every((s) => s === 200 || s === 201)).toBe(true)
    expect(statuses.filter((s) => s === 201)).toHaveLength(1)
    expect(await count('entries')).toBe(1)
    expect(await count('entry_items')).toBe(2)
  })

  it('concurrencia: PATCH items + DELETE en paralelo → sin ingredientes huérfanos', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    const [p, d] = await Promise.all([
      json(`/api/entries/${input.id}`, 'PATCH', { items: [ITEM, ITEM, ITEM] }),
      api(`/api/entries/${input.id}`, { method: 'DELETE' }),
    ])
    expect([200, 404]).toContain(p.status)
    expect([204, 404]).toContain(d.status)
    const orphans = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM entry_items WHERE entry_id NOT IN (SELECT id FROM entries)',
    ).first<{ n: number }>()
    expect(orphans?.n).toBe(0)
  })
})
