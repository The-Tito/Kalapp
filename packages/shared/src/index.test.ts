import { describe, expect, it } from 'vitest'
import * as shared from './index'

describe('@kalapp/shared', () => {
  it('exporta el nombre de la app', () => {
    expect(shared.APP_NAME).toBe('Kalapp')
  })
  it('reexporta el API pública', () => {
    for (const name of [
      'ProfileInputSchema',
      'ProfileSchema',
      'RecommendationSchema',
      'AnalysisProposalSchema',
      'EntryInputSchema',
      'EntrySchema',
      'EntryItemSchema',
      'FavoriteSchema',
      'WeightSchema',
      'ApiErrorSchema',
      'recommend',
      'bmr',
      'tdee',
      'adaptiveTdee',
      'scaleItems',
      'toLocalDate',
      'suggestMealType',
      'MEAL_TYPE_LABELS',
      'ACTIVITY_FACTORS',
    ]) {
      expect(shared).toHaveProperty(name)
    }
  })
  it('constantes copiadas del KG', () => {
    expect(Object.values(shared.ACTIVITY_FACTORS).map((a) => a.factor)).toEqual([
      1.2, 1.375, 1.55, 1.725, 1.9,
    ])
    expect(shared.getAdjustPct('deficit', 'mild')).toBe(-15)
    expect(shared.getAdjustPct('deficit', 'aggressive')).toBe(-25)
    expect(shared.getAdjustPct('gain', 'mild')).toBe(5)
    expect(shared.getAdjustPct('gain', 'aggressive')).toBe(15)
    expect(shared.getAdjustPct('recomp', 'aggressive')).toBe(-5)
    expect(shared.getIntensityLabel('gain', 'mild')).toBe('Limpia')
    expect(shared.GOAL_CONFIG.recomp.proteinGPerKg).toBe(2.0)
  })
})
