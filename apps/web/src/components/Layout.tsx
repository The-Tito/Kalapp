import type { ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { usePwa } from '../lib/pwa'
import { useQueue } from '../lib/queueContext'

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
  `flex min-h-14 min-w-11 flex-1 flex-col items-center justify-center text-[11px] font-medium ${
    isActive ? 'text-green-700 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'
  }`

const NAV_LEFT = [
  { to: '/', label: 'Hoy', icon: '🏠', end: true },
  { to: '/historial', label: 'Historial', icon: '📊', end: false },
] as const
const NAV_RIGHT = [
  { to: '/peso', label: 'Peso', icon: '⚖️', end: false },
  { to: '/ajustes', label: 'Ajustes', icon: '⚙️', end: false },
] as const

function NavItem({
  to,
  label,
  icon,
  end,
}: {
  to: string
  label: string
  icon: string
  end: boolean
}) {
  return (
    <NavLink to={to} end={end} className={navItem}>
      <span aria-hidden="true" className="text-xl leading-none">
        {icon}
      </span>
      <span className="mt-1">{label}</span>
    </NavLink>
  )
}

/** Hoy · Historial · 📷 · Peso · Ajustes. */
export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95"
    >
      <div className="mx-auto flex max-w-md items-end px-2">
        {NAV_LEFT.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
        <div className="flex flex-1 justify-center">
          <NavLink
            to="/capturar"
            aria-label="Registrar comida"
            className="-mt-7 mb-1 flex size-16 items-center justify-center rounded-full bg-green-600 text-3xl text-white shadow-lg ring-4 ring-white active:bg-green-700 dark:ring-gray-950"
          >
            <span aria-hidden="true">📷</span>
          </NavLink>
        </div>
        {NAV_RIGHT.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </div>
    </nav>
  )
}

/**
 * Rutas sin barra inferior: tienen su propia barra de acciones fija (Guardar). Así un doble
 * toque en Guardar no cae sobre el botón 📷.
 */
export const ROUTES_WITHOUT_NAV = ['/revisar', '/ajustes/perfil'] as const

export function hidesBottomNav(pathname: string): boolean {
  return (ROUTES_WITHOUT_NAV as readonly string[]).includes(pathname.replace(/\/+$/, '') || '/')
}

/** Pantallas principales: contenido centrado + barra inferior (o barra de acciones). */
export function AppShell() {
  const { pathname } = useLocation()
  const noNav = hidesBottomNav(pathname)
  return (
    <>
      <QueueNotices />
      <main className={`mx-auto w-full max-w-md px-4 pt-4 ${noNav ? 'pb-actionbar' : 'pb-nav'}`}>
        <Outlet />
      </main>
      {!noNav && <BottomNav />}
    </>
  )
}

/** Avisos de la cola sin internet (elementos descartados por error del servidor). */
function QueueNotices() {
  const { notices, dismissNotice } = useQueue()
  if (notices.length === 0) return null
  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 px-4 pt-3">
      {notices.map((n, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: avisos de texto sin id, se descartan por posición
          key={i}
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <p className="flex-1">{n}</p>
          <button
            type="button"
            aria-label="Cerrar aviso"
            onClick={() => dismissNotice(i)}
            className="min-h-11 min-w-11 rounded-lg text-xl"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Pantallas sin barra inferior (token, onboarding). */
export function PlainShell({
  children,
  withActionBar = false,
}: {
  children: ReactNode
  withActionBar?: boolean
}) {
  return (
    <main
      className={`mx-auto w-full max-w-md px-4 pt-6 ${withActionBar ? 'pb-actionbar' : 'pb-10'}`}
    >
      {children}
    </main>
  )
}

/** Barra de acciones fija abajo, respetando la safe area de iOS. */
export function FixedActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
      <div className="mx-auto flex max-w-md gap-3 px-4 py-3">{children}</div>
    </div>
  )
}

/** Esqueleto mientras carga una pantalla perezosa. */
export function ScreenSkeleton({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-4">
      <div className="skeleton h-8 w-40 rounded-lg bg-gray-200 dark:bg-gray-800" />
      <div className="skeleton h-48 rounded-2xl bg-gray-200 dark:bg-gray-800" />
      <div className="skeleton h-24 rounded-2xl bg-gray-200 dark:bg-gray-800" />
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function ScreenTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="mb-4 flex items-center justify-between gap-2">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">{children}</h1>
      {aside}
    </header>
  )
}
