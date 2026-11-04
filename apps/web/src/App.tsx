import { APP_NAME } from '@kalapp/shared'
import { useEffect, useState } from 'react'
import { checkHealth, type HealthStatus } from './lib/health'

const statusText: Record<HealthStatus, string> = {
  checking: 'Conectando con la API…',
  ok: 'API conectada',
  error: 'Sin conexión con la API',
}

export function App() {
  const [status, setStatus] = useState<HealthStatus>('checking')

  useEffect(() => {
    checkHealth().then(setStatus)
  }, [])

  return (
    <main className="mx-auto flex max-w-md flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-4xl font-bold text-green-600">{APP_NAME}</h1>
      <p className="text-gray-600">Calorías y macros desde una foto.</p>
      <p
        className={
          status === 'ok' ? 'text-green-700' : status === 'error' ? 'text-red-600' : 'text-gray-500'
        }
      >
        {statusText[status]}
      </p>
    </main>
  )
}
