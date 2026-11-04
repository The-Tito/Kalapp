import { describe, expect, it } from 'vitest'
import { combineNote } from './note'

describe('combineNote', () => {
  it('une chips y nota libre', () => {
    expect(combineNote(['Frito', 'Con crema'], ' sin tortilla ')).toBe(
      'Frito, Con crema. sin tortilla',
    )
    expect(combineNote([], 'sin tortilla')).toBe('sin tortilla')
    expect(combineNote(['Con queso'], '')).toBe('Con queso')
    expect(combineNote([], '  ')).toBe('')
  })
  it('recorta a 500 caracteres', () => {
    expect(combineNote(['Frito'], 'x'.repeat(600))).toHaveLength(500)
  })
})
