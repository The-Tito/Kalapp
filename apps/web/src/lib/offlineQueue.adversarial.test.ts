import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tacosProposal } from '../test/fixtures'
import { ApiError } from './api'
import { OfflineQueue, QUEUE_LIMIT, type QueueApi, QueueFullError } from './offlineQueue'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const entryInput = (id: string, title = 'Tacos') => ({
  id,
  localDate: '2026-11-04',
  eatenAt: '2026-11-04T13:05:00-06:00',
  mealType: 'lunch' as const,
  source: 'photo' as const,
  note: null,
  title,
  items: [{ name: 'Taco', grams: 100, kcal: 200, proteinG: 10, carbsG: 20, fatG: 8 }],
  aiModel: 'gemini-test',
  aiConfidence: 'medium' as const,
})
const photo = (id: string) => ({
  id,
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  note: null,
  localHour: 13,
  localDate: '2026-11-04',
})

let queue: OfflineQueue
let n = 0
beforeEach(() => {
  queue = new OfflineQueue({ name: `adv-${n++}`, indexedDB: new IDBFactory(), IDBKeyRange })
})
afterEach(() => queue.db.close())

const api = (over: Partial<QueueApi> = {}) => ({
  createEntry: vi.fn(over.createEntry ?? (async () => ({}))),
  analyzePhoto: vi.fn(over.analyzePhoto ?? (async () => tacosProposal)),
})

describe('cola sin internet (adversarial)', () => {
  it('el elemento 21 lanza QueueFullError y no se guarda (mezclando fotos y comidas)', async () => {
    for (let i = 0; i < QUEUE_LIMIT; i++) {
      if (i % 2) await queue.enqueuePhoto(photo(uuid(i)))
      else await queue.enqueueEntry(entryInput(uuid(i)))
    }
    await expect(queue.enqueueEntry(entryInput(uuid(99)))).rejects.toBeInstanceOf(QueueFullError)
    await expect(queue.enqueuePhoto(photo(uuid(98)))).rejects.toBeInstanceOf(QueueFullError)
    expect((await queue.counts()).total).toBe(QUEUE_LIMIT)
  })

  it('mismo id dos veces reemplaza (incluso con la cola llena)', async () => {
    for (let i = 0; i < QUEUE_LIMIT; i++) await queue.enqueueEntry(entryInput(uuid(i)))
    await queue.enqueueEntry(entryInput(uuid(0), 'Editado'))
    const items = await queue.list()
    expect(items).toHaveLength(QUEUE_LIMIT)
    const first = items.find((i) => i.id === uuid(0))
    expect(first?.kind === 'entry' && first.input.title).toBe('Editado')
  })

  it('entrada inválida no entra a la cola', async () => {
    await expect(
      queue.enqueueEntry({ ...entryInput(uuid(1)), items: [] } as never),
    ).rejects.toThrow()
    expect(await queue.list()).toHaveLength(0)
  })

  it('IndexedDB que falla al abrir: las operaciones rechazan (no cuelgan) y process no lanza síncronamente', async () => {
    const broken = {
      open: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      deleteDatabase: () => ({}) as IDBOpenDBRequest,
      cmp: () => 0,
      databases: async () => [],
    } as unknown as IDBFactory
    const q = new OfflineQueue({ name: 'broken', indexedDB: broken, IDBKeyRange })
    await expect(q.counts()).rejects.toBeTruthy()
    await expect(q.enqueueEntry(entryInput(uuid(1)))).rejects.toBeTruthy()
    const p = q.process(api())
    await expect(p).rejects.toBeTruthy()
  })

  it('401 a mitad: pausa, conserva lo pendiente y no descarta nada', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)), 1)
    await queue.enqueueEntry(entryInput(uuid(2)), 2)
    await queue.enqueuePhoto(photo(uuid(3)), 3)
    let calls = 0
    const a = api({
      createEntry: async () => {
        calls++
        if (calls === 2) throw new ApiError('UNAUTHORIZED', undefined, 401)
        return {}
      },
    })
    const r = await queue.process(a, { force: true })
    expect(r.unauthorized).toBe(true)
    expect(r.sent).toBe(1)
    expect(r.discarded).toEqual([])
    expect(a.analyzePhoto).not.toHaveBeenCalled()
    const ids = (await queue.list()).map((i) => i.id)
    expect(ids).toEqual([uuid(2), uuid(3)])
    // El elemento del 401 no se penaliza con backoff.
    const second = await queue.get(uuid(2))
    expect(second?.attempts).toBe(0)
  })

  it('401 sin token (cliente lanza antes de la red) también pausa sin descartar', async () => {
    await queue.enqueuePhoto(photo(uuid(1)))
    const r = await queue.process(
      api({
        analyzePhoto: async () => {
          throw new ApiError('UNAUTHORIZED', undefined, 401)
        },
      }),
    )
    expect(r.unauthorized).toBe(true)
    expect(await queue.list()).toHaveLength(1)
  })

  it('429 se reintenta (no se descarta) con backoff', async () => {
    await queue.enqueuePhoto(photo(uuid(1)), 0)
    const r = await queue.process(
      api({
        analyzePhoto: async () => {
          throw new ApiError('DAILY_LIMIT', undefined, 429)
        },
      }),
      { now: () => 1000 },
    )
    expect(r.discarded).toEqual([])
    expect(r.retrying).toBe(1)
    const it = await queue.get(uuid(1))
    expect(it?.attempts).toBe(1)
    expect(it?.nextAttemptAt).toBeGreaterThan(1000)
  })

  it('400 descarta con aviso en español y sigue con los demás', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)), 1)
    await queue.enqueueEntry(entryInput(uuid(2)), 2)
    let calls = 0
    const r = await queue.process(
      api({
        createEntry: async () => {
          calls++
          if (calls === 1) throw new ApiError('VALIDATION', 'Los datos no son válidos', 400)
          return {}
        },
      }),
    )
    expect(r.discarded).toHaveLength(1)
    expect(r.discarded[0]?.message).toMatch(/Una comida pendiente no se pudo guardar/)
    expect(r.sent).toBe(1)
    expect(await queue.list()).toHaveLength(0)
  })

  it('foto con datos corruptos (415 del servidor) se descarta con aviso', async () => {
    await queue.enqueuePhoto(photo(uuid(1)))
    // Corrompe los datos guardados.
    await queue.db.items.update(uuid(1), { data: new ArrayBuffer(0), type: '' } as never)
    const r = await queue.process(
      api({
        analyzePhoto: async () => {
          throw new ApiError('UNSUPPORTED_MEDIA', undefined, 415)
        },
      }),
    )
    expect(r.discarded).toHaveLength(1)
    expect(r.discarded[0]?.kind).toBe('photo')
  })

  it('elemento con data no-ArrayBuffer (registro corrupto) no rompe la corrida', async () => {
    await queue.enqueuePhoto(photo(uuid(1)))
    await queue.enqueueEntry(entryInput(uuid(2)), Date.now() + 1)
    await queue.db.items.update(uuid(1), { data: null } as never)
    const a = api()
    const r = await queue.process(a, { force: true })
    expect(a.createEntry).toHaveBeenCalledTimes(1)
    expect(r.sent).toBe(1)
  })

  it('carrera: online + visibilitychange simultáneos no duplican envíos', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    await queue.enqueueEntry(entryInput(uuid(2)))
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => {
      release = r
    })
    const a = api({
      createEntry: async () => {
        await gate
        return {}
      },
    })
    const p1 = queue.process(a, { force: true })
    const p2 = queue.process(a)
    const p3 = queue.process(a, { force: true })
    release()
    const [r1, r2, r3] = await Promise.all([p1, p2, p3])
    expect(a.createEntry).toHaveBeenCalledTimes(2)
    expect(r1).toBe(r2)
    expect(r2).toBe(r3)
  })

  it('BUG: una foto cuya respuesta nunca valida (INVALID_RESPONSE) se reanaliza sin límite de intentos', async () => {
    await queue.enqueuePhoto(photo(uuid(1)), 0)
    const a = api({
      analyzePhoto: async () => {
        throw new ApiError('INVALID_RESPONSE')
      },
    })
    for (let i = 0; i < 12; i++) await queue.process(a, { force: true })
    // Cada intento consume un análisis de Gemini (límite diario). Debería rendirse/descartar.
    expect(a.analyzePhoto.mock.calls.length).toBeLessThanOrEqual(10)
  })

  it('una falla de red detiene la corrida (no martilla los siguientes)', async () => {
    for (let i = 1; i <= 5; i++) await queue.enqueueEntry(entryInput(uuid(i)), i)
    const a = api({
      createEntry: async () => {
        throw new ApiError('NETWORK')
      },
    })
    await queue.process(a, { force: true })
    expect(a.createEntry).toHaveBeenCalledTimes(1)
  })
})
