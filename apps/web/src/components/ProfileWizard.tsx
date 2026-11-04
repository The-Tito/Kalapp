import {
  ACTIVITY_FACTORS,
  ACTIVITY_LEVELS,
  BMR_FORMULA_LABELS,
  formatGrams,
  formatKcal,
  formatNumber,
  formatSignedNumber,
  formatSignedPct,
  GOAL_CONFIG,
  GOALS,
  getIntensityLabel,
  INTENSITIES,
  LIMITS,
  type Profile,
  type Recommendation,
  SEX_LABELS,
  SEXES,
} from '@kalapp/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useId, useMemo, useState } from 'react'
import { errorMessage } from '../lib/api'
import { useApi } from '../lib/apiContext'
import {
  type FieldErrors,
  type OnboardingStep,
  type ProfileFormValues,
  parseProfileForm,
  previewRecommendation,
  validateStep,
} from '../lib/onboarding'
import { queryKeys } from '../lib/queryClient'
import { FixedActionBar } from './Layout'
import { Button, ErrorBox, Field, inputClass, WarningBox } from './ui'

const TRAINING_DAY_OPTIONS = Array.from(
  { length: LIMITS.trainingDays.max - LIMITS.trainingDays.min + 1 },
  (_, i) => LIMITS.trainingDays.min + i,
)

const STEP_TITLES: Record<OnboardingStep, string> = {
  1: 'Tus datos',
  2: 'Actividad y entrenamiento',
  3: 'Tu objetivo',
  4: 'Tu meta diaria',
}

const GOAL_EXPLANATIONS = {
  deficit: 'Bajar grasa comiendo menos de lo que gastas.',
  recomp: 'Mantener el peso mientras bajas grasa y ganas músculo con pesas.',
  gain: 'Subir músculo comiendo un poco más de lo que gastas.',
} as const

function ProgressBar({ step }: { step: OnboardingStep }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">Paso {step} de 4</p>
      <div
        role="progressbar"
        aria-label="Progreso"
        aria-valuemin={1}
        aria-valuemax={4}
        aria-valuenow={step}
        className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800"
      >
        <div
          className="h-full rounded-full bg-green-600 transition-all"
          style={{ width: `${(step / 4) * 100}%` }}
        />
      </div>
    </div>
  )
}

function OptionCard({
  name,
  checked,
  onChange,
  title,
  description,
}: {
  name: string
  checked: boolean
  onChange: () => void
  title: string
  description?: ReactNode
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-xl border p-3 ${
        checked
          ? 'border-green-600 bg-green-50 ring-2 ring-green-600/30 dark:bg-green-950'
          : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
      }`}
    >
      <span className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="size-5 accent-green-600"
        />
        <span className="font-semibold text-gray-900 dark:text-gray-100">{title}</span>
      </span>
      {description && (
        <span className="pl-7 text-sm text-gray-600 dark:text-gray-400">{description}</span>
      )}
    </label>
  )
}

function FieldsetError({ id, error }: { id: string; error?: string | undefined }) {
  if (!error) return null
  return (
    <p id={id} role="alert" className="text-sm text-red-600 dark:text-red-400">
      {error}
    </p>
  )
}

const errProps = (id: string, error?: string) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
})

const signedKg = (kg: number): string => `${formatSignedNumber(kg, 2)} kg`

export function RecommendationView({ rec }: { rec: Recommendation }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl bg-green-600 p-5 text-center text-white">
        <p className="text-sm opacity-90">Meta diaria{rec.isManualOverride ? ' (manual)' : ''}</p>
        <p className="text-5xl font-bold tabular-nums" data-testid="target-kcal">
          {formatKcal(rec.targetKcal)}
        </p>
        <p className="mt-1 text-sm opacity-90">
          Cambio esperado: {signedKg(rec.expectedKgPerWeek)}/semana
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['Proteína', rec.proteinG],
            ['Carbohidratos', rec.carbsG],
            ['Grasa', rec.fatG],
          ] as const
        ).map(([label, g]) => (
          <div key={label} className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
            <dt className="text-xs text-gray-600 dark:text-gray-400">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatGrams(g)}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
          <dt className="text-gray-600 dark:text-gray-400">Metabolismo en reposo</dt>
          <dd className="font-semibold tabular-nums">{formatKcal(rec.bmr)}</dd>
          <dd className="text-xs text-gray-500">{BMR_FORMULA_LABELS[rec.bmrFormula]}</dd>
        </div>
        <div className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
          <dt className="text-gray-600 dark:text-gray-400">Gasto diario</dt>
          <dd className="font-semibold tabular-nums">{formatKcal(rec.tdee)}</dd>
          <dd className="text-xs text-gray-500">Ajuste {formatSignedPct(rec.adjustPct)}</dd>
        </div>
      </dl>
      {rec.warnings.map((w) => (
        <WarningBox key={w.code}>
          <p className="text-sm">
            <span aria-hidden="true">⚠️ </span>
            {w.message}
          </p>
        </WarningBox>
      ))}
      <details className="rounded-xl bg-gray-100 p-3 dark:bg-gray-800">
        <summary className="min-h-11 cursor-pointer content-center font-semibold">
          Cómo lo calculamos
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-gray-700 dark:text-gray-300">
          {rec.explanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </details>
    </div>
  )
}

export interface ProfileWizardProps {
  initialValues: ProfileFormValues
  onSaved(profile: Profile): void
  onCancel?: () => void
  saveLabel?: string
}

export function ProfileWizard({
  initialValues,
  onSaved,
  onCancel,
  saveLabel = 'Guardar y empezar',
}: ProfileWizardProps) {
  const api = useApi()
  const queryClient = useQueryClient()
  const uid = useId()
  const [values, setValues] = useState(initialValues)
  const [step, setStep] = useState<OnboardingStep>(1)
  const [errors, setErrors] = useState<FieldErrors>({})

  const set = <K extends keyof ProfileFormValues>(key: K, value: ProfileFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const rec = useMemo(() => (step === 4 ? previewRecommendation(values) : null), [step, values])

  const save = useMutation({
    mutationFn: api.putProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(queryKeys.profile, profile)
      onSaved(profile)
    },
  })

  const next = () => {
    const stepErrors = validateStep(values, step)
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) return
    if (step < 4) {
      setStep((step + 1) as OnboardingStep)
      window.scrollTo?.({ top: 0 })
      return
    }
    const parsed = parseProfileForm(values)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      setStep(parsed.step)
      return
    }
    if (!save.isPending) save.mutate(parsed.data)
  }

  const back = () => {
    setErrors({})
    if (step > 1) setStep((step - 1) as OnboardingStep)
    else onCancel?.()
  }

  const id = (name: string) => `${uid}-${name}`
  const today = new Date().toISOString().slice(0, 10)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        next()
      }}
      className="flex flex-col gap-5"
    >
      <ProgressBar step={step} />
      <h2 className="text-xl font-bold">{STEP_TITLES[step]}</h2>

      {step === 1 && (
        <>
          <fieldset className="flex flex-col gap-2" aria-describedby={id('sex-error')}>
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Sexo
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {SEXES.map((s) => (
                <OptionCard
                  key={s}
                  name={id('sex')}
                  checked={values.sex === s}
                  onChange={() => set('sex', s)}
                  title={SEX_LABELS[s]}
                />
              ))}
            </div>
            <FieldsetError id={id('sex-error')} error={errors.sex} />
          </fieldset>
          <Field id={id('birthDate')} label="Fecha de nacimiento" error={errors.birthDate}>
            <input
              id={id('birthDate')}
              type="date"
              max={today}
              value={values.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
              className={inputClass}
              {...errProps(id('birthDate'), errors.birthDate)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id={id('heightCm')} label="Estatura (cm)" error={errors.heightCm}>
              <input
                id={id('heightCm')}
                inputMode="numeric"
                autoComplete="off"
                placeholder="175"
                value={values.heightCm}
                onChange={(e) => set('heightCm', e.target.value)}
                className={inputClass}
                {...errProps(id('heightCm'), errors.heightCm)}
              />
            </Field>
            <Field id={id('weightKg')} label="Peso (kg)" error={errors.weightKg}>
              <input
                id={id('weightKg')}
                inputMode="decimal"
                autoComplete="off"
                placeholder="80.5"
                value={values.weightKg}
                onChange={(e) => set('weightKg', e.target.value)}
                className={inputClass}
                {...errProps(id('weightKg'), errors.weightKg)}
              />
            </Field>
          </div>
          <Field
            id={id('bodyFatPct')}
            label="% de grasa (opcional)"
            hint="Si lo conoces, el cálculo es más preciso (Katch-McArdle)."
            error={errors.bodyFatPct}
          >
            <input
              id={id('bodyFatPct')}
              inputMode="decimal"
              autoComplete="off"
              placeholder="Opcional"
              value={values.bodyFatPct}
              onChange={(e) => set('bodyFatPct', e.target.value)}
              className={inputClass}
              {...errProps(id('bodyFatPct'), errors.bodyFatPct)}
            />
          </Field>
        </>
      )}

      {step === 2 && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Nivel de actividad (sin contar pesas)
            </legend>
            {ACTIVITY_LEVELS.map((a) => (
              <OptionCard
                key={a}
                name={id('activity')}
                checked={values.activityLevel === a}
                onChange={() => set('activityLevel', a)}
                title={ACTIVITY_FACTORS[a].label}
                description={ACTIVITY_FACTORS[a].description}
              />
            ))}
            <FieldsetError id={id('activity-error')} error={errors.activityLevel} />
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              Días de pesas o fuerza por semana
            </legend>
            <div className="grid grid-cols-8 gap-1">
              {TRAINING_DAY_OPTIONS.map((d) => (
                <label
                  key={d}
                  className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border text-lg font-semibold ${
                    values.trainingDays === d
                      ? 'border-green-600 bg-green-600 text-white'
                      : 'border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900'
                  }`}
                >
                  <input
                    type="radio"
                    name={id('training')}
                    className="sr-only"
                    checked={values.trainingDays === d}
                    onChange={() => set('trainingDays', d)}
                    aria-label={`${d} días`}
                  />
                  {d}
                </label>
              ))}
            </div>
            <FieldsetError id={id('training-error')} error={errors.trainingDays} />
          </fieldset>
        </>
      )}

      {step === 3 && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
              ¿Qué quieres lograr?
            </legend>
            {GOALS.map((g) => (
              <OptionCard
                key={g}
                name={id('goal')}
                checked={values.goal === g}
                onChange={() => set('goal', g)}
                title={GOAL_CONFIG[g].label}
                description={
                  <>
                    {GOAL_EXPLANATIONS[g]} <br />
                    <span className="text-gray-500">{GOAL_CONFIG[g].expectedChange}</span>
                  </>
                }
              />
            ))}
            <FieldsetError id={id('goal-error')} error={errors.goal} />
          </fieldset>
          {values.goal && values.goal !== 'recomp' && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-300">
                Intensidad
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {INTENSITIES.map((i) => {
                  const goal = values.goal as Exclude<ProfileFormValues['goal'], ''>
                  const pct = GOAL_CONFIG[goal].intensities[i].adjustPct
                  return (
                    <OptionCard
                      key={i}
                      name={id('intensity')}
                      checked={values.intensity === i}
                      onChange={() => set('intensity', i)}
                      title={getIntensityLabel(goal, i)}
                      description={formatSignedPct(pct)}
                    />
                  )
                })}
              </div>
            </fieldset>
          )}
          {values.goal === 'recomp' && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              La recomposición usa un ajuste único de −5 % sobre tu gasto diario.
            </p>
          )}
        </>
      )}

      {step === 4 && (
        <>
          {rec ? (
            <RecommendationView rec={rec} />
          ) : (
            <ErrorBox>No pudimos calcular tu meta. Revisa los pasos anteriores.</ErrorBox>
          )}
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              className="size-5 accent-green-600"
              checked={values.useManualTarget}
              onChange={(e) => set('useManualTarget', e.target.checked)}
            />
            <span>Ajustar meta a mano</span>
          </label>
          {values.useManualTarget && (
            <Field
              id={id('manualTargetKcal')}
              label="Meta manual (kcal por día)"
              hint={`Entre ${formatNumber(LIMITS.manualTargetKcal.min)} y ${formatNumber(LIMITS.manualTargetKcal.max)} kcal. Los macros se ajustan a esta meta.`}
              error={errors.manualTargetKcal}
            >
              <input
                id={id('manualTargetKcal')}
                inputMode="numeric"
                autoComplete="off"
                value={values.manualTargetKcal}
                onChange={(e) => set('manualTargetKcal', e.target.value)}
                className={inputClass}
                {...errProps(id('manualTargetKcal'), errors.manualTargetKcal)}
              />
            </Field>
          )}
          {save.isError && <ErrorBox>{errorMessage(save.error)}</ErrorBox>}
        </>
      )}

      <FixedActionBar>
        {(step > 1 || onCancel) && (
          <Button variant="secondary" onClick={back} className="min-h-12 flex-1">
            {step > 1 ? 'Atrás' : 'Cancelar'}
          </Button>
        )}
        <Button type="submit" className="min-h-12 flex-[2]" disabled={save.isPending}>
          {step < 4 ? 'Siguiente' : save.isPending ? 'Guardando…' : saveLabel}
        </Button>
      </FixedActionBar>
    </form>
  )
}
