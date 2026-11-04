// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiClient } from '../lib/api'
import { emptyProfileForm } from '../lib/onboarding'
import { createTokenStore } from '../lib/token'
import { jsonResponse, memoryStorage, referenceProfile } from '../test/fixtures'
import { renderWithProviders } from '../test/render'
import { ProfileWizard } from './ProfileWizard'

afterEach(cleanup)
beforeEach(() => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

function makeApi() {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const fetchFn = vi.fn(async () => jsonResponse(referenceProfile))
  return { api: createApiClient({ fetchFn, tokenStore: tokens }), fetchFn }
}

describe('Onboarding paso 1', () => {
  it('no deja avanzar con datos vacíos y muestra errores en español', () => {
    const { api } = makeApi()
    renderWithProviders(
      <ProfileWizard initialValues={emptyProfileForm('America/Mexico_City')} onSaved={vi.fn()} />,
      { api },
    )
    expect(screen.getByText('Paso 1 de 4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Elige una opción')).toBeTruthy()
    expect(screen.getByText('Escribe tu estatura en cm')).toBeTruthy()
    expect(screen.getByText('Paso 1 de 4')).toBeTruthy()
    expect(screen.getByLabelText('Estatura (cm)').getAttribute('aria-invalid')).toBe('true')
  })

  it('con datos válidos avanza al paso 2 y llega al resultado', async () => {
    const { api, fetchFn } = makeApi()
    const onSaved = vi.fn()
    renderWithProviders(
      <ProfileWizard initialValues={emptyProfileForm('America/Mexico_City')} onSaved={onSaved} />,
      { api },
    )
    fireEvent.click(screen.getByLabelText('Hombre'))
    fireEvent.change(screen.getByLabelText('Fecha de nacimiento'), {
      target: { value: '1998-06-15' },
    })
    fireEvent.change(screen.getByLabelText('Estatura (cm)'), { target: { value: '175' } })
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '80' } })
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Paso 2 de 4')).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/Moderado/))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    fireEvent.click(screen.getByLabelText(/Déficit/))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByText('Paso 4 de 4')).toBeTruthy()
    expect(screen.getByTestId('target-kcal').textContent).toMatch(/kcal/)
    expect(screen.getByText('Cómo lo calculamos')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar y empezar' }))
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/profile')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(String(init.body))).toMatchObject({
      sex: 'male',
      heightCm: 175,
      weightKg: 80,
      goal: 'deficit',
      timezone: 'America/Mexico_City',
    })
  })
})
