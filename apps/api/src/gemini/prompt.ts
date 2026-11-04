/**
 * Prompt de análisis de comida. Cualquier cambio de texto sube PROMPT_VERSION y se documenta
 * en context/PROMPTS.md (lo actualiza context-keeper).
 */
export const PROMPT_VERSION = '1'

export interface AnalyzePromptInput {
  /** 'photo' = viene una imagen adjunta; 'text' = descripción escrita por el usuario. */
  mode: 'photo' | 'text'
  /** Descripción (solo en modo texto). */
  text?: string | undefined
  /** Nota libre del usuario (ej. "frito en manteca", "sin tortillas"). */
  note?: string | undefined
  /** Hora local 0–23 en la que se comió (ayuda a inferir desayuno/comida/cena). */
  localHour?: number | undefined
}

const BASE_INSTRUCTIONS = `Eres un nutriólogo experto en comida mexicana y en estimar porciones a partir de fotos o descripciones. Tu trabajo es estimar las calorías y macronutrientes de UNA comida.

Reglas:
1. Responde solo con el JSON del esquema indicado, en español de México.
2. Contexto: el usuario vive en México. Considera platillos, ingredientes y porciones típicos de México (tortillas de maíz o harina, frijoles, arroz rojo, guisados, mole, chilaquiles, tacos, tortas, quesadillas, antojitos, pan dulce, aguas frescas, refrescos) y la forma común de prepararlos (con aceite, manteca o crema cuando sea lo habitual).
3. Desglosa en ingredientes ("items"), uno por componente reconocible, con su peso estimado en gramos ("grams") como se comió (cocido, servido). Estima "kcal", "proteinG", "carbsG" y "fatG" de cada ingrediente para ESOS gramos.
4. Incluye como ingredientes aparte los aceites, mantecas, cremas, quesos, salsas, aderezos y bebidas que probablemente acompañen la comida aunque no se vean claramente; si su presencia es dudosa, menciónalos en "assumptions" en lugar de agregarlos.
5. Las kcal de cada ingrediente deben ser coherentes con sus macros (aprox. 4 kcal por gramo de proteína y de carbohidratos y 9 por gramo de grasa).
6. "assumptions": lista corta de supuestos que hiciste (tamaño de porción, tipo de tortilla, cantidad de aceite, etc.).
7. "questions": preguntas breves solo cuando una respuesta cambiaría mucho el resultado; por ejemplo, si una bebida es regular o light/sin azúcar, si algo es frito o asado, o cuántas piezas hay. Máximo 3. Si no hay ambigüedad, deja la lista vacía.
8. Confianza honesta: "confidence" de cada ingrediente y general en "high", "medium" o "low". Usa "low" si la porción o el ingrediente son difíciles de identificar. No inventes precisión.
9. "title": nombre corto y natural del platillo (ej. "Tacos al pastor con piña").
10. Si NO hay comida ni bebida (ej. una persona, un paisaje, un documento) o el texto no describe algo comestible, responde "not_food": true, "title": "No se detectó comida", "items": [], "confidence": "low". En cualquier otro caso "not_food" es false y "items" tiene al menos un ingrediente.`

/** Construye el texto del prompt (determinista: misma entrada → mismo texto). */
export function buildAnalyzePrompt(input: AnalyzePromptInput): string {
  const parts: string[] = [BASE_INSTRUCTIONS, '']
  if (input.mode === 'photo') {
    parts.push(
      'Analiza la comida de la foto adjunta. Usa objetos de referencia visibles (plato, cubiertos, mano, tortilla) para estimar el tamaño.',
    )
  } else {
    parts.push(
      'Analiza esta descripción escrita por el usuario. Si no da cantidades, supón una porción típica en México y dilo en "assumptions".',
    )
    parts.push(`Descripción: """${(input.text ?? '').trim()}"""`)
  }
  const note = input.note?.trim()
  if (note) {
    parts.push(
      `Nota del usuario (tómala en cuenta; tiene prioridad sobre lo que supongas): """${note}"""`,
    )
  }
  if (input.localHour !== undefined) {
    parts.push(`Hora local en la que se comió: ${String(input.localHour).padStart(2, '0')}:00.`)
  }
  return parts.join('\n')
}
