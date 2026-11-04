import {
  type AdaptiveTdeeResult,
  addDays,
  formatKcal,
  formatNumber,
  formatSignedNumber,
  LIMITS,
  type Profile,
  type Weight,
  WeightInputSchema,
} from '@kalapp/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ScreenTitle } from '../components/Layout'
import { Button, Card, ErrorBox, Field, inputClass, Spinner, WarningBox } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { formatDayLabel, formatShortDate, todayIn } from '../lib/dates'
import { parseNumber } from '../lib/onboarding'
import { profileToInput } from '../lib/profile'
import { useAdaptiveQuery, useProfileQuery, useWeightsQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'
import { firstIssueMessage } from '../lib/review'
import { adaptiveProgress, movingAverage, recalcSuggestion } from '../lib/weight'

/** Días de pesos que se muestran (lista y gráfica). */
export const WEIGHT_HISTORY_DAYS = 180

const DISMISS_KEY = 'kalapp.recalcDismissed'

function readDismissed(): string | null {
  try {
    return globalThis.localStorage?.getItem(DISMISS_KEY) ?? null
  } catch {
    return null
  }
}

function writeDismissed(key: string): void {
  try {
    globalThis.localStorage?.setItem(DISMISS_KEY, key)
  } catch {
    // sin almacenamiento: el aviso vuelve a salir en la próxima visita
  }
}

const kg = (v: number) => `${formatNumber(v, 1)} kg`

function WeightForm({ today }: { today: string }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const uid = useId()
  const [date, setDate] = useState(today)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: api.saveWeight,
    onSuccess: () => {
      setText('')
      void queryClient.invalidateQueries({ queryKey: queryKeys.weightsAll })
      void queryClient.invalidateQueries({ queryKey: queryKeys.adaptive })
    },
    onError: (err) => setError(errorMessage(err)),
  })
  const submit = () => {
    const parsed = WeightInputSchema.safeParse({ localDate: date, weightKg: parseNumber(text) })
    if (!parsed.success) {
      setError(
        text.trim() === ''
          ? 'Escribe tu peso en kg.'
          : `Peso entre ${LIMITS.weightKg.min} y ${LIMITS.weightKg.max} kg. ${firstIssueMessage(parsed.error)}`,
      )
      return
    }
    if (parsed.data.localDate > today) {
      setError('La fecha no puede ser futura.')
      return
    }
    setError(null)
    save.mutate(parsed.data)
  }
  return (
    <Card>
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <h2 className="text-lg font-semibold">Registrar peso</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field id={`${uid}-kg`} label="Peso (kg)">
            <input
              id={`${uid}-kg`}
              inputMode="decimal"
              autoComplete="off"
              placeholder="80.5"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field id={`${uid}-date`} label="Fecha">
            <input
              id={`${uid}-date`}
              type="date"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value || today)}
              className={inputClass}
            />
          </Field>
        </div>
        <p className="text-xs text-gray-500">
          Un peso por día: si ya había uno en esa fecha, se reemplaza.
        </p>
        {error && <ErrorBox>{error}</ErrorBox>}
        {save.isSuccess && !error && (
          <p role="status" className="text-sm text-green-700 dark:text-green-400">
            Peso guardado.
          </p>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar peso'}
        </Button>
      </form>
    </Card>
  )
}

function WeightChart({ weights }: { weights: Weight[] }) {
  const data = movingAverage(weights).map((p) => ({ ...p, label: formatShortDate(p.localDate) }))
  const values = data.flatMap((d) => [d.weightKg, d.trendKg])
  const min = Math.floor(Math.min(...values) - 1)
  const max = Math.ceil(Math.max(...values) + 1)
  return (
    <div className="h-56 w-full" data-testid="weight-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={16} tickLine={false} />
          <YAxis
            domain={[min, max]}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => formatNumber(v)}
            width={40}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip formatter={(v) => (typeof v === 'number' ? kg(v) : '')} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="weightKg"
            name="Peso"
            stroke="#94a3b8"
            strokeWidth={1}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="trendKg"
            name="Tendencia (7 días)"
            stroke="#16a34a"
            strokeWidth={3}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function useUpdateProfile(onDone: () => void) {
  const api = useApi()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: api.putProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile)
      void queryClient.invalidateQueries({ queryKey: queryKeys.adaptive })
      onDone()
    },
  })
}

function RecalcBanner({ profile, weights }: { profile: Profile; weights: Weight[] }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const [confirming, setConfirming] = useState(false)
  const update = useUpdateProfile(() => setConfirming(false))
  const suggestion = recalcSuggestion(profile.weightKg, weights, dismissed)
  if (!suggestion) return null
  return (
    <WarningBox>
      <p className="font-semibold">Tu peso cambió; ¿actualizar tu perfil?</p>
      <p className="mt-1 text-sm">
        Tu perfil dice {kg(profile.weightKg)} y tu último registro es {kg(suggestion.weightKg)}. Con
        el peso nuevo recalculamos tu meta y tus macros.
      </p>
      {update.isError && <p className="mt-2 text-sm text-red-700">{errorMessage(update.error)}</p>}
      {confirming ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-sm font-medium">
            ¿Cambiar el peso del perfil a {kg(suggestion.weightKg)}?
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              No
            </Button>
            <Button
              className="flex-1"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(profileToInput(profile, { weightKg: suggestion.weightKg }))
              }
            >
              {update.isPending ? 'Guardando…' : 'Sí, actualizar'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              writeDismissed(suggestion.key)
              setDismissed(suggestion.key)
            }}
          >
            Ahora no
          </Button>
          <Button className="flex-1" onClick={() => setConfirming(true)}>
            Actualizar perfil
          </Button>
        </div>
      )}
    </WarningBox>
  )
}

function AdaptiveOk({
  result,
  profile,
}: {
  result: Extract<AdaptiveTdeeResult, { status: 'ok' }>
  profile: Profile
}) {
  const [confirming, setConfirming] = useState(false)
  const update = useUpdateProfile(() => setConfirming(false))
  const alreadyUsed = profile.targetKcal === result.suggestedTargetKcal
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-gray-700 dark:text-gray-300">{result.message}</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
          <dt className="text-gray-600 dark:text-gray-400">Gasto estimado</dt>
          <dd className="text-lg font-semibold tabular-nums">{formatKcal(result.estimatedTdee)}</dd>
        </div>
        <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
          <dt className="text-gray-600 dark:text-gray-400">Tendencia</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatSignedNumber(result.weightTrendKgPerWeek, 2)} kg/semana
          </dd>
        </div>
        <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
          <dt className="text-gray-600 dark:text-gray-400">Ingesta media</dt>
          <dd className="font-semibold tabular-nums">{formatKcal(result.avgIntakeKcal)}</dd>
        </div>
        <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
          <dt className="text-gray-600 dark:text-gray-400">Meta sugerida</dt>
          <dd className="font-semibold tabular-nums">{formatKcal(result.suggestedTargetKcal)}</dd>
          <dd className="text-xs text-gray-500 tabular-nums">
            {formatSignedNumber(result.deltaKcal)} kcal vs. tu meta
          </dd>
        </div>
      </dl>
      {result.safetyFloorApplied && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Se aplicó el piso de seguridad: no sugerimos menos de esto.
        </p>
      )}
      {update.isError && <ErrorBox>{errorMessage(update.error)}</ErrorBox>}
      {alreadyUsed ? (
        <p className="text-sm text-green-700 dark:text-green-400">Ya usas esta meta.</p>
      ) : confirming ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            ¿Cambiar tu meta de {formatKcal(profile.targetKcal)} a{' '}
            {formatKcal(result.suggestedTargetKcal)}? Quedará como meta manual; puedes volver a la
            calculada en Ajustes.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={update.isPending}
              onClick={() =>
                update.mutate(
                  profileToInput(profile, { manualTargetKcal: result.suggestedTargetKcal }),
                )
              }
            >
              {update.isPending ? 'Guardando…' : 'Sí, cambiar'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          Usar esta meta
        </Button>
      )}
    </div>
  )
}

function AdaptiveCard({
  profile,
  weights,
  today,
}: {
  profile: Profile
  weights: Weight[]
  today: string
}) {
  const adaptive = useAdaptiveQuery()
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Gasto adaptativo</h2>
      {adaptive.isPending && <Spinner label="Calculando…" />}
      {adaptive.isError && (
        <ErrorBox onRetry={() => void adaptive.refetch()}>{errorMessage(adaptive.error)}</ErrorBox>
      )}
      {adaptive.data?.status === 'insufficient_data' &&
        (() => {
          const progress = adaptiveProgress(adaptive.data, weights, today)
          return (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-gray-700 dark:text-gray-300">{adaptive.data.message}</p>
              {progress && (
                <>
                  <div
                    role="progressbar"
                    aria-label="Progreso del gasto adaptativo"
                    aria-valuemin={0}
                    aria-valuemax={progress.max}
                    aria-valuenow={progress.value}
                    className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
                  >
                    <div
                      className="h-full rounded-full bg-green-600"
                      style={{ width: `${(progress.value / progress.max) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500">{progress.label}</p>
                </>
              )}
              <p className="text-xs text-gray-500">
                Con 4 semanas de comidas y pesos estimamos cuánto gastas en realidad. Nunca cambia
                tu meta sin preguntarte.
              </p>
            </div>
          )
        })()}
      {adaptive.data?.status === 'ok' && <AdaptiveOk result={adaptive.data} profile={profile} />}
    </Card>
  )
}

function WeightRow({ weight, today }: { weight: Weight; today: string }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const [confirming, setConfirming] = useState(false)
  const remove = useMutation({
    mutationFn: () => api.deleteWeight(weight.localDate),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.weightsAll })
      void queryClient.invalidateQueries({ queryKey: queryKeys.adaptive })
    },
  })
  return (
    <li className="py-1">
      <div className="flex min-h-12 items-center gap-2">
        <span className="flex-1">{formatDayLabel(weight.localDate, today)}</span>
        <span className="font-semibold tabular-nums">{kg(weight.weightKg)}</span>
        <button
          type="button"
          aria-label={`Borrar peso del ${formatDayLabel(weight.localDate, today).toLowerCase()}`}
          onClick={() => setConfirming(true)}
          className="min-h-11 min-w-11 rounded-lg text-gray-500 active:bg-gray-100 dark:active:bg-gray-800"
        >
          🗑
        </button>
      </div>
      {remove.isError && <ErrorBox>{errorMessage(remove.error)}</ErrorBox>}
      {confirming && (
        <div className="flex gap-2 pb-2">
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
      )}
    </li>
  )
}

export default function WeightScreen() {
  const profile = useProfileQuery().data
  const timezone = profile?.timezone ?? 'UTC'
  const today = todayIn(timezone)
  const from = addDays(today, -(WEIGHT_HISTORY_DAYS - 1))
  const weights = useWeightsQuery(from, today)

  if (!profile) return <Spinner />
  const list = weights.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>Peso</ScreenTitle>

      {weights.data && <RecalcBanner profile={profile} weights={list} />}

      <WeightForm today={today} />

      {weights.isPending && <Spinner label="Cargando pesos…" />}
      {weights.isError && (
        <ErrorBox onRetry={() => void weights.refetch()}>{errorMessage(weights.error)}</ErrorBox>
      )}

      {weights.data && list.length > 0 && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Tendencia</h2>
          <WeightChart weights={list} />
          <p className="text-xs text-gray-500">
            La tendencia es la media de los pesos de los últimos 7 días; suaviza el agua y la sal.
          </p>
        </Card>
      )}

      <AdaptiveCard profile={profile} weights={list} today={today} />

      {weights.data && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Registros</h2>
          {list.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Aún no registras tu peso. Pésate en ayunas, de preferencia a la misma hora.
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-800">
              {[...list]
                .sort((a, b) => b.localDate.localeCompare(a.localDate))
                .map((w) => (
                  <WeightRow key={w.localDate} weight={w} today={today} />
                ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  )
}
