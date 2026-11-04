import { describe, expect, it } from 'vitest'
import { hasVisibleText, NameSchema, ShortTextSchema } from './common'
import { EntryPatchSchema } from './entry'

const INVISIBLE = ['​', '‌', '‍', '⁠', '﻿', '­', '‎']

describe('hasVisibleText', () => {
  it('detecta solo caracteres de formato y espacios', () => {
    expect(hasVisibleText('')).toBe(false)
    expect(hasVisibleText(' \t\n')).toBe(false)
    for (const c of INVISIBLE) expect(hasVisibleText(c), c).toBe(false)
    expect(hasVisibleText(` ${INVISIBLE.join(' ')} `)).toBe(false)
    expect(hasVisibleText('a')).toBe(true)
    expect(hasVisibleText('​pan')).toBe(true)
  })
})

describe('NameSchema', () => {
  it('rechaza nombres invisibles con un solo mensaje en español', () => {
    for (const bad of ['', '   ', ...INVISIBLE, ' ​ ', '​‍⁠﻿']) {
      const r = NameSchema.safeParse(bad)
      expect(r.success, JSON.stringify(bad)).toBe(false)
      if (!r.success) {
        expect(r.error.issues).toHaveLength(1)
        expect(r.error.issues[0]?.message).toBe('El nombre no puede estar vacío')
      }
    }
  })
  it('conserva el texto original si hay algo visible', () => {
    expect(NameSchema.parse('pan​dulce')).toBe('pan​dulce')
    expect(NameSchema.parse('  Tacos  ')).toBe('Tacos')
    expect(NameSchema.parse('​Tacos')).toBe('​Tacos')
  })
  it('aplica al título de un registro', () => {
    expect(EntryPatchSchema.safeParse({ title: '​' }).success).toBe(false)
    expect(EntryPatchSchema.safeParse({ title: 'Comida' }).success).toBe(true)
  })
})

describe('ShortTextSchema', () => {
  it('rechaza texto invisible y conserva su mensaje', () => {
    const r = ShortTextSchema.safeParse('​﻿')
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.message).toBe('El texto no puede estar vacío')
    expect(ShortTextSchema.parse('¿Con queso?')).toBe('¿Con queso?')
  })
})
