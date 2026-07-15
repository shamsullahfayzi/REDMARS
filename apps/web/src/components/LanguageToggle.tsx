import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import {
  LANGUAGE_CODES,
  LANGUAGES,
  storeLanguage,
  type LanguageCode,
} from '@/i18n/languages'

/**
 * Plain button group rather than a dropdown: three options, and staff switching
 * language should be one click, not two. Each option is written in its own
 * script — someone looking for Pashto scans for پښتو, not the word "Pashto".
 */
export function LanguageToggle() {
  const { i18n } = useTranslation()

  function select(code: LanguageCode) {
    storeLanguage(code)
    void i18n.changeLanguage(code)
  }

  return (
    <div className="flex items-center gap-1" role="group">
      {LANGUAGE_CODES.map((code) => {
        const meta = LANGUAGES[code]
        const active = i18n.language === code

        return (
          <button
            key={code}
            type="button"
            lang={code}
            aria-pressed={active}
            onClick={() => select(code)}
            className={cn(
              'rounded-md px-2 py-1 text-sm transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {meta.nativeName}
          </button>
        )
      })}
    </div>
  )
}
