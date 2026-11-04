import { addDays, type ExportFormat } from '@kalapp/shared'
import { useState } from 'react'
import { type DownloadedFile, errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { todayIn } from '../lib/dates'
import { type DeliveryResult, deliverFile } from '../lib/exportFile'
import { Button, Card, ErrorBox } from './ui'

type Scope = 'all' | 'last30'

/** Rango de exportación: todo (sin fechas) o los últimos 30 días que terminan hoy. */
export function exportRange(scope: Scope, today: string): { from?: string; to?: string } {
  return scope === 'all' ? {} : { from: addDays(today, -29), to: today }
}

const RESULT_TEXT: Partial<Record<DeliveryResult, string>> = {
  shared: 'Listo.',
  downloaded: 'Archivo descargado.',
  cancelled: 'Se canceló.',
}

export function ExportCard({ timezone }: { timezone: string }) {
  const api = useApi()
  const [scope, setScope] = useState<Scope>('last30')
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** iOS pide un toque nuevo para compartir si la descarga tardó: se guarda el archivo. */
  const [ready, setReady] = useState<DownloadedFile | null>(null)

  const run = async (format: ExportFormat) => {
    if (busy) return
    setBusy(format)
    setError(null)
    setStatus(null)
    setReady(null)
    try {
      const file = await api.exportFile(format, exportRange(scope, todayIn(timezone)))
      const result = await deliverFile(file.blob, file.filename)
      if (result === 'needs-gesture') setReady(file)
      else setStatus(RESULT_TEXT[result] ?? null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const shareReady = async () => {
    if (!ready) return
    const result = await deliverFile(ready.blob, ready.filename)
    setReady(null)
    setStatus(RESULT_TEXT[result] ?? null)
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Exportar</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        CSV para Numbers o Excel; JSON con todo (perfil, comidas, pesos y favoritos).
      </p>
      <fieldset className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
        <legend className="sr-only">Rango</legend>
        {(
          [
            ['last30', 'Últimos 30 días'],
            ['all', 'Todo'],
          ] as const
        ).map(([value, label]) => (
          <label
            key={value}
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg text-sm font-semibold ${
              scope === value
                ? 'bg-white shadow dark:bg-gray-950'
                : 'text-gray-600 dark:text-gray-400'
            }`}
          >
            <input
              type="radio"
              name="export-scope"
              className="sr-only"
              checked={scope === value}
              onChange={() => setScope(value)}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={busy !== null} onClick={() => void run('csv')}>
          {busy === 'csv' ? 'Preparando…' : 'CSV'}
        </Button>
        <Button variant="secondary" disabled={busy !== null} onClick={() => void run('json')}>
          {busy === 'json' ? 'Preparando…' : 'JSON'}
        </Button>
      </div>
      {ready && <Button onClick={() => void shareReady()}>Compartir {ready.filename}</Button>}
      {status && (
        <p role="status" className="text-sm text-gray-600 dark:text-gray-400">
          {status}
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </Card>
  )
}
