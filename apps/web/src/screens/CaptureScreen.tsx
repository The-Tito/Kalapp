import {
  API_ERROR_MESSAGES,
  DEFAULT_TIMEZONE,
  formatBytes,
  formatNumber,
  isValidLocalDate,
  LIMITS,
  MAX_IMAGE_BYTES,
  toLocalHour,
} from '@kalapp/shared'
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, lazy, Suspense, useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { FavoritesPanel } from '../components/FavoritesPanel'
import { ScreenTitle } from '../components/Layout'
import { Button, ErrorBox, Field, inputClass, Spinner, WarningBox } from '../components/ui'
import { ApiError, errorMessage, isNotFoodError } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { blobToDataUrl, CompressionError, compressImage } from '../lib/compressImage'
import { formatDayLabel, todayIn } from '../lib/dates'
import { useDraft } from '../lib/draft'
import { captureUrl, todayUrl } from '../lib/nav'
import { combineNote, QUICK_CHIPS } from '../lib/note'
import { useProfileQuery, useUsageQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'
import { useQueue } from '../lib/queueContext'
import { newId } from '../lib/uuid'

// zxing solo se descarga al abrir la pestaña Código.
const BarcodePanel = lazy(() => import('../components/BarcodePanel'))

export type CaptureMode = 'photo' | 'text' | 'favorites' | 'barcode'
type Phase = 'idle' | 'compressing' | 'analyzing'

const MODES: readonly (readonly [CaptureMode, string])[] = [
  ['photo', '📷 Foto'],
  ['text', '✏️ Texto'],
  ['favorites', '⭐ Favoritos'],
  ['barcode', '▥ Código'],
]

/** Fecha destino desde `?fecha=` (solo días pasados válidos); null = hoy. */
export function targetDateFromParam(param: string | null, today: string): string | null {
  if (!param || !isValidLocalDate(param) || param >= today) return null
  return param
}

/** ¿Ofrecer "Guardar para analizar después"? */
export function isOfflineFailure(err: unknown, online: boolean): boolean {
  return !online || (err instanceof ApiError && err.code === 'NETWORK')
}

/** Lo que se puede guardar para analizar después (foto comprimida o texto). */
type OfflineItem =
  | { kind: 'photo'; blob: Blob; note: string | null; localHour: number }
  | { kind: 'text'; text: string; note: string | null; localHour: number }

/** Mensaje claro para cada error del análisis. */
export function captureErrorMessage(err: unknown): string {
  if (err instanceof CompressionError) return err.message
  if (isNotFoodError(err)) return API_ERROR_MESSAGES.NOT_FOOD
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'DAILY_LIMIT':
        return 'Llegaste al límite de análisis de hoy. Mañana se reinicia.'
      case 'AI_UNAVAILABLE':
        return 'La IA no está disponible en este momento. Intenta en unos minutos.'
      case 'AI_INVALID_RESPONSE':
        return 'La IA respondió algo inválido. Intenta de nuevo.'
      case 'PAYLOAD_TOO_LARGE':
        return `La foto pesa más de ${formatBytes(MAX_IMAGE_BYTES)}. Intenta con otra.`
      case 'UNSUPPORTED_MEDIA':
        return 'Formato de imagen no soportado. Usa JPEG o PNG.'
      default:
        return err.message
    }
  }
  return errorMessage(err)
}

export function CaptureScreen() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const queue = useQueue()
  const { setDraft } = useDraft()
  const profile = useProfileQuery().data
  const usage = useUsageQuery().data
  const [params, setParams] = useSearchParams()
  const uid = useId()
  const timezone = profile?.timezone ?? DEFAULT_TIMEZONE
  const today = todayIn(timezone)
  const targetDate = targetDateFromParam(params.get('fecha'), today)
  const modeParam = params.get('modo')
  const mode: CaptureMode = MODES.some(([m]) => m === modeParam)
    ? (modeParam as CaptureMode)
    : 'photo'
  const [chips, setChips] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [offline, setOffline] = useState<OfflineItem | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const busy = phase !== 'idle'
  const finalNote = combineNote(chips, note)
  const limitReached = usage ? usage.calls >= usage.limit : false
  const online = typeof navigator === 'undefined' || navigator.onLine !== false

  const setMode = (m: CaptureMode) => {
    const next = new URLSearchParams(params)
    if (m === 'photo') next.delete('modo')
    else next.set('modo', m)
    setParams(next, { replace: true })
    setError(null)
    setOffline(null)
  }

  const toggleChip = (chip: string) =>
    setChips((cur) => (cur.includes(chip) ? cur.filter((c) => c !== chip) : [...cur, chip]))

  const run = async (
    work: (signal: AbortSignal, localHour: number) => Promise<void>,
    onOffline?: (err: unknown, localHour: number) => void,
  ) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setOffline(null)
    setQueueError(null)
    const localHour = toLocalHour(new Date(), timezone)
    try {
      await work(controller.signal, localHour)
      void queryClient.invalidateQueries({ queryKey: queryKeys.usage })
      navigate('/revisar')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ABORTED') return
      if (err instanceof ApiError && err.status > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.usage })
      }
      setError(captureErrorMessage(err))
      onOffline?.(err, localHour)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPhase('idle')
    }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite elegir la misma foto otra vez
    if (!file) return
    let compressed: Blob | null = null
    const noteForPhoto = finalNote || null
    void run(
      async (signal, localHour) => {
        setPhase('compressing')
        const { blob } = await compressImage(file)
        compressed = blob
        if (signal.aborted) throw new ApiError('ABORTED')
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw new ApiError('NETWORK')
        }
        const photo = await blobToDataUrl(blob).catch(() => null)
        setPhase('analyzing')
        const proposal = await api.analyzePhoto(blob, {
          note: noteForPhoto ?? undefined,
          localHour,
          signal,
        })
        setDraft({
          kind: 'new',
          id: newId(),
          proposal,
          source: 'photo',
          note: noteForPhoto,
          photo,
          localHour,
          localDate: targetDate,
        })
      },
      (err, localHour) => {
        if (compressed && isOfflineFailure(err, navigator.onLine !== false)) {
          setOffline({ kind: 'photo', blob: compressed, note: noteForPhoto, localHour })
        }
      },
    )
  }

  const saveForLater = async () => {
    if (!offline) return
    setQueueError(null)
    const q = await queue.getQueue()
    if (!q) {
      setQueueError('Este iPhone no permite guardar fotos sin internet (almacenamiento bloqueado).')
      return
    }
    try {
      const common = {
        id: newId(),
        note: offline.note,
        localHour: offline.localHour,
        localDate: targetDate ?? todayIn(timezone),
      }
      if (offline.kind === 'photo') await q.enqueuePhoto({ ...common, blob: offline.blob })
      else await q.enqueueText({ ...common, text: offline.text })
      await queue.refresh()
      setOffline(null)
      navigate(todayUrl(targetDate, { cola: offline.kind === 'photo' ? 'foto' : 'texto' }), {
        replace: true,
      })
    } catch (err) {
      setQueueError(err instanceof Error ? err.message : errorMessage(err))
    }
  }

  const onAnalyzeText = () => {
    const value = text.trim()
    if (!value) {
      setError('Describe lo que comiste.')
      return
    }
    const noteForText = finalNote || null
    void run(
      async (signal, localHour) => {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          throw new ApiError('NETWORK')
        }
        setPhase('analyzing')
        const proposal = await api.analyzeText(
          { text: value, note: noteForText ?? undefined, localHour },
          signal,
        )
        setDraft({
          kind: 'new',
          id: newId(),
          proposal,
          source: 'text',
          note: noteForText,
          photo: null,
          localHour,
          localDate: targetDate,
        })
      },
      (err, localHour) => {
        if (isOfflineFailure(err, navigator.onLine !== false)) {
          setOffline({ kind: 'text', text: value, note: noteForText, localHour })
        }
      },
    )
  }

  const cancel = () => {
    abortRef.current?.abort()
    setPhase('idle')
  }

  const usesAi = mode === 'photo' || mode === 'text'

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle
        aside={
          usage && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatNumber(usage.calls)}/{formatNumber(usage.limit)} análisis
            </span>
          )
        }
      >
        Registrar
      </ScreenTitle>

      {targetDate && (
        <div className="flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">
          <p className="flex-1">
            Registrando en <strong>{formatDayLabel(targetDate, today).toLowerCase()}</strong>.
          </p>
          <Link
            to={captureUrl(null, mode)}
            replace
            className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-sky-800 underline dark:text-sky-200"
          >
            Cambiar a hoy
          </Link>
        </div>
      )}

      <div
        role="tablist"
        aria-label="Modo de registro"
        className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
      >
        {MODES.map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-lg px-1 text-sm font-semibold ${
              mode === m ? 'bg-white shadow dark:bg-gray-950' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'favorites' && <FavoritesPanel targetDate={targetDate} />}

      {mode === 'barcode' && (
        <Suspense fallback={<Spinner label="Cargando lector de códigos…" />}>
          <BarcodePanel targetDate={targetDate} />
        </Suspense>
      )}

      {mode === 'text' && (
        <Field
          id={`${uid}-text`}
          label="¿Qué comiste?"
          hint={`${text.length}/${LIMITS.analyzeTextMaxLength}`}
        >
          <textarea
            id={`${uid}-text`}
            rows={3}
            maxLength={LIMITS.analyzeTextMaxLength}
            placeholder="2 tacos al pastor y una coca de 355"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className={inputClass}
          />
        </Field>
      )}

      {usesAi && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Preparación (opcional)
            </legend>
            <div className="flex flex-wrap gap-2">
              {QUICK_CHIPS.map((chip) => {
                const on = chips.includes(chip)
                return (
                  <button
                    key={chip}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleChip(chip)}
                    className={`min-h-11 rounded-full border px-4 text-sm font-medium ${
                      on
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
                    }`}
                  >
                    {chip}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <Field
            id={`${uid}-note`}
            label="Nota para la IA (opcional)"
            hint={`${note.length}/${LIMITS.noteMaxLength}`}
          >
            <input
              id={`${uid}-note`}
              maxLength={LIMITS.noteMaxLength}
              placeholder="Ej. sin tortilla, tortilla de harina"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={inputClass}
            />
          </Field>

          {limitReached && (
            <ErrorBox>Llegaste al límite de análisis de hoy. Mañana se reinicia.</ErrorBox>
          )}
          {!online && !offline && (
            <WarningBox>
              <p className="text-sm">
                Estás sin internet. Puedes{' '}
                {mode === 'photo' ? 'tomar la foto' : 'escribir lo que comiste'} y guardarlo para
                analizarlo después.
              </p>
            </WarningBox>
          )}
          {error && <ErrorBox>{error}</ErrorBox>}
          {offline && (
            <WarningBox>
              <p className="mb-2 text-sm">
                Podemos guardar la foto en este iPhone y analizarla sola cuando vuelva el internet.
                Después solo tendrás que revisarla.
              </p>
              <Button className="w-full" onClick={() => void saveForLater()}>
                Guardar para analizar después
              </Button>
              {queueError && <p className="mt-2 text-sm text-red-700">{queueError}</p>}
            </WarningBox>
          )}

          {mode === 'photo' ? (
            <div className="flex flex-col gap-2">
              <input
                ref={cameraRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onFile}
              />
              <input
                ref={galleryRef}
                type="file"
                accept="image/*"
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={onFile}
              />
              <Button
                className="min-h-16 text-lg"
                disabled={busy}
                onClick={() => cameraRef.current?.click()}
              >
                📷 Tomar foto
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => galleryRef.current?.click()}
              >
                Elegir de la galería
              </Button>
            </div>
          ) : (
            <Button className="min-h-14 text-lg" disabled={busy} onClick={onAnalyzeText}>
              Analizar
            </Button>
          )}
        </>
      )}

      {busy && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby={`${uid}-busy`}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white/95 p-6 dark:bg-gray-950/95"
        >
          <span
            aria-hidden="true"
            className="size-12 animate-spin rounded-full border-4 border-gray-300 border-t-green-600"
          />
          <p id={`${uid}-busy`} className="text-lg font-semibold">
            {phase === 'compressing' ? 'Preparando la foto…' : 'Analizando tu comida…'}
          </p>
          <Button variant="secondary" onClick={cancel}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  )
}
