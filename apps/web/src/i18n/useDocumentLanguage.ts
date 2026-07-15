import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FALLBACK_LANGUAGE, LANGUAGES, isLanguageCode, type LanguageMeta } from './languages'

/**
 * Keeps <html lang> and <html dir> in step with the active language.
 *
 * This is the hinge of the whole RTL story. Setting dir="rtl" on the root makes
 * every CSS logical property (padding-inline-start, margin-inline-end, text-align:
 * start) mirror itself — which is why the rule is: never write left/right, pl-/pr-,
 * ml-/mr-, text-left/text-right anywhere in this app. Use the logical forms
 * (ps-/pe-, ms-/me-, text-start/text-end) and the layout flips for free.
 *
 * lang matters too, and not only for screen readers: it drives font selection and
 * line-breaking for Arabic-script text.
 */
export function useDocumentLanguage(): LanguageMeta {
  const { i18n } = useTranslation()

  const code = isLanguageCode(i18n.language) ? i18n.language : FALLBACK_LANGUAGE
  const meta = LANGUAGES[code]

  useEffect(() => {
    document.documentElement.lang = meta.code
    document.documentElement.dir = meta.dir
  }, [meta])

  return meta
}
