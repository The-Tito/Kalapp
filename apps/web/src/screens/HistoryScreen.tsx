import { formatGrams, formatKcal, formatNumber, type MacroTotals } from '@kalapp/shared'
import { useId } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ScreenTitle } from '../components/Layout'
import { Card, ErrorBox, Spinner } from '../components/ui'
import { errorMessage } from '../lib/api'
import { formatDayLabel, formatShortDate, todayIn } from '../lib/dates'
import {
  averageLogged,
  buildHistoryDays,
  chartData,
  HISTORY_RANGES,
  type HistoryDay,
  type HistoryRange,
  historyRange,
  summaryMatches,
  weeklyAverages,
} from '../lib/history'
import { todayUrl } from '../lib/nav'
import { useProfileQuery, useSummaryQuery } from '../lib/queries'

export function parseRange(value: string | null): HistoryRange {
  const n = Number(value)
  return (HISTORY_RANGES as readonly number[]).includes(n) ? (n as HistoryRange) : 7
}

function MacroLine({ t }: { t: MacroTotals }) {
  return (
    <span className="tabular-nums">
      P {formatGrams(t.proteinG)} · C {formatGrams(t.carbsG)} · G {formatGrams(t.fatG)}
    </span>
  )
}

function KcalChart({ days, target }: { days: HistoryDay[]; target: number }) {
  const data = chartData(days).map((d) => ({ ...d, label: formatShortDate(d.localDate) }))
  return (
    <div className="h-56 w-full" data-testid="history-chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={16}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatNumber(v)}
            width={48}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? formatKcal(v) : 'Sin registro')}
            labelFormatter={(l) => String(l)}
          />
          <ReferenceLine
            y={target}
            stroke="#16a34a"
            strokeDasharray="6 4"
            label={{ value: 'Meta', position: 'insideTopRight', fontSize: 11, fill: '#15803d' }}
          />
          <Bar dataKey="kcal" name="kcal" fill="#22c55e" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function HistoryScreen() {
  const profile = useProfileQuery().data
  const [params, setParams] = useSearchParams()
  const uid = useId()
  const range = parseRange(params.get('dias'))
  const timezone = profile?.timezone ?? 'UTC'
  const today = todayIn(timezone)
  const { from, to } = historyRange(today, range)
  const summary = useSummaryQuery(from, to)

  const setRange = (r: HistoryRange) =>
    setParams(r === 7 ? {} : { dias: String(r) }, { replace: true })

  const fresh = summaryMatches(summary.data, from, to)
  const days = summary.data ? buildHistoryDays(summary.data.days, from, to) : []
  const avg = averageLogged(days)
  const weeks = range > 7 ? weeklyAverages(days) : []

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>Historial</ScreenTitle>

      <div
        role="radiogroup"
        aria-label="Rango"
        className="grid grid-cols-3 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
      >
        {HISTORY_RANGES.map((r) => (
          <label
            key={r}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg font-semibold ${
              range === r ? 'bg-white shadow dark:bg-gray-950' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <input
              type="radio"
              name={`${uid}-range`}
              className="sr-only"
              checked={range === r}
              onChange={() => setRange(r)}
            />
            {r} días
          </label>
        ))}
      </div>

      {summary.isPending && <Spinner label="Cargando historial…" />}
      {summary.isError && (
        <ErrorBox onRetry={() => void summary.refetch()}>{errorMessage(summary.error)}</ErrorBox>
      )}

      {summary.data && (
        <div className={`flex flex-col gap-4 ${fresh ? '' : 'opacity-60'}`}>
          <Card className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Calorías por día</h2>
            {profile && <KcalChart days={days} target={profile.targetKcal} />}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              La línea punteada es tu meta
              {profile ? ` (${formatKcal(profile.targetKcal)})` : ''}. Los días sin registro quedan
              vacíos.
            </p>
          </Card>

          <Card className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">Promedio diario</h2>
            {avg.averages ? (
              <>
                <p className="text-3xl font-bold tabular-nums" data-testid="history-avg-kcal">
                  {formatKcal(avg.averages.kcal)}
                </p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  <MacroLine t={avg.averages} />
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Promedio de los días registrados: {formatNumber(avg.loggedDays)} de{' '}
                  {formatNumber(avg.totalDays)} días
                </p>
              </>
            ) : (
              <p className="text-gray-600 dark:text-gray-400">
                No hay registros en estos {formatNumber(range)} días.
              </p>
            )}
          </Card>

          {weeks.length > 0 && (
            <Card className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">Promedio por semana</h2>
              <ul className="divide-y divide-gray-200 dark:divide-gray-800">
                {weeks.map((w) => (
                  <li key={w.from} className="flex items-baseline justify-between gap-2 py-2">
                    <span className="text-sm">
                      {formatShortDate(w.from)} – {formatShortDate(w.to)}
                      <span className="block text-xs text-gray-500">
                        {formatNumber(w.loggedDays)} de {formatNumber(w.totalDays)} días
                      </span>
                    </span>
                    <span className="font-semibold tabular-nums">
                      {w.averages ? formatKcal(w.averages.kcal) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <h2 className="mb-2 text-lg font-semibold">Días</h2>
            <ul className="flex flex-col">
              {[...days].reverse().map((d) => (
                <li key={d.localDate}>
                  <Link
                    to={todayUrl(d.localDate === today ? null : d.localDate)}
                    className="flex min-h-12 items-center justify-between gap-2 rounded-lg px-2 active:bg-gray-100 dark:active:bg-gray-800"
                  >
                    <span>{formatDayLabel(d.localDate, today)}</span>
                    {d.totals ? (
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">
                          {formatKcal(d.totals.kcal)}
                        </span>
                        <span className="block text-xs text-gray-500">
                          <MacroLine t={d.totals} />
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">Sin registro</span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}
