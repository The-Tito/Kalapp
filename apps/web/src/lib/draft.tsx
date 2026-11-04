import { AnalysisProposalSchema, EntrySchema, UuidSchema } from '@kalapp/shared'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { z } from 'zod'

/**
 * Lo que pasa de Capturar (o de Hoy al editar) a Revisar. Vive en memoria y se respalda en
 * `sessionStorage` porque iOS puede recargar la página al volver de la cámara.
 */
export const DraftSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('new'),
    /** id del registro: se genera una vez por propuesta para que reintentar no duplique. */
    id: UuidSchema,
    proposal: AnalysisProposalSchema,
    source: z.enum(['photo', 'text']),
    note: z.string().nullable(),
    /** Miniatura (data URL JPEG) o null. */
    photo: z.string().nullable(),
    localHour: z.number().int().min(0).max(23),
  }),
  z.object({ kind: z.literal('edit'), entry: EntrySchema }),
])
export type Draft = z.infer<typeof DraftSchema>

export const DRAFT_KEY = 'kalapp.draft'

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

export function loadDraft(): Draft | null {
  try {
    const raw = storage()?.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = DraftSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function saveDraft(draft: Draft | null): void {
  const s = storage()
  if (!s) return
  try {
    if (draft) s.setItem(DRAFT_KEY, JSON.stringify(draft))
    else s.removeItem(DRAFT_KEY)
  } catch {
    // Cuota llena (miniatura grande): se reintenta sin foto.
    if (draft?.kind === 'new' && draft.photo) {
      try {
        s.setItem(DRAFT_KEY, JSON.stringify({ ...draft, photo: null }))
      } catch {
        // solo queda en memoria
      }
    }
  }
}

interface DraftContextValue {
  draft: Draft | null
  setDraft(draft: Draft | null): void
}

const DraftContext = createContext<DraftContextValue | null>(null)

export function DraftProvider({
  children,
  initialDraft,
}: {
  children: ReactNode
  initialDraft?: Draft | null
}) {
  const [draft, setState] = useState<Draft | null>(() =>
    initialDraft !== undefined ? initialDraft : loadDraft(),
  )
  const setDraft = useCallback((next: Draft | null) => {
    saveDraft(next)
    setState(next)
  }, [])
  const value = useMemo(() => ({ draft, setDraft }), [draft, setDraft])
  return <DraftContext value={value}>{children}</DraftContext>
}

export function useDraft(): DraftContextValue {
  const ctx = useContext(DraftContext)
  if (!ctx) throw new Error('useDraft debe usarse dentro de DraftProvider')
  return ctx
}
