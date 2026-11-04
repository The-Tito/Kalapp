// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { createApiClient } from './lib/api'
import { ApiProvider } from './lib/apiContext'
import { type Draft, DraftProvider } from './lib/draft'
import { tokenStore } from './lib/token'
import { jsonResponse, referenceProfile, tacosProposal } from './test/fixtures'
import { mockResizeObserver } from './test/resizeObserver'

beforeAll(() => mockResizeObserver())

afterEach(() => {
  cleanup()
  tokenStore.clear()
})

function renderApp(
  route: string,
  fetchImpl: (url: string) => Promise<Response>,
  draft: Draft | null = null,
) {
  const fetchFn = vi.fn(fetchImpl)
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ApiProvider client={api}>
        <DraftProvider initialDraft={draft}>
          <MemoryRouter initialEntries={[route]}>
            <AppRoutes />
          </MemoryRouter>
        </DraftProvider>
      </ApiProvider>
    </QueryClientProvider>,
  )
  return fetchFn
}

describe('guardias de la app', () => {
  it('sin token muestra la pantalla Token', async () => {
    const fetchFn = renderApp('/', async () => jsonResponse({}))
    expect(await screen.findByLabelText('Token de acceso')).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('con token pero sin perfil (404) va al onboarding', async () => {
    tokenStore.set('secreto')
    renderApp('/', async () =>
      jsonResponse({ error: { code: 'NOT_FOUND', message: 'Sin perfil' } }, 404),
    )
    expect(await screen.findByText('Paso 1 de 4')).toBeTruthy()
  })

  it('un 401 borra el token y regresa a Token', async () => {
    tokenStore.set('malo')
    renderApp('/ajustes', async () =>
      jsonResponse({ error: { code: 'UNAUTHORIZED', message: 'Token inválido' } }, 401),
    )
    expect(await screen.findByLabelText('Token de acceso')).toBeTruthy()
    expect(tokenStore.get()).toBeNull()
  })

  it('con perfil muestra Hoy con la meta', async () => {
    tokenStore.set('secreto')
    renderApp('/', async (url) => {
      if (url === '/api/profile') return jsonResponse(referenceProfile)
      if (url.startsWith('/api/entries')) return jsonResponse([])
      return jsonResponse({ date: '2026-11-04', calls: 2, limit: 50 })
    })
    expect(await screen.findByRole('heading', { name: 'Hoy' })).toBeTruthy()
    expect(await screen.findByText('Aún no registras comidas hoy.')).toBeTruthy()
    expect(await screen.findByText('Análisis de hoy: 2 de 50')).toBeTruthy()
  })

  const appFetch = async (url: string) => {
    if (url === '/api/profile') return jsonResponse(referenceProfile)
    if (url.startsWith('/api/entries')) return jsonResponse([])
    if (url.startsWith('/api/summary')) {
      const u = new URL(url, 'http://x')
      return jsonResponse({
        from: u.searchParams.get('from'),
        to: u.searchParams.get('to'),
        days: [],
        loggedDays: 0,
        averages: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      })
    }
    return jsonResponse({ date: '2026-11-04', calls: 2, limit: 50 })
  }

  it('barra inferior: Hoy · Historial · 📷 · Peso · Ajustes', async () => {
    tokenStore.set('secreto')
    renderApp('/', appFetch)
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' })
    const labels = [...nav.querySelectorAll('a')].map(
      (a) =>
        a.getAttribute('aria-label') ??
        a.textContent?.replace(/\p{Extended_Pictographic}|\uFE0F/gu, '').trim(),
    )
    expect(labels).toEqual(['Hoy', 'Historial', 'Registrar comida', 'Peso', 'Ajustes'])
  })

  it('Revisar oculta la barra inferior', async () => {
    tokenStore.set('secreto')
    renderApp('/revisar', appFetch, {
      kind: 'new',
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      proposal: tacosProposal,
      source: 'photo',
      note: null,
      photo: null,
      localHour: 13,
    })
    expect(await screen.findByRole('button', { name: 'Guardar' })).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Navegación principal' })).toBeNull()
  })

  it('Historial se carga perezosamente', async () => {
    tokenStore.set('secreto')
    renderApp('/historial', appFetch)
    expect(await screen.findByRole('heading', { name: 'Historial' })).toBeTruthy()
    expect(await screen.findByText('No hay registros en estos 7 días.')).toBeTruthy()
  })
})
