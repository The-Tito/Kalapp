import type { EntryItemInput, Favorite, FavoriteInput, MealType } from '@kalapp/shared'
import { sumTotals } from '@kalapp/shared'

interface FavoriteRow {
  id: string
  name: string
  meal_type: MealType | null
  items_json: string
  total_kcal: number
  total_protein_g: number
  total_carbs_g: number
  total_fat_g: number
  uses_count: number
  created_at: string
  last_used_at: string | null
}

function rowToFavorite(r: FavoriteRow): Favorite {
  let items: EntryItemInput[] = []
  try {
    const v: unknown = JSON.parse(r.items_json)
    if (Array.isArray(v)) items = v as EntryItemInput[]
  } catch {
    items = []
  }
  return {
    id: r.id,
    name: r.name,
    mealType: r.meal_type,
    items,
    totals: {
      kcal: r.total_kcal,
      proteinG: r.total_protein_g,
      carbsG: r.total_carbs_g,
      fatG: r.total_fat_g,
    },
    usesCount: r.uses_count,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
  }
}

export async function listFavorites(db: D1Database): Promise<Favorite[]> {
  // En SQLite NULL es el menor valor: con DESC los nunca usados quedan al final.
  const { results } = await db
    .prepare(
      'SELECT * FROM favorites ORDER BY uses_count DESC, last_used_at DESC, created_at DESC, id',
    )
    .all<FavoriteRow>()
  return results.map(rowToFavorite)
}

export async function getFavorite(db: D1Database, id: string): Promise<Favorite | null> {
  const row = await db.prepare('SELECT * FROM favorites WHERE id = ?').bind(id).first<FavoriteRow>()
  return row ? rowToFavorite(row) : null
}

/** Inserta si no existe. Devuelve `created: false` con el existente si el id ya estaba. */
export async function insertFavorite(
  db: D1Database,
  input: FavoriteInput,
  createdAt: string,
): Promise<{ favorite: Favorite; created: boolean }> {
  const t = sumTotals(input.items)
  const row = await db
    .prepare(
      `INSERT INTO favorites (id, name, meal_type, items_json, total_kcal, total_protein_g,
         total_carbs_g, total_fat_g, uses_count, created_at, last_used_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
    )
    .bind(
      input.id,
      input.name,
      input.mealType ?? null,
      JSON.stringify(input.items),
      t.kcal,
      t.proteinG,
      t.carbsG,
      t.fatG,
      createdAt,
    )
    .first<FavoriteRow>()
  if (row) return { favorite: rowToFavorite(row), created: true }
  const existing = await getFavorite(db, input.id)
  if (!existing) throw new Error('Favorito no encontrado tras conflicto')
  return { favorite: existing, created: false }
}

export async function deleteFavorite(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM favorites WHERE id = ?').bind(id).run()
  return r.meta.changes > 0
}

export async function useFavorite(
  db: D1Database,
  id: string,
  usedAt: string,
): Promise<Favorite | null> {
  const row = await db
    .prepare(
      'UPDATE favorites SET uses_count = uses_count + 1, last_used_at = ? WHERE id = ? RETURNING *',
    )
    .bind(usedAt, id)
    .first<FavoriteRow>()
  return row ? rowToFavorite(row) : null
}
