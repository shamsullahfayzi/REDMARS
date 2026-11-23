import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

export function CatalogPagination({ page, pageSize, total, onChange }: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()
  const pageCount = Math.ceil(total / pageSize)
  if (pageCount <= 1 && page === 1) return null
  return (
    <div className="flex items-center gap-3">
      <Button type="button" size="sm" variant="outline" disabled={page <= 1}
        onClick={() => onChange(page - 1)}>{t('invoices.previous')}</Button>
      <span aria-live="polite" className="text-sm">{t('invoices.page', { page, pageCount })}</span>
      <Button type="button" size="sm" variant="outline" disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}>{t('invoices.next')}</Button>
    </div>
  )
}
