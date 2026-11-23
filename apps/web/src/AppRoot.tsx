import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { DocumentBranding } from '@/hooks/useBranding'
import { AuthProvider } from '@/auth/AuthProvider'
import { FirstRunLanguagePicker } from '@/components/FirstRunLanguagePicker'
import { getStoredLanguage } from '@/i18n/languages'
import { useDocumentLanguage } from '@/i18n/useDocumentLanguage'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'
import { ThemeProvider } from '@/theme/ThemeProvider'

export function AppRoot() {
  // Above the branch on purpose: the picker itself needs <html dir> to be right.
  useDocumentLanguage()

  const [hasChosen, setHasChosen] = useState(() => getStoredLanguage() !== null)

  // ThemeProvider wraps everything — login and the first-run picker included — so
  // the chosen theme applies before the user is even signed in.
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DocumentBranding />
          {hasChosen ? <RouterProvider router={router} /> : <FirstRunLanguagePicker onChosen={() => setHasChosen(true)} />}
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
