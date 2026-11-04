import { Navigate, Outlet } from 'react-router'
import { errorMessage } from '../lib/api'
import { profileStatus, resolveGuard } from '../lib/guards'
import { useProfileQuery } from '../lib/queries'
import { useToken } from '../lib/token'
import { ErrorBox, Spinner } from './ui'

/** Requiere token (onboarding y la app). */
export function RequireToken() {
  const token = useToken()
  const guard = resolveGuard('onboarding', { hasToken: token !== null, profile: 'ok' })
  if (guard.kind === 'redirect') return <Navigate to={guard.to} replace />
  return <Outlet />
}

/** Requiere perfil; un 404 lleva al onboarding. */
export function RequireProfile() {
  const token = useToken()
  const query = useProfileQuery()
  const status = profileStatus(query)
  const guard = resolveGuard('app', { hasToken: token !== null, profile: status })
  if (guard.kind === 'redirect') return <Navigate to={guard.to} replace />
  if (guard.kind === 'loading') return <Spinner />
  if (status === 'error') {
    return (
      <main className="mx-auto max-w-md p-4">
        <ErrorBox onRetry={() => void query.refetch()}>{errorMessage(query.error)}</ErrorBox>
      </main>
    )
  }
  return <Outlet />
}
