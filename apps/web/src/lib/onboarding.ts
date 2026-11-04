import {
  type ActivityLevel,
  type Goal,
  type Intensity,
  type Profile,
  type ProfileInput,
  ProfileInputSchema,
  type Recommendation,
  recommend,
  type Sex,
} from '@kalapp/shared'

export type OnboardingStep = 1 | 2 | 3 | 4
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [1, 2, 3, 4]

/** Valores del formulario tal como se escriben (los números como texto). */
export interface ProfileFormValues {
  sex: Sex | ''
  birthDate: string
  heightCm: string
  weightKg: string
  bodyFatPct: string
  activityLevel: ActivityLevel | ''
  trainingDays: number
  goal: Goal | ''
  intensity: Intensity
  useManualTarget: boolean
  manualTargetKcal: string
  timezone: string
}

export type ProfileField = keyof typeof ProfileInputSchema.shape
export type FieldErrors = Partial<Record<ProfileField, string>>

export const STEP_FIELDS: Record<OnboardingStep, readonly ProfileField[]> = {
  1: ['sex', 'birthDate', 'heightCm', 'weightKg', 'bodyFatPct'],
  2: ['activityLevel', 'trainingDays'],
  3: ['goal', 'intensity'],
  4: ['manualTargetKcal', 'timezone'],
}

const REQUIRED_MESSAGES: Partial<Record<ProfileField, string>> = {
  sex: 'Elige una opción',
  birthDate: 'Escribe tu fecha de nacimiento',
  heightCm: 'Escribe tu estatura en cm',
  weightKg: 'Escribe tu peso en kg',
  activityLevel: 'Elige tu nivel de actividad',
  goal: 'Elige un objetivo',
  manualTargetKcal: 'Escribe tu meta en kcal',
}

export function emptyProfileForm(timezone: string): ProfileFormValues {
  return {
    sex: '',
    birthDate: '',
    heightCm: '',
    weightKg: '',
    bodyFatPct: '',
    activityLevel: '',
    trainingDays: 3,
    goal: '',
    intensity: 'moderate',
    useManualTarget: false,
    manualTargetKcal: '',
    timezone,
  }
}

const numToText = (n: number | null | undefined) => (n == null ? '' : String(n))

export function profileToForm(profile: Profile): ProfileFormValues {
  return {
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: numToText(profile.heightCm),
    weightKg: numToText(profile.weightKg),
    bodyFatPct: numToText(profile.bodyFatPct),
    activityLevel: profile.activityLevel,
    trainingDays: profile.trainingDays,
    goal: profile.goal,
    intensity: profile.intensity,
    useManualTarget: profile.manualTargetKcal != null,
    manualTargetKcal: numToText(profile.manualTargetKcal),
    timezone: profile.timezone,
  }
}

/** "" → undefined; acepta coma decimal; texto no numérico → NaN (el esquema lo rechaza). */
/**
 * Número decimal escrito por el usuario ("80", "80.5", "80,5", "-5"). `undefined` si está vacío;
 * `NaN` si no es un decimal simple (rechaza "0x10", "1e3", "Infinity", "1,000.5").
 */
export function parseNumber(text: string): number | undefined {
  const t = text.trim()
  if (t === '') return undefined
  if (!/^-?\d+([.,]\d+)?$/.test(t)) return Number.NaN
  return Number(t.replace(',', '.'))
}

function isEmpty(values: ProfileFormValues, field: ProfileField): boolean {
  switch (field) {
    case 'sex':
    case 'activityLevel':
    case 'goal':
    case 'birthDate':
    case 'heightCm':
    case 'weightKg':
      return String(values[field]).trim() === ''
    case 'manualTargetKcal':
      return values.useManualTarget && values.manualTargetKcal.trim() === ''
    default:
      return false
  }
}

/** Objeto candidato para `ProfileInputSchema` (sin validar). */
export function formToCandidate(values: ProfileFormValues): Record<ProfileField, unknown> {
  return {
    sex: values.sex || undefined,
    birthDate: values.birthDate,
    heightCm: parseNumber(values.heightCm),
    weightKg: parseNumber(values.weightKg),
    bodyFatPct: parseNumber(values.bodyFatPct) ?? null,
    activityLevel: values.activityLevel || undefined,
    trainingDays: values.trainingDays,
    goal: values.goal || undefined,
    intensity: values.intensity,
    timezone: values.timezone,
    manualTargetKcal: values.useManualTarget
      ? (parseNumber(values.manualTargetKcal) ?? Number.NaN)
      : null,
  }
}

function collectErrors(
  values: ProfileFormValues,
  fields: readonly ProfileField[],
  issues: readonly { path: PropertyKey[]; message: string }[],
): FieldErrors {
  const errors: FieldErrors = {}
  for (const issue of issues) {
    const field = issue.path[0] as ProfileField | undefined
    if (!field || !fields.includes(field) || errors[field]) continue
    errors[field] = (isEmpty(values, field) && REQUIRED_MESSAGES[field]) || issue.message
  }
  return errors
}

/** Valida solo los campos del paso con el esquema compartido. `{}` = puede avanzar. */
export function validateStep(values: ProfileFormValues, step: OnboardingStep): FieldErrors {
  const fields = STEP_FIELDS[step]
  const mask = Object.fromEntries(fields.map((f) => [f, true as const])) as Record<
    ProfileField,
    true
  >
  const result = ProfileInputSchema.pick(mask).safeParse(formToCandidate(values))
  return result.success ? {} : collectErrors(values, fields, result.error.issues)
}

export function parseProfileForm(
  values: ProfileFormValues,
): { ok: true; data: ProfileInput } | { ok: false; errors: FieldErrors; step: OnboardingStep } {
  for (const step of ONBOARDING_STEPS) {
    const errors = validateStep(values, step)
    if (Object.keys(errors).length > 0) return { ok: false, errors, step }
  }
  const parsed = ProfileInputSchema.safeParse(formToCandidate(values))
  if (!parsed.success) {
    const all = Object.keys(ProfileInputSchema.shape) as ProfileField[]
    return { ok: false, errors: collectErrors(values, all, parsed.error.issues), step: 4 }
  }
  return { ok: true, data: parsed.data }
}

/**
 * Vista previa local con `recommend()` (el servidor recalcula al guardar). `null` si los
 * pasos 1–3 aún no son válidos. Una meta manual inválida se ignora en la vista previa.
 */
export function previewRecommendation(
  values: ProfileFormValues,
  now: Date = new Date(),
): Recommendation | null {
  for (const step of [1, 2, 3] as const) {
    if (Object.keys(validateStep(values, step)).length > 0) return null
  }
  const manualOk = Object.keys(validateStep(values, 4)).length === 0
  const parsed = ProfileInputSchema.safeParse({
    ...formToCandidate(values),
    manualTargetKcal: manualOk ? formToCandidate(values).manualTargetKcal : null,
  })
  if (!parsed.success) return null
  try {
    return recommend(parsed.data, now)
  } catch {
    return null
  }
}
