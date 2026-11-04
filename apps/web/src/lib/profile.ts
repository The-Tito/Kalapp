import type { Profile, ProfileInputPayload } from '@kalapp/shared'

/** Datos crudos del perfil actual para `PUT /api/profile`, con cambios opcionales. */
export function profileToInput(
  profile: Profile,
  overrides: Partial<ProfileInputPayload> = {},
): ProfileInputPayload {
  return {
    sex: profile.sex,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg: profile.weightKg,
    bodyFatPct: profile.bodyFatPct ?? null,
    activityLevel: profile.activityLevel,
    trainingDays: profile.trainingDays,
    goal: profile.goal,
    intensity: profile.intensity,
    timezone: profile.timezone,
    manualTargetKcal: profile.manualTargetKcal ?? null,
    ...overrides,
  }
}
