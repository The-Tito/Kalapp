import type {
  Confidence,
  Entry,
  EntryInput,
  EntryItemInput,
  EntryPatch,
  EntrySource,
  MacroTotals,
  MealType,
} from '@kalapp/shared'
import { sumTotals } from '@kalapp/shared'

interface EntryRow {
  id: string
  local_date: string
  eaten_at: string
  meal_type: MealType
  source: EntrySource
  title: string | null
  note: string | null
  total_kcal: number
  total_protein_g: number
  total_carbs_g: number
  total_fat_g: number
  ai_model: string | null
  ai_confidence: Confidence | null
  created_at: string
}

interface ItemRow {
  entry_id: string
  position: number
  name: string
  grams: number
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: Confidence | null
}

/** Orden cronológico real aunque los `eaten_at` traigan offsets distintos. */
const ORDER_BY = 'ORDER BY julianday(eaten_at), created_at, id'

function rowToItem(r: ItemRow): EntryItemInput {
  const item: EntryItemInput = {
    name: r.name,
    grams: r.grams,
    kcal: r.kcal,
    proteinG: r.protein_g,
    carbsG: r.carbs_g,
    fatG: r.fat_g,
  }
  if (r.confidence) item.confidence = r.confidence
  return item
}

function rowToEntry(r: EntryRow, items: EntryItemInput[]): Entry {
  return {
    id: r.id,
    localDate: r.local_date,
    eatenAt: r.eaten_at,
    mealType: r.meal_type,
    source: r.source,
    title: r.title,
    note: r.note,
    items,
    aiModel: r.ai_model,
    aiConfidence: r.ai_confidence,
    totals: {
      kcal: r.total_kcal,
      proteinG: r.total_protein_g,
      carbsG: r.total_carbs_g,
      fatG: r.total_fat_g,
    },
    createdAt: r.created_at,
  }
}

async function attachItems(db: D1Database, rows: EntryRow[]): Promise<Entry[]> {
  if (rows.length === 0) return []
  const byEntry = new Map<string, EntryItemInput[]>()
  // D1 limita los parámetros por consulta (100); se piden en bloques.
  const ids = rows.map((r) => r.id)
  for (let i = 0; i < ids.length; i += 90) {
    const chunk = ids.slice(i, i + 90)
    const { results } = await db
      .prepare(
        `SELECT * FROM entry_items WHERE entry_id IN (${chunk.map(() => '?').join(',')})
         ORDER BY entry_id, position`,
      )
      .bind(...chunk)
      .all<ItemRow>()
    for (const it of results) {
      const list = byEntry.get(it.entry_id) ?? []
      list.push(rowToItem(it))
      byEntry.set(it.entry_id, list)
    }
  }
  return rows.map((r) => rowToEntry(r, byEntry.get(r.id) ?? []))
}

export async function getEntry(db: D1Database, id: string): Promise<Entry | null> {
  const row = await db.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first<EntryRow>()
  if (!row) return null
  const [entry] = await attachItems(db, [row])
  return entry ?? null
}

export async function listEntriesByDate(db: D1Database, localDate: string): Promise<Entry[]> {
  const { results } = await db
    .prepare(`SELECT * FROM entries WHERE local_date = ? ${ORDER_BY}`)
    .bind(localDate)
    .all<EntryRow>()
  return attachItems(db, results)
}

/** Registros con ingredientes en un rango (ambos extremos opcionales e inclusivos). */
export async function listEntriesInRange(
  db: D1Database,
  from: string | undefined,
  to: string | undefined,
): Promise<Entry[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM entries
       WHERE (?1 IS NULL OR local_date >= ?1) AND (?2 IS NULL OR local_date <= ?2)
       ORDER BY local_date, julianday(eaten_at), created_at, id`,
    )
    .bind(from ?? null, to ?? null)
    .all<EntryRow>()
  return attachItems(db, results)
}

/** Solo totales por registro en [from, to] (para resúmenes, sin leer ingredientes). */
export async function listEntryTotals(
  db: D1Database,
  from: string,
  to: string,
): Promise<{ localDate: string; totals: MacroTotals }[]> {
  const { results } = await db
    .prepare(
      `SELECT local_date, total_kcal, total_protein_g, total_carbs_g, total_fat_g FROM entries
       WHERE local_date >= ? AND local_date <= ?`,
    )
    .bind(from, to)
    .all<
      Pick<
        EntryRow,
        'local_date' | 'total_kcal' | 'total_protein_g' | 'total_carbs_g' | 'total_fat_g'
      >
    >()
  return results.map((r) => ({
    localDate: r.local_date,
    totals: {
      kcal: r.total_kcal,
      proteinG: r.total_protein_g,
      carbsG: r.total_carbs_g,
      fatG: r.total_fat_g,
    },
  }))
}

function insertItemsStatements(
  db: D1Database,
  entryId: string,
  items: readonly EntryItemInput[],
): D1PreparedStatement[] {
  const stmt = db.prepare(
    `INSERT INTO entry_items (entry_id, position, name, grams, kcal, protein_g, carbs_g, fat_g,
       confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  return items.map((it, i) =>
    stmt.bind(
      entryId,
      i,
      it.name,
      it.grams,
      it.kcal,
      it.proteinG,
      it.carbsG,
      it.fatG,
      it.confidence ?? null,
    ),
  )
}

/** Inserta registro + ingredientes en un solo batch (transacción atómica de D1). */
export async function insertEntry(
  db: D1Database,
  input: EntryInput,
  createdAt: string,
): Promise<void> {
  const t = sumTotals(input.items)
  await db.batch([
    db
      .prepare(
        `INSERT INTO entries (id, local_date, eaten_at, meal_type, source, title, note, total_kcal,
           total_protein_g, total_carbs_g, total_fat_g, ai_model, ai_confidence, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        input.localDate,
        input.eatenAt,
        input.mealType,
        input.source,
        input.title ?? null,
        input.note ?? null,
        t.kcal,
        t.proteinG,
        t.carbsG,
        t.fatG,
        input.aiModel,
        input.aiConfidence,
        createdAt,
      ),
    ...insertItemsStatements(db, input.id, input.items),
  ])
}

const PATCH_COLUMNS = {
  mealType: 'meal_type',
  note: 'note',
  title: 'title',
  localDate: 'local_date',
  eatenAt: 'eaten_at',
} as const satisfies Partial<Record<keyof EntryPatch, string>>

/** Aplica el parche; si trae `items` los reemplaza y recalcula totales (un solo batch). */
export async function patchEntry(db: D1Database, id: string, patch: EntryPatch): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []
  for (const [key, column] of Object.entries(PATCH_COLUMNS) as [
    keyof typeof PATCH_COLUMNS,
    string,
  ][]) {
    const v = patch[key]
    if (v !== undefined) {
      sets.push(`${column} = ?`)
      values.push(v)
    }
  }
  const statements: D1PreparedStatement[] = []
  if (patch.items) {
    const t = sumTotals(patch.items)
    sets.push('total_kcal = ?', 'total_protein_g = ?', 'total_carbs_g = ?', 'total_fat_g = ?')
    values.push(t.kcal, t.proteinG, t.carbsG, t.fatG)
    statements.push(db.prepare('DELETE FROM entry_items WHERE entry_id = ?').bind(id))
    statements.push(...insertItemsStatements(db, id, patch.items))
  }
  if (sets.length > 0) {
    statements.unshift(
      db.prepare(`UPDATE entries SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id),
    )
  }
  if (statements.length > 0) await db.batch(statements)
}

/** `true` si se borró (los ingredientes caen por ON DELETE CASCADE). */
export async function deleteEntry(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM entries WHERE id = ?').bind(id).run()
  return r.meta.changes > 0
}
