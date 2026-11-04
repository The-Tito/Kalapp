import {
  type AnalysisProposal,
  AnalysisProposalSchema,
  type AnalyzeTextRequest,
  type EntryInput,
  EntryInputSchema,
} from '@kalapp/shared'
import { Dexie, type Table } from 'dexie'
import { ApiError, errorMessage } from './api'

/** Máximo de elementos en la cola (fotos + comidas). */
export const QUEUE_LIMIT = 20

/**
 * Máximo de intentos fallidos con respuesta del servidor (5xx, respuesta inválida) por elemento;
 * después se descarta con aviso (cada análisis fallido consume el límite diario). Las fallas
 * de red y el límite diario (429) no cuentan: no llegaron a gastar nada y no se pierden datos.
 */
export const MAX_ATTEMPTS = 5

/** Reintento: 30 s, 1 min, 2 min… hasta 30 min. */
export function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** Math.max(0, attempts - 1), 30 * 60_000)
}

interface QueuedBase {
  id: string
  createdAt: number
  attempts: number
  /** Intentos fallidos que sí cuentan para `MAX_ATTEMPTS`. */
  failures?: number
  /** Epoch ms; antes de esto no se reintenta. */
  nextAttemptAt: number
  lastError: string | null
}

/** Comida que no se pudo enviar (POST /api/entries). El id es el del registro: idempotente. */
export interface QueuedEntry extends QueuedBase {
  kind: 'entry'
  input: EntryInput
}

/** Foto que no se pudo analizar. Se guarda como ArrayBuffer (más fiable que Blob en Safari). */
export interface QueuedPhoto extends QueuedBase {
  kind: 'photo'
  data: ArrayBuffer
  type: string
  note: string | null
  localHour: number
  localDate: string
  status: 'queued' | 'analyzed'
  proposal: AnalysisProposal | null
}

/** Texto ("¿Qué comiste?") que no se pudo analizar por falta de red. */
export interface QueuedText extends QueuedBase {
  kind: 'text'
  text: string
  note: string | null
  localHour: number
  localDate: string
  status: 'queued' | 'analyzed'
  proposal: AnalysisProposal | null
}

/** Elementos que se analizan y luego quedan "por revisar". */
export type QueuedAnalysis = QueuedPhoto | QueuedText

export type QueuedItem = QueuedEntry | QueuedAnalysis

export class QueueFullError extends Error {
  constructor() {
    super(
      `La cola sin internet está llena (${QUEUE_LIMIT} elementos). Conéctate para enviar los pendientes.`,
    )
    this.name = 'QueueFullError'
  }
}

export interface QueueApi {
  createEntry(input: EntryInput): Promise<unknown>
  analyzePhoto(
    image: Blob,
    params: { note?: string; localHour?: number },
  ): Promise<AnalysisProposal>
  /** Opcional: sin él los textos en cola se quedan esperando. */
  analyzeText?(input: AnalyzeTextRequest): Promise<AnalysisProposal>
}

export interface DiscardNotice {
  id: string
  kind: QueuedItem['kind']
  message: string
}

export interface ProcessResult {
  sent: number
  analyzed: number
  discarded: DiscardNotice[]
  /** Quedaron para reintentar (red, 5xx, límite diario). */
  retrying: number
  /** Se detuvo por 401: hay que volver a capturar el token. */
  unauthorized: boolean
}

export interface QueueCounts {
  pendingEntries: number
  queuedPhotos: number
  analyzedPhotos: number
  queuedTexts: number
  analyzedTexts: number
  total: number
}

type QueueDb = Dexie & { items: Table<QueuedItem, string> }

export interface OfflineQueueOptions {
  name?: string
  /** Para pruebas (fake-indexeddb). */
  indexedDB?: IDBFactory
  IDBKeyRange?: typeof IDBKeyRange
}

/** ¿Este error amerita reintento (y no descartar)? */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true
  if (err.code === 'NETWORK' || err.code === 'ABORTED' || err.code === 'INVALID_RESPONSE')
    return true
  // El límite diario se reinicia: no tiene sentido tirar la foto.
  if (err.code === 'DAILY_LIMIT' || err.status === 429) return true
  return err.status >= 500 || err.status === 0
}

/** ¿Este fallo reintentable cuenta para el máximo de intentos? */
function countsAsFailure(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true
  if (err.code === 'NETWORK' || err.code === 'ABORTED') return false
  return !(err.code === 'DAILY_LIMIT' || err.status === 429)
}

const SUBJECT: Record<QueuedItem['kind'], [string, string]> = {
  entry: ['Una comida pendiente', 'guardar'],
  photo: ['Una foto pendiente', 'analizar'],
  text: ['Una descripción pendiente', 'analizar'],
}

const discardMessage = (kind: QueuedItem['kind'], err: unknown, gaveUp = false) => {
  const [who, verb] = SUBJECT[kind]
  return gaveUp
    ? `${who} no se pudo ${verb} tras ${MAX_ATTEMPTS} intentos y se quitó de la cola: ${errorMessage(err)}`
    : `${who} no se pudo ${verb} y se quitó de la cola: ${errorMessage(err)}`
}

export class OfflineQueue {
  readonly db: QueueDb
  private running: Promise<ProcessResult> | null = null

  constructor(options: OfflineQueueOptions = {}) {
    const deps =
      options.indexedDB && options.IDBKeyRange
        ? { indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange }
        : undefined
    this.db = new Dexie(options.name ?? 'kalapp-offline', deps) as QueueDb
    this.db.version(1).stores({ items: 'id, kind, createdAt' })
  }

  async list(): Promise<QueuedItem[]> {
    return this.db.items.orderBy('createdAt').toArray()
  }

  async counts(): Promise<QueueCounts> {
    const items = await this.db.items.toArray()
    const c: QueueCounts = {
      pendingEntries: 0,
      queuedPhotos: 0,
      analyzedPhotos: 0,
      queuedTexts: 0,
      analyzedTexts: 0,
      total: items.length,
    }
    for (const it of items) {
      if (it.kind === 'entry') c.pendingEntries++
      else if (it.kind === 'photo') it.status === 'analyzed' ? c.analyzedPhotos++ : c.queuedPhotos++
      else it.status === 'analyzed' ? c.analyzedTexts++ : c.queuedTexts++
    }
    return c
  }

  async get(id: string): Promise<QueuedItem | undefined> {
    return this.db.items.get(id)
  }

  async remove(id: string): Promise<void> {
    await this.db.items.delete(id)
  }

  private async ensureRoom(id: string): Promise<void> {
    if (await this.db.items.get(id)) return // reemplazo: no ocupa lugar nuevo
    if ((await this.db.items.count()) >= QUEUE_LIMIT) throw new QueueFullError()
  }

  /** Encola una comida. Mismo id = se reemplaza (idempotente). */
  async enqueueEntry(input: EntryInput, now = Date.now()): Promise<void> {
    const parsed = EntryInputSchema.parse(input)
    await this.db.transaction('rw', this.db.items, async () => {
      await this.ensureRoom(parsed.id)
      await this.db.items.put({
        kind: 'entry',
        id: parsed.id,
        input: parsed,
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
      })
    })
  }

  /** Encola una foto comprimida para analizarla al volver la red. */
  async enqueuePhoto(
    p: {
      id: string
      blob: Blob
      note: string | null
      localHour: number
      localDate: string
    },
    now = Date.now(),
  ): Promise<void> {
    const data = await p.blob.arrayBuffer()
    await this.db.transaction('rw', this.db.items, async () => {
      await this.ensureRoom(p.id)
      await this.db.items.put({
        kind: 'photo',
        id: p.id,
        data,
        type: p.blob.type || 'image/jpeg',
        note: p.note,
        localHour: p.localHour,
        localDate: p.localDate,
        status: 'queued',
        proposal: null,
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
      })
    })
  }

  /** Encola un texto para analizarlo al volver la red. */
  async enqueueText(
    p: { id: string; text: string; note: string | null; localHour: number; localDate: string },
    now = Date.now(),
  ): Promise<void> {
    const text = p.text.trim()
    if (!text) throw new Error('Describe lo que comiste.')
    await this.db.transaction('rw', this.db.items, async () => {
      await this.ensureRoom(p.id)
      await this.db.items.put({
        kind: 'text',
        id: p.id,
        text,
        note: p.note,
        localHour: p.localHour,
        localDate: p.localDate,
        status: 'queued',
        proposal: null,
        createdAt: now,
        attempts: 0,
        nextAttemptAt: now,
        lastError: null,
      })
    })
  }

  async analyzedPhotos(): Promise<QueuedPhoto[]> {
    const items = await this.list()
    return items.filter((it): it is QueuedPhoto => it.kind === 'photo' && it.status === 'analyzed')
  }

  /** Fotos y textos ya analizados, pendientes de revisar (más antiguos primero). */
  async analyzedItems(): Promise<QueuedAnalysis[]> {
    const items = await this.list()
    return items.filter(
      (it): it is QueuedAnalysis => it.kind !== 'entry' && it.status === 'analyzed',
    )
  }

  /**
   * Procesa la cola: comidas → POST; fotos → analizar y dejar la propuesta pendiente de revisar.
   * 4xx (salvo 401 y 429) se descarta con aviso; red/5xx/429 se reintenta con backoff. Tras una
   * falla de red se detiene (sigue sin internet). Llamadas simultáneas comparten la misma corrida.
   * `force` ignora el backoff (al volver la red).
   */
  process(
    api: QueueApi,
    opts: { now?: () => number; force?: boolean } = {},
  ): Promise<ProcessResult> {
    if (this.running) return this.running
    const run = this.runOnce(api, opts).finally(() => {
      this.running = null
    })
    this.running = run
    return run
  }

  private async runOnce(
    api: QueueApi,
    opts: { now?: () => number; force?: boolean },
  ): Promise<ProcessResult> {
    const now = opts.now ?? Date.now
    const result: ProcessResult = {
      sent: 0,
      analyzed: 0,
      discarded: [],
      retrying: 0,
      unauthorized: false,
    }
    const items = await this.list()
    for (const item of items) {
      if (item.kind !== 'entry' && item.status === 'analyzed') continue
      if (!opts.force && item.nextAttemptAt > now()) continue
      if (item.kind === 'text' && !api.analyzeText) continue
      try {
        if (item.kind === 'entry') {
          await api.createEntry(item.input)
          await this.db.items.delete(item.id)
          result.sent++
        } else {
          const raw =
            item.kind === 'photo'
              ? await api.analyzePhoto(new Blob([item.data], { type: item.type }), {
                  note: item.note ?? undefined,
                  localHour: item.localHour,
                })
              : await (api.analyzeText as NonNullable<QueueApi['analyzeText']>)({
                  text: item.text,
                  note: item.note ?? undefined,
                  localHour: item.localHour,
                })
          const parsed = AnalysisProposalSchema.safeParse(raw)
          if (!parsed.success) throw new ApiError('INVALID_RESPONSE')
          await this.db.items.update(item.id, {
            status: 'analyzed',
            proposal: parsed.data,
            lastError: null,
          } as Partial<QueuedAnalysis>)
          result.analyzed++
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          result.unauthorized = true
          break
        }
        if (isRetryable(err)) {
          const attempts = item.attempts + 1
          const failures = (item.failures ?? 0) + (countsAsFailure(err) ? 1 : 0)
          if (failures >= MAX_ATTEMPTS) {
            await this.db.items.delete(item.id)
            result.discarded.push({
              id: item.id,
              kind: item.kind,
              message: discardMessage(item.kind, err, true),
            })
            continue
          }
          await this.db.items.update(item.id, {
            attempts,
            failures,
            nextAttemptAt: now() + backoffMs(attempts),
            lastError: errorMessage(err),
          })
          // Sin red: el resto también fallaría.
          if (err instanceof ApiError && err.code === 'NETWORK') break
          continue
        }
        await this.db.items.delete(item.id)
        result.discarded.push({
          id: item.id,
          kind: item.kind,
          message: discardMessage(item.kind, err),
        })
      }
    }
    const c = await this.counts()
    result.retrying = c.pendingEntries + c.queuedPhotos + c.queuedTexts
    return result
  }
}

/** Instancia de la app (null si no hay IndexedDB, p. ej. modo privado antiguo). */
let shared: OfflineQueue | null | undefined

export function getOfflineQueue(): OfflineQueue | null {
  if (shared !== undefined) return shared
  shared = typeof indexedDB === 'undefined' ? null : new OfflineQueue()
  // iOS puede borrar datos de webs poco usadas (risk:ios-storage-eviction): se pide persistencia.
  if (shared) void globalThis.navigator?.storage?.persist?.().catch(() => false)
  return shared
}
