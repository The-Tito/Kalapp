// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tacosProposal } from '../test/fixtures'
import { DRAFT_KEY, type Draft, loadDraft, saveDraft } from './draft'
import { newId } from './uuid'

afterEach(() => sessionStorage.clear())

describe('respaldo de la propuesta en sessionStorage', () => {
  const draft: Draft = {
    kind: 'new',
    id: newId(),
    proposal: tacosProposal,
    source: 'photo',
    note: 'Frito',
    photo: 'data:image/jpeg;base64,AAAA',
    localHour: 13,
  }

  it('guarda y recupera (sobrevive a una recarga de iOS)', () => {
    saveDraft(draft)
    expect(loadDraft()).toEqual(draft)
    saveDraft(null)
    expect(loadDraft()).toBeNull()
  })

  it('ignora datos corruptos', () => {
    sessionStorage.setItem(DRAFT_KEY, '{no es json')
    expect(loadDraft()).toBeNull()
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ kind: 'new', id: 'x' }))
    expect(loadDraft()).toBeNull()
  })

  it('newId produce UUID v4', () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('newId funciona sin crypto.randomUUID (HTTP en la red local)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: real.getRandomValues.bind(real) })
    try {
      expect(newId()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      )
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
