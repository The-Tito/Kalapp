import { env } from 'cloudflare:test'
import { EntrySchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, entryInput, ITEM, json, resetDb } from '../test/helpers'

beforeEach(resetDb)

async function itemCount(entryId?: string) {
  const sql = entryId
    ? 'SELECT COUNT(*) AS n FROM entry_items WHERE entry_id = ?'
    : 'SELECT COUNT(*) AS n FROM entry_items'
  const stmt = env.DB.prepare(sql)
  const row = await (entryId ? stmt.bind(entryId) : stmt).first<{ n: number }>()
  return row?.n ?? 0
}

describe('/api/entries', () => {
  it('POST crea (201) con totales calculados por el servidor', async () => {
    const input = entryInput({ totals: { kcal: 1, proteinG: 1, carbsG: 1, fatG: 1 } })
    const res = await json('/api/entries', 'POST', input)
    expect(res.status).toBe(201)
    const entry = EntrySchema.parse(await res.json())
    expect(entry.totals).toEqual({ kcal: 330, proteinG: 21.4, carbsG: 30, fatG: 14.4 })
    expect(entry.items).toHaveLength(2)
    expect(entry.items[0]).toEqual(ITEM)
    expect(entry.title).toBe('Tacos')
    expect(entry.note).toBeNull()
    expect(await itemCount(input.id)).toBe(2)
  })

  it('POST es idempotente por id: 200 con el existente, sin duplicar', async () => {
    const input = entryInput()
    const first = (await (await json('/api/entries', 'POST', input)).json()) as {
      createdAt: string
    }
    const res = await json('/api/entries', 'POST', { ...input, title: 'Otro título' })
    expect(res.status).toBe(200)
    const again = (await res.json()) as { createdAt: string; title: string }
    expect(again.createdAt).toBe(first.createdAt)
    expect(again.title).toBe('Tacos')
    expect(await itemCount()).toBe(2)
  })

  it('ítems manipulados (kcal negativas, sin ítems, id no UUID) → 400', async () => {
    const neg = await json('/api/entries', 'POST', entryInput({ items: [{ ...ITEM, kcal: -50 }] }))
    expect(neg.status).toBe(400)
    const body = (await neg.json()) as { error: { code: string; details: { path: string }[] } }
    expect(body.error.code).toBe('VALIDATION')
    expect(body.error.details[0]?.path).toBe('items.0.kcal')
    expect((await json('/api/entries', 'POST', entryInput({ items: [] }))).status).toBe(400)
    expect((await json('/api/entries', 'POST', entryInput({ id: '1' }))).status).toBe(400)
    expect(await itemCount()).toBe(0)
  })

  it('GET ?date= filtra por día y ordena por eatenAt aunque cambie el offset', async () => {
    const late = entryInput({ eatenAt: '2026-11-04T20:00:00Z', mealType: 'dinner' }) // 14:00 MX
    const early = entryInput({ eatenAt: '2026-11-04T09:00:00-06:00', mealType: 'breakfast' }) // 15:00Z
    const other = entryInput({ localDate: '2026-11-05', eatenAt: '2026-11-05T09:00:00-06:00' })
    for (const e of [early, late, other]) await json('/api/entries', 'POST', e)
    const res = await api('/api/entries?date=2026-11-04')
    expect(res.status).toBe(200)
    const list = (await res.json()) as { id: string }[]
    expect(list.map((e) => e.id)).toEqual([early.id, late.id])
    expect((await api('/api/entries?date=04-11-2026')).status).toBe(400)
    expect((await api('/api/entries')).status).toBe(400)
  })

  it('PATCH cambia campos y, si trae items, los reemplaza y recalcula totales', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    const res = await json(`/api/entries/${input.id}`, 'PATCH', {
      mealType: 'dinner',
      note: 'sin cebolla',
      items: [{ ...ITEM, grams: 120, kcal: 260, proteinG: 6.8, carbsG: 54, fatG: 2.8 }],
    })
    expect(res.status).toBe(200)
    const e = EntrySchema.parse(await res.json())
    expect(e.mealType).toBe('dinner')
    expect(e.note).toBe('sin cebolla')
    expect(e.items).toHaveLength(1)
    expect(e.totals).toEqual({ kcal: 260, proteinG: 6.8, carbsG: 54, fatG: 2.8 })
    expect(await itemCount(input.id)).toBe(1)

    const titleOnly = await json(`/api/entries/${input.id}`, 'PATCH', { title: null })
    const t = EntrySchema.parse(await titleOnly.json())
    expect(t.title).toBeNull()
    expect(t.totals.kcal).toBe(260)
  })

  it('PATCH: 404 si no existe; 400 si no hay cambios', async () => {
    const missing = crypto.randomUUID()
    expect((await json(`/api/entries/${missing}`, 'PATCH', { mealType: 'snack' })).status).toBe(404)
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    expect((await json(`/api/entries/${input.id}`, 'PATCH', {})).status).toBe(400)
  })

  it('DELETE → 204 y borra los ítems en cascada; repetir → 404', async () => {
    const input = entryInput()
    await json('/api/entries', 'POST', input)
    expect(await itemCount(input.id)).toBe(2)
    const res = await api(`/api/entries/${input.id}`, { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(await itemCount(input.id)).toBe(0)
    expect((await api(`/api/entries/${input.id}`, { method: 'DELETE' })).status).toBe(404)
    expect((await api('/api/entries/no-es-uuid', { method: 'DELETE' })).status).toBe(404)
  })

  it('las FK de D1 están activas (CASCADE real, no borrado manual)', async () => {
    const row = await env.DB.prepare('PRAGMA foreign_keys').first<{ foreign_keys: number }>()
    expect(row?.foreign_keys).toBe(1)
  })
})
