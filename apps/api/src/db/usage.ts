/** Análisis usados en una fecha (todos los modelos). */
export async function getUsageCalls(db: D1Database, date: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(calls), 0) AS calls FROM ai_usage WHERE date = ?')
    .bind(date)
    .first<{ calls: number }>()
  return row?.calls ?? 0
}

/**
 * Reserva un intento de forma atómica: una sola sentencia (D1/SQLite la ejecuta serializada)
 * que suma 1 solo si el total del día (todos los modelos) sigue por debajo de `limit`.
 * Devuelve `false` si ya se alcanzó el límite (no suma nada). El respaldo no cuenta aparte.
 */
export async function tryReserveUsage(
  db: D1Database,
  date: string,
  model: string,
  limit: number,
): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO ai_usage (date, model, calls)
       SELECT ?1, ?2, 1
       WHERE (SELECT COALESCE(SUM(calls), 0) FROM ai_usage WHERE date = ?1) < ?3
       ON CONFLICT (date, model) DO UPDATE SET calls = calls + 1
       WHERE (SELECT COALESCE(SUM(calls), 0) FROM ai_usage WHERE date = ?1) < ?3
       RETURNING calls`,
    )
    .bind(date, model, limit)
    .first<{ calls: number }>()
  return row !== null
}
