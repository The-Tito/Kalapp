import { useSyncExternalStore } from 'react'

export const TOKEN_KEY = 'kalapp.token'

export interface TokenStore {
  get(): string | null
  set(token: string): void
  clear(): void
  subscribe(listener: () => void): () => void
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Safari en modo privado o almacenamiento bloqueado.
    return null
  }
}

/**
 * Token en `localStorage` con respaldo en memoria (si el almacenamiento falla la sesión
 * dura mientras la app siga abierta). Notifica cambios para que las guardias reaccionen.
 */
export function createTokenStore(getStorage: () => Storage | null = defaultStorage): TokenStore {
  let memory: string | null = null
  const listeners = new Set<() => void>()
  const emit = () => {
    for (const l of listeners) l()
  }

  return {
    get() {
      try {
        const storage = getStorage()
        if (storage) {
          const value = storage.getItem(TOKEN_KEY)
          return value && value.trim() !== '' ? value : memory
        }
      } catch {
        // se usa la copia en memoria
      }
      return memory
    },
    set(token) {
      memory = token
      try {
        getStorage()?.setItem(TOKEN_KEY, token)
      } catch {
        // se usa la copia en memoria
      }
      emit()
    },
    clear() {
      memory = null
      try {
        getStorage()?.removeItem(TOKEN_KEY)
      } catch {
        // nada que limpiar
      }
      emit()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const tokenStore = createTokenStore()

export function useToken(store: TokenStore = tokenStore): string | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null)
}
