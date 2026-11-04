import {
  type AnalysisProposal,
  AnalysisProposalSchema,
  type Profile,
  ProfileInputSchema,
  ProfileSchema,
  recommend,
} from '@kalapp/shared'

/** Ejemplo ficticio ex:reference-male (NO son datos del usuario). */
export const referenceInput = ProfileInputSchema.parse({
  sex: 'male',
  birthDate: '1998-06-15',
  heightCm: 175,
  weightKg: 80,
  activityLevel: 'moderate',
  trainingDays: 3,
  goal: 'deficit',
  intensity: 'moderate',
  timezone: 'America/Mexico_City',
})

export const referenceProfile: Profile = ProfileSchema.parse({
  ...referenceInput,
  ...recommend(referenceInput, '2026-11-04'),
  updatedAt: '2026-11-04T12:00:00Z',
})

export const tacosProposal: AnalysisProposal = AnalysisProposalSchema.parse({
  title: 'Tacos al pastor',
  items: [
    {
      name: 'Tortilla de maíz',
      grams: 60,
      kcal: 130,
      proteinG: 3.4,
      carbsG: 27.5,
      fatG: 1.4,
      confidence: 'high',
    },
    {
      name: 'Carne al pastor',
      grams: 90,
      kcal: 215,
      proteinG: 18.5,
      carbsG: 3.1,
      fatG: 14.3,
      confidence: 'medium',
    },
  ],
  assumptions: ['Dos tacos con tortilla de maíz de 30 g'],
  questions: ['¿Llevaban piña?'],
  totals: { kcal: 345, proteinG: 21.9, carbsG: 30.6, fatG: 15.7 },
  energyMismatch: false,
  model: 'gemini-test',
  confidence: 'medium',
})

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    key: (i) => [...map.keys()][i] ?? null,
    removeItem: (k) => {
      map.delete(k)
    },
    setItem: (k, v) => {
      map.set(k, String(v))
    },
  }
}
