import { QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { RequireProfile, RequireToken } from './components/Guards'
import { AppShell, UpdateBanner } from './components/Layout'
import { ApiProvider } from './lib/apiContext'
import { DraftProvider } from './lib/draft'
import { PwaProvider } from './lib/pwa'
import { createQueryClient } from './lib/queryClient'
import { CaptureScreen } from './screens/CaptureScreen'
import { OnboardingScreen } from './screens/OnboardingScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TodayScreen } from './screens/TodayScreen'
import { TokenScreen } from './screens/TokenScreen'

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
            <Route path="/ajustes" element={<SettingsScreen />} />
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
          <DraftProvider>
            <BrowserRouter>
              <UpdateBanner />
              <AppRoutes />
            </BrowserRouter>
          </DraftProvider>
        </ApiProvider>
      </QueryClientProvider>
    </PwaProvider>
  )
}
