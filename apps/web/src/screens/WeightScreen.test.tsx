// @vitest-environment jsdom
import { addDays } from '@kalapp/shared'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../lib/api'
import { todayIn } from '../lib/dates'
import { queryKeys } from '../lib/queryClient'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { mockResizeObserver } from '../test/resizeObserver'
import WeightScreen from './WeightScreen'

beforeAll(() => mockResizeObserver())
afterEach(cleanup)

const today = todayIn(referenceProfile.timezone)
const weight = (daysAgo: number, weightKg: number) => ({
  id: `w${daysAgo}`,
  localDate: addDays(today, -daysAgo),
  weightKg,
  createdAt: '2026-11-04T12:00:00Z',
})

function setup(adaptive: unknown, weights = [weight(10, 80), weight(0, 83)]) {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/weights?')) return jsonResponse(weights)
    if (url === '/api/adaptive') return jsonResponse(adaptive)
    if (url === '/api/profile' && init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      return jsonResponse({
        ...referenceProfile,
        ...body,
        targetKcal: body.manualTargetKcal ?? 2200,
      })
    }
    return jsonResponse({})
  })
  const api = createApiClient({ fetchFn: fetchFn as unknown as typeof fetch, tokenStore: tokens })
  renderWithProviders(<WeightScreen />, {
    api,
    route: '/peso',
    setup: (qc) => qc.setQueryData(queryKeys.profile, referenceProfile),
  })
  return fetchFn
}

const okResult = {
  status: 'ok',
  estimatedTdee: 2550,
  avgIntakeKcal: 2300,
  weightTrendKgPerWeek: -0.25,
  loggedDaysRatio: 0.9,
  suggestedTargetKcal: 2050,
  deltaKcal: -150,
  safetyFloorApplied: false,
  message: 'Tu gasto real parece ser ~2,550 kcal.',
}

describe('Peso', () => {
  it('lista, gráfica, banner de recálculo y gasto adaptativo pendiente', async () => {
    setup({
      status: 'insufficient_data',
      reason: 'LOW_LOGGING',
      message: 'Registraste 10 de 28 días',
      daysNeeded: 13,
    })
    expect(await screen.findByText('83 kg')).toBeTruthy()
    expect(screen.getByText('80 kg')).toBeTruthy()
    expect(screen.getByTestId('weight-chart')).toBeTruthy()
    expect(screen.getByText('Tu peso cambió; ¿actualizar tu perfil?')).toBeTruthy()
    expect(await screen.findByText('Registraste 10 de 28 días')).toBeTruthy()
    expect(screen.getByText('10 de 23 días registrados (últimas 4 semanas)')).toBeTruthy()
  })

  it('el banner actualiza el peso del perfil solo tras confirmar', async () => {
    const fetchFn = setup(okResult)
    fireEvent.click(await screen.findByRole('button', { name: 'Actualizar perfil' }))
    expect(fetchFn.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, actualizar' }))
    await vi.waitFor(() =>
      expect(fetchFn.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true),
    )
    const put = fetchFn.mock.calls.find((c) => c[1]?.method === 'PUT')
    const body = JSON.parse(String(put?.[1]?.body))
    expect(body.weightKg).toBe(83)
    expect(body.birthDate).toBe(referenceProfile.birthDate)
  })

  it('"Usar esta meta" pide confirmación y manda manualTargetKcal', async () => {
    const fetchFn = setup(okResult, [weight(0, 80)])
    expect(await screen.findByText('−0.25 kg/semana')).toBeTruthy()
    expect(screen.getByText('−150 kcal vs. tu meta')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta meta' }))
    expect(fetchFn.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, cambiar' }))
    await vi.waitFor(() =>
      expect(fetchFn.mock.calls.some((c) => c[1]?.method === 'PUT')).toBe(true),
    )
    const put = fetchFn.mock.calls.find((c) => c[1]?.method === 'PUT')
    expect(JSON.parse(String(put?.[1]?.body)).manualTargetKcal).toBe(2050)
  })

  it('registrar un peso hace POST con fecha y kg', async () => {
    const fetchFn = setup(okResult, [])
    fireEvent.change(await screen.findByLabelText('Peso (kg)'), { target: { value: '79,4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar peso' }))
    await vi.waitFor(() =>
      expect(
        fetchFn.mock.calls.some((c) => c[0] === '/api/weights' && c[1]?.method === 'POST'),
      ).toBe(true),
    )
    const post = fetchFn.mock.calls.find((c) => c[0] === '/api/weights')
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ localDate: today, weightKg: 79.4 })
  })
})
