export type HealthStatus = 'checking' | 'ok' | 'error'

export async function checkHealth(fetchFn: typeof fetch = fetch): Promise<HealthStatus> {
  try {
    const res = await fetchFn('/api/health')
    if (!res.ok) return 'error'
    const body = (await res.json()) as { status?: string }
    return body.status === 'ok' ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}
