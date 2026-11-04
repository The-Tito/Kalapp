import { describe, expect, it } from 'vitest'
import {
  emptyProfileForm,
  type ProfileFormValues,
  parseNumber,
  parseProfileForm,
  previewRecommendation,
  validateStep,
} from './onboarding'

const valid = (): ProfileFormValues => ({
  ...emptyProfileForm('America/Mexico_City'),
  sex: 'male',
  birthDate: '1998-06-15',
  heightCm: '175',
  weightKg: '80',
  activityLevel: 'moderate',
  trainingDays: 3,
  goal: 'deficit',
  intensity: 'moderate',
})

const yearsAgo = (n: number) => {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - n)
  return d.toISOString().slice(0, 10)
}

describe('onboarding (adversarial)', () => {
  it.each([
    ['0'],
    ['99999'],
    ['1e3'],
    ['-175'],
    ['abc'],
    ['175 cm'],
    ['0x AF'],
    ['Infinity'],
    ['NaN'],
    ['1.234,5'],
    ['12,5'],
  ])('estatura inválida %j no deja avanzar ni guardar', (h) => {
    const v = { ...valid(), heightCm: h }
    expect(validateStep(v, 1).heightCm).toBeTruthy()
    expect(parseProfileForm(v).ok).toBe(false)
    expect(previewRecommendation(v)).toBeNull()
  })

  it('coma decimal es-MX se acepta cuando el valor está en rango', () => {
    expect(parseNumber('175,5')).toBe(175.5)
    const r = parseProfileForm({ ...valid(), heightCm: '175,5', weightKg: '80,3' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.data.heightCm).toBe(175.5)
      expect(r.data.weightKg).toBe(80.3)
    }
  })

  it('BUG: "0x10" no se cuela como número hexadecimal válido (16) para la grasa', () => {
    // Number('0x10') === 16: dentro del rango 3–70; se acepta texto no decimal.
    const v = { ...valid(), bodyFatPct: '0x10' }
    expect(validateStep(v, 1).bodyFatPct).toBeTruthy()
  })

  it('peso negativo / 0 / gigante se rechaza', () => {
    for (const w of ['-80', '0', '1e6', ' ']) {
      expect(parseProfileForm({ ...valid(), weightKg: w }).ok).toBe(false)
    }
  })

  it.each([
    ['futura', '2999-01-01'],
    ['1900', '1900-01-01'],
    ['inexistente', '2001-02-30'],
    ['formato', '15/06/1998'],
    ['vacía', ''],
    ['menor de 14', yearsAgo(10)],
  ])('fecha de nacimiento %s se rechaza', (_label, birthDate) => {
    const v = { ...valid(), birthDate }
    expect(validateStep(v, 1).birthDate).toBeTruthy()
    expect(parseProfileForm(v).ok).toBe(false)
  })

  it('% de grasa 0 y 100 se rechazan; vacío se permite', () => {
    expect(parseProfileForm({ ...valid(), bodyFatPct: '0' }).ok).toBe(false)
    expect(parseProfileForm({ ...valid(), bodyFatPct: '100' }).ok).toBe(false)
    expect(parseProfileForm({ ...valid(), bodyFatPct: '' }).ok).toBe(true)
  })

  it('cambiar de objetivo y volver conserva la intensidad elegida', () => {
    let v: ProfileFormValues = { ...valid(), goal: 'deficit', intensity: 'aggressive' }
    v = { ...v, goal: 'recomp' }
    v = { ...v, goal: 'deficit' }
    expect(v.intensity).toBe('aggressive')
    const r = parseProfileForm(v)
    expect(r.ok && r.data.intensity).toBe('aggressive')
  })

  it.each([['0'], ['799'], ['6001'], ['abc'], [''], ['1500.5'], ['NaN']])(
    'meta manual inválida %j no se puede guardar',
    (kcal) => {
      const v = { ...valid(), useManualTarget: true, manualTargetKcal: kcal }
      const r = parseProfileForm(v)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.step).toBe(4)
    },
  )

  it('meta manual inválida no rompe la vista previa (se ignora)', () => {
    const v = { ...valid(), useManualTarget: true, manualTargetKcal: '799' }
    const rec = previewRecommendation(v)
    expect(rec).not.toBeNull()
    expect(rec?.isManualOverride).toBe(false)
  })

  it('meta manual desactivada ignora texto basura en el campo', () => {
    const r = parseProfileForm({ ...valid(), useManualTarget: false, manualTargetKcal: 'zzz' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.manualTargetKcal).toBeNull()
  })

  it('texto pegado con espacios alrededor se recorta', () => {
    const r = parseProfileForm({ ...valid(), heightCm: '  175\n', weightKg: '\t80 ' })
    expect(r.ok).toBe(true)
  })

  it('zona horaria inválida no se puede guardar', () => {
    expect(parseProfileForm({ ...valid(), timezone: 'Mars/Olympus' }).ok).toBe(false)
  })
})
