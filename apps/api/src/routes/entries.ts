import { EntriesQuerySchema, EntryInputSchema, EntryPatchSchema, UuidSchema } from '@kalapp/shared'
import { Hono } from 'hono'
import { deleteEntry, getEntry, insertEntry, listEntriesByDate, patchEntry } from '../db/entries'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/errors'
import { nowIso } from '../lib/time'
import { readJson, readQuery } from '../lib/validate'

export const entriesRoutes = new Hono<AppEnv>()

const notFound = () => new HttpError('NOT_FOUND', 'No se encontró el registro')

/** Un id que no es UUID no puede existir: 404 directo. */
function entryId(raw: string): string {
  const r = UuidSchema.safeParse(raw)
  if (!r.success) throw notFound()
  return r.data
}

entriesRoutes.get('/', async (c) => {
  const { date } = readQuery(c, EntriesQuerySchema)
  return c.json(await listEntriesByDate(c.env.DB, date))
})

/** Idempotente por id: si ya existe responde 200 con el guardado. Totales del servidor. */
entriesRoutes.post('/', async (c) => {
  const input = await readJson(c, EntryInputSchema)
  const existing = await getEntry(c.env.DB, input.id)
  if (existing) return c.json(existing, 200)
  try {
    await insertEntry(c.env.DB, input, nowIso())
  } catch (err) {
    // Carrera entre dos POST con el mismo id: el segundo choca con la PK.
    const again = await getEntry(c.env.DB, input.id)
    if (again) return c.json(again, 200)
    throw err
  }
  const created = await getEntry(c.env.DB, input.id)
  if (!created) throw new Error('Registro no encontrado tras insertarlo')
  return c.json(created, 201)
})

entriesRoutes.patch('/:id', async (c) => {
  const id = entryId(c.req.param('id'))
  const patch = await readJson(c, EntryPatchSchema)
  if (!(await getEntry(c.env.DB, id))) throw notFound()
  await patchEntry(c.env.DB, id, patch)
  const updated = await getEntry(c.env.DB, id)
  if (!updated) throw notFound()
  return c.json(updated)
})

entriesRoutes.delete('/:id', async (c) => {
  const id = entryId(c.req.param('id'))
  if (!(await deleteEntry(c.env.DB, id))) throw notFound()
  return c.body(null, 204)
})
