import { describe, expect, it } from 'vitest'
import { GEMINI_RESPONSE_SCHEMA } from './schema'

/** Claves que hacen que Gemini 2.5 responda 400 "too many states for serving". */
const FORBIDDEN = ['minimum', 'maximum', 'minItems', 'maxItems', 'minLength', 'maxLength']

function walk(node: unknown, path: string, found: string[]): void {
  if (Array.isArray(node)) {
    for (const [i, v] of node.entries()) walk(v, `${path}[${i}]`, found)
    return
  }
  if (typeof node !== 'object' || node === null) return
  for (const [k, v] of Object.entries(node)) {
    const here = `${path}.${k}`
    if (FORBIDDEN.includes(k)) found.push(here)
    if (k === 'format' && v !== 'enum') found.push(`${here}=${String(v)}`)
    walk(v, here, found)
  }
}

describe('GEMINI_RESPONSE_SCHEMA', () => {
  it('no lleva límites numéricos ni de longitud (Gemini los rechaza con 400)', () => {
    const found: string[] = []
    walk(GEMINI_RESPONSE_SCHEMA, '$', found)
    expect(found).toEqual([])
  })

  it('el detector sí encuentra claves prohibidas', () => {
    const found: string[] = []
    walk(
      { a: { items: { maxItems: 3 }, b: [{ minimum: 0 }], c: { format: 'date-time' } } },
      '$',
      found,
    )
    expect(found).toHaveLength(3)
  })
})
