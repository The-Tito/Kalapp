import { formatBytes, MAX_IMAGE_BYTES } from '@kalapp/shared'

export interface CompressionStep {
  maxSide: number
  quality: number
}

/** 1024 px a 0.7; si pesa de más, baja la calidad y al final reduce a 800 px. */
export const COMPRESSION_STEPS: readonly CompressionStep[] = [
  { maxSide: 1024, quality: 0.7 },
  { maxSide: 1024, quality: 0.6 },
  { maxSide: 1024, quality: 0.5 },
  { maxSide: 1024, quality: 0.4 },
  { maxSide: 800, quality: 0.5 },
  { maxSide: 800, quality: 0.4 },
]

export type CompressionErrorCode = 'NOT_IMAGE' | 'DECODE_FAILED' | 'TOO_LARGE' | 'ENCODE_FAILED'

const COMPRESSION_MESSAGES: Record<CompressionErrorCode, string> = {
  NOT_IMAGE: 'El archivo no es una imagen. Elige una foto.',
  DECODE_FAILED: 'No pudimos leer la foto (puede estar dañada o en un formato no compatible).',
  TOO_LARGE: `No pudimos reducir la foto a menos de ${formatBytes(MAX_IMAGE_BYTES)}. Intenta con otra.`,
  ENCODE_FAILED: 'No pudimos procesar la foto. Intenta de nuevo.',
}

export class CompressionError extends Error {
  readonly code: CompressionErrorCode
  constructor(code: CompressionErrorCode) {
    super(COMPRESSION_MESSAGES[code])
    this.name = 'CompressionError'
    this.code = code
  }
}

/** Dimensiones para que el lado mayor quede ≤ `maxSide`, sin agrandar y sin bajar de 1 px. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) throw new CompressionError('DECODE_FAILED')
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width: Math.round(width), height: Math.round(height) }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

const HEIC_EXT = /\.(heic|heif)$/i

/** Acepta `image/*`; algunos iPhone entregan HEIC sin `type`, así que también se mira la extensión. */
export function looksLikeImage(file: { type: string; name?: string }): boolean {
  if (file.type) return file.type.startsWith('image/')
  return HEIC_EXT.test(file.name ?? '') || /\.(jpe?g|png|webp|gif)$/i.test(file.name ?? '')
}

export interface CompressionResult {
  blob: Blob
  width: number
  height: number
  quality: number
}

/**
 * Prueba los escalones en orden hasta que el JPEG quede ≤ `maxBytes`.
 * `encode` dibuja y codifica; se separa para poder probar la lógica sin canvas.
 */
export async function compressWithSteps(
  source: { width: number; height: number },
  encode: (size: { width: number; height: number }, quality: number) => Promise<Blob | null>,
  maxBytes: number = MAX_IMAGE_BYTES,
  steps: readonly CompressionStep[] = COMPRESSION_STEPS,
): Promise<CompressionResult> {
  for (const step of steps) {
    const size = fitWithin(source.width, source.height, step.maxSide)
    const blob = await encode(size, step.quality)
    if (!blob) throw new CompressionError('ENCODE_FAILED')
    if (blob.size <= maxBytes) return { blob, ...size, quality: step.quality }
  }
  throw new CompressionError('TOO_LARGE')
}

// ---------------------------------------------------------------------------
// Navegador (canvas)
// ---------------------------------------------------------------------------
interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release(): void
}

function loadWithImgElement(file: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new CompressionError('DECODE_FAILED'))
    }
    img.src = url
  })
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Safari viejo o HEIC no soportado por createImageBitmap: se intenta con <img>.
    }
  }
  return loadWithImgElement(file)
}

function canvasEncoder(image: DecodedImage) {
  const canvas = document.createElement('canvas')
  return (size: { width: number; height: number }, quality: number) =>
    new Promise<Blob | null>((resolve) => {
      canvas.width = size.width
      canvas.height = size.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.fillStyle = '#ffffff' // PNG con transparencia → fondo blanco en JPEG
      ctx.fillRect(0, 0, size.width, size.height)
      ctx.drawImage(image.source, 0, 0, size.width, size.height)
      canvas.toBlob(resolve, 'image/jpeg', quality)
    })
}

/** Convierte la foto (HEIC/JPEG/PNG) en JPEG ≤ 1024 px y ≤ MAX_IMAGE_BYTES. */
export async function compressImage(
  file: File,
  maxBytes: number = MAX_IMAGE_BYTES,
): Promise<CompressionResult> {
  if (!looksLikeImage(file)) throw new CompressionError('NOT_IMAGE')
  const image = await decodeImage(file)
  try {
    return await compressWithSteps(image, canvasEncoder(image), maxBytes)
  } finally {
    image.release()
  }
}

/** Data URL (para la miniatura que sobrevive a una recarga en sessionStorage). */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
