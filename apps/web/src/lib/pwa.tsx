import { useRegisterSW } from 'virtual:pwa-register/react'
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react'

const UPDATE_INTERVAL_MS = 60 * 60 * 1000

interface PwaContextValue {
  needRefresh: boolean
  update(): void
  dismiss(): void
  checkNow(): void
}

const PwaContext = createContext<PwaContextValue>({
  needRefresh: false,
  update: () => {},
  dismiss: () => {},
  checkNow: () => {},
})

async function checkForUpdate(reg: ServiceWorkerRegistration): Promise<void> {
  if (reg.installing || (typeof navigator !== 'undefined' && navigator.onLine === false)) return
  try {
    await reg.update()
  } catch {
    // sin red o servidor caído: se intentará en la siguiente revisión
  }
}

/**
 * Registro del service worker con aviso de nueva versión. En iOS la app instalada casi nunca
 * se cierra, así que se busca actualización cada hora y cada vez que vuelve a primer plano.
 */
export function PwaProvider({ children }: { children: ReactNode }) {
  const regRef = useRef<ServiceWorkerRegistration | null>(null)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return
      regRef.current = reg
      setInterval(() => {
        void checkForUpdate(reg)
      }, UPDATE_INTERVAL_MS)
    },
    onRegisterError(error) {
      console.warn('No se pudo registrar el service worker', error)
    },
  })

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && regRef.current) {
        void checkForUpdate(regRef.current)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const update = useCallback(() => {
    void updateServiceWorker(true)
  }, [updateServiceWorker])
  const dismiss = useCallback(() => setNeedRefresh(false), [setNeedRefresh])
  const checkNow = useCallback(() => {
    if (regRef.current) void checkForUpdate(regRef.current)
  }, [])

  return <PwaContext value={{ needRefresh, update, dismiss, checkNow }}>{children}</PwaContext>
}

export function usePwa(): PwaContextValue {
  return useContext(PwaContext)
}
