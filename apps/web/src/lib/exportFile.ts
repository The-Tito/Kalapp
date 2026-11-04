export type DeliveryResult = 'shared' | 'downloaded' | 'cancelled' | 'needs-gesture'

export interface DeliveryDeps {
  navigator?: Pick<Navigator, 'share' | 'canShare'> | undefined
  document?: Document | undefined
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
  FileCtor?: typeof File
}

function errName(err: unknown): string | undefined {
  return typeof err === 'object' && err !== null && 'name' in err
    ? String((err as { name: unknown }).name)
    : undefined
}

/** ¿Se puede compartir este archivo con la hoja de iOS? */
export function canShareFile(file: File, nav: DeliveryDeps['navigator']): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

/** Descarga con `<a download>` (escritorio y navegadores sin Web Share con archivos). */
export function downloadBlob(blob: Blob, filename: string, deps: DeliveryDeps = {}): void {
  const doc = deps.document ?? globalThis.document
  const create = deps.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b))
  const revoke = deps.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u))
  const url = create(blob)
  const a = doc.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  doc.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => revoke(url), 60_000)
}

/**
 * Entrega un archivo: en iOS abre la hoja de compartir (`navigator.share({ files })`) si
 * `canShare` lo permite; si no, lo descarga. Si iOS rechaza compartir porque se perdió el gesto
 * del usuario (después de un fetch largo) devuelve 'needs-gesture' para pedir otro toque.
 */
export async function deliverFile(
  blob: Blob,
  filename: string,
  deps: DeliveryDeps = {},
): Promise<DeliveryResult> {
  const nav = 'navigator' in deps ? deps.navigator : globalThis.navigator
  const FileCtor = deps.FileCtor ?? globalThis.File
  if (FileCtor) {
    const file = new FileCtor([blob], filename, { type: blob.type || 'application/octet-stream' })
    if (canShareFile(file, nav) && nav) {
      try {
        await nav.share({ files: [file], title: filename })
        return 'shared'
      } catch (err) {
        const name = errName(err)
        if (name === 'AbortError') return 'cancelled'
        if (name === 'NotAllowedError') return 'needs-gesture'
        // Otro fallo: se intenta descargar.
      }
    }
  }
  downloadBlob(blob, filename, deps)
  return 'downloaded'
}
