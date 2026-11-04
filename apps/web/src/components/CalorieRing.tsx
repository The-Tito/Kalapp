import { formatKcal, formatNumber } from '@kalapp/shared'

const R = 52
const C = 2 * Math.PI * R

export function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const over = consumed > target
  const ratio = target > 0 ? Math.min(consumed / target, 1) : 0
  const remaining = Math.round(target - consumed)
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative size-48">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="10"
            className="stroke-gray-200 dark:stroke-gray-800"
          />
          <circle
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ratio)}
            className={`transition-[stroke-dashoffset] duration-500 ${over ? 'stroke-red-500' : 'stroke-green-600'}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={`text-4xl font-bold tabular-nums ${over ? 'text-red-600 dark:text-red-400' : ''}`}
          >
            {formatNumber(Math.abs(remaining))}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {over ? 'kcal de más' : 'kcal restantes'}
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-300">
        <span className="font-semibold tabular-nums">{formatNumber(consumed)}</span> consumidas de{' '}
        <span className="font-semibold tabular-nums">{formatKcal(target)}</span>
      </p>
    </div>
  )
}

export function MacroBar({
  label,
  consumed,
  target,
  colorClass,
}: {
  label: string
  consumed: number
  target: number
  colorClass: string
}) {
  const pct = target > 0 ? Math.min((consumed / target) * 100, 100) : 0
  const over = consumed > target
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={`tabular-nums ${over ? 'text-red-600 dark:text-red-400' : ''}`}>
          {formatNumber(consumed)} / {formatNumber(target)} g
        </span>
      </div>
      <div
        aria-hidden="true"
        className="h-2.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
      >
        <div
          className={`h-full rounded-full ${over ? 'bg-red-500' : colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
