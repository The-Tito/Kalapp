/**
 * Constantes del dominio. Los valores numéricos se copian tal cual del KG
 * (`act:*`, `goal:*`, `calc:*`); no cambiarlos sin actualizar `context/`.
 */

// ---------------------------------------------------------------------------
// Enums (valores)
// ---------------------------------------------------------------------------
export const SEXES = ['male', 'female'] as const
export const ACTIVITY_LEVELS = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const
export const GOALS = ['deficit', 'recomp', 'gain'] as const
export const INTENSITIES = ['mild', 'moderate', 'aggressive'] as const
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export const ENTRY_SOURCES = ['photo', 'text', 'favorite', 'barcode', 'manual'] as const
export const CONFIDENCES = ['high', 'medium', 'low'] as const
export const BMR_FORMULAS = ['mifflin', 'katch'] as const
export const EXPORT_FORMATS = ['csv', 'json'] as const

export type SexValue = (typeof SEXES)[number]
export type ActivityLevelValue = (typeof ACTIVITY_LEVELS)[number]
export type GoalValue = (typeof GOALS)[number]
export type IntensityValue = (typeof INTENSITIES)[number]
export type MealTypeValue = (typeof MEAL_TYPES)[number]
export type EntrySourceValue = (typeof ENTRY_SOURCES)[number]
export type ConfidenceValue = (typeof CONFIDENCES)[number]

// ---------------------------------------------------------------------------
// Actividad (KG act:*)
// ---------------------------------------------------------------------------
export const ACTIVITY_FACTORS = {
  sedentary: {
    label: 'Sedentario',
    factor: 1.2,
    description: 'Trabajo de escritorio, < 5,000 pasos/día',
  },
  light: {
    label: 'Ligero',
    factor: 1.375,
    description: '5,000–8,000 pasos o 1–2 entrenamientos/semana',
  },
  moderate: {
    label: 'Moderado',
    factor: 1.55,
    description: '8,000–10,000 pasos o 3–4 entrenamientos/semana',
  },
  active: {
    label: 'Activo',
    factor: 1.725,
    description: '> 10,000 pasos o 5–6 entrenamientos/semana',
  },
  very_active: {
    label: 'Muy activo',
    factor: 1.9,
    description: 'Trabajo físico pesado o doble sesión diaria',
  },
} as const satisfies Record<
  ActivityLevelValue,
  { label: string; factor: number; description: string }
>

// ---------------------------------------------------------------------------
// Objetivos e intensidades (KG goal:*)
// ---------------------------------------------------------------------------
export const GOAL_CONFIG = {
  deficit: {
    label: 'Déficit',
    proteinGPerKg: 2.2,
    expectedChange: '≈ −0.3 a −0.8 kg/semana',
    defaultIntensity: 'moderate',
    intensities: {
      mild: { label: 'Suave', adjustPct: -15 },
      moderate: { label: 'Moderado', adjustPct: -20 },
      aggressive: { label: 'Agresivo', adjustPct: -25 },
    },
  },
  recomp: {
    label: 'Recomposición',
    proteinGPerKg: 2.0,
    expectedChange: 'Peso estable; baja grasa y sube músculo lentamente',
    defaultIntensity: 'moderate',
    // La recomposición tiene una sola intensidad ("Única", −5 %); se ignora la elegida.
    intensities: {
      mild: { label: 'Única', adjustPct: -5 },
      moderate: { label: 'Única', adjustPct: -5 },
      aggressive: { label: 'Única', adjustPct: -5 },
    },
  },
  gain: {
    label: 'Ganancia muscular',
    proteinGPerKg: 1.8,
    expectedChange: '≈ +0.25 a +0.5 kg/semana',
    defaultIntensity: 'moderate',
    intensities: {
      mild: { label: 'Limpia', adjustPct: 5 },
      moderate: { label: 'Moderada', adjustPct: 10 },
      aggressive: { label: 'Rápida', adjustPct: 15 },
    },
  },
} as const satisfies Record<
  GoalValue,
  {
    label: string
    proteinGPerKg: number
    expectedChange: string
    defaultIntensity: IntensityValue
    intensities: Record<IntensityValue, { label: string; adjustPct: number }>
  }
>

/** Ajuste porcentual (ej. −20) para un objetivo e intensidad. */
export function getAdjustPct(goal: GoalValue, intensity: IntensityValue): number {
  return GOAL_CONFIG[goal].intensities[intensity].adjustPct
}

/** Etiqueta es-MX de la intensidad según el objetivo (ej. gain+mild → "Limpia"). */
export function getIntensityLabel(goal: GoalValue, intensity: IntensityValue): string {
  return GOAL_CONFIG[goal].intensities[intensity].label
}

// ---------------------------------------------------------------------------
// Etiquetas es-MX
// ---------------------------------------------------------------------------
export const SEX_LABELS = { male: 'Hombre', female: 'Mujer' } as const satisfies Record<
  SexValue,
  string
>

export const ACTIVITY_LEVEL_LABELS = {
  sedentary: ACTIVITY_FACTORS.sedentary.label,
  light: ACTIVITY_FACTORS.light.label,
  moderate: ACTIVITY_FACTORS.moderate.label,
  active: ACTIVITY_FACTORS.active.label,
  very_active: ACTIVITY_FACTORS.very_active.label,
} as const satisfies Record<ActivityLevelValue, string>

export const GOAL_LABELS = {
  deficit: GOAL_CONFIG.deficit.label,
  recomp: GOAL_CONFIG.recomp.label,
  gain: GOAL_CONFIG.gain.label,
} as const satisfies Record<GoalValue, string>

/** Etiqueta genérica; para la etiqueta según objetivo usar `getIntensityLabel`. */
export const INTENSITY_LABELS = {
  mild: 'Suave',
  moderate: 'Moderada',
  aggressive: 'Agresiva',
} as const satisfies Record<IntensityValue, string>

export const MEAL_TYPE_LABELS = {
  breakfast: 'Desayuno',
  lunch: 'Comida',
  dinner: 'Cena',
  snack: 'Colación',
} as const satisfies Record<MealTypeValue, string>

export const ENTRY_SOURCE_LABELS = {
  photo: 'Foto',
  text: 'Texto',
  favorite: 'Favorito',
  barcode: 'Código de barras',
  manual: 'Manual',
} as const satisfies Record<EntrySourceValue, string>

export const CONFIDENCE_LABELS = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
} as const satisfies Record<ConfidenceValue, string>

export const BMR_FORMULA_LABELS = {
  mifflin: 'Mifflin-St Jeor',
  katch: 'Katch-McArdle',
} as const

// ---------------------------------------------------------------------------
// Reglas de cálculo (KG calc:*)
// ---------------------------------------------------------------------------
/** kcal por gramo (calc:macros). */
export const KCAL_PER_GRAM = { protein: 4, carbs: 4, fat: 9 } as const
/** kcal por kg de peso corporal (calc:expected-change). */
export const KCAL_PER_KG_BODY_WEIGHT = 7700
/** Redondeo de la meta (calc:goal-adjust). */
export const TARGET_ROUNDING_KCAL = 50
/** Piso absoluto por sexo (calc:safety-floor). */
export const SAFETY_FLOOR_KCAL = { male: 1500, female: 1200 } as const satisfies Record<
  SexValue,
  number
>
/** Grasa: 25 % de las kcal, mínimo 0.6 g/kg (calc:macros). */
export const FAT_PCT_OF_KCAL = 0.25
export const FAT_MIN_G_PER_KG = 0.6
/** IMC a partir del cual se usa peso ajustado y IMC objetivo (calc:adjusted-weight). */
export const BMI_ADJUST_THRESHOLD = 30
export const BMI_ADJUSTED_TARGET = 25
/** % de grasa a partir del cual se avisa en ganancia muscular. */
export const GAIN_HIGH_BODY_FAT_PCT = { male: 25, female: 32 } as const satisfies Record<
  SexValue,
  number
>
/** Tolerancia de la verificación 4/4/9 (calc:energy-check) e ítems ignorados por pequeños. */
export const ENERGY_MISMATCH_TOLERANCE = 0.15
export const ENERGY_MISMATCH_MIN_KCAL = 20
/** Diferencia de peso que sugiere recalcular el perfil (calc:warnings). */
export const WEIGHT_DRIFT_RECALC_KG = 2

/** Gasto adaptativo (calc:adaptive-tdee). */
export const ADAPTIVE_TDEE = {
  minRangeDays: 14,
  minLoggedRatio: 0.8,
  minWeights: 2,
  minWeightSpanDays: 7,
  roundingKcal: 10,
  /** Fuera de este rango el gasto estimado se considera irreal (IMPLAUSIBLE_RESULT). */
  plausibleTdeeKcal: { min: 800, max: 6000 },
} as const

/** Límites de `scaleItems`. */
export const SCALE_FACTOR_MIN = 0.25
export const SCALE_FACTOR_MAX = 10

// ---------------------------------------------------------------------------
// Límites de validación
// ---------------------------------------------------------------------------
export const LIMITS = {
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 30, max: 350 },
  bodyFatPct: { min: 3, max: 70 },
  trainingDays: { min: 0, max: 7 },
  ageYears: { min: 14, max: 100 },
  itemGrams: { min: 0, max: 5000 },
  itemKcal: { min: 0, max: 10000 },
  itemMacroG: { min: 0, max: 1000 },
  itemsPerEntry: { min: 1, max: 30 },
  noteMaxLength: 500,
  nameMaxLength: 120,
  analyzeTextMaxLength: 500,
  manualTargetKcal: { min: 800, max: 6000 },
  listMaxItems: 20,
  summaryMaxRangeDays: 366,
} as const

export const DEFAULT_TIMEZONE = 'America/Mexico_City'

/** Subida de foto a /api/analyze (multipart). */
export const ANALYZE_IMAGE_FIELD = 'image'
export const ANALYZE_NOTE_FIELD = 'note'
export const ANALYZE_LOCAL_HOUR_FIELD = 'localHour'
/** Valor por defecto (sec:token-rate-limit); el Worker puede sobrescribirlo con MAX_IMAGE_BYTES. */
export const MAX_IMAGE_BYTES = 1_048_576
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
