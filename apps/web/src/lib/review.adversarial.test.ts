import type { Entry } from '@kalapp/shared'
import { afterEach, describe, expect, it } from 'vitest'
import { memoryStorage, tacosProposal } from '../test/fixtures'
import { DRAFT_KEY, loadDraft, saveDraft } from './draft'
import {
  buildEntryInput,
  buildEntryPatch,
  displayItems,
  initReviewFromEntry,
  initReviewFromProposal,
  type ReviewState,
  reviewReducer,
  reviewTotals,
} from './review'

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const TZ = 'America/Mexico_City'
const NOW = new Date('2026-11-04T19:05:00Z') // 13:05 en CDMX

const base = () => initReviewFromProposal(tacosProposal, 13)
const build = (state: ReviewState) =>
  buildEntryInput({
    id: ID,
    state,
    source: 'photo',
    aiModel: 'gemini-test',
    aiConfidence: 'medium',
    timezone: TZ,
    now: NOW,
  })

describe('Revisar: reducer (adversarial)', () => {
  it('gramos negativos, NaN, Infinity se ignoran', () => {
    const s = base()
    for (const g of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(reviewReducer(s, { type: 'setItemGrams', key: 'i0', grams: g })).toBe(s)
    }
  })

  it('gramos 1e9 no se pueden guardar', () => {
    const s = reviewReducer(base(), { type: 'setItemGrams', key: 'i0', grams: 1e9 })
    expect(build(s).success).toBe(false)
  })

  it('BUG: poner 0 g y luego volver a 60 g pierde las kcal y macros para siempre', () => {
    let s = base()
    s = reviewReducer(s, { type: 'setItemGrams', key: 'i0', grams: 0 })
    s = reviewReducer(s, { type: 'setItemGrams', key: 'i0', grams: 60 })
    const tortilla = displayItems(s)[0]
    expect(tortilla?.grams).toBe(60)
    // Esperado: se restauran las 130 kcal originales (la tortilla vuelve a 60 g).
    expect(tortilla?.kcal).toBe(130)
  })

  it('quitar todos los ingredientes impide guardar', () => {
    let s = base()
    for (const it of s.baseItems) s = reviewReducer(s, { type: 'removeItem', key: it.key })
    expect(displayItems(s)).toHaveLength(0)
    expect(build(s).success).toBe(false)
    expect(buildEntryPatch(s).success).toBe(false)
  })

  it('½× repetido no acumula redondeo (siempre se escala desde la base)', () => {
    let s = base()
    for (let i = 0; i < 50; i++) {
      s = reviewReducer(s, { type: 'setMultiplier', multiplier: 0.5 })
      s = reviewReducer(s, { type: 'setMultiplier', multiplier: 2 })
    }
    s = reviewReducer(s, { type: 'setMultiplier', multiplier: 1 })
    expect(reviewTotals(s).kcal).toBe(345)
  })

  it('editar gramos a ½× varias veces y volver a 1× no deriva', () => {
    let s = reviewReducer(base(), { type: 'setMultiplier', multiplier: 0.5 })
    for (let i = 0; i < 20; i++) {
      s = reviewReducer(s, { type: 'setItemGrams', key: 'i1', grams: 45 })
    }
    s = reviewReducer(s, { type: 'setMultiplier', multiplier: 1 })
    const carne = displayItems(s)[1]
    expect(carne?.grams).toBe(90)
    expect(carne?.kcal).toBe(215)
  })

  it('30 ingredientes se guardan; el 31 no', () => {
    let s = base()
    s = { ...s, baseItems: [] }
    const item = { name: 'Arroz', grams: 10, kcal: 13, proteinG: 0.3, carbsG: 2.8, fatG: 0 }
    for (let i = 0; i < 30; i++) s = reviewReducer(s, { type: 'addItem', item })
    expect(build(s).success).toBe(true)
    s = reviewReducer(s, { type: 'addItem', item })
    expect(displayItems(s)).toHaveLength(31)
    expect(build(s).success).toBe(false)
  })

  it('claves únicas al agregar después de quitar', () => {
    let s = base()
    const item = { name: 'X', grams: 1, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }
    s = reviewReducer(s, { type: 'addItem', item })
    s = reviewReducer(s, { type: 'removeItem', key: 'i0' })
    s = reviewReducer(s, { type: 'addItem', item })
    const keys = s.baseItems.map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('nombre de ingrediente vacío / solo espacios / 10 000 chars no se puede guardar', () => {
    for (const name of ['', '    ', 'a'.repeat(10_000)]) {
      const s = reviewReducer(base(), { type: 'setItemName', key: 'i0', name })
      expect(build(s).success).toBe(false)
    }
  })

  it('título vacío se guarda como null; título de 10 000 chars se rechaza', () => {
    const empty = build(reviewReducer(base(), { type: 'setTitle', title: '   ' }))
    expect(empty.success && empty.data.title).toBeNull()
    expect(
      build(reviewReducer(base(), { type: 'setTitle', title: 'x'.repeat(10_000) })).success,
    ).toBe(false)
  })

  it('BUG: nombre de ingrediente invisible (solo U+200B) se acepta', () => {
    const s = reviewReducer(base(), { type: 'setItemName', key: 'i0', name: '​​' })
    expect(build(s).success).toBe(false)
  })

  it('XSS: un nombre con HTML viaja como texto literal', () => {
    const evil = '<img src=x onerror=alert(1)>'
    const s = reviewReducer(base(), { type: 'setItemName', key: 'i0', name: evil })
    const r = build(s)
    expect(r.success && r.data.items[0]?.name).toBe(evil)
  })

  it('editar una comida y cambiar la fecha mueve eatenAt al mismo reloj local', () => {
    const entry: Entry = {
      id: ID,
      localDate: '2026-11-04',
      eatenAt: '2026-11-04T13:05:00-06:00',
      mealType: 'lunch',
      source: 'photo',
      note: null,
      title: 'Tacos',
      items: tacosProposal.items,
      aiModel: 'gemini-test',
      aiConfidence: 'medium',
      totals: tacosProposal.totals,
      createdAt: '2026-11-04T19:05:00Z',
    }
    let s = initReviewFromEntry(entry)
    s = reviewReducer(s, { type: 'setLocalDate', localDate: '2026-11-01' })
    const p = buildEntryPatch(s, entry, TZ)
    expect(p.success).toBe(true)
    if (p.success) {
      expect(p.data.localDate).toBe('2026-11-01')
      expect(p.data.eatenAt).toBe('2026-11-01T13:05:00-06:00')
    }
  })

  it('BUG: el reducer/patch aceptan una fecha futura (solo la UI la bloquea)', () => {
    const entry = {
      localDate: '2026-11-04',
      eatenAt: '2026-11-04T13:05:00-06:00',
    }
    let s = initReviewFromProposal(tacosProposal, 13)
    s = reviewReducer(s, { type: 'setLocalDate', localDate: '2999-01-01' })
    expect(buildEntryPatch(s, entry, TZ).success).toBe(false)
    expect(build(s).success).toBe(false)
  })
})

describe('borrador en sessionStorage (adversarial)', () => {
  const original = globalThis.sessionStorage
  afterEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', { value: original, configurable: true })
  })
  const withStorage = (s: Storage) =>
    Object.defineProperty(globalThis, 'sessionStorage', { value: s, configurable: true })

  it.each([
    ['JSON inválido', '{"kind":"new",'],
    ['null literal', 'null'],
    ['número', '42'],
    ['esquema viejo (sin id)', JSON.stringify({ kind: 'new', proposal: tacosProposal })],
    ['kind desconocido', JSON.stringify({ kind: 'legacy', entry: {} })],
    ['edit sin entry', JSON.stringify({ kind: 'edit' })],
    [
      'proposal con items vacíos',
      JSON.stringify({
        kind: 'new',
        id: ID,
        proposal: { ...tacosProposal, items: [] },
        source: 'photo',
        note: null,
        photo: null,
        localHour: 13,
      }),
    ],
  ])('borrador corrupto (%s) → null, sin lanzar', (_l, raw) => {
    const s = memoryStorage()
    s.setItem(DRAFT_KEY, raw)
    withStorage(s)
    expect(() => loadDraft()).not.toThrow()
    expect(loadDraft()).toBeNull()
  })

  it('getItem que lanza → null', () => {
    withStorage({
      getItem: () => {
        throw new Error('denied')
      },
    } as unknown as Storage)
    expect(loadDraft()).toBeNull()
  })

  it('cuota llena: reintenta sin la miniatura', () => {
    const s = memoryStorage()
    const setItem = s.setItem.bind(s)
    s.setItem = (k: string, v: string) => {
      if (v.length > 2000) throw new DOMException('quota', 'QuotaExceededError')
      setItem(k, v)
    }
    withStorage(s)
    saveDraft({
      kind: 'new',
      id: ID,
      proposal: tacosProposal,
      source: 'photo',
      note: null,
      photo: `data:image/jpeg;base64,${'A'.repeat(5000)}`,
      localHour: 13,
    })
    const d = loadDraft()
    expect(d?.kind).toBe('new')
    expect(d?.kind === 'new' && d.photo).toBeNull()
  })
})
