import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { usePwa } from '../lib/pwa'

export function UpdateBanner() {
  const { needRefresh, update, dismiss } = usePwa()
  if (!needRefresh) return null
  return (
    <div
      role="status"
      className="top-safe fixed inset-x-0 z-50 mx-auto flex max-w-md items-center gap-2 bg-green-700 px-4 py-2 text-white shadow-lg"
    >
      <p className="flex-1 text-sm font-medium">Hay una nueva versión</p>
      <button
        type="button"
        onClick={update}
        className="min-h-11 rounded-lg bg-white px-3 font-semibold text-green-800"
      >
        Actualizar
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar aviso"
        className="min-h-11 min-w-11 rounded-lg text-xl"
      >
        ×
      </button>
    </div>
  )
}

const navItem = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 flex-col items-center justify-center text-xs font-medium ${
    isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
  }`

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95"
    >
      <div className="mx-auto flex max-w-md items-end px-6">
        <NavLink to="/" end className={navItem}>
          <span aria-hidden="true" className="text-xl">
            🏠
          </span>
          Hoy
        </NavLink>
        <div className="flex flex-1 justify-center">
          <NavLink
            to="/capturar"
            aria-label="Registrar comida con foto"
            className="-mt-7 mb-1 flex size-16 items-center justify-center rounded-full bg-green-600 text-3xl text-white shadow-lg ring-4 ring-white active:bg-green-700 dark:ring-gray-950"
          >
            <span aria-hidden="true">📷</span>
          </NavLink>
        </div>
        <NavLink to="/ajustes" className={navItem}>
          <span aria-hidden="true" className="text-xl">
            ⚙️
          </span>
          Ajustes
        </NavLink>
      </div>
    </nav>
  )
}

/** Pantallas principales: contenido centrado + barra inferior. */
export function AppShell() {
  return (
    <>
      <main className="mx-auto w-full max-w-md px-4 pt-4 pb-32">
        <Outlet />
      </main>
      <BottomNav />
    </>
  )
}

/** Pantallas sin barra inferior (token, onboarding). */
export function PlainShell({ children }: { children: ReactNode }) {
  return <main className="mx-auto w-full max-w-md px-4 pt-6 pb-10">{children}</main>
}

export function ScreenTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{children}</h1>
      {aside}
    </header>
  )
}
