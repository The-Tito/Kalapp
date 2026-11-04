import { APP_NAME } from '@kalapp/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PlainShell } from '../components/Layout'
import { ProfileWizard } from '../components/ProfileWizard'
import { deviceTimeZone } from '../lib/dates'
import { emptyProfileForm } from '../lib/onboarding'

export function OnboardingScreen() {
  const navigate = useNavigate()
  const [initial] = useState(() => emptyProfileForm(deviceTimeZone()))
  return (
    <PlainShell withActionBar>
      <h1 className="mb-1 text-2xl font-bold">Bienvenido a {APP_NAME}</h1>
      <p className="mb-6 text-gray-600 dark:text-gray-400">
        Con tus datos calculamos cuántas calorías y macros te tocan al día.
      </p>
      <ProfileWizard initialValues={initial} onSaved={() => navigate('/', { replace: true })} />
    </PlainShell>
  )
}
