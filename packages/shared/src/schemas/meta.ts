import { z } from 'zod'
import { IsoDateTimeSchema, LocalDateSchema } from './common'
import { EntrySchema } from './entry'
import { FavoriteSchema } from './favorite'
import { ProfileSchema } from './profile'
import { WeightSchema } from './weight'

/** `GET /api/health`. */
export const HealthSchema = z.object({
  status: z.literal('ok'),
  app: z.string(),
})
export type Health = z.infer<typeof HealthSchema>

/** Uso diario de análisis con IA (`calls` de `limit` en la fecha local `date`). */
export const UsageSchema = z.object({
  date: LocalDateSchema,
  calls: z.number().int().min(0),
  limit: z.number().int().min(1),
})
export type Usage = z.infer<typeof UsageSchema>

/** Cuerpo de `GET /api/export?format=json`. `from`/`to` en null = sin rango (todo). */
export const ExportJsonSchema = z.object({
  exportedAt: IsoDateTimeSchema,
  from: LocalDateSchema.nullable(),
  to: LocalDateSchema.nullable(),
  profile: ProfileSchema.nullable(),
  entries: z.array(EntrySchema),
  weights: z.array(WeightSchema),
  favorites: z.array(FavoriteSchema),
})
export type ExportJson = z.infer<typeof ExportJsonSchema>
