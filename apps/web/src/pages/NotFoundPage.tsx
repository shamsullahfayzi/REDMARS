import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export function NotFoundPage() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold text-foreground">{t('notFound.title')}</h1>
      <p className="text-muted-foreground">{t('notFound.body')}</p>
      <Link to="/" className="text-sm underline underline-offset-4">
        {t('notFound.back')}
      </Link>
    </div>
  )
}
