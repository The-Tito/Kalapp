import {
  DEFAULT_TIMEZONE,
  type Favorite,
  formatGrams,
  formatKcal,
  MEAL_TYPE_LABELS,
} from '@kalapp/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError, errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { buildEntryFromFavorite, filterFavorites, sortFavorites } from '../lib/favorites'
import { todayUrl } from '../lib/nav'
import { useFavoritesQuery, useProfileQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'
import { useQueue } from '../lib/queueContext'
import { firstIssueMessage } from '../lib/review'
import { newId } from '../lib/uuid'
import { Button, ErrorBox, inputClass, Spinner } from './ui'

function FavoriteRow({
  favorite,
  busy,
  onUse,
  onDelete,
  deleting,
}: {
  favorite: Favorite
  busy: boolean
  onUse(): void
  onDelete(): void
  deleting: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <li className="rounded-xl bg-gray-50 dark:bg-gray-800/60">
      <div className="flex items-stretch">
        <button
          type="button"
          disabled={busy}
          onClick={onUse}
          aria-label={`Registrar ${favorite.name}, ${formatKcal(favorite.totals.kcal)}`}
          className="flex min-h-14 flex-1 items-center gap-3 rounded-l-xl px-3 py-2 text-left active:bg-green-50 disabled:opacity-60 dark:active:bg-gray-700"
        >
          <span className="flex-1">
            <span className="line-clamp-1 font-medium">{favorite.name}</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {favorite.mealType ? `${MEAL_TYPE_LABELS[favorite.mealType]} · ` : ''}P{' '}
              {formatGrams(favorite.totals.proteinG)} · C {formatGrams(favorite.totals.carbsG)} · G{' '}
              {formatGrams(favorite.totals.fatG)}
              {favorite.usesCount > 0 ? ` · ${favorite.usesCount}×` : ''}
            </span>
          </span>
          <span className="font-semibold tabular-nums">{formatKcal(favorite.totals.kcal)}</span>
        </button>
        <button
          type="button"
          aria-label={`Borrar favorito ${favorite.name}`}
          onClick={() => setConfirming(true)}
          className="min-h-14 min-w-12 rounded-r-xl text-lg text-gray-500 active:bg-gray-200 dark:active:bg-gray-700"
        >
          🗑
        </button>
      </div>
      {confirming && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-sm font-medium">¿Borrar “{favorite.name}” de favoritos?</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              No
            </Button>
            <Button variant="danger" className="flex-1" disabled={deleting} onClick={onDelete}>
              {deleting ? 'Borrando…' : 'Sí, borrar'}
            </Button>
          </div>
        </div>
      )}
    </li>
  )
}

/** Pestaña Favoritos de Capturar: tocar uno registra la comida directamente. */
export function FavoritesPanel({ targetDate }: { targetDate: string | null }) {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const queue = useQueue()
  const uid = useId()
  const profile = useProfileQuery().data
  const favorites = useFavoritesQuery()
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const usingRef = useRef(false)
  const timezone = profile?.timezone ?? DEFAULT_TIMEZONE

  const use = useMutation({
    mutationFn: async (fav: Favorite) => {
      const input = buildEntryFromFavorite({
        id: newId(),
        favorite: fav,
        now: new Date(),
        timezone,
        targetDate,
      })
      if (!input.success) throw new Error(firstIssueMessage(input.error))
      try {
        await api.createEntry(input.data)
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NETWORK') {
          const q = await queue.getQueue()
          if (!q) throw err
          await q.enqueueEntry(input.data)
          await queue.refresh()
          return { localDate: input.data.localDate, queued: true }
        }
        throw err
      }
      // Contador de uso: si falla no importa (la comida ya quedó).
      void api
        .markFavoriteUsed(fav.id)
        .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.favorites }))
        .catch(() => {})
      return { localDate: input.data.localDate, queued: false }
    },
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entries(r.localDate) })
      void queryClient.invalidateQueries({ queryKey: queryKeys.summaryAll })
      navigate(todayUrl(targetDate ? r.localDate : null, r.queued ? { cola: 'comida' } : {}), {
        replace: true,
      })
    },
    onError: (err) =>
      setError(
        err instanceof Error && !(err instanceof ApiError) ? err.message : errorMessage(err),
      ),
    onSettled: () => {
      usingRef.current = false
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteFavorite(id),
    onSuccess: (_v, id) => {
      queryClient.setQueryData<Favorite[]>(queryKeys.favorites, (old) =>
        old?.filter((f) => f.id !== id),
      )
      void queryClient.invalidateQueries({ queryKey: queryKeys.favorites })
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (favorites.isPending) return <Spinner label="Cargando favoritos…" />
  if (favorites.isError) {
    return (
      <ErrorBox onRetry={() => void favorites.refetch()}>{errorMessage(favorites.error)}</ErrorBox>
    )
  }

  const list = filterFavorites(sortFavorites(favorites.data), query)

  return (
    <div className="flex flex-col gap-3">
      {favorites.data.length === 0 ? (
        <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800/60 dark:text-gray-400">
          Aún no tienes favoritos. Al guardar una comida marca “⭐ Guardar también como favorito” o,
          en Hoy, abre un registro y toca “Guardar como favorito”.
        </p>
      ) : (
        <>
          <label htmlFor={`${uid}-q`} className="sr-only">
            Buscar favorito
          </label>
          <input
            id={`${uid}-q`}
            type="search"
            placeholder="Buscar favorito"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Toca uno para registrarlo{targetDate ? ' en el día elegido' : ''}. Se guarda al
            instante.
          </p>
          {error && <ErrorBox>{error}</ErrorBox>}
          {list.length === 0 ? (
            <p className="text-sm text-gray-500">Ningún favorito coincide con “{query}”.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {list.map((f) => (
                <FavoriteRow
                  key={f.id}
                  favorite={f}
                  busy={use.isPending}
                  deleting={remove.isPending && remove.variables === f.id}
                  onUse={() => {
                    if (usingRef.current) return
                    usingRef.current = true
                    setError(null)
                    use.mutate(f)
                  }}
                  onDelete={() => remove.mutate(f.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
