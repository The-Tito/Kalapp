// @vitest-environment jsdom
import { MINUS_SIGN } from '@kalapp/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { referenceProfile } from '../test/fixtures'
import { RecommendationView } from './ProfileWizard'

afterEach(cleanup)

describe('formato con signo', () => {
  it('ajuste y cambio esperado usan el signo menos tipográfico', () => {
    render(<RecommendationView rec={referenceProfile} />)
    expect(referenceProfile.adjustPct).toBeLessThan(0)
    expect(screen.getByText(`Ajuste ${MINUS_SIGN}20 %`)).toBeTruthy()
    const change = screen.getByText(/^Cambio esperado: .*semana$/).textContent ?? ''
    expect(change).toContain(MINUS_SIGN)
    expect(change).not.toMatch(/-\d/)
    expect(change).toMatch(/kg\/semana$/)
  })

  it('positivo con "+"', () => {
    render(
      <RecommendationView rec={{ ...referenceProfile, adjustPct: 10, expectedKgPerWeek: 0.25 }} />,
    )
    expect(screen.getByText('Ajuste +10 %')).toBeTruthy()
    expect(screen.getByText('Cambio esperado: +0.25 kg/semana')).toBeTruthy()
  })
})
