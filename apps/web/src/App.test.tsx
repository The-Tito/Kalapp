// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from './App'
import { createApiClient } from './lib/api'
import { ApiProvider } from './lib/apiContext'
import { DraftProvider } from './lib/draft'
import { tokenStore } from './lib/token'
import { jsonResponse, referenceProfile } from './test/fixtures'

afterEach(() => {
  cleanup()
  tokenStore.clear()
})

function renderApp(route: string, fetchImpl: (url: string) => Promise<Response>) {
  const fetchFn = vi.fn(fetchImpl)
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ApiProvider client={api}>
        <DraftProvider initialDraft={null}>
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
})
