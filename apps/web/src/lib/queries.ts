import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useApi } from './apiContext'
import { queryKeys } from './queryClient'

export function useProfileQuery() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.profile, queryFn: api.getProfile, staleTime: 5 * 60_000 })
}

export function useEntriesQuery(date: string) {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.entries(date), queryFn: () => api.listEntries(date) })
}

export function useUsageQuery() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.usage, queryFn: api.getUsage })
}

export function useSummaryQuery(from: string, to: string) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.summary(from, to),
    queryFn: () => api.getSummary(from, to),
    placeholderData: keepPreviousData,
  })
}

export function useFavoritesQuery() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.favorites, queryFn: api.listFavorites })
}

export function useWeightsQuery(from: string, to: string) {
  const api = useApi()
  return useQuery({
    queryKey: queryKeys.weights(from, to),
    queryFn: () => api.listWeights(from, to),
  })
}

export function useAdaptiveQuery() {
  const api = useApi()
  return useQuery({ queryKey: queryKeys.adaptive, queryFn: api.getAdaptive, staleTime: 5 * 60_000 })
}
