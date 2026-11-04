import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { ApiClient } from '../lib/api'
import { ApiProvider } from '../lib/apiContext'
import { type Draft, DraftProvider } from '../lib/draft'

export function renderWithProviders(
  ui: ReactNode,
  opts: {
    api: ApiClient
    route?: string
    draft?: Draft | null
    setup?: (qc: QueryClient) => void
    extraRoutes?: ReactNode
  },
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
  })
  opts.setup?.(queryClient)
  const route = opts.route ?? '/'
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={opts.api}>
        <DraftProvider initialDraft={opts.draft ?? null}>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path={route} element={ui} />
              {opts.extraRoutes}
            </Routes>
          </MemoryRouter>
        </DraftProvider>
      </ApiProvider>
    </QueryClientProvider>,
  )
  return { ...utils, queryClient }
}
