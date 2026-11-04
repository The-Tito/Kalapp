import { z } from 'zod'
import { GramsSchema, NameSchema } from './common'

const per100 = z.number().min(0)

/** Producto empacado (Open Food Facts) normalizado por el Worker (v1.0). */
export const BarcodeProductSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6,14}$/, { error: 'Código de barras inválido' }),
  name: NameSchema,
  brand: z.string().trim().max(120).nullable().optional(),
  per100g: z.object({
    kcal: per100.max(900),
    proteinG: per100.max(100),
    carbsG: per100.max(100),
    fatG: per100.max(100),
  }),
  servingGrams: GramsSchema.positive().nullable().optional(),
})
export type BarcodeProduct = z.infer<typeof BarcodeProductSchema>
