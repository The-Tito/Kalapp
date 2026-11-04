import { beforeEach, describe, expect, it } from 'vitest'
import { api, entryInput, ITEM, json, PROFILE_INPUT, resetDb } from '../test/helpers'
import { csvCell } from './export'

beforeEach(resetDb)

describe('csvCell', () => {
  it('escapa comas, comillas y saltos; neutraliza fórmulas', () => {
    expect(csvCell('simple')).toBe('simple')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('di "hola"')).toBe('"di ""hola"""')
    expect(csvCell('línea\nnueva')).toBe('"línea\nnueva"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+1')).toBe("'+1")
    expect(csvCell('-2')).toBe("'-2")
    expect(csvCell('@cmd')).toBe("'@cmd")
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"')
    expect(csvCell(12.5)).toBe('12.5')
    expect(csvCell(null)).toBe('')
  })
})

describe('GET /api/export', () => {
  it('CSV: BOM, una fila por ítem, escape y descarga con nombre', async () => {
    await json('/api/profile', 'PUT', PROFILE_INPUT)
    await json(
      '/api/entries',
      'POST',
      entryInput({
        localDate: '2026-11-04',
        eatenAt: '2026-11-04T20:05:00Z',
        title: 'Tacos, "el güero"',
        items: [ITEM, { ...ITEM, name: '=CMD()' }],
      }),
    )
    await json('/api/entries', 'POST', entryInput({ localDate: '2026-12-25' }))
    const res = await api('/api/export?format=csv&from=2026-11-01&to=2026-11-30')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="kalapp-2026-11-01-2026-11-30.csv"',
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const text = new TextDecoder().decode(bytes.subarray(3))
    const lines = text.trimEnd().split('\r\n')
    expect(lines[0]).toBe(
      'fecha,hora,comida,título,ingrediente,gramos,kcal,proteína (g),carbohidratos (g),grasa (g)',
    )
    expect(lines).toHaveLength(3)
    expect(lines[1]).toBe(
      '2026-11-04,14:05,Comida,"Tacos, ""el güero""",Tortilla de maíz,60,130,3.4,27,1.4',
    )
    expect(lines[2]).toContain(",'=CMD(),")
  })

  it('JSON: perfil, registros con ítems, pesos y favoritos', async () => {
    await json('/api/profile', 'PUT', PROFILE_INPUT)
    await json('/api/entries', 'POST', entryInput())
    await json('/api/weights', 'POST', { localDate: '2026-11-04', weightKg: 80 })
    await json('/api/favorites', 'POST', { id: crypto.randomUUID(), name: 'Fav', items: [ITEM] })
    const res = await api('/api/export?format=json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="kalapp-inicio-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    const body = (await res.json()) as {
      profile: { targetKcal: number }
      entries: { items: unknown[] }[]
      weights: unknown[]
      favorites: unknown[]
    }
    expect(body.profile.targetKcal).toBeGreaterThan(0)
    expect(body.entries).toHaveLength(1)
    expect(body.entries[0]?.items).toHaveLength(2)
    expect(body.weights).toHaveLength(1)
    expect(body.favorites).toHaveLength(1)
  })

  it('formato o rango inválidos → 400', async () => {
    expect((await api('/api/export?format=xml')).status).toBe(400)
    expect((await api('/api/export')).status).toBe(400)
    expect((await api('/api/export?format=csv&from=2026-11-05&to=2026-11-01')).status).toBe(400)
  })
})
