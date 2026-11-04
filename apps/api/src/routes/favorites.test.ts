import { env } from 'cloudflare:test'
import { FavoriteSchema } from '@kalapp/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { api, ITEM, json, resetDb } from '../test/helpers'

beforeEach(resetDb)

const fav = (name: string) => ({ id: crypto.randomUUID(), name, items: [ITEM, ITEM] })

describe('/api/favorites', () => {
  it('POST crea (201, totales del servidor) y es idempotente por id (200)', async () => {
    const input = { ...fav('Desayuno'), mealType: 'breakfast' }
    const res = await json('/api/favorites', 'POST', input)
    expect(res.status).toBe(201)
    const f = FavoriteSchema.parse(await res.json())
    expect(f.totals).toEqual({ kcal: 260, proteinG: 6.8, carbsG: 54, fatG: 2.8 })
    expect(f.usesCount).toBe(0)
    expect(f.lastUsedAt).toBeNull()
    expect(f.mealType).toBe('breakfast')
    const again = await json('/api/favorites', 'POST', { ...input, name: 'Otro' })
    expect(again.status).toBe(200)
    expect(((await again.json()) as { name: string }).name).toBe('Desayuno')
  })

  it('POST /:id/use suma usos; GET ordena por usos y luego por último uso', async () => {
    const a = fav('A')
    const b = fav('B')
    const c = fav('C')
    for (const f of [a, b, c]) await json('/api/favorites', 'POST', f)
    await api(`/api/favorites/${b.id}/use`, { method: 'POST' })
    await api(`/api/favorites/${b.id}/use`, { method: 'POST' })
    await api(`/api/favorites/${c.id}/use`, { method: 'POST' })
    // Fija el último uso de C en el pasado para que el desempate no dependa del reloj.
    await env.DB.prepare('UPDATE favorites SET last_used_at = ? WHERE id = ?')
      .bind('2020-01-01T00:00:00.000Z', c.id)
      .run()
    const used = await api(`/api/favorites/${a.id}/use`, { method: 'POST' })
    expect(used.status).toBe(200)
    const u = FavoriteSchema.parse(await used.json())
    expect(u.usesCount).toBe(1)
    expect(u.lastUsedAt).not.toBeNull()
    const list = (await (await api('/api/favorites')).json()) as { name: string }[]
    // B (2 usos); luego A y C con 1 uso, A más reciente.
    expect(list.map((f) => f.name)).toEqual(['B', 'A', 'C'])
    expect(
      (await api(`/api/favorites/${crypto.randomUUID()}/use`, { method: 'POST' })).status,
    ).toBe(404)
  })

  it('DELETE → 204 / 404; entrada inválida → 400', async () => {
    const f = fav('X')
    await json('/api/favorites', 'POST', f)
    expect((await api(`/api/favorites/${f.id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await api(`/api/favorites/${f.id}`, { method: 'DELETE' })).status).toBe(404)
    expect((await json('/api/favorites', 'POST', { ...fav(''), name: '' })).status).toBe(400)
  })
})
