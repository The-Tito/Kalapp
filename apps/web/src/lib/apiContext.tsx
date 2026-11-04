import { createContext, type ReactNode, useContext } from 'react'
import { type ApiClient, api as defaultApi } from './api'

const ApiContext = createContext<ApiClient>(defaultApi)

export function ApiProvider({ client, children }: { client?: ApiClient; children: ReactNode }) {
  return <ApiContext value={client ?? defaultApi}>{children}</ApiContext>
}

export function useApi(): ApiClient {
  return useContext(ApiContext)
}
