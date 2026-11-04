import {
  type EntryInput,
  EntryInputSchema,
  type EntryItemInput,
  type Favorite,
  type FavoriteInput,
  FavoriteInputSchema,
  type MealType,
  suggestMealType,
  toLocalHour,
} from '@kalapp/shared'
import { entryTiming } from './dates'

/** Más usados primero; empate → usado más recientemente → nombre. */
export function sortFavorites(list: readonly Favorite[]): Favorite[] {
  return [...list].sort(
    (a, b) =>
      b.usesCount - a.usesCount ||
      (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') ||
      a.name.localeCompare(b.name, 'es-MX'),
  )
}

const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Filtra por nombre o ingrediente, sin distinguir acentos ni mayúsculas. */
export function filterFavorites(list: readonly Favorite[], query: string): Favorite[] {
  const q = normalize(query)
  if (!q) return [...list]
  return list.filter(
    (f) => normalize(f.name).includes(q) || f.items.some((it) => normalize(it.name).includes(q)),
  )
}

export interface FavoriteEntryParams {
  id: string
  favorite: Favorite
  now: Date
  timezone: string
  /** Día al que se registra (día pasado en Hoy); null = hoy. */
  targetDate?: string | null
}

/** Tipo de comida: el guardado en el favorito o, si no tiene, el sugerido por la hora. */
export function favoriteMealType(favorite: Favorite, now: Date, timezone: string): MealType {
  return favorite.mealType ?? suggestMealType(toLocalHour(now, timezone))
}

/** `POST /api/entries` para repetir un favorito en un toque. */
export function buildEntryFromFavorite(p: FavoriteEntryParams) {
  const timing = entryTiming(p.now, p.timezone, p.targetDate)
  const candidate: EntryInput = {
    id: p.id,
    localDate: timing.localDate,
    eatenAt: timing.eatenAt,
    mealType: favoriteMealType(p.favorite, p.now, p.timezone),
    source: 'favorite',
    note: null,
    title: p.favorite.name,
    items: p.favorite.items.map(({ confidence: _c, ...it }) => it),
    aiModel: null,
    aiConfidence: null,
  }
  return EntryInputSchema.safeParse(candidate)
}

/** `POST /api/favorites` desde un registro o desde Revisar. */
export function buildFavoriteInput(p: {
  id: string
  name: string
  items: readonly EntryItemInput[]
  mealType?: MealType | null
}) {
  const candidate: FavoriteInput = {
    id: p.id,
    name: p.name,
    items: p.items.map(({ confidence: _c, ...it }) => it),
    mealType: p.mealType ?? null,
  }
  return FavoriteInputSchema.safeParse(candidate)
}
