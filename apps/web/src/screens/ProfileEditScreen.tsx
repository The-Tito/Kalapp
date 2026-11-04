import type { Profile } from '@kalapp/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ScreenTitle } from '../components/Layout'
import { ProfileWizard } from '../components/ProfileWizard'
import { Spinner } from '../components/ui'
import { profileToForm } from '../lib/onboarding'
import { useProfileQuery } from '../lib/queries'

/** Editar perfil y objetivo (sin barra inferior: la barra fija es Atrás/Siguiente). */
export function ProfileEditScreen() {
  const profile = useProfileQuery().data
  if (!profile) return <Spinner />
  return <ProfileEditor profile={profile} />
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const navigate = useNavigate()
  const [initial] = useState(() => profileToForm(profile))
  const done = () => navigate('/ajustes', { replace: true })
  return (
    <div>
      <ScreenTitle>Editar perfil</ScreenTitle>
      <ProfileWizard
        initialValues={initial}
        saveLabel="Guardar cambios"
        onCancel={done}
        onSaved={done}
      />
    </div>
  )
}
