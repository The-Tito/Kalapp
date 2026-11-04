import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { tacosProposal } from '../test/fixtures'
import { ApiError } from './api'
import {
  backoffMs,
  MAX_ATTEMPTS,
  OfflineQueue,
  QUEUE_LIMIT,
  type QueueApi,
  QueueFullError,
} from './offlineQueue'

const entryInput = (id: string) => ({
  id,
  localDate: '2026-11-04',
  eatenAt: '2026-11-04T13:05:00-06:00',
  mealType: 'lunch' as const,
  source: 'photo' as const,
  note: null,
  title: 'Tacos',
  items: [{ name: 'Taco', grams: 100, kcal: 200, proteinG: 10, carbsG: 20, fatG: 8 }],
  aiModel: 'gemini-test',
  aiConfidence: 'medium' as const,
})

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let queue: OfflineQueue
let dbCount = 0

beforeEach(() => {
  queue = new OfflineQueue({
    name: `test-${dbCount++}`,
    indexedDB: new IDBFactory(),
    IDBKeyRange,
  })
})

afterEach(() => {
  queue.db.close()
})

function fakeApi(overrides: Partial<QueueApi> = {}): QueueApi & {
  createEntry: ReturnType<typeof vi.fn>
  analyzePhoto: ReturnType<typeof vi.fn>
  analyzeText: ReturnType<typeof vi.fn>
} {
  return {
    createEntry: vi.fn(overrides.createEntry ?? (async () => ({}))),
    analyzePhoto: vi.fn(overrides.analyzePhoto ?? (async () => tacosProposal)),
    analyzeText: vi.fn(overrides.analyzeText ?? (async () => tacosProposal)),
  } as never
}

const photo = (id: string) => ({
  id,
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }),
  note: 'frito',
  localHour: 13,
  localDate: '2026-11-04',
})

describe('cola sin internet', () => {
  it('encola comidas y fotos y cuenta por tipo', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    await queue.enqueuePhoto(photo(uuid(2)))
    expect(await queue.counts()).toEqual({
      pendingEntries: 1,
      queuedPhotos: 1,
      analyzedPhotos: 0,
      queuedTexts: 0,
      analyzedTexts: 0,
      total: 2,
    })
    const stored = await queue.get(uuid(2))
    expect(stored?.kind).toBe('photo')
    if (stored?.kind === 'photo') {
      expect(new Uint8Array(stored.data)).toEqual(new Uint8Array([1, 2, 3]))
      expect(stored.type).toBe('image/jpeg')
    }
  })

  it('es idempotente: el mismo id no se duplica', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    await queue.enqueueEntry({ ...entryInput(uuid(1)), title: 'Otra vez' })
    const c = await queue.counts()
    expect(c.pendingEntries).toBe(1)
    const it = await queue.get(uuid(1))
    expect(it?.kind === 'entry' && it.input.title).toBe('Otra vez')
  })

  it(`no acepta más de ${QUEUE_LIMIT} elementos (pero sí reemplazar uno existente)`, async () => {
    for (let i = 0; i < QUEUE_LIMIT; i++) await queue.enqueueEntry(entryInput(uuid(i)))
    await expect(queue.enqueueEntry(entryInput(uuid(99)))).rejects.toBeInstanceOf(QueueFullError)
    await expect(queue.enqueuePhoto(photo(uuid(98)))).rejects.toBeInstanceOf(QueueFullError)
    await expect(queue.enqueueEntry(entryInput(uuid(0)))).resolves.toBeUndefined()
    expect((await queue.counts()).total).toBe(QUEUE_LIMIT)
  })

  it('procesa: envía comidas (mismo id) y deja las fotos analizadas por revisar', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    await queue.enqueuePhoto(photo(uuid(2)))
    const api = fakeApi()
    const r = await queue.process(api)
    expect(r).toMatchObject({ sent: 1, analyzed: 1, discarded: [], retrying: 0 })
    expect(api.createEntry.mock.calls[0]?.[0].id).toBe(uuid(1))
    const [blob, params] = api.analyzePhoto.mock.calls[0] as [
      Blob,
      { note: string; localHour: number },
    ]
    expect(blob.type).toBe('image/jpeg')
    expect(params).toEqual({ note: 'frito', localHour: 13 })
    const analyzed = await queue.analyzedPhotos()
    expect(analyzed).toHaveLength(1)
    expect(analyzed[0]?.proposal?.title).toBe('Tacos al pastor')
    expect(await queue.counts()).toMatchObject({ pendingEntries: 0, analyzedPhotos: 1 })
    // Una segunda corrida no vuelve a analizar la foto ya analizada.
    await queue.process(api)
    expect(api.analyzePhoto).toHaveBeenCalledTimes(1)
  })

  it('4xx se descarta con aviso', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    await queue.enqueuePhoto(photo(uuid(2)))
    const api = fakeApi({
      createEntry: async () => {
        throw new ApiError('CONFLICT', 'Ya existe con otros datos', 409)
      },
      analyzePhoto: async () => {
        throw new ApiError('NOT_FOOD', undefined, 422)
      },
    })
    const r = await queue.process(api)
    expect(r.discarded.map((d) => d.kind)).toEqual(['entry', 'photo'])
    expect(r.discarded[0]?.message).toContain('Ya existe con otros datos')
    expect((await queue.counts()).total).toBe(0)
  })

  it('falla de red: conserva, programa backoff y se detiene', async () => {
    const now = 1_000_000
    await queue.enqueueEntry(entryInput(uuid(1)), now - 2)
    await queue.enqueueEntry(entryInput(uuid(2)), now - 1)
    const api = fakeApi({
      createEntry: async () => {
        throw new ApiError('NETWORK')
      },
    })
    const r = await queue.process(api, { now: () => now })
    expect(r).toMatchObject({ sent: 0, retrying: 2, discarded: [] })
    expect(api.createEntry).toHaveBeenCalledTimes(1) // se detuvo tras la primera falla de red
    const first = await queue.get(uuid(1))
    expect(first?.attempts).toBe(1)
    expect(first?.nextAttemptAt).toBe(now + backoffMs(1))
    expect(first?.lastError).toBe('Sin conexión. Revisa tu internet.')

    // Antes del backoff no reintenta; con `force` (evento online) sí.
    const ok = fakeApi()
    await queue.process(ok, { now: () => now + 1 })
    expect(ok.createEntry).toHaveBeenCalledTimes(1) // solo la segunda (sin backoff)
    await queue.process(ok, { now: () => now + 1, force: true })
    expect((await queue.counts()).total).toBe(0)
  })

  it('5xx y límite diario se reintentan; 401 detiene sin descartar', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    await queue.enqueuePhoto(photo(uuid(2)))
    const r = await queue.process(
      fakeApi({
        createEntry: async () => {
          throw new ApiError('INTERNAL', undefined, 500)
        },
        analyzePhoto: async () => {
          throw new ApiError('DAILY_LIMIT', undefined, 429)
        },
      }),
    )
    expect(r).toMatchObject({ retrying: 2, discarded: [] })

    const r2 = await queue.process(
      fakeApi({
        createEntry: async () => {
          throw new ApiError('UNAUTHORIZED', undefined, 401)
        },
      }),
      { force: true },
    )
    expect(r2.unauthorized).toBe(true)
    expect((await queue.counts()).total).toBe(2)
  })

  it('el backoff crece y tiene tope', () => {
    expect(backoffMs(1)).toBe(30_000)
    expect(backoffMs(2)).toBe(60_000)
    expect(backoffMs(20)).toBe(30 * 60_000)
  })

  it('llamadas simultáneas comparten la misma corrida', async () => {
    await queue.enqueueEntry(entryInput(uuid(1)))
    const api = fakeApi()
    const [a, b] = await Promise.all([queue.process(api), queue.process(api)])
    expect(a).toBe(b)
    expect(api.createEntry).toHaveBeenCalledTimes(1)
  })

  it('textos: se encolan, se analizan con analyzeText y quedan por revisar', async () => {
    await queue.enqueueText({
      id: uuid(5),
      text: '  2 tacos al pastor  ',
      note: 'con piña',
      localHour: 14,
      localDate: '2026-11-03',
    })
    expect(await queue.counts()).toMatchObject({ queuedTexts: 1, total: 1 })
    await expect(
      queue.enqueueText({
        id: uuid(6),
        text: '   ',
        note: null,
        localHour: 1,
        localDate: '2026-11-03',
      }),
    ).rejects.toThrow()
    const api = fakeApi()
    const r = await queue.process(api)
    expect(r.analyzed).toBe(1)
    expect(api.analyzeText).toHaveBeenCalledWith({
      text: '2 tacos al pastor',
      note: 'con piña',
      localHour: 14,
    })
    const [item] = await queue.analyzedItems()
    expect(item?.kind).toBe('text')
    expect(item?.localDate).toBe('2026-11-03')
    expect(await queue.counts()).toMatchObject({ queuedTexts: 0, analyzedTexts: 1 })
  })

  it(`tras ${MAX_ATTEMPTS} fallas del servidor se descarta con aviso; la red no cuenta`, async () => {
    await queue.enqueueEntry(entryInput(uuid(1)), 0)
    const offline = fakeApi({
      createEntry: async () => {
        throw new ApiError('NETWORK')
      },
    })
    for (let i = 0; i < MAX_ATTEMPTS + 3; i++) await queue.process(offline, { force: true })
    expect((await queue.counts()).pendingEntries).toBe(1) // sin red nunca se pierde

    const broken = fakeApi({
      createEntry: async () => {
        throw new ApiError('INTERNAL', undefined, 500)
      },
    })
    const results = []
    for (let i = 0; i < MAX_ATTEMPTS; i++)
      results.push(await queue.process(broken, { force: true }))
    expect(broken.createEntry).toHaveBeenCalledTimes(MAX_ATTEMPTS)
    expect(results.at(-1)?.discarded[0]?.message).toContain(`tras ${MAX_ATTEMPTS} intentos`)
    expect((await queue.counts()).total).toBe(0)
  })
})
