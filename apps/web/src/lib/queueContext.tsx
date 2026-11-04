import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useApi } from './apiContext'
import type { OfflineQueue, QueueCounts, QueuedPhoto } from './offlineQueue'
import { queryKeys } from './queryClient'

const EMPTY: QueueCounts = { pendingEntries: 0, queuedPhotos: 0, analyzedPhotos: 0, total: 0 }

export interface QueueContextValue {
  counts: QueueCounts
  /** Avisos de elementos descartados (4xx) para mostrar una vez. */
  notices: string[]
  dismissNotice(index: number): void
  /** Cola (se carga perezosamente con Dexie); null si no hay IndexedDB. */
  getQueue(): Promise<OfflineQueue | null>
  refresh(): Promise<void>
  /** Procesa la cola (al volver la red, a primer plano o al abrir). */
  processNow(force?: boolean): Promise<void>
  analyzedPhotos(): Promise<QueuedPhoto[]>
}

const QueueContext = createContext<QueueContextValue | null>(null)

const defaultLoader = async (): Promise<OfflineQueue | null> =>
  (await import('./offlineQueue')).getOfflineQueue()

export function QueueProvider({
  children,
  loader = defaultLoader,
}: {
  children: ReactNode
  /** Para pruebas: inyecta una cola (o null para desactivarla). */
  loader?: () => Promise<OfflineQueue | null>
}) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [counts, setCounts] = useState<QueueCounts>(EMPTY)
  const [notices, setNotices] = useState<string[]>([])
  const queueRef = useRef<Promise<OfflineQueue | null> | null>(null)

  const getQueue = useCallback(() => {
    queueRef.current ??= loader().catch(() => null)
    return queueRef.current
  }, [loader])

  const refresh = useCallback(async () => {
    const q = await getQueue()
    if (!q) return
    try {
      setCounts(await q.counts())
    } catch {
      // IndexedDB no disponible (modo privado): la cola queda vacía.
    }
  }, [getQueue])

  const processNow = useCallback(
    async (force = false) => {
      const q = await getQueue()
      if (!q) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        await refresh()
        return
      }
      try {
        const r = await q.process(api, { force })
        if (r.sent > 0) {
          void queryClient.invalidateQueries({ queryKey: queryKeys.entriesAll })
          void queryClient.invalidateQueries({ queryKey: queryKeys.summaryAll })
        }
        if (r.analyzed > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.usage })
        if (r.discarded.length > 0) {
          setNotices((cur) => [...cur, ...r.discarded.map((d) => d.message)])
        }
      } catch {
        // se reintenta en el siguiente evento
      }
      await refresh()
    },
    [api, getQueue, queryClient, refresh],
  )

  useEffect(() => {
    void processNow()
    const onOnline = () => void processNow(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void processNow()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [processNow])

  const analyzedPhotos = useCallback(async () => {
    const q = await getQueue()
    return q ? q.analyzedPhotos() : []
  }, [getQueue])

  const dismissNotice = useCallback(
    (index: number) => setNotices((cur) => cur.filter((_, i) => i !== index)),
    [],
  )

  const value = useMemo(
    () => ({ counts, notices, dismissNotice, getQueue, refresh, processNow, analyzedPhotos }),
    [counts, notices, dismissNotice, getQueue, refresh, processNow, analyzedPhotos],
  )
  return <QueueContext value={value}>{children}</QueueContext>
}

const noopQueue: QueueContextValue = {
  counts: EMPTY,
  notices: [],
  dismissNotice: () => {},
  getQueue: async () => null,
  refresh: async () => {},
  processNow: async () => {},
  analyzedPhotos: async () => [],
}

/** Fuera del proveedor (pruebas de pantallas) se comporta como cola desactivada. */
export function useQueue(): QueueContextValue {
  return useContext(QueueContext) ?? noopQueue
}
