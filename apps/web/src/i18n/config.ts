import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import prs from './locales/prs.json'
import ps from './locales/ps.json'
import { FALLBACK_LANGUAGE, getStoredLanguage } from './languages'

/**
 * Imported once, for its side effect, from main.tsx before anything renders.
 *
 * No language detector plugin on purpose: the browser's Accept-Language is a bad
 * guess in a hospital where every machine ships with an English Windows install.
 * The user's explicit choice is the only signal we trust — and Phase 2 adds the
 * facility default from the DB behind it.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    prs: { translation: prs },
    ps: { translation: ps },
  },
  lng: getStoredLanguage() ?? FALLBACK_LANGUAGE,
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: {
    // React already escapes.
    escapeValue: false,
  },
})

export default i18n
