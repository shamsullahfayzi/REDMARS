import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDiscountCeiling, useSetDiscountCeiling } from '@/hooks/useDiscountCeiling'

/**
 * Task 6b.1 — admin-only facility settings. One field today: the R10 discount ceiling,
 * which used to be a hardcoded 10% and is now something Farhat's owner sets himself.
 *
 * The ceiling still has a floor under it: a receptionist without
 * `discount.approve_over_threshold` cannot exceed whatever number is set here, but an
 * admin can still authorise a one-off discount above it at the till (task 6.5) — this
 * screen changes the everyday limit, not the override.
 */
export function SettingsPage() {
  const { t } = useTranslation()
  const ceilingQuery = useDiscountCeiling()
  const setCeiling = useSetDiscountCeiling()

  const [value, setValue] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (ceilingQuery.data) setValue(String(ceilingQuery.data.maxPercent))
  }, [ceilingQuery.data])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    const maxPercent = Number(value)
    if (!Number.isFinite(maxPercent) || maxPercent < 0 || maxPercent > 100) return
    setCeiling.mutate(maxPercent, { onSuccess: () => setSaved(true) })
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.settings')} description={t('settings.subtitle')} />

      <Card className="max-w-lg space-y-4 p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="discountCeiling">{t('settings.discountCeiling.label')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="discountCeiling"
                type="number"
                dir="ltr"
                min={0}
                max={100}
                step="1"
                className="max-w-32"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <p className="text-sm text-muted-foreground">{t('settings.discountCeiling.hint')}</p>
          </div>

          {setCeiling.isError && (
            <p className="text-sm text-destructive">{t('settings.discountCeiling.error')}</p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={setCeiling.isPending || ceilingQuery.isPending}>
              {setCeiling.isPending ? t('settings.saving') : t('settings.save')}
            </Button>
            {saved && !setCeiling.isPending && (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <Check className="size-4" aria-hidden />
                {t('settings.saved')}
              </span>
            )}
          </div>
        </form>
      </Card>
    </div>
  )
}
