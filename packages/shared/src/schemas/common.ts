import { z } from 'zod'
import {
  ACTIVITY_LEVELS,
  BMR_FORMULAS,
  CONFIDENCES,
  DEFAULT_TIMEZONE,
  ENTRY_SOURCES,
  EXPORT_FORMATS,
  GOALS,
  INTENSITIES,
  LIMITS,
  MEAL_TYPES,
  SEXES,
} from '../constants'
import { isValidLocalDate, isValidTimeZone } from '../utils/dates'

// Enums ----------------------------------------------------------------------
export const SexSchema = z.enum(SEXES)
export const ActivityLevelSchema = z.enum(ACTIVITY_LEVELS)
export const GoalSchema = z.enum(GOALS)
export const IntensitySchema = z.enum(INTENSITIES)
export const MealTypeSchema = z.enum(MEAL_TYPES)
export const EntrySourceSchema = z.enum(ENTRY_SOURCES)
export const ConfidenceSchema = z.enum(CONFIDENCES)
export const BmrFormulaSchema = z.enum(BMR_FORMULAS)
export const ExportFormatSchema = z.enum(EXPORT_FORMATS)

export type Sex = z.infer<typeof SexSchema>
export type ActivityLevel = z.infer<typeof ActivityLevelSchema>
export type Goal = z.infer<typeof GoalSchema>
export type Intensity = z.infer<typeof IntensitySchema>
export type MealType = z.infer<typeof MealTypeSchema>
export type EntrySource = z.infer<typeof EntrySourceSchema>
export type Confidence = z.infer<typeof ConfidenceSchema>
export type BmrFormula = z.infer<typeof BmrFormulaSchema>
export type ExportFormat = z.infer<typeof ExportFormatSchema>

// Primitivos -----------------------------------------------------------------
/** Fecha local YYYY-MM-DD válida en calendario. */
export const LocalDateSchema = z
  .string()
  .trim()
  .refine(isValidLocalDate, { error: 'Fecha inválida; usa el formato AAAA-MM-DD', abort: true })

/** Zona horaria IANA comprobada con Intl. */
export const TimeZoneSchema = z
  .string()
  .trim()
  .refine(isValidTimeZone, { error: 'Zona horaria inválida', abort: true })

export const TimeZoneWithDefaultSchema = TimeZoneSchema.default(DEFAULT_TIMEZONE)

/** Fecha y hora ISO 8601 con zona (`Z` u offset, ej. 2026-11-04T13:05:00-06:00). */
export const IsoDateTimeSchema = z.iso.datetime({
  offset: true,
  error: 'Fecha y hora inválida (ISO 8601 con zona)',
})

export const UuidSchema = z.uuid({ error: 'Identificador inválido (UUID)' })

/**
 * `true` si queda algo visible tras quitar caracteres de formato (`\p{Cf}`: U+200B–U+200D,
 * U+2060, U+FEFF…) y espacios; `trim()` no quita los primeros.
 */
export function hasVisibleText(value: string): boolean {
  return value.replace(/[\p{Cf}\s]/gu, '').length > 0
}

/** Nombre recortado, no vacío (ni solo caracteres invisibles), ≤ 120. Conserva el texto original. */
export const NameSchema = z
  .string()
  .trim()
  .min(1, { error: 'El nombre no puede estar vacío', abort: true })
  .refine(hasVisibleText, { error: 'El nombre no puede estar vacío' })
  .max(LIMITS.nameMaxLength, { error: `Máximo ${LIMITS.nameMaxLength} caracteres` })

/** Nota recortada ≤ 500 (puede quedar vacía). */
export const NoteSchema = z
  .string()
  .trim()
  .max(LIMITS.noteMaxLength, { error: `Máximo ${LIMITS.noteMaxLength} caracteres` })

/** Texto corto no vacío para supuestos y preguntas de la IA. */
export const ShortTextSchema = z
  .string()
  .trim()
  .min(1, { error: 'El texto no puede estar vacío', abort: true })
  .refine(hasVisibleText, { error: 'El texto no puede estar vacío' })
  .max(LIMITS.noteMaxLength, { error: `Máximo ${LIMITS.noteMaxLength} caracteres` })

const rangeNumber = (min: number, max: number, label: string) =>
  z
    .number({ error: `${label}: debe ser un número` })
    .min(min, { error: `${label}: mínimo ${min}` })
    .max(max, { error: `${label}: máximo ${max}` })

export const GramsSchema = rangeNumber(LIMITS.itemGrams.min, LIMITS.itemGrams.max, 'Gramos')
export const ItemKcalSchema = rangeNumber(LIMITS.itemKcal.min, LIMITS.itemKcal.max, 'Calorías')
export const MacroGramsSchema = rangeNumber(
  LIMITS.itemMacroG.min,
  LIMITS.itemMacroG.max,
  'Macronutriente',
)

/** Totales de kcal y macros (no negativos; sin tope porque suman varios ítems). */
export const MacroTotalsSchema = z.object({
  kcal: z.number().min(0),
  proteinG: z.number().min(0),
  carbsG: z.number().min(0),
  fatG: z.number().min(0),
})
export type MacroTotals = z.infer<typeof MacroTotalsSchema>

export { rangeNumber }
