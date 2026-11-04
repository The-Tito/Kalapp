// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { Route } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../lib/api'
import type { Draft } from '../lib/draft'
import { OfflineQueue, QUEUE_LIMIT } from '../lib/offlineQueue'
import { queryKeys } from '../lib/queryClient'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile, tacosProposal } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { ReviewScreen } from './ReviewScreen'

afterEach(cleanup)

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const XSS = '<img src=x onerror=alert(1)>'

const draftOf = (over: Partial<Extract<Draft, { kind: 'new' }>> = {}): Draft => ({
  kind: 'new',
  id: ID,
  proposal: tacosProposal,
  source: 'photo',
  note: null,
  photo: null,
  localHour: 13,
  ...over,
})

function setup(
  fetchImpl: (url: string, init: RequestInit) => Promise<Response>,
  opts: { draft?: Draft; queue?: OfflineQueue } = {},
) {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const fetchFn = vi.fn(fetchImpl)
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  const utils = renderWithProviders(<ReviewScreen />, {
    api,
    route: '/revisar',
    draft: opts.draft ?? draftOf(),
    queue: opts.queue ?? null,
    setup: (qc) => qc.setQueryData(queryKeys.profile, referenceProfile),
    extraRoutes: <Route path="/" element={<p>Pantalla Hoy</p>} />,
  })
  return { ...utils, fetchFn }
}

const total = () => screen.getByTestId('review-total-kcal').textContent

let n = 0
const newQueue = () =>
  new OfflineQueue({ name: `review-adv-${n++}`, indexedDB: new IDBFactory(), IDBKeyRange })

describe('Revisar (adversarial)', () => {
  it('BUG: escribir "0" y luego "60" en gramos deja la tortilla en 0 kcal (pasa al teclear "0.5")', () => {
    setup(async () => jsonResponse({}))
    const grams = screen.getByLabelText('Gramos de Tortilla de maíz')
    fireEvent.change(grams, { target: { value: '0' } })
    fireEvent.change(grams, { target: { value: '60' } })
    // Esperado: vuelve a 345 kcal (60 g de tortilla = 130 kcal).
    expect(total()).toBe('345 kcal')
  })

  it('gramos "abc", "-5", "1e9" marcan error y no cambian el total', () => {
    setup(async () => jsonResponse({}))
    const grams = screen.getByLabelText('Gramos de Carne al pastor')
    for (const v of ['abc', '-5', '1e9']) {
      fireEvent.change(grams, { target: { value: v } })
      expect(grams.getAttribute('aria-invalid')).toBe('true')
      expect(total()).toBe('345 kcal')
    }
  })

  it('quitar todos los ingredientes deshabilita Guardar y no llama a la red', () => {
    const { fetchFn } = setup(async () => jsonResponse({}))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Tortilla de maíz' }))
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Carne al pastor' }))
    const save = screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    fireEvent.click(save)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('nombre de ingrediente vacío muestra error y no guarda', async () => {
    const { fetchFn } = setup(async () => jsonResponse({}))
    fireEvent.change(screen.getByDisplayValue('Tortilla de maíz'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/no puede estar vacío/)).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('XSS: título, preguntas, supuestos e ingredientes con HTML se muestran como texto', () => {
    setup(async () => jsonResponse({}), {
      draft: draftOf({
        proposal: {
          ...tacosProposal,
          title: XSS,
          questions: [XSS],
          assumptions: [`${XSS} supuesto`],
          items: tacosProposal.items.map((it) => ({ ...it, name: `${it.name} ${XSS}` })),
        },
        note: XSS,
      }),
    })
    expect(document.querySelector('img[src="x"]')).toBeNull()
    expect(screen.getByText(XSS)).toBeTruthy()
    expect(screen.getAllByDisplayValue(XSS)).toHaveLength(2) // título y nota
  })

  it('sin red y con la cola llena: muestra el error de cola llena y no sale de Revisar', async () => {
    const queue = newQueue()
    for (let i = 0; i < QUEUE_LIMIT; i++) {
      await queue.enqueueEntry({
        id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        localDate: '2026-11-03',
        eatenAt: '2026-11-03T13:00:00-06:00',
        mealType: 'lunch',
        source: 'photo',
        note: null,
        title: null,
        items: [{ name: 'X', grams: 1, kcal: 1, proteinG: 0, carbsG: 0, fatG: 0 }],
        aiModel: null,
        aiConfidence: null,
      })
    }
    setup(
      async () => {
        throw new TypeError('offline')
      },
      { queue },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText(/cola sin internet está llena/)).toBeTruthy()
    expect(screen.queryByText('Pantalla Hoy')).toBeNull()
    expect(await queue.list()).toHaveLength(QUEUE_LIMIT)
    queue.db.close()
  })

  it('doble toque sin red encola una sola vez', async () => {
    const queue = newQueue()
    setup(
      async () => {
        throw new TypeError('offline')
      },
      { queue },
    )
    const save = screen.getByRole('button', { name: 'Guardar' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(await screen.findByText('Pantalla Hoy')).toBeTruthy()
    expect(await queue.list()).toHaveLength(1)
    queue.db.close()
  })

  it('401 al guardar no deja el botón bloqueado ni encola', async () => {
    const queue = newQueue()
    setup(
      async () => jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Token inválido' } }, 401),
      {
        queue,
      },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Token inválido')).toBeTruthy()
    expect(await queue.list()).toHaveLength(0)
    queue.db.close()
  })

  it('31 ingredientes: el botón Agregar se deshabilita con 30', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      name: `Ingrediente ${i}`,
      grams: 10,
      kcal: 10,
      proteinG: 0,
      carbsG: 2.5,
      fatG: 0,
      confidence: 'high' as const,
    }))
    setup(async () => jsonResponse({}), {
      draft: draftOf({ proposal: { ...tacosProposal, items } }),
    })
    const add = screen.getByRole('button', { name: '+ Agregar ingrediente' }) as HTMLButtonElement
    expect(add.disabled).toBe(true)
  })
})
