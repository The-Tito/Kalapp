import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, type ReactNode, Suspense, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { RequireProfile, RequireToken } from './components/Guards'
import { AppShell, ScreenSkeleton, UpdateBanner } from './components/Layout'
import { ApiProvider } from './lib/apiContext'
import { DraftProvider } from './lib/draft'
import { PwaProvider } from './lib/pwa'
import { createQueryClient } from './lib/queryClient'
import { QueueProvider } from './lib/queueContext'
import { CaptureScreen } from './screens/CaptureScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { ProfileEditScreen } from './screens/ProfileEditScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TodayScreen } from './screens/TodayScreen'
import { TokenScreen } from './screens/TokenScreen'

// Pantallas pesadas (Recharts) fuera del bundle inicial.
const HistoryScreen = lazy(() => import('./screens/HistoryScreen'))
const WeightScreen = lazy(() => import('./screens/WeightScreen'))

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<ScreenSkeleton />}>{children}</Suspense>
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/token" element={<TokenScreen />} />
      <Route element={<RequireToken />}>
        <Route path="/onboarding" element={<OnboardingScreen />} />
        <Route element={<RequireProfile />}>
          <Route element={<AppShell />}>
            <Route index element={<TodayScreen />} />
            <Route path="/capturar" element={<CaptureScreen />} />
            <Route path="/revisar" element={<ReviewScreen />} />
            <Route
              path="/historial"
              element={
                <Lazy>
                  <HistoryScreen />
                </Lazy>
              }
            />
            <Route
              path="/peso"
              element={
                <Lazy>
                  <WeightScreen />
                </Lazy>
              }
            />
            <Route path="/ajustes" element={<SettingsScreen />} />
            <Route path="/ajustes/perfil" element={<ProfileEditScreen />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  const [queryClient] = useState(createQueryClient)
  return (
    <PwaProvider>
      <QueryClientProvider client={queryClient}>
        <ApiProvider>
          <QueueProvider>
            <DraftProvider>
              <BrowserRouter>
                <UpdateBanner />
                <AppRoutes />
              </BrowserRouter>
            </DraftProvider>
          </QueueProvider>
        </ApiProvider>
      </QueryClientProvider>
    </PwaProvider>
  )
}
