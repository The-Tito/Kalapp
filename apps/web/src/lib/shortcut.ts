/** Ruta del Atajo de iOS (totales del día para Apple Salud). */
export const SHORTCUT_PATH = '/api/shortcut/today'

export function shortcutUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${SHORTCUT_PATH}`
}

/**
 * Token enmascarado para mostrarlo sin revelarlo: como máximo 1/4 del token y nunca más de
 * 4 caracteres visibles (mitad al inicio, mitad al final). ≤ 8 caracteres: solo puntos.
 */
export function maskToken(token: string | null): string {
  if (!token) return '—'
  if (token.length <= 8) return '•'.repeat(token.length)
  const visible = Math.min(4, Math.floor(token.length / 4))
  const head = Math.ceil(visible / 2)
  const tail = visible - head
  return `${token.slice(0, head)}${'•'.repeat(6)}${tail > 0 ? token.slice(-tail) : ''}`
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
