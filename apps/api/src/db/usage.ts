/** Análisis usados en una fecha (todos los modelos). */
export async function getUsageCalls(db: D1Database, date: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(calls), 0) AS calls FROM ai_usage WHERE date = ?')
    .bind(date)
    .first<{ calls: number }>()
  return row?.calls ?? 0
}

/** Suma un intento (el respaldo de modelo no cuenta aparte). */
export async function incrementUsage(db: D1Database, date: string, model: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO ai_usage (date, model, calls) VALUES (?, ?, 1)
       ON CONFLICT (date, model) DO UPDATE SET calls = calls + 1`,
    )
    .bind(date, model)
    .run()
}
