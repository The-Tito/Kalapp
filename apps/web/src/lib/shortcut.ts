/** Ruta del Atajo de iOS (totales del día para Apple Salud). */
export const SHORTCUT_PATH = '/api/shortcut/today'

export function shortcutUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${SHORTCUT_PATH}`
}

/** Token enmascarado para mostrarlo sin revelarlo: "abcd••••••wxyz" (o solo puntos si es corto). */
export function maskToken(token: string | null): string {
  if (!token) return '—'
  if (token.length <= 8) return '•'.repeat(token.length)
  return `${token.slice(0, 4)}${'•'.repeat(6)}${token.slice(-4)}`
}

/** Copia al portapapeles; `false` si el navegador no lo permite. */
export async function copyText(text: string, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard?.writeText) return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
