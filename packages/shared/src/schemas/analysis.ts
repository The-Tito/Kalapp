import { z } from 'zod'
import { LIMITS } from '../constants'
import {
  ConfidenceSchema,
  GramsSchema,
  ItemKcalSchema,
  MacroGramsSchema,
  MacroTotalsSchema,
  NameSchema,
  NoteSchema,
  ShortTextSchema,
} from './common'

export const itemNutritionShape = {
  name: NameSchema,
  grams: GramsSchema,
  kcal: ItemKcalSchema,
  proteinG: MacroGramsSchema,
  carbsG: MacroGramsSchema,
  fatG: MacroGramsSchema,
}

/** Ingrediente propuesto por la IA. */
export const AnalysisItemSchema = z.object({
  ...itemNutritionShape,
  confidence: ConfidenceSchema,
})
export type AnalysisItem = z.infer<typeof AnalysisItemSchema>

const itemsArray = <T extends z.ZodType>(item: T) =>
  z
    .array(item)
    .min(LIMITS.itemsPerEntry.min, { error: 'Agrega al menos un ingrediente' })
    .max(LIMITS.itemsPerEntry.max, {
      error: `Máximo ${LIMITS.itemsPerEntry.max} ingredientes por comida`,
    })

export { itemsArray }

const textList = z.array(ShortTextSchema).max(LIMITS.listMaxItems)

/**
 * Lo que devuelve el modelo (JSON forzado con responseSchema), antes de que el Worker
 * agregue totales, `energyMismatch` y `model`. Ver `toAnalysisProposal`.
 */
export const AiAnalysisOutputSchema = z.object({
  title: NameSchema,
  items: itemsArray(AnalysisItemSchema),
  assumptions: textList.default([]),
  questions: textList.default([]),
  confidence: ConfidenceSchema,
})
export type AiAnalysisOutput = z.infer<typeof AiAnalysisOutputSchema>

/** Respuesta de `POST /api/analyze` (no se guarda). */
export const AnalysisProposalSchema = z.object({
  title: NameSchema,
  items: itemsArray(AnalysisItemSchema),
  assumptions: textList,
  questions: textList,
  totals: MacroTotalsSchema,
  /** `true` si algún ítem difiere > 15 % de 4/4/9. */
  energyMismatch: z.boolean(),
  model: z.string().min(1),
  confidence: ConfidenceSchema,
})
export type AnalysisProposal = z.infer<typeof AnalysisProposalSchema>

/** `POST /api/analyze` con JSON (registro por texto, v0.2). */
export const AnalyzeTextRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, { error: 'Describe lo que comiste' })
    .max(LIMITS.analyzeTextMaxLength, {
      error: `Máximo ${LIMITS.analyzeTextMaxLength} caracteres`,
    }),
  note: NoteSchema.optional(),
  localHour: z.number().int().min(0).max(23).optional(),
})
export type AnalyzeTextRequest = z.infer<typeof AnalyzeTextRequestSchema>

/**
 * Campos de texto del multipart de foto (`image` es el archivo y se valida aparte:
 * tipo en ALLOWED_IMAGE_TYPES y tamaño ≤ MAX_IMAGE_BYTES). `localHour` llega como texto.
 */
export const AnalyzePhotoFieldsSchema = z.object({
  note: NoteSchema.optional(),
  /** "" o solo espacios = ausente; texto no numérico = error. */
  localHour: z.preprocess((v) => {
    if (typeof v !== 'string') return v
    const s = v.trim()
    return s === '' ? undefined : Number(s)
  }, z.number({ error: 'Hora local inválida' }).int().min(0).max(23).optional()),
})
export type AnalyzePhotoFields = z.infer<typeof AnalyzePhotoFieldsSchema>
