import {
  type BarcodeProduct,
  DEFAULT_TIMEZONE,
  formatGrams,
  formatKcal,
  formatNumber,
  productToItem,
  toLocalHour,
} from '@kalapp/shared'
import { useMutation } from '@tanstack/react-query'
import { BrowserMultiFormatReader, type IScannerControls } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useApi } from '../lib/apiContext'
import {
  barcodeErrorMessage,
  buildBarcodeDraft,
  cameraErrorMessage,
  defaultGrams,
  normalizeBarcode,
  parseGrams,
} from '../lib/barcode'
import { useDraft } from '../lib/draft'
import { useProfileQuery } from '../lib/queries'
import { newId } from '../lib/uuid'
import { Button, Card, ErrorBox, Field, inputClass, Spinner } from './ui'

/** Formatos de productos empacados. */
export const BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
] as const

function Scanner({ onCode, onError }: { onCode(code: string): void; onError(err: unknown): void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const onCodeRef = useRef(onCode)
  const onErrorRef = useRef(onError)
  onCodeRef.current = onCode
  onErrorRef.current = onError

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let controls: IScannerControls | undefined
    let done = false
    const hints = new Map<DecodeHintType, unknown>([
      [DecodeHintType.POSSIBLE_FORMATS, [...BARCODE_FORMATS]],
    ])
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 })
    // deviceId undefined → cámara trasera (facingMode: environment).
    reader
      .decodeFromVideoDevice(undefined, video, (result, _err, ctrl) => {
        if (!result || done) return
        const code = normalizeBarcode(result.getText())
        if (!code) return
        done = true
        ctrl.stop()
        onCodeRef.current(code)
      })
      .then((c) => {
        controls = c
        if (done) c.stop()
      })
      .catch((err: unknown) => {
        if (!done) onErrorRef.current(err)
      })
    return () => {
      done = true
      controls?.stop()
    }
  }, [])

  return (
    <div className="relative overflow-hidden rounded-2xl bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        autoPlay
        aria-label="Vista de la cámara para escanear"
        className="aspect-[4/3] w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80"
      />
    </div>
  )
}

function ProductCard({
  product,
  onReview,
}: {
  product: BarcodeProduct
  onReview(grams: number): void
}) {
  const uid = useId()
  const [gramsText, setGramsText] = useState(String(defaultGrams(product)))
  const check = parseGrams(gramsText)
  let preview: { kcal: number; error: string | null } = { kcal: 0, error: null }
  if (check.ok) {
    try {
      preview = { kcal: productToItem(product, check.grams).kcal, error: null }
    } catch {
      preview = { kcal: 0, error: 'Con esa cantidad los valores salen de rango.' }
    }
  }
  const p = product.per100g
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{product.name}</h2>
        {product.brand && (
          <p className="text-sm text-gray-600 dark:text-gray-400">{product.brand}</p>
        )}
      </div>
      <p className="text-sm tabular-nums text-gray-700 dark:text-gray-300">
        Por 100 g: <strong>{formatKcal(p.kcal)}</strong> · P {formatGrams(p.proteinG)} · C{' '}
        {formatGrams(p.carbsG)} · G {formatGrams(p.fatG)}
      </p>
      {product.servingGrams && (
        <p className="text-xs text-gray-500">
          Porción del empaque: {formatNumber(product.servingGrams, 1)} g
        </p>
      )}
      <Field
        id={`${uid}-g`}
        label="¿Cuántos gramos comiste?"
        error={check.ok ? (preview.error ?? undefined) : check.message}
      >
        <input
          id={`${uid}-g`}
          inputMode="decimal"
          value={gramsText}
          onChange={(e) => setGramsText(e.target.value)}
          className={`${inputClass} tabular-nums`}
        />
      </Field>
      {check.ok && !preview.error && (
        <p className="text-center text-2xl font-bold tabular-nums">{formatKcal(preview.kcal)}</p>
      )}
      <Button
        className="min-h-14 text-lg"
        disabled={!check.ok || preview.error !== null}
        onClick={() => check.ok && onReview(check.grams)}
      >
        Revisar
      </Button>
    </Card>
  )
}

/** Pestaña Código de Capturar: escáner (zxing) + respaldo de captura manual. */
export default function BarcodePanel({ targetDate }: { targetDate: string | null }) {
  const api = useApi()
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const uid = useId()
  const timezone = useProfileQuery().data?.timezone ?? DEFAULT_TIMEZONE
  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const canScan = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const lookup = useMutation({ mutationFn: (code: string) => api.getBarcode(code) })

  const find = (code: string) => {
    setScanning(false)
    setManual(code)
    setReviewError(null)
    lookup.mutate(code)
  }

  const onManual = () => {
    const code = normalizeBarcode(manual)
    if (!code) {
      setManualError('Escribe de 6 a 14 dígitos (están debajo de las barras).')
      return
    }
    setManualError(null)
    find(code)
  }

  const review = (product: BarcodeProduct, grams: number) => {
    try {
      setDraft(
        buildBarcodeDraft({
          id: newId(),
          product,
          grams,
          localHour: toLocalHour(new Date(), timezone),
          localDate: targetDate,
        }),
      )
      navigate('/revisar')
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : 'No pudimos preparar el producto.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {scanning ? (
        <div className="flex flex-col gap-2">
          <Scanner
            onCode={find}
            onError={(err) => {
              setScanning(false)
              setCameraError(cameraErrorMessage(err))
            }}
          />
          <p className="text-center text-sm text-gray-600 dark:text-gray-400">
            Apunta a las barras del empaque.
          </p>
          <Button variant="secondary" onClick={() => setScanning(false)}>
            Detener cámara
          </Button>
        </div>
      ) : (
        canScan && (
          <Button
            className="min-h-14 text-lg"
            onClick={() => {
              setCameraError(null)
              lookup.reset()
              setScanning(true)
            }}
          >
            ▥ Escanear código
          </Button>
        )
      )}
      {cameraError && <ErrorBox>{cameraError}</ErrorBox>}

      <form
        noValidate
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          onManual()
        }}
      >
        <Field
          id={`${uid}-code`}
          label="O escribe el código"
          hint="Los números debajo de las barras (EAN-13, EAN-8, UPC)."
          error={manualError ?? undefined}
        >
          <input
            id={`${uid}-code`}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={20}
            placeholder="7501055300075"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={lookup.isPending}>
          Buscar producto
        </Button>
      </form>

      {lookup.isPending && <Spinner label="Buscando en Open Food Facts…" />}
      {lookup.isError && <ErrorBox>{barcodeErrorMessage(lookup.error)}</ErrorBox>}
      {lookup.isSuccess && (
        <ProductCard
          key={lookup.data.code}
          product={lookup.data}
          onReview={(g) => review(lookup.data, g)}
        />
      )}
      {reviewError && <ErrorBox>{reviewError}</ErrorBox>}
    </div>
  )
}
