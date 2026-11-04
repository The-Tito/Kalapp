import { describe, expect, it } from 'vitest'
import { ApiError } from './api'
import { profileStatus, resolveGuard } from './guards'
import { shouldRetry } from './queryClient'

describe('guardias de ruta', () => {
  it('sin token siempre va a /token', () => {
    expect(resolveGuard('app', { hasToken: false, profile: 'ok' })).toEqual({
      kind: 'redirect',
      to: '/token',
    })
    expect(resolveGuard('onboarding', { hasToken: false, profile: 'missing' })).toEqual({
      kind: 'redirect',
      to: '/token',
    })
  })

  it('sin perfil va a /onboarding; cargando espera', () => {
    expect(resolveGuard('app', { hasToken: true, profile: 'missing' })).toEqual({
      kind: 'redirect',
      to: '/onboarding',
    })
    expect(resolveGuard('app', { hasToken: true, profile: 'loading' })).toEqual({
      kind: 'loading',
    })
    expect(resolveGuard('app', { hasToken: true, profile: 'ok' })).toEqual({ kind: 'allow' })
    expect(resolveGuard('onboarding', { hasToken: true, profile: 'missing' })).toEqual({
      kind: 'allow',
    })
  })

  it('profileStatus: 404 = sin perfil; otros errores sin caché = error', () => {
    const notFound = new ApiError('NOT_FOUND', 'x', 404)
    expect(profileStatus({ isPending: false, isError: true, error: notFound })).toBe('missing')
    const network = new ApiError('NETWORK')
    expect(profileStatus({ isPending: false, isError: true, error: network })).toBe('error')
    expect(profileStatus({ data: {}, isPending: false, isError: true, error: network })).toBe('ok')
    expect(profileStatus({ isPending: true, isError: false, error: null })).toBe('loading')
  })
})

describe('reintentos de TanStack Query', () => {
  it('un reintento para red/servidor, ninguno para 4xx', () => {
    expect(shouldRetry(0, new ApiError('NETWORK'))).toBe(true)
    expect(shouldRetry(1, new ApiError('NETWORK'))).toBe(false)
    expect(shouldRetry(0, new ApiError('INTERNAL', 'x', 500))).toBe(true)
    expect(shouldRetry(0, new ApiError('NOT_FOUND', 'x', 404))).toBe(false)
    expect(shouldRetry(0, new ApiError('UNAUTHORIZED', 'x', 401))).toBe(false)
    expect(shouldRetry(0, new ApiError('ABORTED'))).toBe(false)
  })
})
