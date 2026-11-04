import { QueryClient } from '@tanstack/react-query'
import { ApiError } from './api'

/** Un reintento para fallas de red o del servidor; nunca para errores 4xx ni cancelaciones. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.isClientError || error.code === 'ABORTED')) return false
  return failureCount < 1
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  })
}

export const queryKeys = {
  profile: ['profile'] as const,
  usage: ['usage'] as const,
  entriesAll: ['entries'] as const,
  entries: (date: string) => ['entries', date] as const,
}
