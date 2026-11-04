// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { Route } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../lib/api'
import { todayIn } from '../lib/dates'
import { historyRange } from '../lib/history'
import { queryKeys } from '../lib/queryClient'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { mockResizeObserver } from '../test/resizeObserver'
import HistoryScreen from './HistoryScreen'

beforeAll(() => mockResizeObserver())
afterEach(cleanup)

function setup() {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const today = todayIn(referenceProfile.timezone)
  const fetchFn = vi.fn(async (url: string) => {
    const u = new URL(url, 'http://x')
    const from = u.searchParams.get('from') ?? ''
    const to = u.searchParams.get('to') ?? ''
    const { from: f7 } = historyRange(today, 7)
    return jsonResponse({
      from,
      to,
      days:
        from === f7
          ? [
              { localDate: f7, kcal: 2000, proteinG: 150, carbsG: 200, fatG: 60, entryCount: 3 },
              { localDate: to, kcal: 1500, proteinG: 100, carbsG: 150, fatG: 50, entryCount: 2 },
            ]
          : [],
      loggedDays: from === f7 ? 2 : 0,
      averages: { kcal: 1750, proteinG: 125, carbsG: 175, fatG: 55 },
    })
  })
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  renderWithProviders(<HistoryScreen />, {
    api,
    route: '/historial',
    setup: (qc) => qc.setQueryData(queryKeys.profile, referenceProfile),
    extraRoutes: <Route path="/" element={<p>Pantalla Hoy</p>} />,
  })
  return { fetchFn, today }
}

describe('Historial', () => {
  it('muestra promedio sobre días registrados, días vacíos y la gráfica', async () => {
    const { fetchFn, today } = setup()
    expect(await screen.findByTestId('history-avg-kcal')).toBeTruthy()
    expect(screen.getByTestId('history-avg-kcal').textContent).toBe('1,750 kcal')
    expect(screen.getByText('Promedio de los días registrados: 2 de 7 días')).toBeTruthy()
    expect(screen.getAllByText('Sin registro')).toHaveLength(5)
    expect(screen.getByTestId('history-chart')).toBeTruthy()
    const { from } = historyRange(today, 7)
    expect(String(fetchFn.mock.calls[0]?.[0])).toBe(`/api/summary?from=${from}&to=${today}`)
  })

  it('cambiar a 30 días pide otro rango; tocar un día abre Hoy', async () => {
    const { fetchFn, today } = setup()
    await screen.findByTestId('history-avg-kcal')
    fireEvent.click(screen.getByLabelText('30 días'))
    const { from } = historyRange(today, 30)
    await vi.waitFor(() =>
      expect(fetchFn.mock.calls.map((c) => String(c[0]))).toContain(
        `/api/summary?from=${from}&to=${today}`,
      ),
    )
    expect(await screen.findByText('No hay registros en estos 30 días.')).toBeTruthy()
    expect(screen.getByText('Promedio por semana')).toBeTruthy()
    fireEvent.click(screen.getByText('Hoy'))
    expect(await screen.findByText('Pantalla Hoy')).toBeTruthy()
  })
})
