import { useTranslation } from 'react-i18next'
import { LANGUAGE_CODES, LANGUAGES, storeLanguage, type LanguageCode } from '@/i18n/languages'

interface Props {
  onChosen: () => void
}

/**
 * Shown once, when nobody has ever picked a language on this machine.
 *
 * Every option is written in its own script and nothing else is on the screen —
 * a receptionist who reads only Dari should not have to parse an English
 * sentence to find دری. That is also why there is no translated prompt above
 * the buttons: at this moment we do not yet know which language to prompt in.
 *
 * Phase 2: the facility default from the DB will pre-empt this for machines
 * that have never been used, leaving this as the fallback.
 */
export function FirstRunLanguagePicker({ onChosen }: Props) {
  const { i18n } = useTranslation()

  function choose(code: LanguageCode) {
    storeLanguage(code)
    void i18n.changeLanguage(code)
    onChosen()
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">REDMARS HMIS</h1>
        </div>

        <div className="flex flex-col gap-2">
          {LANGUAGE_CODES.map((code) => {
            const meta = LANGUAGES[code]
            return (
              <button
                key={code}
                type="button"
                lang={code}
                dir={meta.dir}
                onClick={() => choose(code)}
                className="rounded-lg border border-border px-4 py-3 text-lg transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {meta.nativeName}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
