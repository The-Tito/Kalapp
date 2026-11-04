import { CONFIDENCES, LIMITS } from '@kalapp/shared'

/**
 * `responseSchema` de Gemini (subconjunto OpenAPI 3.0) equivalente a `AiAnalysisOutputSchema`
 * de @kalapp/shared, más `not_food` para detectar fotos/textos sin comida. La validación real
 * se hace después con Zod; este esquema solo guía al modelo.
 */
const number = (min: number, max: number) => ({ type: 'NUMBER', minimum: min, maximum: max })

export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    not_food: {
      type: 'BOOLEAN',
      description: 'true solo si la foto o el texto no contienen comida ni bebida',
    },
    title: { type: 'STRING', description: 'Nombre corto del platillo' },
    items: {
      type: 'ARRAY',
      maxItems: LIMITS.itemsPerEntry.max,
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: number(LIMITS.itemGrams.min, LIMITS.itemGrams.max),
          kcal: number(LIMITS.itemKcal.min, LIMITS.itemKcal.max),
          proteinG: number(LIMITS.itemMacroG.min, LIMITS.itemMacroG.max),
          carbsG: number(LIMITS.itemMacroG.min, LIMITS.itemMacroG.max),
          fatG: number(LIMITS.itemMacroG.min, LIMITS.itemMacroG.max),
          confidence: { type: 'STRING', format: 'enum', enum: [...CONFIDENCES] },
        },
        required: ['name', 'grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'confidence'],
        propertyOrdering: ['name', 'grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'confidence'],
      },
    },
    assumptions: { type: 'ARRAY', maxItems: LIMITS.listMaxItems, items: { type: 'STRING' } },
    questions: { type: 'ARRAY', maxItems: LIMITS.listMaxItems, items: { type: 'STRING' } },
    confidence: { type: 'STRING', format: 'enum', enum: [...CONFIDENCES] },
  },
  required: ['not_food', 'title', 'items', 'assumptions', 'questions', 'confidence'],
  propertyOrdering: ['not_food', 'title', 'items', 'assumptions', 'questions', 'confidence'],
} as const
