import { CONFIDENCE_LABELS, type Confidence } from '@kalapp/shared'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-green-600 text-white hover:bg-green-700 active:bg-green-800 disabled:bg-green-600/50 dark:disabled:bg-green-900',
  secondary:
    'border border-gray-300 bg-white text-gray-900 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:active:bg-gray-700',
  danger: 'bg-red-600 text-white active:bg-red-700 disabled:bg-red-600/50',
  ghost: 'text-green-700 active:bg-green-50 dark:text-green-400 dark:active:bg-gray-800',
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export const inputClass =
  'block min-h-11 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900 placeholder:text-gray-400 focus:border-green-600 focus:outline-none focus:ring-2 focus:ring-green-600/30 aria-[invalid=true]:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100'

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string | undefined
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm text-gray-500 dark:text-gray-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <p>{children}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="self-start">
          Reintentar
        </Button>
      )}
    </div>
  )
}

export function WarningBox({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      {children}
    </div>
  )
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 p-8 text-gray-500">
      <span
        aria-hidden="true"
        className="size-6 animate-spin rounded-full border-2 border-gray-300 border-t-green-600"
      />
      <span>{label}</span>
    </div>
  )
}

const CONFIDENCE_CLASS: Record<Confidence, string> = {
  high: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100',
  medium: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  low: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100',
}

export function ConfidencePill({ confidence }: { confidence: Confidence }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${CONFIDENCE_CLASS[confidence]}`}
    >
      Confianza {CONFIDENCE_LABELS[confidence].toLowerCase()}
    </span>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800 ${className}`}
    >
      {children}
    </section>
  )
}
