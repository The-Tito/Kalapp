import {
  ACTIVITY_LEVEL_LABELS,
  formatGrams,
  formatKcal,
  GOAL_LABELS,
  getIntensityLabel,
} from '@kalapp/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ExportCard } from '../components/ExportCard'
import { ScreenTitle } from '../components/Layout'
import { ShortcutCard } from '../components/ShortcutCard'
import { Button, Card, Spinner } from '../components/ui'
import { useDraft } from '../lib/draft'
import { usePwa } from '../lib/pwa'
import { useProfileQuery } from '../lib/queries'
import { tokenStore } from '../lib/token'

export function SettingsScreen() {
  const profile = useProfileQuery().data
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { setDraft } = useDraft()
  const pwa = usePwa()
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [checked, setChecked] = useState(false)

  if (!profile) return <Spinner />

  const logout = () => {
    tokenStore.clear()
    setDraft(null)
    queryClient.clear()
    navigate('/token', { replace: true })
  }

  return (
    <div className="flex flex-col gap-4">
      <ScreenTitle>Ajustes</ScreenTitle>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Tu meta</h2>
        <p className="text-3xl font-bold tabular-nums">
          {formatKcal(profile.targetKcal)}
          {profile.isManualOverride && (
            <span className="ml-2 text-sm font-normal text-gray-500">(manual)</span>
          )}
        </p>
        <p className="text-sm text-gray-700 tabular-nums dark:text-gray-300">
          Proteína {formatGrams(profile.proteinG)} · Carbohidratos {formatGrams(profile.carbsG)} ·
          Grasa {formatGrams(profile.fatG)}
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {GOAL_LABELS[profile.goal]}
          {profile.goal !== 'recomp' && ` · ${getIntensityLabel(profile.goal, profile.intensity)}`}{' '}
          · {ACTIVITY_LEVEL_LABELS[profile.activityLevel]} · {profile.trainingDays} días de pesas
        </p>
        <Button variant="secondary" onClick={() => navigate('/ajustes/perfil')}>
          Editar perfil y objetivo
        </Button>
      </Card>

      <ExportCard timezone={profile.timezone} />

      <ShortcutCard />

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Acceso</h2>
        <Button variant="secondary" onClick={() => navigate('/token')}>
          Cambiar token
        </Button>
        {confirmLogout ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Se borrará el token de este iPhone. Tus comidas siguen guardadas en el servidor.
            </p>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmLogout(false)}
              >
                Cancelar
              </Button>
              <Button variant="danger" className="flex-1" onClick={logout}>
                Cerrar sesión
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirmLogout(true)}>
            Cerrar sesión
          </Button>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">App</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Versión {__APP_VERSION__} · Zona horaria {profile.timezone}
        </p>
        {pwa.needRefresh ? (
          <Button onClick={pwa.update}>Actualizar a la nueva versión</Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => {
              pwa.checkNow()
              setChecked(true)
            }}
          >
            Buscar actualizaciones
          </Button>
        )}
        {checked && !pwa.needRefresh && (
          <p role="status" className="text-sm text-gray-500">
            Si hay una nueva versión verás un aviso arriba.
          </p>
        )}
      </Card>
    </div>
  )
}
