import {
  daysBetween,
  type Entry,
  type ExportJson,
  ExportQuerySchema,
  LIMITS,
  MEAL_TYPE_LABELS,
  type Profile,
} from '@kalapp/shared'
import { Hono } from 'hono'
import { listEntriesInRange } from '../db/entries'
import { listFavorites } from '../db/favorites'
import { getProfile } from '../db/profile'
import { listWeights } from '../db/weights'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'
import { nowIso, safeTimeZone, todayIn } from '../lib/time'
import { readQuery } from '../lib/validate'

export const CSV_HEADER = [
  'fecha',
  'hora',
  'comida',
  'título',
  'ingrediente',
  'gramos',
  'kcal',
  'proteína (g)',
  'carbohidratos (g)',
  'grasa (g)',
] as const

/**
 * Celda CSV (RFC 4180): comillas si hay coma, comillas, salto de línea o espacios en los
 * bordes. Los textos que empiezan con = + - @ (o tab/CR) se prefijan con ' para que Excel/Numbers
 * no los ejecuten como fórmula.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let s = value
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\r\n]/.test(s) || s !== s.trim()) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/** HH:MM local del instante en la zona dada. */
function localTime(iso: string, tz: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

/** Una fila por ingrediente, con BOM UTF-8 y CRLF (Excel y Numbers abren bien los acentos). */
export function entriesToCsv(entries: readonly Entry[], tz: string): string {
  const lines = [CSV_HEADER.map(csvCell).join(',')]
  for (const e of entries) {
    const hour = localTime(e.eatenAt, tz)
    for (const it of e.items) {
      lines.push(
        [
          e.localDate,
          hour,
          MEAL_TYPE_LABELS[e.mealType],
          e.title ?? '',
          it.name,
          it.grams,
          it.kcal,
          it.proteinG,
          it.carbsG,
          it.fatG,
        ]
          .map(csvCell)
          .join(','),
      )
    }
  }
  return `﻿${lines.join('\r\n')}\r\n`
}

export const exportRoutes = new Hono<AppEnv>()

exportRoutes.get('/', async (c) => {
  const { format, from, to } = readQuery(c, ExportQuerySchema)
  if (from && to && from > to) {
    throw new HttpError('VALIDATION', 'La fecha inicial debe ser anterior a la final')
  }
  if (from && to && daysBetween(from, to) + 1 > LIMITS.summaryMaxRangeDays) {
    throw new HttpError('VALIDATION', `El rango máximo es de ${LIMITS.summaryMaxRangeDays} días`)
  }
  const profile: Profile | null = await getProfile(c.env.DB)
  const tz = safeTimeZone(profile?.timezone)
  const entries = await listEntriesInRange(c.env.DB, from, to)
  const filename = `kalapp-${from ?? 'inicio'}-${to ?? todayIn(tz)}.${format}`
  const disposition = `attachment; filename="${filename}"`

  if (format === 'csv') {
    return c.body(entriesToCsv(entries, tz), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': disposition,
    })
  }
  const [weights, favorites] = await Promise.all([
    listWeights(c.env.DB, from, to),
    listFavorites(c.env.DB),
  ])
  const body: ExportJson = {
    exportedAt: nowIso(),
    from: from ?? null,
    to: to ?? null,
    profile,
    entries,
    weights,
    favorites,
  }
  return c.body(JSON.stringify(body, null, 2), 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': disposition,
  })
})
