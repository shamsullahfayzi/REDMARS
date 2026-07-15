import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { FirstRunLanguagePicker } from '@/components/FirstRunLanguagePicker'
import { getStoredLanguage } from '@/i18n/languages'
import { useDocumentLanguage } from '@/i18n/useDocumentLanguage'
import { router } from '@/router'

export function AppRoot() {
  // Above the branch on purpose: the picker itself needs <html dir> to be right.
  useDocumentLanguage()

  const [hasChosen, setHasChosen] = useState(() => getStoredLanguage() !== null)

  if (!hasChosen) {
    return <FirstRunLanguagePicker onChosen={() => setHasChosen(true)} />
  }

  return <RouterProvider router={router} />
}
