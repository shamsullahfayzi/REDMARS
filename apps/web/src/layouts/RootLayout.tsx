import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { LanguageToggle } from '@/components/LanguageToggle'

/**
 * App shell. Deliberately bare.
 *
 * Every spacing/alignment class here is logical (ps-/pe-, ms-/me-, text-start),
 * never physical (pl-/pr-, text-left). That is what lets dir="rtl" mirror this
 * without a second stylesheet. See useDocumentLanguage.
 */
export function RootLayout() {
  const { t } = useTranslation()

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <span className="font-semibold">{t('app.name')}</span>
          {/* ms-auto, not ml-auto: pushes to the inline end, so it lands on the
              right in LTR and the left in RTL. */}
          <div className="ms-auto">
            <LanguageToggle />
          </div>
          {/* Role-based nav lands in 1.6. */}
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-4">
        <Outlet />
      </main>
    </div>
  )
}
