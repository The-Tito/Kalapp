import type { Weight, WeightInput } from '@kalapp/shared'

interface WeightRow {
  id: string
  local_date: string
  weight_kg: number
  created_at: string
}

function rowToWeight(r: WeightRow): Weight {
  return { id: r.id, localDate: r.local_date, weightKg: r.weight_kg, createdAt: r.created_at }
}

/** Pesos en orden ascendente; extremos opcionales e inclusivos. */
export async function listWeights(
  db: D1Database,
  from: string | undefined,
  to: string | undefined,
): Promise<Weight[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM weights
       WHERE (?1 IS NULL OR local_date >= ?1) AND (?2 IS NULL OR local_date <= ?2)
       ORDER BY local_date`,
    )
    .bind(from ?? null, to ?? null)
    .all<WeightRow>()
  return results.map(rowToWeight)
}

/** Un peso por día: si ya hay uno ese día se sustituye (conserva el id). */
export async function upsertWeight(
  db: D1Database,
  input: WeightInput,
  id: string,
  createdAt: string,
): Promise<Weight> {
  const row = await db
    .prepare(
      `INSERT INTO weights (id, local_date, weight_kg, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT (local_date) DO UPDATE SET
         weight_kg = excluded.weight_kg, created_at = excluded.created_at
       RETURNING *`,
    )
    .bind(id, input.localDate, input.weightKg, createdAt)
    .first<WeightRow>()
  if (!row) throw new Error('No se pudo guardar el peso')
  return rowToWeight(row)
}

export async function deleteWeight(db: D1Database, localDate: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM weights WHERE local_date = ?').bind(localDate).run()
  return r.meta.changes > 0
}
