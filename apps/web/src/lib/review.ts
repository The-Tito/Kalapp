import {
  type AnalysisProposal,
  type Confidence,
  type Entry,
  type EntryInput,
  EntryInputSchema,
  type EntryItemInput,
  type EntryPatch,
  EntryPatchSchema,
  type EntrySource,
  hasEnergyMismatch,
  type MacroTotals,
  type MealType,
  recalcItemFromGrams,
  scaleItems,
  suggestMealType,
  sumTotals,
} from '@kalapp/shared'
import { entryTiming, moveEatenAt } from './dates'

export const PORTION_PRESETS = [
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
] as const

export interface ReviewItem extends EntryItemInput {
  /** Clave local para listas de React; no se envía. */
  key: string
}

/**
 * Estado de Revisar. `baseItems` son los ingredientes a 1× (los originales de la IA más las
 * ediciones); lo que se ve y se guarda es `scaleItems(baseItems, multiplier)`, así cambiar
 * el multiplicador varias veces no acumula redondeos.
 */
export interface ReviewState {
  title: string
  mealType: MealType
  note: string
  multiplier: number
  baseItems: ReviewItem[]
  nextKey: number
  /** Día del registro (YYYY-MM-DD); null = hoy al guardar. */
  localDate: string | null
}

export type ReviewAction =
  | { type: 'setTitle'; title: string }
  | { type: 'setMealType'; mealType: MealType }
  | { type: 'setNote'; note: string }
  | { type: 'setMultiplier'; multiplier: number }
  | { type: 'setLocalDate'; localDate: string | null }
  | { type: 'setItemGrams'; key: string; grams: number }
  | { type: 'setItemName'; key: string; name: string }
  | { type: 'removeItem'; key: string }
  | { type: 'addItem'; item: EntryItemInput }

function withKeys(items: readonly EntryItemInput[]): { items: ReviewItem[]; nextKey: number } {
  return {
    items: items.map((it, i) => ({ ...it, key: `i${i}` })),
    nextKey: items.length,
  }
}

export function initReviewFromProposal(
  proposal: AnalysisProposal,
  localHour: number,
  note: string | null = null,
  localDate: string | null = null,
): ReviewState {
  const { items, nextKey } = withKeys(proposal.items)
  return {
    title: proposal.title,
    mealType: suggestMealType(localHour),
    note: note ?? '',
    multiplier: 1,
    baseItems: items,
    nextKey,
    localDate,
  }
}

export function initReviewFromEntry(entry: Entry): ReviewState {
  const { items, nextKey } = withKeys(entry.items)
  return {
    title: entry.title ?? '',
    mealType: entry.mealType,
    note: entry.note ?? '',
    multiplier: 1,
    baseItems: items,
    nextKey,
    localDate: entry.localDate,
  }
}

/** Ingredientes como se muestran y se guardan (con el multiplicador aplicado y redondeados). */
export function displayItems(state: ReviewState): ReviewItem[] {
  return scaleItems(state.baseItems, state.multiplier)
}

export function reviewTotals(state: ReviewState): MacroTotals {
  return sumTotals(displayItems(state))
}

export function itemsWithEnergyMismatch(state: ReviewState): ReviewItem[] {
  return displayItems(state).filter((it) => hasEnergyMismatch(it))
}

export function reviewReducer(state: ReviewState, action: ReviewAction): ReviewState {
  const m = state.multiplier
  switch (action.type) {
    case 'setTitle':
      return { ...state, title: action.title }
    case 'setMealType':
      return { ...state, mealType: action.mealType }
    case 'setNote':
      return { ...state, note: action.note }
    case 'setMultiplier':
      return { ...state, multiplier: action.multiplier }
    case 'setLocalDate':
      return { ...state, localDate: action.localDate }
    case 'setItemGrams': {
      if (!Number.isFinite(action.grams) || action.grams < 0) return state
      // Los gramos que escribe el usuario son los visibles (con multiplicador).
      return {
        ...state,
        baseItems: state.baseItems.map((it) =>
          it.key === action.key ? recalcItemFromGrams(it, action.grams / m) : it,
        ),
      }
    }
    case 'setItemName':
      return {
        ...state,
        baseItems: state.baseItems.map((it) =>
          it.key === action.key ? { ...it, name: action.name } : it,
        ),
      }
    case 'removeItem':
      return { ...state, baseItems: state.baseItems.filter((it) => it.key !== action.key) }
    case 'addItem': {
      // Lo capturado corresponde a la porción visible: se guarda a 1× sin redondear.
      const it = action.item
      const base: ReviewItem = {
        ...it,
        grams: it.grams / m,
        kcal: it.kcal / m,
        proteinG: it.proteinG / m,
        carbsG: it.carbsG / m,
        fatG: it.fatG / m,
        key: `n${state.nextKey}`,
      }
      return { ...state, baseItems: [...state.baseItems, base], nextKey: state.nextKey + 1 }
    }
  }
}

function stripKeys(items: readonly ReviewItem[]): EntryItemInput[] {
  return items.map(({ key: _key, ...rest }) => rest)
}

const emptyToNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

export interface BuildEntryParams {
  /** Generado una sola vez por propuesta (los reintentos usan el mismo). */
  id: string
  state: ReviewState
  source: EntrySource
  aiModel: string | null
  aiConfidence: Confidence | null
  timezone: string
  now: Date
}

/** Cuerpo de `POST /api/entries`, validado con el esquema compartido. */
export function buildEntryInput(p: BuildEntryParams) {
  const timing = entryTiming(p.now, p.timezone, p.state.localDate)
  const candidate: EntryInput = {
    id: p.id,
    localDate: timing.localDate,
    eatenAt: timing.eatenAt,
    mealType: p.state.mealType,
    source: p.source,
    note: emptyToNull(p.state.note),
    title: emptyToNull(p.state.title),
    items: stripKeys(displayItems(p.state)),
    aiModel: p.aiModel,
    aiConfidence: p.aiConfidence,
  }
  return EntryInputSchema.safeParse(candidate)
}

/**
 * Cuerpo de `PATCH /api/entries/:id` al editar un registro. Si cambió la fecha, también se
 * mueve `eatenAt` a ese día conservando la hora local.
 */
export function buildEntryPatch(
  state: ReviewState,
  original?: { localDate: string; eatenAt: string },
  timezone?: string,
) {
  const candidate: EntryPatch = {
    mealType: state.mealType,
    note: emptyToNull(state.note),
    title: emptyToNull(state.title),
    items: stripKeys(displayItems(state)),
  }
  if (original && timezone && state.localDate && state.localDate !== original.localDate) {
    candidate.localDate = state.localDate
    candidate.eatenAt = moveEatenAt(original.eatenAt, state.localDate, timezone)
  }
  return EntryPatchSchema.safeParse(candidate)
}

/** Primer mensaje de error de validación, en español. */
export function firstIssueMessage(error: { issues: { message: string }[] }): string {
  return error.issues[0]?.message ?? 'Revisa los datos'
}
