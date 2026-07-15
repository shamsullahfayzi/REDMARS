import { useState } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router'
import { FirstRunLanguagePicker } from '@/components/FirstRunLanguagePicker'
import { getStoredLanguage } from '@/i18n/languages'
import { useDocumentLanguage } from '@/i18n/useDocumentLanguage'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/router'

export function AppRoot() {
  // Above the branch on purpose: the picker itself needs <html dir> to be right.
  useDocumentLanguage()

  const [hasChosen, setHasChosen] = useState(() => getStoredLanguage() !== null)

  if (!hasChosen) {
    return <FirstRunLanguagePicker onChosen={() => setHasChosen(true)} />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
