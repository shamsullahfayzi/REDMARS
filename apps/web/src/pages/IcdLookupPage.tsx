import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { MIN_ICD_QUERY_LENGTH } from '@redmars/shared'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useDebounced } from '@/hooks/useDebounced'
import { useIcdSearch } from '@/hooks/useIcdSearch'

/**
 * Read-only ICD-10 diagnosis lookup (task 2.9). The catalog is seeded reference
 * data — nothing is created or edited here. The real consumer of this search is the
 * consultation form in a later phase; this page proves the search and lets an admin
 * or doctor look a code up directly. Server-side diagnosis.read.
 */
export function IcdLookupPage() {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const query = useDebounced(input, 250)
  const searchQuery = useIcdSearch(query)

  const tooShort = query.trim().length > 0 && query.trim().length < MIN_ICD_QUERY_LENGTH
  const results = searchQuery.data?.results ?? []

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.icd')} description={t('icd.subtitle')} />

      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('icd.searchPlaceholder')}
          className="ps-9"
          autoFocus
        />
      </div>

      {tooShort && <p className="text-sm text-muted-foreground">{t('icd.tooShort')}</p>}
      {searchQuery.isError && <p className="text-sm text-destructive">{t('icd.error')}</p>}

      {query.trim().length >= MIN_ICD_QUERY_LENGTH && !searchQuery.isError && (
        <section className="space-y-3">
          {results.length === 0 && !searchQuery.isPending ? (
            <p className="text-muted-foreground">{t('icd.empty')}</p>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="p-3 text-start font-medium">{t('icd.code')}</th>
                    <th className="p-3 text-start font-medium">{t('icd.title')}</th>
                    <th className="p-3 text-start font-medium">{t('icd.chapter')}</th>
                    <th className="p-3 text-end font-medium">{t('icd.billable')}</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.code} className="border-b border-border last:border-0">
                      <td className="p-3 font-mono text-foreground">{row.code}</td>
                      <td className="p-3 text-foreground">
                        {row.title}
                        {row.titleLocal && (
                          <div className="text-xs text-muted-foreground" dir="rtl">
                            {row.titleLocal}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground">{row.chapter ?? '—'}</td>
                      <td className="p-3 text-end">
                        {row.isBillable ? (
                          <Badge variant="active">{t('icd.billableYes')}</Badge>
                        ) : (
                          <Badge variant="muted">{t('icd.billableNo')}</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </section>
      )}
    </div>
  )
}

// A value that only updates after it has stopped changing for `delay` ms — so a
// keystroke storm makes one request, not one per character.
