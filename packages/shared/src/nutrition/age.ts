import { DEFAULT_TIMEZONE } from '../constants'
import { isValidLocalDate, resolveLocalDate } from '../utils/dates'

/**
 * Edad cumplida en años en la fecha `asOf`.
 * `asOf` puede ser YYYY-MM-DD, un ISO datetime o un `Date`; los instantes se convierten
 * a fecha local con `timezone` (America/Mexico_City por defecto). Fechas inexistentes lanzan
 * `RangeError`.
 */
export function ageOn(
  birthDate: string,
  asOf: Date | string,
  timezone: string = DEFAULT_TIMEZONE,
): number {
  if (!isValidLocalDate(birthDate))
    throw new RangeError(`Fecha de nacimiento inválida: ${birthDate}`)
  const asOfDate = resolveLocalDate(asOf, timezone)
  const [by, bm, bd] = birthDate.split('-').map(Number) as [number, number, number]
  const [ay, am, ad] = asOfDate.split('-').map(Number) as [number, number, number]
  let age = ay - by
  if (am < bm || (am === bm && ad < bd)) age--
  return age
}
