import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient, useMutation } from '@tanstack/react-query'
import { brandingSchema, hospitalLogoSchema } from '@redmars/shared'
import { useBranding } from '@/hooks/useBranding'
import { useAuth } from '@/auth/authContext'
import { apiPatch } from '@/lib/api'
import { Check } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  useDiscountCeiling,
  useSetDiscountCeiling,
} from '@/hooks/useDiscountCeiling'

/**
 * Task 6b.1 — admin-only facility settings. One field today: the R10 discount ceiling,
 * which used to be a hardcoded 10% and is now something Axon's owner sets himself.
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
    if (!Number.isFinite(maxPercent) || maxPercent < 0 || maxPercent > 100)
      return
    setCeiling.mutate(maxPercent, { onSuccess: () => setSaved(true) })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.settings')}
        description={t('settings.subtitle')}
      />

      <HospitalBranding />
      <Card className="max-w-lg space-y-4 p-6">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="discountCeiling">
              {t('settings.discountCeiling.label')}
            </Label>
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
            <p className="text-sm text-muted-foreground">
              {t('settings.discountCeiling.hint')}
            </p>
          </div>

          {setCeiling.isError && (
            <p className="text-sm text-destructive">
              {t('settings.discountCeiling.error')}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="submit"
              disabled={setCeiling.isPending || ceilingQuery.isPending}
            >
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

async function resizeLogo(file: File) {
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    file.size > 5 * 1024 * 1024
  )
    throw new Error('invalid logo')
  const image = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    const longest = Math.max(image.width, image.height)
    for (const limit of [512, 384, 256, 192, 128, 96]) {
      const scale = Math.min(1, limit / longest)
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const png = canvas.toDataURL('image/png')
      if (hospitalLogoSchema.safeParse(png).success) return png
    }
    throw new Error('Logo exceeds the branding size limit')
  } finally {
    image.close()
  }
}

function HospitalBranding() {
  const { t } = useTranslation()
  const query = useBranding()
  const { user } = useAuth()
  const client = useQueryClient()
  const [name, setName] = useState<string>()
  const [logo, setLogo] = useState<string | null>()
  const [processing, setProcessing] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const save = useMutation({
    mutationFn: () =>
      apiPatch(
        '/settings/branding',
        { name: (name ?? query.data?.name ?? '').trim(), logo },
        brandingSchema,
      ),
    onSuccess: (data) => {
      client.setQueryData(['branding', user?.facilityId], data)
      void client.invalidateQueries({ queryKey: ['branding', 'public'] })
      setName(undefined)
      setLogo(undefined)
    },
  })
  const preview = logo === undefined ? query.data?.logo : logo
  return (
    <Card className="max-w-lg space-y-4 p-6">
      <h2 className="font-semibold">{t('settings.branding.title')}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate()
        }}
      >
        <fieldset
          disabled={!query.data || save.isPending || processing}
          className="space-y-3"
        >
          <Label htmlFor="hospital-name">{t('settings.branding.name')}</Label>
          <Input
            id="hospital-name"
            maxLength={160}
            required
            value={name ?? query.data?.name ?? ''}
            onChange={(e) => {
              save.reset()
              setName(e.target.value)
            }}
          />
          <Label htmlFor="hospital-logo">{t('settings.branding.logo')}</Label>
          <div className="flex items-center gap-3">
            <img
              className="size-12 object-contain"
              alt=""
              src={preview ?? '/favicon.svg'}
            />
            <Input
              id="hospital-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                setInvalid(false)
                save.reset()
                setProcessing(true)
                try {
                  setLogo(await resizeLogo(file))
                } catch {
                  setInvalid(true)
                } finally {
                  setProcessing(false)
                }
              }}
            />
          </div>
          {preview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                save.reset()
                setInvalid(false)
                setLogo(null)
              }}
            >
              {t('settings.branding.remove')}
            </Button>
          )}
          <div>
            <Button
              type="submit"
              disabled={
                !(name ?? query.data?.name)?.trim() ||
                (name === undefined && logo === undefined)
              }
            >
              {t('settings.save')}
            </Button>
          </div>
        </fieldset>
        {invalid && <p role="alert">{t('settings.branding.invalid')}</p>}
        {(save.isError || query.isError) && (
          <p role="alert">{t('settings.branding.error')}</p>
        )}
        {save.isSuccess && <p role="status">{t('settings.saved')}</p>}
      </form>
    </Card>
  )
}
