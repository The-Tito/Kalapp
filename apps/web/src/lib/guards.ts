import { ApiError } from './api'

export type ProfileStatus = 'loading' | 'ok' | 'missing' | 'error'

/** Estado del perfil a partir de la consulta: 404 = aún no hay perfil (va a onboarding). */
export function profileStatus(q: {
  data?: unknown
  isPending: boolean
  isError: boolean
  error: unknown
}): ProfileStatus {
  if (q.isError && q.error instanceof ApiError && q.error.code === 'NOT_FOUND') return 'missing'
  // Si falla una recarga pero hay datos en caché, se sigue usando el perfil guardado.
  if (q.data !== undefined) return 'ok'
  if (q.isError) return 'error'
  return q.isPending ? 'loading' : 'ok'
}

export type GuardResult = { kind: 'redirect'; to: string } | { kind: 'loading' } | { kind: 'allow' }

/**
 * Guardias de ruta (puras para probarlas):
 * - sin token → /token
 * - zona de la app sin perfil → /onboarding
 */
export function resolveGuard(
  area: 'onboarding' | 'app',
  input: { hasToken: boolean; profile: ProfileStatus },
): GuardResult {
  if (!input.hasToken) return { kind: 'redirect', to: '/token' }
  if (area === 'onboarding') return { kind: 'allow' }
  if (input.profile === 'loading') return { kind: 'loading' }
  if (input.profile === 'missing') return { kind: 'redirect', to: '/onboarding' }
  return { kind: 'allow' }
}
