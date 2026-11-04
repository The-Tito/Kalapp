import { describe, expect, it } from 'vitest'
import { formatBytes, formatSignedNumber, formatSignedPct, MINUS_SIGN } from './format'

describe('formatSignedNumber', () => {
  it('usa "+" y "−" (U+2212)', () => {
    expect(MINUS_SIGN).toBe('−')
    expect(formatSignedNumber(-20)).toBe('−20')
    expect(formatSignedNumber(-20)).not.toContain('-')
    expect(formatSignedNumber(15)).toBe('+15')
    expect(formatSignedNumber(1500)).toBe('+1,500')
    expect(formatSignedNumber(-0.25, 2)).toBe('−0.25')
    expect(formatSignedNumber(0.456, 1)).toBe('+0.5')
  })
  it('cero sin signo (incluye -0 y valores que redondean a 0)', () => {
    expect(formatSignedNumber(0)).toBe('0')
    expect(formatSignedNumber(-0)).toBe('0')
    expect(formatSignedNumber(-0.001, 1)).toBe('0')
  })
})

describe('formatSignedPct', () => {
  it('formatea porcentaje con signo', () => {
    expect(formatSignedPct(-20)).toBe('−20 %')
    expect(formatSignedPct(10)).toBe('+10 %')
    expect(formatSignedPct(-12.5)).toBe('−12.5 %')
    expect(formatSignedPct(0)).toBe('0 %')
  })
})

describe('formatBytes', () => {
  it('base 1024, es-MX', () => {
    expect(formatBytes(1_048_576)).toBe('1 MB')
    expect(formatBytes(524_288)).toBe('512 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.5 GB')
    expect(formatBytes(1024 ** 4)).toBe('1,024 GB')
  })
})
