import { describe, expect, it } from 'vitest'
import { ProfileInputSchema } from '../schemas/profile'
import { ageOn } from './age'
import { bmi, bmr, safetyFloorKcal, tdee } from './energy'
import { recommend } from './recommend'

// Ejemplo ficticio ex:reference-male (NO son datos del usuario).
const AS_OF = '2026-11-04'
const reference = ProfileInputSchema.parse({
  sex: 'male',
  birthDate: '1998-06-15', // 28 años al 2026-11-04
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  trainingDays: 3,
  goal: 'deficit',
  intensity: 'moderate',
})

const codes = (r: { warnings: { code: string }[] }) => r.warnings.map((w) => w.code)

describe('ageOn', () => {
  it('cuenta años cumplidos', () => {
    expect(ageOn('1998-06-15', '2026-11-04')).toBe(28)
    expect(ageOn('1998-11-05', '2026-11-04')).toBe(27)
    expect(ageOn('1998-11-04', '2026-11-04')).toBe(28)
  })
  it('acepta Date con zona horaria', () => {
    // 2026-11-05T03:00Z es todavía 4 de noviembre en CDMX
    expect(ageOn('1998-11-05', new Date('2026-11-05T03:00:00Z'), 'America/Mexico_City')).toBe(27)
    expect(ageOn('1998-11-05', new Date('2026-11-05T03:00:00Z'), 'UTC')).toBe(28)
  })
  it('rechaza fechas inválidas', () => {
    expect(() => ageOn('1998-02-30', AS_OF)).toThrow(RangeError)
  })
})

describe('bmr / tdee', () => {
  it('Mifflin-St Jeor hombre (referencia)', () => {
    const r = bmr({ sex: 'male', weightKg: 80, heightCm: 175, age: 28 })
    expect(r.formula).toBe('mifflin')
    expect(r.value).toBeCloseTo(1758.75, 5)
    expect(Math.round(tdee(r.value, 'moderate'))).toBe(2726)
  })
  it('Mifflin-St Jeor mujer', () => {
    const r = bmr({ sex: 'female', weightKg: 60, heightCm: 165, age: 30 })
    expect(r.value).toBeCloseTo(600 + 1031.25 - 150 - 161, 5)
  })
  it('Katch-McArdle si hay % de grasa', () => {
    const r = bmr({ sex: 'male', weightKg: 80, heightCm: 175, age: 28, bodyFatPct: 20 })
    expect(r.formula).toBe('katch')
    expect(r.leanMassKg).toBeCloseTo(64, 5)
    expect(r.value).toBeCloseTo(370 + 21.6 * 64, 5) // 1752.4
  })
  it('factores de actividad', () => {
    expect(tdee(1000, 'sedentary')).toBeCloseTo(1200)
    expect(tdee(1000, 'light')).toBeCloseTo(1375)
    expect(tdee(1000, 'active')).toBeCloseTo(1725)
    expect(tdee(1000, 'very_active')).toBeCloseTo(1900)
  })
  it('piso de seguridad', () => {
    expect(safetyFloorKcal('male', 1300)).toBe(1500)
    expect(safetyFloorKcal('female', 1100)).toBe(1200)
    expect(safetyFloorKcal('male', 1758.75)).toBe(1800)
    expect(safetyFloorKcal('female', 1201)).toBe(1250)
  })
  it('IMC', () => {
    expect(bmi(80, 175)).toBeCloseTo(26.12, 2)
  })
})

describe('recommend — caso de referencia', () => {
  it('déficit moderado: 2,200 / 176 / 61 / 236', () => {
    const r = recommend(reference, AS_OF)
    expect(r.bmr).toBe(1759)
    expect(r.tdee).toBe(2726)
    expect(r.bmrFormula).toBe('mifflin')
    expect(r.adjustPct).toBe(-20)
    expect(r.targetKcal).toBe(2200)
    expect(r.proteinG).toBe(176)
    expect(r.fatG).toBe(61)
    expect(r.carbsG).toBe(236)
    expect(r.expectedKgPerWeek).toBe(-0.48)
    expect(r.safetyFloorApplied).toBe(false)
    expect(r.isManualOverride).toBe(false)
    expect(r.warnings).toEqual([])
    expect(r.explanation.length).toBeGreaterThanOrEqual(7)
    expect(r.explanation.join('\n')).toContain('2,726')
  })
  it('recomposición: 2,600 / 160 / 72 / 327 (ignora la intensidad)', () => {
    for (const intensity of ['mild', 'moderate', 'aggressive'] as const) {
      const r = recommend({ ...reference, goal: 'recomp', intensity }, AS_OF)
      expect(r.adjustPct).toBe(-5)
      expect([r.targetKcal, r.proteinG, r.fatG, r.carbsG]).toEqual([2600, 160, 72, 327])
      expect(r.expectedKgPerWeek).toBe(-0.11) // (2600 − 2726)·7 ÷ 7700 = −0.1145
    }
  })
  it('ganancia moderada: 3,000 / 144 / 83 / 418', () => {
    const r = recommend({ ...reference, goal: 'gain' }, AS_OF)
    expect([r.targetKcal, r.proteinG, r.fatG, r.carbsG]).toEqual([3000, 144, 83, 418])
    expect(r.expectedKgPerWeek).toBe(0.25)
  })
  it('intensidades de déficit y ganancia', () => {
    const t = (goal: 'deficit' | 'gain', intensity: 'mild' | 'aggressive') =>
      recommend({ ...reference, goal, intensity }, AS_OF).targetKcal
    expect(t('deficit', 'mild')).toBe(2300) // 2317.2
    expect(t('deficit', 'aggressive')).toBe(2050) // 2044.5
    expect(t('gain', 'mild')).toBe(2850) // 2862.4
    expect(t('gain', 'aggressive')).toBe(3150) // 3134.97
  })
  it('acepta un Date como asOf (fecha local de la zona del perfil)', () => {
    const r = recommend(reference, new Date('2026-11-04T18:00:00Z'))
    expect(r.targetKcal).toBe(2200)
  })
})

describe('recommend — casos límite', () => {
  it('Katch-McArdle cuando hay % de grasa', () => {
    const r = recommend({ ...reference, bodyFatPct: 20 }, AS_OF)
    expect(r.bmrFormula).toBe('katch')
    expect(r.bmr).toBe(1752) // 370 + 21.6·64 = 1752.4
    expect(r.tdee).toBe(2716) // 1752.4 · 1.55 = 2716.22
    expect(r.targetKcal).toBe(2150) // 2172.98 → 2150
    expect(r.explanation[0]).toContain('Katch-McArdle')
  })

  it('piso de seguridad en hombre (1,500)', () => {
    // Mifflin: 10·50 + 6.25·160 − 5·60 + 5 = 1205; ×1.2 = 1446; −25 % = 1084.5 → 1100
    const r = recommend(
      {
        ...reference,
        birthDate: '1966-01-01',
        heightCm: 160,
        weightKg: 50,
        activityLevel: 'sedentary',
        intensity: 'aggressive',
      },
      AS_OF,
    )
    expect(r.bmr).toBe(1205)
    expect(r.targetKcal).toBe(1500)
    expect(r.safetyFloorApplied).toBe(true)
    expect(codes(r)).toContain('SAFETY_FLOOR_APPLIED')
  })

  it('piso de seguridad en mujer (1,200)', () => {
    // 10·45 + 6.25·150 − 5·70 − 161 = 876.5; ×1.2 = 1051.8; −25 % = 788.85 → 800
    const r = recommend(
      {
        ...reference,
        sex: 'female',
        birthDate: '1956-01-01',
        heightCm: 150,
        weightKg: 45,
        activityLevel: 'sedentary',
        intensity: 'aggressive',
      },
      AS_OF,
    )
    expect(r.targetKcal).toBe(1200)
    expect(r.safetyFloorApplied).toBe(true)
    // TDEE 1,052 ≤ piso 1,200 → el déficit no es posible
    expect(codes(r)).toEqual(['SAFETY_FLOOR_APPLIED', 'DEFICIT_NOT_POSSIBLE'])
  })

  it('piso = BMR redondeado hacia arriba cuando supera el mínimo por sexo', () => {
    // Hombre grande sedentario en déficit agresivo:
    // 10·150 + 6.25·200 − 5·30 + 5 = 2605; ×1.2 = 3126; −25 % = 2344.5 → 2350 < ceil50(2605)=2650
    const r = recommend(
      {
        ...reference,
        birthDate: '1996-01-01',
        heightCm: 200,
        weightKg: 150,
        activityLevel: 'sedentary',
        intensity: 'aggressive',
      },
      AS_OF,
    )
    expect(r.bmr).toBe(2605)
    expect(r.targetKcal).toBe(2650)
    expect(r.safetyFloorApplied).toBe(true)
    // piso 2,650 < TDEE 3,126: aún hay déficit
    expect(codes(r)).toEqual(['SAFETY_FLOOR_APPLIED'])
  })

  it('meta manual bajo el piso: no se sube, pero avisa', () => {
    const r = recommend({ ...reference, manualTargetKcal: 1400 }, AS_OF)
    expect(r.isManualOverride).toBe(true)
    expect(r.targetKcal).toBe(1400)
    expect(r.safetyFloorApplied).toBe(false)
    expect(codes(r)).toEqual(['BELOW_SAFETY_FLOOR'])
    // macros sobre la meta manual: grasa 350/9 = 38.9 < 0.6·80 = 48 → 48 g
    expect(r.proteinG).toBe(176)
    expect(r.fatG).toBe(48)
    expect(r.carbsG).toBe(Math.floor((1400 - 704 - 432) / 4)) // 66
  })

  it('DEFICIT_NOT_POSSIBLE solo en déficit con piso ≥ TDEE (no en meta manual)', () => {
    const tiny = {
      ...reference,
      birthDate: '1966-01-01',
      heightCm: 160,
      weightKg: 50,
      activityLevel: 'sedentary' as const,
    }
    const r = recommend(tiny, AS_OF) // TDEE 1,446, meta 1,150 → piso 1,500 ≥ 1,446
    expect(codes(r)).toEqual(['SAFETY_FLOOR_APPLIED', 'DEFICIT_NOT_POSSIBLE'])
    expect(r.warnings[1]?.message).toMatch(/no es posible un déficit/)
    expect(codes(recommend({ ...tiny, manualTargetKcal: 1400 }, AS_OF))).toEqual([
      'BELOW_SAFETY_FLOOR',
    ])
  })

  it('entradas imposibles lanzan RangeError', () => {
    for (const patch of [
      { weightKg: Number.NaN },
      { weightKg: -80 },
      { heightCm: Number.POSITIVE_INFINITY },
      { heightCm: 99 },
      { bodyFatPct: 71 },
      { trainingDays: 1.5 },
      { trainingDays: 8 },
      { manualTargetKcal: 500 },
    ]) {
      expect(() => recommend({ ...reference, ...patch }, AS_OF)).toThrow(RangeError)
    }
    expect(() => recommend(reference, '2025-02-29')).toThrow(RangeError)
    expect(() => recommend(reference, '2025-02-29T12:00:00Z')).toThrow(RangeError)
  })

  it('meta manual sobre el piso: sin avisos', () => {
    const r = recommend({ ...reference, manualTargetKcal: 2000 }, AS_OF)
    expect(r.isManualOverride).toBe(true)
    expect(r.targetKcal).toBe(2000)
    expect(r.warnings).toEqual([])
    expect(r.expectedKgPerWeek).toBe(-0.66)
  })

  it('IMC > 30: proteína sobre el peso equivalente a IMC 25', () => {
    // 175 cm, 110 kg → IMC 35.9; peso ajustado = 25 · 1.75² = 76.5625 kg
    const r = recommend({ ...reference, weightKg: 110 }, AS_OF)
    expect(r.proteinG).toBe(Math.round(2.2 * 76.5625)) // 168
    expect(r.explanation.join('\n')).toContain('IMC 25')
  })

  it('IMC ≤ 30: proteína sobre el peso total', () => {
    // 175 cm, 91.8 kg → IMC 29.98
    const r = recommend({ ...reference, weightKg: 91.8 }, AS_OF)
    expect(r.proteinG).toBe(Math.round(2.2 * 91.8)) // 202
  })

  it('aviso RECOMP_NO_TRAINING', () => {
    const r = recommend({ ...reference, goal: 'recomp', trainingDays: 0 }, AS_OF)
    expect(codes(r)).toEqual(['RECOMP_NO_TRAINING'])
    expect(r.warnings[0]?.message).toMatch(/entrenamiento de fuerza/)
    expect(codes(recommend({ ...reference, goal: 'recomp', trainingDays: 1 }, AS_OF))).toEqual([])
    expect(codes(recommend({ ...reference, trainingDays: 0 }, AS_OF))).toEqual([])
  })

  it('aviso GAIN_HIGH_BODY_FAT (> 25 % H, > 32 % M)', () => {
    expect(codes(recommend({ ...reference, goal: 'gain', bodyFatPct: 26 }, AS_OF))).toContain(
      'GAIN_HIGH_BODY_FAT',
    )
    expect(codes(recommend({ ...reference, goal: 'gain', bodyFatPct: 25 }, AS_OF))).toEqual([])
    const female = { ...reference, sex: 'female' as const, goal: 'gain' as const }
    expect(codes(recommend({ ...female, bodyFatPct: 33 }, AS_OF))).toContain('GAIN_HIGH_BODY_FAT')
    expect(codes(recommend({ ...female, bodyFatPct: 32 }, AS_OF))).toEqual([])
    // Sin % de grasa no se avisa
    expect(codes(recommend({ ...reference, goal: 'gain' }, AS_OF))).toEqual([])
    // Solo en ganancia
    expect(codes(recommend({ ...reference, bodyFatPct: 30 }, AS_OF))).toEqual([])
  })

  it('carbohidratos nunca negativos (CARBS_CLAMPED)', () => {
    // 190 cm, 108 kg (IMC 29.9), meta manual 1,000:
    // proteína 2.2·108 = 238 g (952 kcal); grasa 0.6·108 = 64.8 g (583.2 kcal) → resto < 0
    const r = recommend(
      { ...reference, heightCm: 190, weightKg: 108, manualTargetKcal: 1000 },
      AS_OF,
    )
    expect(r.carbsG).toBe(0)
    expect(r.proteinG).toBe(238)
    expect(r.fatG).toBe(65)
    expect(codes(r)).toEqual(['BELOW_SAFETY_FLOOR', 'CARBS_CLAMPED'])
  })
})

describe('signos en textos (U+2212)', () => {
  const allText = (r: { explanation: string[]; warnings: { message: string }[] }) =>
    [...r.explanation, ...r.warnings.map((w) => w.message)].join('\n')
  it('déficit: "−20 %" y "≈ −0.48 kg/semana", sin guion ASCII', () => {
    const r = recommend(reference, AS_OF)
    const text = allText(r)
    expect(text).toContain('−20 % →')
    expect(text).toContain('≈ −0.48 kg/semana')
    expect(text).not.toMatch(/-\d/)
  })
  it('ganancia: "+" explícito', () => {
    const r = recommend({ ...reference, goal: 'gain' }, AS_OF)
    expect(r.explanation.join('\n')).toMatch(/: \+\d+ % →/)
    expect(r.explanation.join('\n')).toMatch(/≈ \+0\.\d+ kg\/semana/)
  })
  it('cambio 0 sin signo y ningún texto con guion ASCII antes de dígito', () => {
    const zero = recommend({ ...reference, manualTargetKcal: 2726 }, AS_OF)
    expect(zero.explanation.join('\n')).toContain('≈ 0 kg/semana')
    for (const goal of ['deficit', 'recomp', 'gain'] as const) {
      for (const intensity of ['mild', 'moderate', 'aggressive'] as const) {
        const r = recommend(
          { ...reference, goal, intensity, trainingDays: 0, bodyFatPct: 30 },
          AS_OF,
        )
        expect(allText(r)).not.toMatch(/-\d/)
      }
    }
  })
})
