import { describe, expect, it } from 'vitest'
import { referenceProfile } from '../test/fixtures'
import {
  emptyProfileForm,
  type ProfileFormValues,
  parseProfileForm,
  previewRecommendation,
  profileToForm,
  validateStep,
} from './onboarding'

const TZ = 'America/Mexico_City'
const filled: ProfileFormValues = {
  ...emptyProfileForm(TZ),
  sex: 'male',
  birthDate: '1998-06-15',
  heightCm: '175',
  weightKg: '80',
  activityLevel: 'moderate',
  trainingDays: 3,
  goal: 'deficit',
  intensity: 'moderate',
}

describe('validación por paso', () => {
  it('paso 1 vacío: mensajes en español por campo', () => {
    const errors = validateStep(emptyProfileForm(TZ), 1)
    expect(errors).toEqual({
      sex: 'Elige una opción',
      birthDate: 'Escribe tu fecha de nacimiento',
      heightCm: 'Escribe tu estatura en cm',
      weightKg: 'Escribe tu peso en kg',
    })
  })

  it('paso 1: rangos y texto no numérico', () => {
    const errors = validateStep(
      { ...filled, heightCm: '90', weightKg: 'ochenta', bodyFatPct: '80' },
      1,
    )
    expect(errors.heightCm).toBe('Estatura (cm): mínimo 100')
    expect(errors.weightKg).toBe('Peso (kg): debe ser un número')
    expect(errors.bodyFatPct).toBe('% de grasa: máximo 70')
  })

  it('paso 1: edad fuera de rango y fecha futura', () => {
    expect(validateStep({ ...filled, birthDate: '2020-01-01' }, 1).birthDate).toBe(
      'La edad debe estar entre 14 y 100 años',
    )
    expect(validateStep({ ...filled, birthDate: '2999-01-01' }, 1).birthDate).toBe(
      'La fecha de nacimiento no puede ser futura',
    )
  })

  it('acepta coma decimal y % grasa vacío', () => {
    expect(validateStep({ ...filled, weightKg: '80,5', bodyFatPct: '' }, 1)).toEqual({})
  })

  it('pasos 2 y 3 requieren elegir', () => {
    expect(validateStep({ ...filled, activityLevel: '' }, 2)).toEqual({
      activityLevel: 'Elige tu nivel de actividad',
    })
    expect(validateStep({ ...filled, goal: '' }, 3)).toEqual({ goal: 'Elige un objetivo' })
  })

  it('paso 4: meta manual obligatoria si se activa y dentro de rango', () => {
    expect(validateStep({ ...filled, useManualTarget: true }, 4).manualTargetKcal).toBe(
      'Escribe tu meta en kcal',
    )
    expect(
      validateStep({ ...filled, useManualTarget: true, manualTargetKcal: '500' }, 4)
        .manualTargetKcal,
    ).toBe('Meta manual (kcal): mínimo 800')
    expect(validateStep({ ...filled, useManualTarget: true, manualTargetKcal: '2100' }, 4)).toEqual(
      {},
    )
  })
})

describe('resultado y guardado', () => {
  it('vista previa con recommend() del ejemplo de referencia', () => {
    const rec = previewRecommendation(filled, new Date('2026-11-04T18:00:00Z'))
    expect(rec).toMatchObject({ bmr: 1759, tdee: 2726, targetKcal: 2200, proteinG: 176 })
  })

  it('sin datos válidos no hay vista previa', () => {
    expect(previewRecommendation(emptyProfileForm(TZ))).toBeNull()
  })

  it('meta manual en la vista previa', () => {
    const rec = previewRecommendation(
      { ...filled, useManualTarget: true, manualTargetKcal: '2000' },
      new Date('2026-11-04T18:00:00Z'),
    )
    expect(rec?.targetKcal).toBe(2000)
    expect(rec?.isManualOverride).toBe(true)
  })

  it('parseProfileForm arma el payload completo', () => {
    const r = parseProfileForm({ ...filled, weightKg: '80,5' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data).toMatchObject({
        weightKg: 80.5,
        bodyFatPct: null,
        manualTargetKcal: null,
        timezone: TZ,
      })
    }
  })

  it('parseProfileForm indica el primer paso con errores', () => {
    const r = parseProfileForm({ ...filled, goal: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.step).toBe(3)
  })

  it('profileToForm → parseProfileForm conserva el perfil', () => {
    const r = parseProfileForm(profileToForm(referenceProfile))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.weightKg).toBe(referenceProfile.weightKg)
  })
})
