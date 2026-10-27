import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  SHAMSI_MIN_YEAR,
  SHAMSI_MAX_YEAR,
  formatShamsiDate,
  gregorianToShamsi,
  isShamsiLeapYear,
  parseShamsiDate,
  shamsiDayBounds,
  shamsiMonthLength,
  shamsiToGregorian,
  utcToShamsi,
} from '@redmars/shared'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

/** Read-only calendar conversion, available before the books are initialized. */
export function ShamsiCalendar() {
  const { t, i18n } = useTranslation()
  const [direction, setDirection] = useState<'shamsi' | 'gregorian'>('shamsi')
  const [value, setValue] = useState('1404-01-01')
  const language = i18n.language === 'prs' || i18n.language === 'ps' ? i18n.language : 'en'
  let result: {
    shamsi: string
    gregorian: string
    label: string
    leap: boolean
    days: number
    start: string
    end: string
  } | null = null
  try {
    const shamsi = direction === 'shamsi' ? value : gregorianToShamsi(value)
    const gregorian = shamsiToGregorian(shamsi)
    const { year, month } = parseShamsiDate(shamsi)
    const bounds = shamsiDayBounds(shamsi)
    result = {
      shamsi,
      gregorian,
      label: formatShamsiDate(shamsi, language),
      leap: isShamsiLeapYear(year),
      days: shamsiMonthLength(year, month),
      start: bounds.start.toISOString(),
      end: bounds.endExclusive.toISOString(),
    }
  } catch {
    // An incomplete or invalid input has no conversion result.
  }

  function changeDirection(next: typeof direction) {
    setValue(result ? result[next] : '')
    setDirection(next)
  }

  return (
    <Card className="p-5">
      <details open>
        <summary className="cursor-pointer text-lg font-semibold">
          {t('shamsiCalendar.title')}
        </summary>
        <p className="mt-2 text-sm text-muted-foreground">{t('shamsiCalendar.description')}</p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label={t('shamsiCalendar.direction')}
            >
              {(['shamsi', 'gregorian'] as const).map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={direction === mode ? 'default' : 'outline'}
                  aria-pressed={direction === mode}
                  onClick={() => changeDirection(mode)}
                >
                  {t(`shamsiCalendar.from_${mode}`)}
                </Button>
              ))}
            </div>
            <label className="grid gap-2 text-sm font-medium" htmlFor="finance-calendar-date">
              {t(`shamsiCalendar.${direction}`)}
              <Input
                id="finance-calendar-date"
                dir="ltr"
                type={direction === 'gregorian' ? 'date' : 'text'}
                value={value}
                placeholder="1404-01-01"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={!!value && !result}
                aria-describedby="finance-calendar-help finance-calendar-error"
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            <p id="finance-calendar-help" className="text-sm text-muted-foreground">
              {t('shamsiCalendar.help', { min: SHAMSI_MIN_YEAR, max: SHAMSI_MAX_YEAR })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const now = utcToShamsi(new Date())
                  setValue(direction === 'shamsi' ? now : shamsiToGregorian(now))
                }}
              >
                {t('shamsiCalendar.today')}
              </Button>
              {['1404-01-01', '1403-12-30', '1404-07-05'].map((sample) => (
                <Button
                  key={sample}
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setValue(direction === 'shamsi' ? sample : shamsiToGregorian(sample))
                  }}
                >
                  {formatShamsiDate(sample, language)}
                </Button>
              ))}
            </div>
            <p id="finance-calendar-error" role="status" className="text-sm text-destructive">
              {value && !result ? t('shamsiCalendar.invalid') : ''}
            </p>
          </div>
          <div aria-live="polite" aria-atomic="true" className="rounded-lg border bg-muted/30 p-4">
            {result ? (
              <>
                <p className="text-lg font-semibold">{result.label}</p>
                <dl className="mt-4 grid gap-3 text-sm">
                  {[
                    [t('shamsiCalendar.shamsi'), result.shamsi],
                    [t('shamsiCalendar.gregorian'), result.gregorian],
                    [t('shamsiCalendar.utcStart'), result.start],
                    [t('shamsiCalendar.utcEnd'), result.end],
                    [t('shamsiCalendar.daysInMonth'), String(result.days)],
                  ].map(([label, text]) => (
                    <div key={label} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd dir="ltr" className="break-all font-mono">
                        {text}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm font-medium">
                  {t(result.leap ? 'shamsiCalendar.leap' : 'shamsiCalendar.common')}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{t('shamsiCalendar.boundary')}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t('shamsiCalendar.enterDate')}</p>
            )}
          </div>
        </div>
      </details>
    </Card>
  )
}
