import { useTranslation } from 'react-i18next'

/**
 * Stand-in for a menu destination whose real screen belongs to a later phase.
 * Exists so role-based nav in 1.6 leads somewhere honest ("this arrives later")
 * instead of a 404, without pretending the feature is built.
 */
export function PlaceholderPage({ sectionKey }: { sectionKey: string }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold text-foreground">{t(`nav.${sectionKey}`)}</h1>
      <p className="text-muted-foreground">{t('placeholder.comingSoon')}</p>
    </div>
  )
}
