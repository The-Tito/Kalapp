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

describe('fitWithin', () => {
  it('escala el lado mayor a 1024 manteniendo proporción', () => {
    expect(fitWithin(4032, 3024, 1024)).toEqual({ width: 1024, height: 768 })
    expect(fitWithin(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 })
  })
  it('no agranda imágenes pequeñas', () => {
    expect(fitWithin(640, 480, 1024)).toEqual({ width: 640, height: 480 })
  })
  it('nunca baja de 1 px', () => {
    expect(fitWithin(10000, 2, 1024)).toEqual({ width: 1024, height: 1 })
  })
  it('rechaza dimensiones inválidas', () => {
    expect(() => fitWithin(0, 100, 1024)).toThrow(CompressionError)
  })
})

describe('compressWithSteps', () => {
  it('se queda en el primer escalón (1024 px, 0.7) si cabe', async () => {
    const encode = vi.fn(async () => blobOf(150_000))
    const r = await compressWithSteps({ width: 4032, height: 3024 }, encode)
    expect(encode).toHaveBeenCalledTimes(1)
    expect(encode).toHaveBeenCalledWith({ width: 1024, height: 768 }, 0.7)
    expect(r.quality).toBe(0.7)
    expect(r.blob.size).toBeLessThanOrEqual(MAX_IMAGE_BYTES)
  })

  it('baja la calidad 0.6 → 0.5 → 0.4 y luego reduce a 800 px', async () => {
    const calls: [number, number][] = []
    const encode = vi.fn(async (size: { width: number; height: number }, q: number) => {
      calls.push([Math.max(size.width, size.height), q])
      return blobOf(size.width > 800 || q > 0.5 ? 2_000_000 : 900_000)
    })
    const r = await compressWithSteps({ width: 3000, height: 3000 }, encode)
    expect(calls).toEqual([
      [1024, 0.7],
      [1024, 0.6],
      [1024, 0.5],
      [1024, 0.4],
      [800, 0.5],
    ])
    expect(r).toMatchObject({ width: 800, height: 800, quality: 0.5 })
  })

  it('si ningún escalón cabe → TOO_LARGE', async () => {
    const encode = vi.fn(async () => blobOf(MAX_IMAGE_BYTES + 1))
    await expect(compressWithSteps({ width: 2000, height: 1000 }, encode)).rejects.toMatchObject({
      code: 'TOO_LARGE',
    })
    expect(encode).toHaveBeenCalledTimes(COMPRESSION_STEPS.length)
  })

  it('si el canvas no produce blob → ENCODE_FAILED', async () => {
    await expect(
      compressWithSteps({ width: 100, height: 100 }, async () => null),
    ).rejects.toMatchObject({ code: 'ENCODE_FAILED' })
  })
})

describe('looksLikeImage / compressImage', () => {
  it('acepta image/* y HEIC sin tipo', () => {
    expect(looksLikeImage({ type: 'image/heic' })).toBe(true)
    expect(looksLikeImage({ type: '', name: 'IMG_0001.HEIC' })).toBe(true)
    expect(looksLikeImage({ type: 'application/pdf', name: 'menu.pdf' })).toBe(false)
    expect(looksLikeImage({ type: '', name: 'notas.txt' })).toBe(false)
  })

  it('rechaza archivos que no son imagen con mensaje claro', async () => {
    const file = new File(['hola'], 'notas.txt', { type: 'text/plain' })
    await expect(compressImage(file)).rejects.toMatchObject({
      code: 'NOT_IMAGE',
      message: 'El archivo no es una imagen. Elige una foto.',
    })
  })
})
