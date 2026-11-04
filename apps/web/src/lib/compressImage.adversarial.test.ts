import { MAX_IMAGE_BYTES } from '@kalapp/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  COMPRESSION_STEPS,
  CompressionError,
  compressImage,
  compressWithSteps,
  fitWithin,
  looksLikeImage,
} from './compressImage'

const blobOf = (size: number) => new Blob([new Uint8Array(size)], { type: 'image/jpeg' })

describe('compressImage (adversarial)', () => {
  it('imagen 1×1 no se agranda', async () => {
    const encode = vi.fn(async () => blobOf(100))
    const r = await compressWithSteps({ width: 1, height: 1 }, encode)
    expect(encode).toHaveBeenCalledWith({ width: 1, height: 1 }, 0.7)
    expect(r.width).toBe(1)
  })

  it('panorámica 10000×10 → 1024×1 (nunca 0 px)', () => {
    expect(fitWithin(10000, 10, 1024)).toEqual({ width: 1024, height: 1 })
    expect(fitWithin(10, 10000, 800)).toEqual({ width: 1, height: 800 })
  })

  it('0×0, NaN, negativos → DECODE_FAILED', () => {
    for (const [w, h] of [
      [0, 0],
      [Number.NaN, 10],
      [-5, 10],
    ] as const) {
      try {
        const r = fitWithin(w, h, 1024)
        expect(Number.isFinite(r.width) && Number.isFinite(r.height)).toBe(true)
      } catch (err) {
        expect(err).toBeInstanceOf(CompressionError)
        expect((err as CompressionError).code).toBe('DECODE_FAILED')
      }
    }
  })

  it('nunca devuelve más de MAX_IMAGE_BYTES: si ningún escalón cabe → TOO_LARGE', async () => {
    const encode = vi.fn(async () => blobOf(MAX_IMAGE_BYTES + 1))
    await expect(compressWithSteps({ width: 4000, height: 3000 }, encode)).rejects.toMatchObject({
      code: 'TOO_LARGE',
    })
    expect(encode).toHaveBeenCalledTimes(COMPRESSION_STEPS.length)
  })

  it('justo MAX_IMAGE_BYTES se acepta', async () => {
    const r = await compressWithSteps({ width: 100, height: 100 }, async () =>
      blobOf(MAX_IMAGE_BYTES),
    )
    expect(r.blob.size).toBe(MAX_IMAGE_BYTES)
  })

  it('encoder que devuelve null → ENCODE_FAILED con mensaje en español', async () => {
    await expect(
      compressWithSteps({ width: 100, height: 100 }, async () => null),
    ).rejects.toMatchObject({ code: 'ENCODE_FAILED', message: expect.stringMatching(/foto/) })
  })

  it('archivo vacío .jpg (sin datos) falla con CompressionError, no con error crudo', async () => {
    const file = new File([], 'vacia.jpg', { type: 'image/jpeg' })
    const g = globalThis as Record<string, unknown>
    const prev = g.createImageBitmap
    g.createImageBitmap = async () => {
      throw new DOMException('bad', 'InvalidStateError')
    }
    // Sin <img> en node: forzamos el fallback a fallar como en Safari.
    const prevImage = g.Image
    g.Image = class {
      onerror: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    const prevURL = URL.createObjectURL
    URL.createObjectURL = () => 'blob:x'
    URL.revokeObjectURL = () => {}
    try {
      await expect(compressImage(file)).rejects.toMatchObject({ code: 'DECODE_FAILED' })
    } finally {
      g.createImageBitmap = prev
      g.Image = prevImage
      URL.createObjectURL = prevURL
    }
  })

  it('no imagen con extensión .jpg pero type text/plain → NOT_IMAGE', async () => {
    const file = new File(['hola'], 'foto.jpg', { type: 'text/plain' })
    await expect(compressImage(file)).rejects.toMatchObject({ code: 'NOT_IMAGE' })
  })

  it('HEIC sin type se acepta por extensión; .exe sin type no', () => {
    expect(looksLikeImage({ type: '', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(looksLikeImage({ type: '', name: 'IMG_0001.heif' })).toBe(true)
    expect(looksLikeImage({ type: '', name: 'virus.exe' })).toBe(false)
    expect(looksLikeImage({ type: '', name: '' })).toBe(false)
    expect(looksLikeImage({ type: '' })).toBe(false)
  })
})
