import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  eachDay,
  isValidLocalDate,
  isValidTimeZone,
  toLocalDate,
  toLocalHour,
} from './dates'
import { formatGrams, formatKcal, formatNumber } from './format'
import { ceilToStep, roundTo, roundToStep } from './math'
import { suggestMealType } from './meal'

describe('toLocalDate', () => {
  it('cerca de medianoche respeta la zona', () => {
    // 05:30 UTC del 5 de nov = 23:30 del 4 de nov en CDMX (UTC−6)
    const instant = '2026-11-05T05:30:00Z'
    expect(toLocalDate(instant, 'America/Mexico_City')).toBe('2026-11-04')
    expect(toLocalDate(instant, 'UTC')).toBe('2026-11-05')
    expect(toLocalDate(new Date('2026-11-05T06:00:00Z'), 'America/Mexico_City')).toBe('2026-11-05')
    expect(toLocalDate('2026-11-04T23:59:59-06:00', 'America/Mexico_City')).toBe('2026-11-04')
    expect(toLocalDate('2026-11-04T23:59:59-06:00', 'Asia/Tokyo')).toBe('2026-11-05')
  })
  it('fin de año', () => {
    expect(toLocalDate('2027-01-01T03:00:00Z', 'America/Mexico_City')).toBe('2026-12-31')
  })
  it('errores', () => {
    expect(() => toLocalDate('no es fecha', 'UTC')).toThrow(RangeError)
    expect(() => toLocalDate(new Date(), 'Marte/Olympus')).toThrow(RangeError)
  })
  it('toLocalHour', () => {
    expect(toLocalHour('2026-11-05T05:30:00Z', 'America/Mexico_City')).toBe(23)
    expect(toLocalHour('2026-11-05T06:00:00Z', 'America/Mexico_City')).toBe(0)
  })
})

describe('fechas locales', () => {
  it('isValidLocalDate', () => {
    expect(isValidLocalDate('2026-11-04')).toBe(true)
    expect(isValidLocalDate('2024-02-29')).toBe(true)
    expect(isValidLocalDate('2026-02-29')).toBe(false)
    expect(isValidLocalDate('2026-13-01')).toBe(false)
    expect(isValidLocalDate('2026-11-4')).toBe(false)
    expect(isValidLocalDate('2026-11-04T00:00')).toBe(false)
    expect(isValidLocalDate('')).toBe(false)
  })
  it('addDays / daysBetween / eachDay', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(daysBetween('2026-11-01', '2026-11-15')).toBe(14)
    expect(daysBetween('2026-11-15', '2026-11-01')).toBe(-14)
    // El cambio de horario no afecta (se calcula en UTC)
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31)
    expect(eachDay('2026-11-01', '2026-11-03')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(eachDay('2026-11-03', '2026-11-01')).toEqual([])
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError)
  })
  it('isValidTimeZone', () => {
    expect(isValidTimeZone('America/Mexico_City')).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
    expect(isValidTimeZone('America/Ciudad_Gotica')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
  })
})

describe('suggestMealType', () => {
  it('bordes', () => {
    expect(suggestMealType(4)).toBe('snack')
    expect(suggestMealType(5)).toBe('breakfast')
    expect(suggestMealType(11)).toBe('breakfast')
    expect(suggestMealType(12)).toBe('lunch')
    expect(suggestMealType(17)).toBe('lunch')
    expect(suggestMealType(18)).toBe('dinner')
    expect(suggestMealType(22)).toBe('dinner')
    expect(suggestMealType(23)).toBe('snack')
    expect(suggestMealType(0)).toBe('snack')
    expect(suggestMealType(11.9)).toBe('breakfast')
  })
})

describe('formato es-MX', () => {
  it('kcal y gramos', () => {
    expect(formatKcal(2200)).toBe('2,200 kcal')
    expect(formatKcal(2725.6)).toBe('2,726 kcal')
    expect(formatGrams(176)).toBe('176 g')
    expect(formatGrams(3.44)).toBe('3.4 g')
    expect(formatNumber(-0.478, 2)).toBe('-0.48')
  })
})

describe('math', () => {
  it('redondeos', () => {
    expect(roundTo(1.005, 2)).toBe(1.01)
    expect(roundToStep(2180.8, 50)).toBe(2200)
    expect(roundToStep(2175, 50)).toBe(2200)
    expect(roundToStep(1615, 10)).toBe(1620)
    expect(ceilToStep(1758.75, 50)).toBe(1800)
    expect(ceilToStep(1800, 50)).toBe(1800)
  })
})
