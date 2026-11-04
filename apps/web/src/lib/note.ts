import { LIMITS } from '@kalapp/shared'

export const QUICK_CHIPS = [
  'Frito',
  'Con aceite',
  'Con crema',
  'Con queso',
  'Porción grande',
  'Media porción',
] as const

/** Une los chips elegidos y la nota libre: "Frito, Con crema. sin tortilla". Máx. 500. */
export function combineNote(chips: readonly string[], note: string): string {
  const free = note.trim()
  const chipText = chips.join(', ')
  const joined = chipText && free ? `${chipText}. ${free}` : chipText || free
  return joined.slice(0, LIMITS.noteMaxLength)
}
