import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

/**
 * Placeholder home. Real content arrives with the role-based nav in 1.6.
 * For now it proves Tailwind + shadcn render and the language flip works.
 */
export function HomePage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('app.name')}</h1>
      <p className="text-muted-foreground">{t('shell.subtitle')}</p>

      {/* Sanity check for the numeral rule: this must read 1,234.5 in Dari and
          Pashto too, never ۱٬۲۳۴٫۵ */}
      <p className="text-sm text-muted-foreground">{formatNumber(1234.5)}</p>

      <Button>{t('language.label')}</Button>
    </div>
  )
}
