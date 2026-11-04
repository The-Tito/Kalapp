import { describe, expect, it } from 'vitest'
import { checkHealth } from './health'

const fakeFetch = (res: Response | Error) =>
  (async () => {
    if (res instanceof Error) throw res
    return res
  }) as unknown as typeof fetch

describe('checkHealth', () => {
  it('devuelve ok cuando la API responde ok', async () => {
    expect(await checkHealth(fakeFetch(Response.json({ status: 'ok' })))).toBe('ok')
  })

  it('devuelve error si la API falla o no hay red', async () => {
    expect(await checkHealth(fakeFetch(new Response('x', { status: 500 })))).toBe('error')
    expect(await checkHealth(fakeFetch(new Error('offline')))).toBe('error')
  })
})
