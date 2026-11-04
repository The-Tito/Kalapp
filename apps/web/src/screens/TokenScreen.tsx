import { APP_NAME } from '@kalapp/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { PlainShell } from '../components/Layout'
import { Button, ErrorBox, Field, inputClass } from '../components/ui'
import { ApiError, errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { queryKeys } from '../lib/queryClient'
import { tokenStore, useToken } from '../lib/token'

export function TokenScreen() {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const id = useId()
  const [token, setToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const hasToken = useToken() !== null

  const submit = async () => {
    const value = token.trim()
    if (!value) {
      setError('Escribe tu token')
      return
    }
    setPending(true)
    setError(null)
    try {
      const usage = await api.verifyToken(value)
      tokenStore.set(value)
      queryClient.clear()
      queryClient.setQueryData(queryKeys.usage, usage)
      navigate('/', { replace: true })
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'UNAUTHORIZED'
          ? 'Token incorrecto. Revísalo e intenta de nuevo.'
          : errorMessage(err),
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <PlainShell>
      <div className="flex flex-col gap-6 pt-10">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-green-600">{APP_NAME}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Calorías y macros desde una foto.</p>
        </div>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field
            id={id}
            label="Token de acceso"
            hint="Se guarda solo en este iPhone. Lo necesitas una sola vez."
          >
            <input
              id={id}
              type="password"
              autoComplete="current-password"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className={inputClass}
            />
          </Field>
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" disabled={pending}>
            {pending ? 'Verificando…' : 'Guardar'}
          </Button>
          {hasToken && (
            <Link
              to="/ajustes"
              className="inline-flex min-h-11 items-center justify-center font-semibold text-green-700 dark:text-green-400"
            >
              Volver sin cambiar
            </Link>
          )}
        </form>
      </div>
    </PlainShell>
  )
}
