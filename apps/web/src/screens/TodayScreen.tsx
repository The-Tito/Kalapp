import {
  addDays,
  type Entry,
  formatGrams,
  formatKcal,
  formatNumber,
  isValidLocalDate,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  sumTotals,
} from '@kalapp/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CalorieRing, MacroBar } from '../components/CalorieRing'
import { Button, Card, ErrorBox, Spinner } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { formatDayLabel, formatTime, todayIn } from '../lib/dates'
import { useDraft } from '../lib/draft'
import { useEntriesQuery, useProfileQuery, useUsageQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'

function EntryCard({ entry, timezone }: { entry: Entry; timezone: string }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const remove = useMutation({
    mutationFn: () => api.deleteEntry(entry.id),
    onSuccess: () => {
      queryClient.setQueryData<Entry[]>(queryKeys.entries(entry.localDate), (old) =>
        old?.filter((e) => e.id !== entry.id),
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(entry.localDate) })
    },
  })

  const title = entry.title ?? entry.items.map((i) => i.name).join(', ')
  const detailId = `entry-${entry.id}`

  return (
    <li className="rounded-xl bg-gray-50 dark:bg-gray-800/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="flex-1">
          <span className="line-clamp-1 font-medium">{title}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {formatTime(entry.eatenAt, timezone)} · P {formatGrams(entry.totals.proteinG)} · C{' '}
            {formatGrams(entry.totals.carbsG)} · G {formatGrams(entry.totals.fatG)}
          </span>
        </span>
        <span className="font-semibold tabular-nums">{formatKcal(entry.totals.kcal)}</span>
      </button>
      {open && (
        <div id={detailId} className="flex flex-col gap-3 px-3 pb-3">
          <ul className="divide-y divide-gray-200 text-sm dark:divide-gray-700">
            {entry.items.map((it, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lista estática sin estado; los ítems no tienen id
              <li key={`${it.name}-${i}`} className="flex justify-between gap-2 py-1.5">
                <span>
                  {it.name} <span className="text-gray-500">· {formatGrams(it.grams)}</span>
                </span>
                <span className="tabular-nums">{formatKcal(it.kcal)}</span>
              </li>
            ))}
          </ul>
          {entry.note && <p className="text-sm text-gray-600 dark:text-gray-400">{entry.note}</p>}
          {remove.isError && <ErrorBox>{errorMessage(remove.error)}</ErrorBox>}
          {confirming ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">¿Borrar esta comida? No se puede deshacer.</p>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
                  No
                </Button>
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  {remove.isPending ? 'Borrando…' : 'Sí, borrar'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setDraft({ kind: 'edit', entry })
                  navigate('/revisar')
                }}
              >
                Editar
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => setConfirming(true)}>
                Borrar
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function UsageLine() {
  const usage = useUsageQuery()
  if (!usage.data) return null
  return (
    <p className="text-center text-xs text-gray-500 dark:text-gray-400">
      Análisis de hoy: {formatNumber(usage.data.calls)} de {formatNumber(usage.data.limit)}
    </p>
  )
}

export function TodayScreen() {
  const profile = useProfileQuery().data
  const [params, setParams] = useSearchParams()
  const timezone = profile?.timezone ?? 'UTC'
  const today = todayIn(timezone)
  const requested = params.get('fecha')
  const date = requested && isValidLocalDate(requested) && requested <= today ? requested : today
  const entries = useEntriesQuery(date)

  if (!profile) return <Spinner />

  const goTo = (d: string) => setParams(d === today ? {} : { fecha: d }, { replace: true })
  const list = entries.data ?? []
  const totals = sumTotals(list.map((e) => e.totals))

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center justify-between">
        <button
          type="button"
          aria-label="Día anterior"
          onClick={() => goTo(addDays(date, -1))}
          className="min-h-11 min-w-11 rounded-full text-2xl active:bg-gray-100 dark:active:bg-gray-800"
        >
          ‹
        </button>
        <h1 className="text-xl font-bold">{formatDayLabel(date, today)}</h1>
        <button
          type="button"
          aria-label="Día siguiente"
          disabled={date >= today}
          onClick={() => goTo(addDays(date, 1))}
          className="min-h-11 min-w-11 rounded-full text-2xl active:bg-gray-100 disabled:opacity-30 dark:active:bg-gray-800"
        >
          ›
        </button>
      </header>

      <Card className="flex flex-col gap-4">
        <CalorieRing consumed={totals.kcal} target={profile.targetKcal} />
        <div className="flex flex-col gap-3">
          <MacroBar
            label="Proteína"
            consumed={totals.proteinG}
            target={profile.proteinG}
            colorClass="bg-sky-500"
          />
          <MacroBar
            label="Carbohidratos"
            consumed={totals.carbsG}
            target={profile.carbsG}
            colorClass="bg-amber-500"
          />
          <MacroBar
            label="Grasa"
            consumed={totals.fatG}
            target={profile.fatG}
            colorClass="bg-fuchsia-500"
          />
        </div>
      </Card>

      {entries.isPending && <Spinner label="Cargando comidas…" />}
      {entries.isError && (
        <ErrorBox onRetry={() => void entries.refetch()}>{errorMessage(entries.error)}</ErrorBox>
      )}
      {entries.isSuccess && list.length === 0 && (
        <Card className="text-center">
          <p className="text-gray-600 dark:text-gray-400">
            {date === today ? 'Aún no registras comidas hoy.' : 'Sin registros este día.'}
          </p>
          {date === today && (
            <Link
              to="/capturar"
              className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-green-600 px-4 font-semibold text-white"
            >
              📷 Registrar comida
            </Link>
          )}
        </Card>
      )}

      {MEAL_TYPES.map((meal) => {
        const group = list.filter((e) => e.mealType === meal)
        if (group.length === 0) return null
        const groupTotals = sumTotals(group.map((e) => e.totals))
        return (
          <Card key={meal}>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{MEAL_TYPE_LABELS[meal]}</h2>
              <span className="text-sm font-medium tabular-nums text-gray-600 dark:text-gray-400">
                {formatKcal(groupTotals.kcal)}
              </span>
            </div>
            <ul className="flex flex-col gap-2">
              {group.map((e) => (
                <EntryCard key={e.id} entry={e} timezone={timezone} />
              ))}
            </ul>
          </Card>
        )
      })}

      <UsageLine />
    </div>
  )
}
