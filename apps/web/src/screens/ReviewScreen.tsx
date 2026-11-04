import {
  DEFAULT_TIMEZONE,
  type Entry,
  type EntryItemInput,
  EntryItemInputSchema,
  formatGrams,
  formatKcal,
  hasEnergyMismatch,
  LIMITS,
  MEAL_TYPE_LABELS,
  MEAL_TYPES,
  sumTotals,
} from '@kalapp/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useReducer, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { ScreenTitle } from '../components/Layout'
import {
  Button,
  Card,
  ConfidencePill,
  ErrorBox,
  Field,
  inputClass,
  WarningBox,
} from '../components/ui'
import { errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import { type Draft, useDraft } from '../lib/draft'
import { parseNumber } from '../lib/onboarding'
import { useProfileQuery } from '../lib/queries'
import { queryKeys } from '../lib/queryClient'
import {
  buildEntryInput,
  buildEntryPatch,
  displayItems,
  firstIssueMessage,
  initReviewFromEntry,
  initReviewFromProposal,
  PORTION_PRESETS,
  type ReviewItem,
  type ReviewState,
  reviewReducer,
} from '../lib/review'

function initState(draft: Draft): ReviewState {
  return draft.kind === 'new'
    ? initReviewFromProposal(draft.proposal, draft.localHour, draft.note)
    : initReviewFromEntry(draft.entry)
}

function ItemRow({
  item,
  onGrams,
  onName,
  onRemove,
}: {
  item: ReviewItem
  onGrams(grams: number): void
  onName(name: string): void
  onRemove(): void
}) {
  const uid = useId()
  const [gramsText, setGramsText] = useState(String(item.grams))
  const [lastGrams, setLastGrams] = useState(item.grams)
  // Si cambia desde fuera (multiplicador), se refleja en el campo.
  if (item.grams !== lastGrams) {
    setLastGrams(item.grams)
    if (parseNumber(gramsText) !== item.grams) setGramsText(String(item.grams))
  }
  const mismatch = hasEnergyMismatch(item)
  const parsed = parseNumber(gramsText)
  const invalid =
    parsed === undefined ||
    Number.isNaN(parsed) ||
    parsed < LIMITS.itemGrams.min ||
    parsed > LIMITS.itemGrams.max

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <label htmlFor={`${uid}-name`} className="sr-only">
            Nombre del ingrediente
          </label>
          <input
            id={`${uid}-name`}
            value={item.name}
            maxLength={LIMITS.nameMaxLength}
            onChange={(e) => onName(e.target.value)}
            className="min-h-11 w-full rounded-lg bg-transparent px-1 font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-600/30 dark:focus:bg-gray-900"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Quitar ${item.name}`}
          className="min-h-11 min-w-11 rounded-lg text-xl text-gray-500 active:bg-gray-200 dark:active:bg-gray-700"
        >
          ✕
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex w-28 items-center gap-1">
          <label htmlFor={`${uid}-grams`} className="sr-only">
            Gramos de {item.name}
          </label>
          <input
            id={`${uid}-grams`}
            inputMode="decimal"
            value={gramsText}
            aria-invalid={invalid || undefined}
            onChange={(e) => {
              setGramsText(e.target.value)
              const g = parseNumber(e.target.value)
              if (
                g !== undefined &&
                !Number.isNaN(g) &&
                g >= LIMITS.itemGrams.min &&
                g <= LIMITS.itemGrams.max
              ) {
                setLastGrams(g)
                onGrams(g)
              }
            }}
            className={`${inputClass} text-right tabular-nums`}
          />
          <span className="text-sm text-gray-500">g</span>
        </div>
        <div className="flex-1 text-right">
          <p className="font-semibold tabular-nums">{formatKcal(item.kcal)}</p>
          <p className="text-xs text-gray-500 tabular-nums dark:text-gray-400">
            P {formatGrams(item.proteinG)} · C {formatGrams(item.carbsG)} · G{' '}
            {formatGrams(item.fatG)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.confidence && <ConfidencePill confidence={item.confidence} />}
        {mismatch && (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            ⚠️ Las kcal no cuadran con los macros
          </span>
        )}
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-red-600">
          Gramos entre {LIMITS.itemGrams.min} y {formatGrams(LIMITS.itemGrams.max)}
        </p>
      )}
    </li>
  )
}

const EMPTY_NEW_ITEM = { name: '', grams: '', kcal: '', proteinG: '', carbsG: '', fatG: '' }

function AddItemForm({ onAdd, onClose }: { onAdd(item: EntryItemInput): void; onClose(): void }) {
  const uid = useId()
  const [v, setV] = useState(EMPTY_NEW_ITEM)
  const [error, setError] = useState<string | null>(null)
  const fields = [
    ['grams', 'Gramos'],
    ['kcal', 'kcal'],
    ['proteinG', 'Proteína (g)'],
    ['carbsG', 'Carbohidratos (g)'],
    ['fatG', 'Grasa (g)'],
  ] as const

  const submit = () => {
    const parsed = EntryItemInputSchema.safeParse({
      name: v.name,
      grams: parseNumber(v.grams),
      kcal: parseNumber(v.kcal),
      proteinG: parseNumber(v.proteinG) ?? 0,
      carbsG: parseNumber(v.carbsG) ?? 0,
      fatG: parseNumber(v.fatG) ?? 0,
    })
    if (!parsed.success) {
      setError(firstIssueMessage(parsed.error))
      return
    }
    onAdd(parsed.data)
    setV(EMPTY_NEW_ITEM)
    setError(null)
    onClose()
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-gray-700">
      <Field id={`${uid}-name`} label="Ingrediente">
        <input
          id={`${uid}-name`}
          value={v.name}
          maxLength={LIMITS.nameMaxLength}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          className={inputClass}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {fields.map(([key, label]) => (
          <Field key={key} id={`${uid}-${key}`} label={label}>
            <input
              id={`${uid}-${key}`}
              inputMode="decimal"
              value={v[key]}
              onChange={(e) => setV({ ...v, [key]: e.target.value })}
              className={inputClass}
            />
          </Field>
        ))}
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      <div className="flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={submit}>
          Agregar
        </Button>
      </div>
    </div>
  )
}

export function ReviewScreen() {
  const { draft } = useDraft()
  if (!draft) return <Navigate to="/capturar" replace />
  return <ReviewEditor key={draft.kind === 'new' ? draft.id : draft.entry.id} draft={draft} />
}

function ReviewEditor({ draft }: { draft: Draft }) {
  const api = useApi()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { setDraft } = useDraft()
  const profile = useProfileQuery().data
  const uid = useId()
  const [state, dispatch] = useReducer(reviewReducer, draft, initState)
  const [adding, setAdding] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const savingRef = useRef(false)

  const timezone = profile?.timezone ?? DEFAULT_TIMEZONE
  const items = displayItems(state)
  const totals = sumTotals(items)
  const anyMismatch = items.some((i) => hasEnergyMismatch(i))
  const proposal = draft.kind === 'new' ? draft.proposal : null

  const save = useMutation({
    mutationFn: async (): Promise<Entry> => {
      if (draft.kind === 'new') {
        const input = buildEntryInput({
          id: draft.id,
          state,
          source: draft.source,
          aiModel: draft.proposal.model,
          aiConfidence: draft.proposal.confidence,
          timezone,
          now: new Date(),
        })
        if (!input.success) throw new Error(firstIssueMessage(input.error))
        return api.createEntry(input.data)
      }
      const patch = buildEntryPatch(state)
      if (!patch.success) throw new Error(firstIssueMessage(patch.error))
      return api.updateEntry(draft.entry.id, patch.data)
    },
    onSuccess: (entry) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.entriesAll })
      navigate(draft.kind === 'edit' ? `/?fecha=${entry.localDate}` : '/', { replace: true })
      setDraft(null)
    },
    onSettled: () => {
      savingRef.current = false
    },
  })

  const onSave = () => {
    if (savingRef.current || save.isPending) return
    if (items.length === 0) {
      setFormError('Agrega al menos un ingrediente.')
      return
    }
    setFormError(null)
    savingRef.current = true
    save.mutate()
  }

  const saveError = save.isError
    ? save.error instanceof Error && save.error.name !== 'ApiError'
      ? save.error.message
      : errorMessage(save.error)
    : null

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>{draft.kind === 'new' ? 'Revisar' : 'Editar comida'}</ScreenTitle>

      <div className="flex items-center gap-3">
        {draft.kind === 'new' && draft.photo && (
          <img
            src={draft.photo}
            alt="Foto de la comida"
            className="size-20 shrink-0 rounded-xl object-cover"
          />
        )}
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={`${uid}-title`} className="text-sm text-gray-600 dark:text-gray-400">
            Título
          </label>
          <input
            id={`${uid}-title`}
            value={state.title}
            maxLength={LIMITS.nameMaxLength}
            onChange={(e) => dispatch({ type: 'setTitle', title: e.target.value })}
            className={`${inputClass} font-semibold`}
          />
          {proposal && (
            <div>
              <ConfidencePill confidence={proposal.confidence} />
            </div>
          )}
        </div>
      </div>

      <Card className="sticky top-2 z-10">
        <p className="text-center text-3xl font-bold tabular-nums" data-testid="review-total-kcal">
          {formatKcal(totals.kcal)}
        </p>
        <p className="text-center text-sm text-gray-600 tabular-nums dark:text-gray-400">
          P {formatGrams(totals.proteinG)} · C {formatGrams(totals.carbsG)} · G{' '}
          {formatGrams(totals.fatG)}
        </p>
        <fieldset className="mt-3">
          <legend className="sr-only">Porción</legend>
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {PORTION_PRESETS.map((p) => (
              <label
                key={p.value}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg font-semibold ${
                  state.multiplier === p.value
                    ? 'bg-green-600 text-white'
                    : 'text-gray-700 dark:text-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`${uid}-portion`}
                  className="sr-only"
                  checked={state.multiplier === p.value}
                  onChange={() => dispatch({ type: 'setMultiplier', multiplier: p.value })}
                  aria-label={`Porción ${p.label}`}
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>

      {proposal && proposal.questions.length > 0 && (
        <WarningBox>
          <p className="mb-1 font-semibold">Para afinar el cálculo</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {proposal.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs">Si algo no coincide, ajusta los gramos abajo.</p>
        </WarningBox>
      )}

      {anyMismatch && (
        <WarningBox>
          <p className="text-sm">
            ⚠️ En algún ingrediente las calorías no cuadran con proteína, carbohidratos y grasa
            (4/4/9). Revisa los valores marcados.
          </p>
        </WarningBox>
      )}

      <section aria-labelledby={`${uid}-items`} className="flex flex-col gap-2">
        <h2 id={`${uid}-items`} className="text-lg font-semibold">
          Ingredientes
        </h2>
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <ItemRow
              key={item.key}
              item={item}
              onGrams={(grams) => dispatch({ type: 'setItemGrams', key: item.key, grams })}
              onName={(name) => dispatch({ type: 'setItemName', key: item.key, name })}
              onRemove={() => dispatch({ type: 'removeItem', key: item.key })}
            />
          ))}
        </ul>
        {items.length === 0 && (
          <p className="text-sm text-red-600">Agrega al menos un ingrediente.</p>
        )}
        {adding ? (
          <AddItemForm
            onAdd={(item) => dispatch({ type: 'addItem', item })}
            onClose={() => setAdding(false)}
          />
        ) : (
          <Button
            variant="ghost"
            onClick={() => setAdding(true)}
            disabled={items.length >= LIMITS.itemsPerEntry.max}
          >
            + Agregar ingrediente
          </Button>
        )}
      </section>

      {proposal && proposal.assumptions.length > 0 && (
        <details className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800" open>
          <summary className="min-h-11 cursor-pointer content-center font-semibold">
            Supuestos de la IA
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
            {proposal.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
          Tipo de comida
        </legend>
        <div className="grid grid-cols-4 gap-1">
          {MEAL_TYPES.map((m) => (
            <label
              key={m}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${
                state.mealType === m
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
              }`}
            >
              <input
                type="radio"
                name={`${uid}-meal`}
                className="sr-only"
                checked={state.mealType === m}
                onChange={() => dispatch({ type: 'setMealType', mealType: m })}
              />
              {MEAL_TYPE_LABELS[m]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field id={`${uid}-note`} label="Nota (opcional)">
        <input
          id={`${uid}-note`}
          value={state.note}
          maxLength={LIMITS.noteMaxLength}
          onChange={(e) => dispatch({ type: 'setNote', note: e.target.value })}
          className={inputClass}
        />
      </Field>

      {formError && <ErrorBox>{formError}</ErrorBox>}
      {saveError && <ErrorBox>{saveError}</ErrorBox>}

      <div className="flex gap-3">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => {
            navigate(draft.kind === 'edit' ? `/?fecha=${draft.entry.localDate}` : '/', {
              replace: true,
            })
            setDraft(null)
          }}
        >
          Descartar
        </Button>
        <Button
          className="min-h-14 flex-[2] text-lg"
          onClick={onSave}
          disabled={save.isPending || items.length === 0}
        >
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </div>
  )
}
