import { describe, expect, it } from 'vitest'
import { tacosProposal } from '../test/fixtures'
import {
  buildEntryInput,
  buildEntryPatch,
  displayItems,
  initReviewFromProposal,
  type ReviewState,
  reviewReducer,
  reviewTotals,
} from './review'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const reduce = (s: ReviewState, ...actions: Parameters<typeof reviewReducer>[1][]) =>
  actions.reduce(reviewReducer, s)

describe('estado de Revisar', () => {
  const base = initReviewFromProposal(tacosProposal, 13)

  it('sugiere el tipo de comida por la hora local', () => {
    expect(base.mealType).toBe('lunch')
    expect(initReviewFromProposal(tacosProposal, 8).mealType).toBe('breakfast')
    expect(initReviewFromProposal(tacosProposal, 20).mealType).toBe('dinner')
    expect(initReviewFromProposal(tacosProposal, 2).mealType).toBe('snack')
  })

  it('el multiplicador se aplica sobre los originales sin acumular redondeos', () => {
    const s = reduce(
      base,
      { type: 'setMultiplier', multiplier: 1.5 },
      { type: 'setMultiplier', multiplier: 0.5 },
      { type: 'setMultiplier', multiplier: 1.5 },
      { type: 'setMultiplier', multiplier: 1 },
    )
    expect(displayItems(s).map(({ key: _k, ...it }) => it)).toEqual(tacosProposal.items)
    const doubled = reduce(base, { type: 'setMultiplier', multiplier: 2 })
    expect(reviewTotals(doubled).kcal).toBe(690)
    expect(displayItems(doubled)[0]?.grams).toBe(120)
  })

  it('cambiar gramos recalcula kcal y macros proporcionales', () => {
    const key = base.baseItems[1]?.key ?? ''
    const s = reduce(base, { type: 'setItemGrams', key, grams: 180 })
    const item = displayItems(s)[1]
    expect(item).toMatchObject({ grams: 180, kcal: 430, proteinG: 37, carbsG: 6.2, fatG: 28.6 })
  })

  it('los gramos escritos con multiplicador son los visibles', () => {
    const key = base.baseItems[0]?.key ?? ''
    const s = reduce(
      base,
      { type: 'setMultiplier', multiplier: 2 },
      { type: 'setItemGrams', key, grams: 60 },
    )
    expect(displayItems(s)[0]).toMatchObject({ grams: 60, kcal: 130 })
    const back = reduce(s, { type: 'setMultiplier', multiplier: 1 })
    expect(displayItems(back)[0]).toMatchObject({ grams: 30, kcal: 65 })
  })

  it('ignora gramos inválidos', () => {
    const key = base.baseItems[0]?.key ?? ''
    expect(reduce(base, { type: 'setItemGrams', key, grams: Number.NaN })).toBe(base)
    expect(reduce(base, { type: 'setItemGrams', key, grams: -5 })).toBe(base)
  })

  it('totales en vivo al quitar y agregar ingredientes', () => {
    expect(reviewTotals(base)).toEqual({ kcal: 345, proteinG: 21.9, carbsG: 30.6, fatG: 15.7 })
    const key = base.baseItems[0]?.key ?? ''
    const removed = reduce(base, { type: 'removeItem', key })
    expect(reviewTotals(removed).kcal).toBe(215)
    const added = reduce(removed, {
      type: 'addItem',
      item: { name: 'Coca-Cola 355 ml', grams: 355, kcal: 150, proteinG: 0, carbsG: 39, fatG: 0 },
    })
    expect(reviewTotals(added)).toEqual({ kcal: 365, proteinG: 18.5, carbsG: 42.1, fatG: 14.3 })
    const keys = added.baseItems.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('un ingrediente agregado con multiplicador conserva lo capturado', () => {
    const s = reduce(
      base,
      { type: 'setMultiplier', multiplier: 1.5 },
      {
        type: 'addItem',
        item: { name: 'Salsa', grams: 30, kcal: 10, proteinG: 0.3, carbsG: 2, fatG: 0.1 },
      },
    )
    expect(displayItems(s)[2]).toMatchObject({ grams: 30, kcal: 10, proteinG: 0.3, carbsG: 2 })
  })
})

describe('buildEntryInput', () => {
  const state = initReviewFromProposal(tacosProposal, 23, 'Frito')
  // 2026-11-05T05:30Z = 4 de noviembre, 23:30 en CDMX (UTC−6)
  const now = new Date('2026-11-05T05:30:00.000Z')
  const params = {
    id: ID,
    state,
    source: 'photo' as const,
    aiModel: tacosProposal.model,
    aiConfidence: tacosProposal.confidence,
    timezone: 'America/Mexico_City',
    now,
  }

  it('usa el id dado, localDate con la zona del perfil y eatenAt con offset', () => {
    const r = buildEntryInput(params)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data).toMatchObject({
      id: ID,
      localDate: '2026-11-04',
      eatenAt: '2026-11-04T23:30:00-06:00',
      mealType: 'snack',
      source: 'photo',
      note: 'Frito',
      title: 'Tacos al pastor',
      aiModel: 'gemini-test',
      aiConfidence: 'medium',
    })
    expect(r.data.items).toHaveLength(2)
    expect(r.data.items[0]).not.toHaveProperty('key')
  })

  it('reintentar produce el mismo cuerpo (mismo id)', () => {
    const a = buildEntryInput(params)
    const b = buildEntryInput(params)
    expect(a.data?.id).toBe(b.data?.id)
    expect(a.data).toEqual(b.data)
  })

  it('en otra zona cambia la fecha local', () => {
    const r = buildEntryInput({ ...params, timezone: 'UTC' })
    expect(r.data?.localDate).toBe('2026-11-05')
    expect(r.data?.eatenAt).toBe('2026-11-05T05:30:00+00:00')
  })

  it('sin ingredientes no es válido', () => {
    const empty = state.baseItems.reduce(
      (s, it) => reviewReducer(s, { type: 'removeItem', key: it.key }),
      state,
    )
    const r = buildEntryInput({ ...params, state: empty })
    expect(r.success).toBe(false)
    expect(r.error?.issues[0]?.message).toBe('Agrega al menos un ingrediente')
  })

  it('título y nota vacíos se envían como null', () => {
    const s = reduce(state, { type: 'setTitle', title: '  ' }, { type: 'setNote', note: '' })
    const r = buildEntryInput({ ...params, state: s })
    expect(r.data).toMatchObject({ title: null, note: null })
  })

  it('el PATCH incluye ítems escalados', () => {
    const s = reduce(state, { type: 'setMultiplier', multiplier: 2 })
    const r = buildEntryPatch(s)
    expect(r.success).toBe(true)
    expect(r.data?.items?.[0]?.grams).toBe(120)
  })

  it('con un día elegido: localDate de ese día y eatenAt a la hora actual', () => {
    const s = reduce(state, { type: 'setLocalDate', localDate: '2026-11-01' })
    const r = buildEntryInput({ ...params, state: s })
    expect(r.data?.localDate).toBe('2026-11-01')
    expect(r.data?.eatenAt).toBe('2026-11-01T23:30:00-06:00')
  })

  it('el PATCH mueve fecha y eatenAt solo si cambió el día', () => {
    const original = { localDate: '2026-11-04', eatenAt: '2026-11-04T08:15:00-06:00' }
    const same = reduce(state, { type: 'setLocalDate', localDate: '2026-11-04' })
    expect(buildEntryPatch(same, original, 'America/Mexico_City').data).not.toHaveProperty(
      'localDate',
    )
    const moved = reduce(state, { type: 'setLocalDate', localDate: '2026-11-03' })
    const r = buildEntryPatch(moved, original, 'America/Mexico_City')
    expect(r.data).toMatchObject({ localDate: '2026-11-03', eatenAt: '2026-11-03T08:15:00-06:00' })
  })
})
