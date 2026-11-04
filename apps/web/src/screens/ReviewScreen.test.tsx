// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { Route } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../lib/api'
import type { Draft } from '../lib/draft'
import { OfflineQueue } from '../lib/offlineQueue'
import { queryKeys } from '../lib/queryClient'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile, tacosProposal } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { ReviewScreen } from './ReviewScreen'

// Fecha fija (solo Date: los timers reales siguen para waitFor/findBy).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-04T19:05:00Z')) // 13:05 en CDMX
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

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
    draft: opts.draft ?? draft,
    queue: opts.queue ?? null,
    setup: (qc) => qc.setQueryData(queryKeys.profile, referenceProfile),
    extraRoutes: <Route path="/" element={<p>Pantalla Hoy</p>} />,
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
    expect(body.localDate).toBe('2026-11-04')
    expect(body.eatenAt).toBe('2026-11-04T13:05:00-06:00')
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

  it('Guardar queda en una barra fija (no hay barra de navegación en Revisar)', () => {
    setup(async () => jsonResponse({}))
    expect(screen.queryByRole('navigation')).toBeNull()
    const save = screen.getByRole('button', { name: 'Guardar' })
    expect(save.closest('.fixed')?.className).toContain('pb-safe')
  })

  it('⭐ también como favorito: POST /favorites tras guardar la comida, con el nombre editado', async () => {
    const { fetchFn } = setup(async (url, init) => {
      const body = JSON.parse(String(init.body))
      if (url === '/api/entries')
        return jsonResponse({
          ...body,
          totals: { kcal: 345, proteinG: 21.9, carbsG: 30.6, fatG: 15.7 },
          createdAt: '2026-11-04T19:00:00Z',
        })
      return jsonResponse(
        {
          ...body,
          totals: { kcal: 345, proteinG: 21.9, carbsG: 30.6, fatG: 15.7 },
          usesCount: 0,
          createdAt: '2026-11-04T19:00:00Z',
          lastUsedAt: null,
        },
        201,
      )
    })
    fireEvent.click(screen.getByLabelText('⭐ Guardar también como favorito'))
    const name = screen.getByLabelText('Nombre del favorito') as HTMLInputElement
    expect(name.value).toBe('Tacos al pastor')
    fireEvent.change(name, { target: { value: 'Tacos de la esquina' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Pantalla Hoy')).toBeTruthy()
    const urls = fetchFn.mock.calls.map((c) => c[0])
    expect(urls).toEqual(['/api/entries', '/api/favorites'])
    const fav = JSON.parse(
      String((fetchFn.mock.calls[1] as unknown as [string, RequestInit])[1].body),
    )
    expect(fav).toMatchObject({ name: 'Tacos de la esquina', mealType: 'lunch' })
    expect(fav.items[0]).not.toHaveProperty('confidence')
  })

  it('sin red: la comida va a la cola con el mismo id y vuelve a Hoy', async () => {
    const queue = new OfflineQueue({
      name: 'review-test',
      indexedDB: new IDBFactory(),
      IDBKeyRange,
    })
    setup(
      async () => {
        throw new TypeError('offline')
      },
      { queue },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Pantalla Hoy')).toBeTruthy()
    const items = await queue.list()
    expect(items).toHaveLength(1)
    expect(items[0]?.kind === 'entry' && items[0].input.id).toBe(ID)
    queue.db.close()
  })

  it('en edición permite cambiar el día (sin fechas futuras) y manda PATCH con localDate', async () => {
    const entry = {
      id: ID,
      localDate: '2026-11-04',
      eatenAt: '2026-11-04T08:15:00-06:00',
      mealType: 'breakfast' as const,
      source: 'photo' as const,
      note: null,
      title: 'Tacos al pastor',
      items: tacosProposal.items,
      aiModel: 'gemini-test',
      aiConfidence: 'medium' as const,
      totals: tacosProposal.totals,
      createdAt: '2026-11-04T14:15:00Z',
    }
    const { fetchFn } = setup(
      async (_url, init) => jsonResponse({ ...entry, ...JSON.parse(String(init.body)) }),
      { draft: { kind: 'edit', entry } },
    )
    const date = screen.getByLabelText('Día') as HTMLInputElement
    expect(date.max).toBe('2026-11-04')
    fireEvent.change(date, { target: { value: '2999-01-01' } })
    expect(date.value).toBe('2026-11-04') // se ignora la fecha futura
    fireEvent.change(date, { target: { value: '2026-11-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(1))
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/entries/${ID}`)
    expect(init.method).toBe('PATCH')
    expect(JSON.parse(String(init.body))).toMatchObject({
      localDate: '2026-11-02',
      eatenAt: '2026-11-02T08:15:00-06:00',
    })
  })
})
