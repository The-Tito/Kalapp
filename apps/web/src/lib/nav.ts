/** URL de Hoy en un día (null = hoy) con indicadores opcionales (ej. `cola=foto`). */
export function todayUrl(localDate: string | null, flags: Record<string, string> = {}): string {
  const sp = new URLSearchParams()
  if (localDate) sp.set('fecha', localDate)
  for (const [k, v] of Object.entries(flags)) sp.set(k, v)
  const q = sp.toString()
  return q ? `/?${q}` : '/'
}

/** URL de Capturar para un día (null = hoy). */
export function captureUrl(localDate: string | null, mode?: string): string {
  const sp = new URLSearchParams()
  if (localDate) sp.set('fecha', localDate)
  if (mode && mode !== 'photo') sp.set('modo', mode)
  const q = sp.toString()
  return q ? `/capturar?${q}` : '/capturar'
}
