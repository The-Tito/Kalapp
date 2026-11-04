// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../lib/api'
import type { Draft } from '../lib/draft'
import { queryKeys } from '../lib/queryClient'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile, tacosProposal } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { ReviewScreen } from './ReviewScreen'

afterEach(cleanup)

const ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const draft: Draft = {
  kind: 'new',
  id: ID,
  proposal: tacosProposal,
  source: 'photo',
  note: 'Frito',
  photo: null,
  localHour: 13,
}

function setup(fetchImpl: (url: string, init: RequestInit) => Promise<Response>) {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const fetchFn = vi.fn(fetchImpl)
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  const utils = renderWithProviders(<ReviewScreen />, {
    api,
    route: '/revisar',
    draft,
    setup: (qc) => qc.setQueryData(queryKeys.profile, referenceProfile),
  })
  return { ...utils, fetchFn }
}

const total = () => screen.getByTestId('review-total-kcal').textContent

describe('Revisar', () => {
  it('muestra ingredientes, preguntas, supuestos y tipo sugerido', () => {
    setup(async () => jsonResponse({}))
    expect(screen.getByDisplayValue('Tortilla de maíz')).toBeTruthy()
    expect(screen.getByDisplayValue('Carne al pastor')).toBeTruthy()
    expect(screen.getByText('¿Llevaban piña?')).toBeTruthy()
    expect(screen.getByText('Dos tacos con tortilla de maíz de 30 g')).toBeTruthy()
    expect((screen.getByLabelText('Comida') as HTMLInputElement).checked).toBe(true)
    expect(total()).toBe('345 kcal')
  })

  it('el multiplicador y los gramos actualizan los totales en vivo', () => {
    setup(async () => jsonResponse({}))
    fireEvent.click(screen.getByLabelText('Porción 2×'))
    expect(total()).toBe('690 kcal')
    fireEvent.click(screen.getByLabelText('Porción 1×'))
    expect(total()).toBe('345 kcal')
    fireEvent.change(screen.getByLabelText('Gramos de Carne al pastor'), {
      target: { value: '180' },
    })
    expect(total()).toBe('560 kcal')
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Tortilla de maíz' }))
    expect(total()).toBe('430 kcal')
  })

  it('Guardar envía POST con el id de la propuesta y no duplica con doble toque', async () => {
    let resolve: ((r: Response) => void) | undefined
    const { fetchFn } = setup(
      (_url, init) =>
        new Promise<Response>((r) => {
          resolve = (res) => r(res)
          void init
        }),
    )
    const button = screen.getByRole('button', { name: 'Guardar' })
    fireEvent.click(button)
    fireEvent.click(button)
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/entries')
    const body = JSON.parse(String(init.body))
    expect(body).toMatchObject({
      id: ID,
      mealType: 'lunch',
      source: 'photo',
      note: 'Frito',
      aiModel: 'gemini-test',
      aiConfidence: 'medium',
    })
    expect(body.eatenAt).toMatch(/[+-]\d{2}:\d{2}$/)
    resolve?.(
      jsonResponse({
        ...body,
        totals: { kcal: 345, proteinG: 21.9, carbsG: 30.6, fatG: 15.7 },
        createdAt: '2026-11-04T19:00:00Z',
      }),
    )
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('si falla, reintentar usa el mismo id', async () => {
    const { fetchFn } = setup(async () => {
      throw new TypeError('offline')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await screen.findByText('Sin conexión. Revisa tu internet.')
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2))
    const ids = fetchFn.mock.calls.map(
      (c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)).id,
    )
    expect(ids).toEqual([ID, ID])
  })
})
