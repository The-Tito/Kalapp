import type { MealTypeValue } from '../constants'

/** Tipo de comida sugerido por hora local: 5–11 desayuno, 12–17 comida, 18–22 cena, resto colación. */
export function suggestMealType(hour: number): MealTypeValue {
  const h = ((Math.floor(hour) % 24) + 24) % 24
  if (h >= 5 && h <= 11) return 'breakfast'
  if (h >= 12 && h <= 17) return 'lunch'
  if (h >= 18 && h <= 22) return 'dinner'
  return 'snack'
}
