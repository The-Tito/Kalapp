import { DEFAULT_TIMEZONE, formatNumber, LIMITS, toLocalHour } from '@kalapp/shared'
import { useQueryClient } from '@tanstack/react-query'
import { type ChangeEvent, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { ScreenTitle } from '../components/Layout'
import { Button, ErrorBox, Field, inputClass } from '../components/ui'
import { ApiError, errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { blobToDataUrl, CompressionError, compressImage } from '../lib/compressImage'
import { useDraft } from '../lib/draft'
import { combineNote, QUICK_CHIPS } from '../lib/note'
import { useProfileQuery, useUsageQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'
import { newId } from '../lib/uuid'

type Mode = 'photo' | 'text'
type Phase = 'idle' | 'compressing' | 'analyzing'

/** Mensaje claro para cada error del análisis. */
export function captureErrorMessage(err: unknown): string {
  if (err instanceof CompressionError) return err.message
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'DAILY_LIMIT':
        return 'Llegaste al límite de análisis de hoy. Mañana se reinicia.'
      case 'AI_UNAVAILABLE':
        return 'La IA no está disponible en este momento. Intenta en unos minutos.'
      case 'AI_INVALID_RESPONSE':
        return 'La IA respondió algo inválido. Intenta de nuevo.'
      case 'PAYLOAD_TOO_LARGE':
        return 'La foto pesa más de 1 MB. Intenta con otra.'
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
  const { setDraft } = useDraft()
  const profile = useProfileQuery().data
  const usage = useUsageQuery().data
  const uid = useId()
  const [mode, setMode] = useState<Mode>('photo')
  const [chips, setChips] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [text, setText] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => abortRef.current?.abort(), [])

  const timezone = profile?.timezone ?? DEFAULT_TIMEZONE
  const busy = phase !== 'idle'
  const finalNote = combineNote(chips, note)
  const limitReached = usage ? usage.calls >= usage.limit : false

  const toggleChip = (chip: string) =>
    setChips((cur) => (cur.includes(chip) ? cur.filter((c) => c !== chip) : [...cur, chip]))

  const run = async (work: (signal: AbortSignal, localHour: number) => Promise<void>) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
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
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPhase('idle')
    }
  }

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite elegir la misma foto otra vez
    if (!file) return
    void run(async (signal, localHour) => {
      setPhase('compressing')
      const { blob } = await compressImage(file)
      if (signal.aborted) throw new ApiError('ABORTED')
      const photo = await blobToDataUrl(blob).catch(() => null)
      setPhase('analyzing')
      const proposal = await api.analyzePhoto(blob, {
        note: finalNote || undefined,
        localHour,
        signal,
      })
      setDraft({
        kind: 'new',
        id: newId(),
        proposal,
        source: 'photo',
        note: finalNote || null,
        photo,
        localHour,
      })
    })
  }

  const onAnalyzeText = () => {
    const value = text.trim()
    if (!value) {
      setError('Describe lo que comiste.')
      return
    }
    void run(async (signal, localHour) => {
      setPhase('analyzing')
      const proposal = await api.analyzeText(
        { text: value, note: finalNote || undefined, localHour },
        signal,
      )
      setDraft({
        kind: 'new',
        id: newId(),
        proposal,
        source: 'text',
        note: finalNote || null,
        photo: null,
        localHour,
      })
    })
  }

  const cancel = () => {
    abortRef.current?.abort()
    setPhase('idle')
  }

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

      <div
        role="tablist"
        aria-label="Modo de registro"
        className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800"
      >
        {(
          [
            ['photo', '📷 Foto'],
            ['text', '✏️ Escribir'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-lg font-semibold ${
              mode === m ? 'bg-white shadow dark:bg-gray-950' : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

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
      {error && <ErrorBox>{error}</ErrorBox>}

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
          <Button variant="secondary" disabled={busy} onClick={() => galleryRef.current?.click()}>
            Elegir de la galería
          </Button>
        </div>
      ) : (
        <Button className="min-h-14 text-lg" disabled={busy} onClick={onAnalyzeText}>
          Analizar
        </Button>
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
