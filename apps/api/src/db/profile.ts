import type {
  ActivityLevel,
  BmrFormula,
  Goal,
  Intensity,
  Profile,
  ProfileInput,
  Recommendation,
  RecommendationWarning,
  Sex,
} from '@kalapp/shared'

interface ProfileRow {
  sex: Sex
  birth_date: string
  height_cm: number
  weight_kg: number
  body_fat_pct: number | null
  activity_level: ActivityLevel
  training_days: number
  goal: Goal
  intensity: Intensity
  timezone: string
  manual_target_kcal: number | null
  bmr: number
  tdee: number
  bmr_formula: BmrFormula
  adjust_pct: number
  target_kcal: number
  protein_g: number
  fat_g: number
  carbs_g: number
  expected_kg_per_week: number
  safety_floor_applied: number
  is_manual_override: number
  warnings_json: string
  explanation_json: string
  updated_at: string
}

function parseJsonArray<T>(text: string): T[] {
  try {
    const v: unknown = JSON.parse(text)
    return Array.isArray(v) ? (v as T[]) : []
  } catch {
    return []
  }
}

function rowToProfile(r: ProfileRow): Profile {
  return {
    sex: r.sex,
    birthDate: r.birth_date,
    heightCm: r.height_cm,
    weightKg: r.weight_kg,
    bodyFatPct: r.body_fat_pct,
    activityLevel: r.activity_level,
    trainingDays: r.training_days,
    goal: r.goal,
    intensity: r.intensity,
    timezone: r.timezone,
    manualTargetKcal: r.manual_target_kcal,
    bmr: r.bmr,
    tdee: r.tdee,
    bmrFormula: r.bmr_formula,
    adjustPct: r.adjust_pct,
    targetKcal: r.target_kcal,
    proteinG: r.protein_g,
    fatG: r.fat_g,
    carbsG: r.carbs_g,
    expectedKgPerWeek: r.expected_kg_per_week,
    safetyFloorApplied: r.safety_floor_applied === 1,
    isManualOverride: r.is_manual_override === 1,
    warnings: parseJsonArray<RecommendationWarning>(r.warnings_json),
    explanation: parseJsonArray<string>(r.explanation_json),
    updatedAt: r.updated_at,
  }
}

export async function getProfile(db: D1Database): Promise<Profile | null> {
  const row = await db.prepare('SELECT * FROM profile WHERE id = 1').first<ProfileRow>()
  return row ? rowToProfile(row) : null
}

/** Zona del perfil (o null si no hay perfil). Consulta ligera para límites y fechas. */
export async function getProfileTimezone(db: D1Database): Promise<string | null> {
  const row = await db
    .prepare('SELECT timezone FROM profile WHERE id = 1')
    .first<{ timezone: string }>()
  return row?.timezone ?? null
}

export async function saveProfile(
  db: D1Database,
  input: ProfileInput,
  rec: Recommendation,
  updatedAt: string,
): Promise<Profile> {
  const row = await db
    .prepare(
      `INSERT INTO profile (
        id, sex, birth_date, height_cm, weight_kg, body_fat_pct, activity_level, training_days,
        goal, intensity, timezone, manual_target_kcal, bmr, tdee, bmr_formula, adjust_pct,
        target_kcal, protein_g, fat_g, carbs_g, expected_kg_per_week, safety_floor_applied,
        is_manual_override, warnings_json, explanation_json, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO UPDATE SET
        sex = excluded.sex, birth_date = excluded.birth_date, height_cm = excluded.height_cm,
        weight_kg = excluded.weight_kg, body_fat_pct = excluded.body_fat_pct,
        activity_level = excluded.activity_level, training_days = excluded.training_days,
        goal = excluded.goal, intensity = excluded.intensity, timezone = excluded.timezone,
        manual_target_kcal = excluded.manual_target_kcal, bmr = excluded.bmr,
        tdee = excluded.tdee, bmr_formula = excluded.bmr_formula,
        adjust_pct = excluded.adjust_pct, target_kcal = excluded.target_kcal,
        protein_g = excluded.protein_g, fat_g = excluded.fat_g, carbs_g = excluded.carbs_g,
        expected_kg_per_week = excluded.expected_kg_per_week,
        safety_floor_applied = excluded.safety_floor_applied,
        is_manual_override = excluded.is_manual_override,
        warnings_json = excluded.warnings_json, explanation_json = excluded.explanation_json,
        updated_at = excluded.updated_at
      RETURNING *`,
    )
    .bind(
      input.sex,
      input.birthDate,
      input.heightCm,
      input.weightKg,
      input.bodyFatPct ?? null,
      input.activityLevel,
      input.trainingDays,
      input.goal,
      input.intensity,
      input.timezone,
      input.manualTargetKcal,
      rec.bmr,
      rec.tdee,
      rec.bmrFormula,
      rec.adjustPct,
      rec.targetKcal,
      rec.proteinG,
      rec.fatG,
      rec.carbsG,
      rec.expectedKgPerWeek,
      rec.safetyFloorApplied ? 1 : 0,
      rec.isManualOverride ? 1 : 0,
      JSON.stringify(rec.warnings),
      JSON.stringify(rec.explanation),
      updatedAt,
    )
    .first<ProfileRow>()
  if (!row) throw new Error('No se pudo guardar el perfil')
  return rowToProfile(row)
}
