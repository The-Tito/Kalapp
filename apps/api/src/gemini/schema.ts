import { CONFIDENCES } from '@kalapp/shared'

/**
 * `responseSchema` de Gemini (subconjunto OpenAPI 3.0) equivalente a `AiAnalysisOutputSchema`
 * de @kalapp/shared, más `not_food` para detectar fotos/textos sin comida. La validación real
 * se hace después con Zod; este esquema solo guía al modelo.
 *
 * SIN `minimum`/`maximum`/`minItems`/`maxItems` ni `format` (salvo `enum`): Gemini 2.5 rechaza
 * con HTTP 400 los esquemas con esos límites ("too many states for serving"). Los rangos y el
 * máximo de ingredientes los aplica `parseGeminiResponse` + Zod. Lo vigila schema.test.ts.
 */
const number = { type: 'NUMBER' } as const

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
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          grams: number,
          kcal: number,
          proteinG: number,
          carbsG: number,
          fatG: number,
          confidence: { type: 'STRING', format: 'enum', enum: [...CONFIDENCES] },
        },
        required: ['name', 'grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'confidence'],
        propertyOrdering: ['name', 'grams', 'kcal', 'proteinG', 'carbsG', 'fatG', 'confidence'],
      },
    },
    assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
    questions: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'STRING', format: 'enum', enum: [...CONFIDENCES] },
  },
  required: ['not_food', 'title', 'items', 'assumptions', 'questions', 'confidence'],
  propertyOrdering: ['not_food', 'title', 'items', 'assumptions', 'questions', 'confidence'],
} as const
