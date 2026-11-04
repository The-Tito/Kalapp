import { z } from 'zod'
import { itemsArray } from './analysis'
import {
  IsoDateTimeSchema,
  MacroTotalsSchema,
  MealTypeSchema,
  NameSchema,
  UuidSchema,
} from './common'
import { EntryItemInputSchema } from './entry'

const favoriteInputShape = {
  id: UuidSchema,
  name: NameSchema,
  items: itemsArray(EntryItemInputSchema),
  mealType: MealTypeSchema.nullable().optional(),
}

/** `POST /api/favorites` (v0.2). */
export const FavoriteInputSchema = z.object(favoriteInputShape)
export type FavoriteInput = z.infer<typeof FavoriteInputSchema>

export const FavoriteSchema = z.object({
  ...favoriteInputShape,
  totals: MacroTotalsSchema,
  usesCount: z.number().int().min(0),
  createdAt: IsoDateTimeSchema,
  lastUsedAt: IsoDateTimeSchema.nullable(),
})
export type Favorite = z.infer<typeof FavoriteSchema>
