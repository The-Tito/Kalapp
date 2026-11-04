import {
  addDays,
  type Entry,
  formatGrams,
  formatKcal,
  formatNumber,
  isValidLocalDate,
  LIMITS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  sumTotals,
} from '@kalapp/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { CalorieRing, MacroBar } from '../components/CalorieRing'
import { Button, Card, ErrorBox, Field, inputClass, Spinner } from '../components/ui'
import { errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { blobToDataUrl } from '../lib/compressImage'
import { formatDayLabel, formatTime, todayIn } from '../lib/dates'
import { useDraft } from '../lib/draft'
import { buildFavoriteInput } from '../lib/favorites'
import { captureUrl } from '../lib/nav'
import { useEntriesQuery, useProfileQuery, useUsageQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'
import { useQueue } from '../lib/queueContext'
import { firstIssueMessage } from '../lib/review'
import { newId } from '../lib/uuid'

function SaveFavoriteForm({ entry, onDone }: { entry: Entry; onDone(): void }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const uid = useId()
  const [name, setName] = useState(entry.title ?? entry.items.map((i) => i.name).join(', '))
  const [error, setError] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: async () => {
      const input = buildFavoriteInput({
        id: newId(),
        name: name.slice(0, LIMITS.nameMaxLength),
        items: entry.items,
        mealType: entry.mealType,
      })
      if (!input.success) throw new Error(firstIssueMessage(input.error))
      return api.createFavorite(input.data)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites })
    },
    onError: (err) =>
      setError(err instanceof Error && err.name !== 'ApiError' ? err.message : errorMessage(err)),
  })
  if (create.isSuccess) {
    return (
      <div role="status" className="flex items-center justify-between gap-2 text-sm">
        <span>⭐ Guardado en favoritos.</span>
        <Button variant="ghost" onClick={onDone}>
          Listo
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <Field id={`${uid}-name`} label="Nombre del favorito">
        <input
          id={`${uid}-name`}
          value={name}
          maxLength={LIMITS.nameMaxLength}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
      </Field>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={create.isPending || name.trim() === ''}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Guardando…' : '⭐ Guardar'}
        </Button>
      </div>
    </div>
  )
}

function EntryCard({ entry, timezone }: { entry: Entry; timezone: string }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [favorite, setFavorite] = useState(false)

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
          {favorite ? (
            <SaveFavoriteForm entry={entry} onDone={() => setFavorite(false)} />
          ) : confirming ? (
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
          {!favorite && !confirming && (
            <Button variant="ghost" onClick={() => setFavorite(true)}>
              ⭐ Guardar como favorito
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

const FLAG_MESSAGES: Record<string, Record<string, string>> = {
  cola: {
    comida:
      'Sin conexión: tu comida quedó guardada en este iPhone y se enviará sola al volver el internet.',
    foto: 'Foto guardada. Se analizará sola cuando vuelva el internet; luego solo tendrás que revisarla.',
    texto:
      'Descripción guardada. Se analizará sola cuando vuelva el internet; luego solo tendrás que revisarla.',
  },
  aviso: {
    favorito:
      'La comida se guardó, pero no se pudo crear el favorito. Puedes hacerlo desde el registro.',
  },
}

function FlagNotices() {
  const [params, setParams] = useSearchParams()
  const messages = Object.entries(FLAG_MESSAGES).flatMap(([key, map]) => {
    const v = params.get(key)
    const m = v ? map[v] : undefined
    return m ? [{ key, m }] : []
  })
  if (messages.length === 0) return null
  const dismiss = () => {
    const next = new URLSearchParams(params)
    for (const k of Object.keys(FLAG_MESSAGES)) next.delete(k)
    setParams(next, { replace: true })
  }
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100"
    >
      <div className="flex-1 space-y-1">
        {messages.map(({ key, m }) => (
          <p key={key}>{m}</p>
        ))}
      </div>
      <button
        type="button"
        aria-label="Cerrar aviso"
        onClick={dismiss}
        className="min-h-11 min-w-11 rounded-lg text-xl"
      >
        ×
      </button>
    </div>
  )
}

const plural = (n: number, one: string, many: string) =>
  `${formatNumber(n)} ${n === 1 ? one : many}`

function QueueBanners() {
  const queue = useQueue()
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const [opening, setOpening] = useState(false)
  const { pendingEntries, queuedPhotos, analyzedPhotos, queuedTexts, analyzedTexts } = queue.counts
  const analyzed = analyzedPhotos + analyzedTexts

  const openAnalyzed = async () => {
    if (opening) return
    setOpening(true)
    try {
      const [item] = await queue.analyzedItems()
      if (!item?.proposal) return
      const photo =
        item.kind === 'photo'
          ? await blobToDataUrl(new Blob([item.data], { type: item.type })).catch(() => null)
          : null
      setDraft({
        kind: 'new',
        id: item.id,
        proposal: item.proposal,
        source: item.kind,
        note: item.note,
        photo,
        localHour: item.localHour,
        localDate: item.localDate,
        pendingPhotoId: item.id,
      })
      navigate('/revisar')
    } finally {
      setOpening(false)
    }
  }

  if (pendingEntries + queuedPhotos + queuedTexts + analyzed === 0) return null
  return (
    <div className="flex flex-col gap-2">
      {analyzed > 0 && (
        <button
          type="button"
          onClick={() => void openAnalyzed()}
          disabled={opening}
          className="flex min-h-14 items-center gap-3 rounded-xl bg-green-600 px-4 py-2 text-left font-semibold text-white shadow active:bg-green-700"
        >
          <span aria-hidden="true" className="text-2xl">
            📸
          </span>
          <span className="flex-1">
            {analyzedTexts === 0
              ? analyzedPhotos === 1
                ? 'Tienes 1 foto analizada por revisar'
                : `Tienes ${formatNumber(analyzedPhotos)} fotos analizadas por revisar`
              : analyzed === 1
                ? 'Tienes 1 comida analizada por revisar'
                : `Tienes ${formatNumber(analyzed)} comidas analizadas por revisar`}
          </span>
          <span aria-hidden="true">›</span>
        </button>
      )}
      {(pendingEntries > 0 || queuedPhotos > 0 || queuedTexts > 0) && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <p className="flex-1">
            {[
              pendingEntries > 0 &&
                plural(pendingEntries, 'comida por enviar', 'comidas por enviar'),
              queuedPhotos > 0 && plural(queuedPhotos, 'foto por analizar', 'fotos por analizar'),
              queuedTexts > 0 &&
                plural(queuedTexts, 'descripción por analizar', 'descripciones por analizar'),
            ]
              .filter(Boolean)
              .join(' · ')}
            . Se procesan solas al volver el internet.
          </p>
          <Button variant="secondary" onClick={() => void queue.processNow(true)}>
            Reintentar
          </Button>
        </div>
      )}
    </div>
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

      <FlagNotices />
      <QueueBanners />

      {date !== today && (
        <Link
          to={captureUrl(date)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-green-600 px-4 font-semibold text-green-700 active:bg-green-50 dark:text-green-400 dark:active:bg-gray-800"
        >
          ＋ Registrar comida en este día
        </Link>
      )}

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
          <Link
            to={captureUrl(date === today ? null : date)}
            className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-green-600 px-4 font-semibold text-white"
          >
            📷 Registrar comida
          </Link>
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
