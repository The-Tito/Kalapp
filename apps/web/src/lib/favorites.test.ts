import type { Favorite } from '@kalapp/shared'
import { describe, expect, it } from 'vitest'
import {
  buildEntryFromFavorite,
  buildFavoriteInput,
  favoriteMealType,
  filterFavorites,
  sortFavorites,
} from './favorites'

const fav = (over: Partial<Favorite> = {}): Favorite => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Avena con plátano',
  items: [
    { name: 'Avena', grams: 40, kcal: 150, proteinG: 5, carbsG: 27, fatG: 3, confidence: 'high' },
    { name: 'Plátano', grams: 100, kcal: 89, proteinG: 1.1, carbsG: 22.8, fatG: 0.3 },
  ],
  mealType: null,
  totals: { kcal: 239, proteinG: 6.1, carbsG: 49.8, fatG: 3.3 },
  usesCount: 0,
  createdAt: '2026-11-01T10:00:00Z',
  lastUsedAt: null,
  ...over,
})

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const TZ = 'America/Mexico_City'
// 2026-11-04 13:05 en CDMX (UTC−6).
const NOW = new Date('2026-11-04T19:05:00Z')

describe('favoritos', () => {
  it('arma la entrada: source favorite, items sin confianza, título = nombre, id dado', () => {
    const r = buildEntryFromFavorite({ id: ID, favorite: fav(), now: NOW, timezone: TZ })
    expect(r.success).toBe(true)
    expect(r.data).toMatchObject({
      id: ID,
      localDate: '2026-11-04',
      eatenAt: '2026-11-04T13:05:00-06:00',
      mealType: 'lunch', // sugerido por la hora (13 h)
      source: 'favorite',
      title: 'Avena con plátano',
      aiModel: null,
      aiConfidence: null,
    })
    expect(r.data?.items[0]).not.toHaveProperty('confidence')
    expect(r.data?.items).toHaveLength(2)
  })

  it('usa el tipo de comida del favorito si lo tiene', () => {
    expect(favoriteMealType(fav({ mealType: 'breakfast' }), NOW, TZ)).toBe('breakfast')
    expect(favoriteMealType(fav(), new Date('2026-11-05T02:00:00Z'), TZ)).toBe('dinner') // 20 h
  })

  it('en un día pasado: esa fecha a la hora actual', () => {
    const r = buildEntryFromFavorite({
      id: ID,
      favorite: fav(),
      now: NOW,
      timezone: TZ,
      targetDate: '2026-11-01',
    })
    expect(r.data?.localDate).toBe('2026-11-01')
    expect(r.data?.eatenAt).toBe('2026-11-01T13:05:00-06:00')
  })

  it('ordena por más usados y filtra sin acentos', () => {
    const a = fav({ id: 'a', name: 'Café', usesCount: 2 })
    const b = fav({ id: 'b', name: 'Tacos', usesCount: 5 })
    const c = fav({ id: 'c', name: 'Atún', usesCount: 2, lastUsedAt: '2026-11-03T10:00:00Z' })
    expect(sortFavorites([a, b, c]).map((f) => f.id)).toEqual(['b', 'c', 'a'])
    expect(filterFavorites([a, b, c], 'cafe').map((f) => f.id)).toEqual(['a'])
    expect(filterFavorites([a, b, c], 'PLATANO')).toHaveLength(3) // por ingrediente
    expect(filterFavorites([a, b, c], '  ')).toHaveLength(3)
  })

  it('valida la entrada del favorito', () => {
    const ok = buildFavoriteInput({
      id: ID,
      name: ' Desayuno ',
      items: fav().items,
      mealType: 'breakfast',
    })
    expect(ok.success).toBe(true)
    expect(ok.data?.name).toBe('Desayuno')
    expect(buildFavoriteInput({ id: ID, name: '', items: fav().items }).success).toBe(false)
  })
})
