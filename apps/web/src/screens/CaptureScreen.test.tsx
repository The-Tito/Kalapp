// @vitest-environment jsdom
import { API_ERROR_MESSAGES, type Favorite } from '@kalapp/shared'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from '../lib/api'
import { queryKeys } from '../lib/queryClient'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import {
  CaptureScreen,
  captureErrorMessage,
  isOfflineFailure,
  targetDateFromParam,
} from './CaptureScreen'

afterEach(cleanup)

describe('Capturar: lógica', () => {
  it('fecha destino: solo días pasados válidos', () => {
    expect(targetDateFromParam('2026-11-01', '2026-11-04')).toBe('2026-11-01')
    expect(targetDateFromParam('2026-11-04', '2026-11-04')).toBeNull()
    expect(targetDateFromParam('2026-12-01', '2026-11-04')).toBeNull()
    expect(targetDateFromParam('2026-02-30', '2026-11-04')).toBeNull()
    expect(targetDateFromParam(null, '2026-11-04')).toBeNull()
  })

  it('ofrece guardar para después solo si es falla de red o no hay conexión', () => {
    expect(isOfflineFailure(new ApiError('NETWORK'), true)).toBe(true)
    expect(isOfflineFailure(new ApiError('INTERNAL', undefined, 500), true)).toBe(false)
    expect(isOfflineFailure(new Error('x'), false)).toBe(true)
  })

  it('mensajes: no es comida (422) y tamaño con formatBytes', () => {
    expect(captureErrorMessage(new ApiError('NOT_FOOD', 'x', 422))).toBe(
      API_ERROR_MESSAGES.NOT_FOOD,
    )
    expect(captureErrorMessage(new ApiError('VALIDATION', 'x', 422))).toBe(
      API_ERROR_MESSAGES.NOT_FOOD,
    )
    expect(captureErrorMessage(new ApiError('PAYLOAD_TOO_LARGE', 'x', 413))).toBe(
      'La foto pesa más de 1 MB. Intenta con otra.',
    )
  })
})

const favorite: Favorite = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Avena con plátano',
  items: [{ name: 'Avena', grams: 40, kcal: 150, proteinG: 5, carbsG: 27, fatG: 3 }],
  mealType: 'breakfast',
  totals: { kcal: 150, proteinG: 5, carbsG: 27, fatG: 3 },
  usesCount: 3,
  createdAt: '2026-11-01T10:00:00Z',
  lastUsedAt: null,
}
const other: Favorite = {
  ...favorite,
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Café americano',
  usesCount: 9,
}

function setup(route: string) {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/favorites') return jsonResponse([favorite, other])
    if (url === '/api/usage') return jsonResponse({ date: '2026-11-04', calls: 1, limit: 50 })
    if (url === '/api/entries') {
      const body = JSON.parse(String(init?.body))
      return jsonResponse({ ...body, totals: favorite.totals, createdAt: '2026-11-04T19:00:00Z' })
    }
    if (url.endsWith('/use')) return jsonResponse({ ...favorite, usesCount: 4 })
    return new Response(null, { status: 204 })
  })
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  renderWithProviders(<CaptureScreen />, {
    api,
    route,
    setup: (qc) => qc.setQueryData(queryKeys.profile, referenceProfile),
    extraRoutes: <Route path="/" element={<p>Pantalla Hoy</p>} />,
  })
  return fetchFn
}

describe('Capturar: favoritos', () => {
  it('lista más usados primero, busca y un toque registra en el día elegido', async () => {
    const fetchFn = setup('/capturar?modo=favorites&fecha=2026-11-01')
    expect(screen.getByText(/Registrando en/)).toBeTruthy()
    const buttons = await screen.findAllByRole('button', { name: /^Registrar / })
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Registrar Café americano, 150 kcal',
      'Registrar Avena con plátano, 150 kcal',
    ])
    fireEvent.change(screen.getByLabelText('Buscar favorito'), { target: { value: 'platano' } })
    const [avena] = screen.getAllByRole('button', { name: /^Registrar / })
    expect(screen.getAllByRole('button', { name: /^Registrar / })).toHaveLength(1)
    fireEvent.click(avena as HTMLElement)
    fireEvent.click(avena as HTMLElement) // doble toque: una sola comida
    expect(await screen.findByText('Pantalla Hoy')).toBeTruthy()
    const posts = fetchFn.mock.calls.filter((c) => c[0] === '/api/entries')
    expect(posts).toHaveLength(1)
    const body = JSON.parse(String(posts[0]?.[1]?.body))
    expect(body).toMatchObject({
      source: 'favorite',
      localDate: '2026-11-01',
      mealType: 'breakfast',
      title: 'Avena con plátano',
    })
    await vi.waitFor(() =>
      expect(fetchFn.mock.calls.map((c) => c[0])).toContain(`/api/favorites/${favorite.id}/use`),
    )
  })

  it('borrar pide confirmación', async () => {
    const fetchFn = setup('/capturar?modo=favorites')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Borrar favorito Avena con plátano' }),
    )
    expect(fetchFn.mock.calls.some((c) => c[1]?.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, borrar' }))
    await vi.waitFor(() =>
      expect(
        fetchFn.mock.calls.some(
          (c) => c[0] === `/api/favorites/${favorite.id}` && c[1]?.method === 'DELETE',
        ),
      ).toBe(true),
    )
  })
})
