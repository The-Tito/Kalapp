// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render } from '@testing-library/react'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, memoryStorage } from '../test/fixtures'
import { createApiClient } from './api'
import { ApiProvider } from './apiContext'
import { OfflineQueue } from './offlineQueue'
import { QueueProvider } from './queueContext'
import { createTokenStore } from './token'

afterEach(cleanup)

const entry = (id: string) => ({
  id,
  localDate: '2026-11-04',
  eatenAt: '2026-11-04T13:05:00-06:00',
  mealType: 'lunch' as const,
  source: 'photo' as const,
  note: null,
  title: 'Tacos',
  items: [{ name: 'Taco', grams: 100, kcal: 200, proteinG: 10, carbsG: 20, fatG: 8 }],
  aiModel: null,
  aiConfidence: null,
})

function mount(queue: OfflineQueue | null, fetchFn: typeof fetch, loaderFails = false) {
  const tokens = createTokenStore(() => memoryStorage())
  tokens.set('secreto')
  const api = createApiClient({ fetchFn, tokenStore: tokens })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const loader = loaderFails
    ? async () => {
        throw new DOMException('blocked', 'SecurityError')
      }
    : async () => queue
  return render(
    <QueryClientProvider client={qc}>
      <ApiProvider client={api}>
        <QueueProvider loader={loader}>
          <p>app</p>
        </QueueProvider>
      </ApiProvider>
    </QueryClientProvider>,
  )
}

describe('QueueProvider (adversarial)', () => {
  it('online + visibilitychange + montaje simultáneos envían cada comida una sola vez', async () => {
    const queue = new OfflineQueue({ name: 'qc-race', indexedDB: new IDBFactory(), IDBKeyRange })
    await queue.enqueueEntry(entry('00000000-0000-4000-8000-000000000001'))
    await queue.enqueueEntry(entry('00000000-0000-4000-8000-000000000002'))
    const fetchFn = vi.fn(async (_u: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((r) => setTimeout(r, 20))
      return jsonResponse(
        {
          ...JSON.parse(String(init?.body)),
          totals: { kcal: 200, proteinG: 10, carbsG: 20, fatG: 8 },
          createdAt: '2026-11-04T19:00:00Z',
        },
        201,
      )
    })
    mount(queue, fetchFn as unknown as typeof fetch)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new Event('online'))
    })
    await vi.waitFor(async () => expect(await queue.list()).toHaveLength(0))
    const ids = fetchFn.mock.calls.map((c) => JSON.parse(String(c[1]?.body)).id)
    expect(ids.sort()).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ])
    queue.db.close()
  })

  it('loader de la cola que falla (IndexedDB bloqueado) no rompe la app', async () => {
    const onError = vi.fn()
    window.addEventListener('unhandledrejection', onError)
    const fetchFn = vi.fn(async () => jsonResponse({}))
    const r = mount(null, fetchFn as unknown as typeof fetch, true)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
    })
    expect(r.getByText('app')).toBeTruthy()
    expect(fetchFn).not.toHaveBeenCalled()
    window.removeEventListener('unhandledrejection', onError)
    expect(onError).not.toHaveBeenCalled()
  })
})
