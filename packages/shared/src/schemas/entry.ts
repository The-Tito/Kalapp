import { z } from 'zod'
import { LIMITS } from '../constants'
import { itemNutritionShape, itemsArray } from './analysis'
import {
  ConfidenceSchema,
  EntrySourceSchema,
  IsoDateTimeSchema,
  LocalDateSchema,
  MacroTotalsSchema,
  MealTypeSchema,
  NameSchema,
  NoteSchema,
  UuidSchema,
} from './common'

/** Ingrediente de un registro (la confianza es opcional; la BD no la guarda en v0.1). */
export const EntryItemInputSchema = z.object({
  ...itemNutritionShape,
  confidence: ConfidenceSchema.optional(),
})
export type EntryItemInput = z.infer<typeof EntryItemInputSchema>

/** Alias con el nombre del PLAN (§7). */
export const EntryItemSchema = EntryItemInputSchema
export type EntryItem = EntryItemInput

export const entryInputShape = {
  /** crypto.randomUUID() en el cliente; POST es idempotente por id. */
  id: UuidSchema,
  localDate: LocalDateSchema,
  eatenAt: IsoDateTimeSchema,
  mealType: MealTypeSchema,
  source: EntrySourceSchema,
  note: NoteSchema.nullable().optional(),
  title: NameSchema.nullable().optional(),
  items: itemsArray(EntryItemInputSchema),
  aiModel: z.string().trim().min(1).max(LIMITS.nameMaxLength).nullable(),
  aiConfidence: ConfidenceSchema.nullable(),
}

/** `POST /api/entries`. */
export const EntryInputSchema = z.object(entryInputShape)
export type EntryInput = z.infer<typeof EntryInputSchema>

/** Registro guardado (`GET /api/entries?date=`). Totales calculados por el servidor. */
export const EntrySchema = z.object({
  ...entryInputShape,
  totals: MacroTotalsSchema,
  createdAt: IsoDateTimeSchema,
})
export type Entry = z.infer<typeof EntrySchema>

/** `PATCH /api/entries/:id`: al menos un campo. Si cambian `items`, el servidor recalcula totales. */
export const EntryPatchSchema = z
  .object({
    mealType: MealTypeSchema,
    note: NoteSchema.nullable(),
    title: NameSchema.nullable(),
    items: itemsArray(EntryItemInputSchema),
    localDate: LocalDateSchema,
    eatenAt: IsoDateTimeSchema,
  })
  .partial()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    error: 'No hay cambios que guardar',
  })
export type EntryPatch = z.infer<typeof EntryPatchSchema>

/** `GET /api/entries?date=YYYY-MM-DD`. */
export const EntriesQuerySchema = z.object({ date: LocalDateSchema })
export type EntriesQuery = z.infer<typeof EntriesQuerySchema>
