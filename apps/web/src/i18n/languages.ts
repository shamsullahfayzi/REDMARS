/**
 * The languages REDMARS speaks, and which way each one runs.
 *
 * Single source of truth: the toggle, the first-run picker, the i18next config
 * and the <html dir> sync all read from here. Adding a language means adding a
 * row and a locale file — nothing else.
 */

export type LanguageCode = 'en' | 'prs' | 'ps'
export type Direction = 'ltr' | 'rtl'

export interface LanguageMeta {
  code: LanguageCode
  /** For our own UI/debugging. */
  englishName: string
  /** How speakers write the name of their own language — what the picker shows. */
  nativeName: string
  dir: Direction
}

export const LANGUAGES: Record<LanguageCode, LanguageMeta> = {
  en: { code: 'en', englishName: 'English', nativeName: 'English', dir: 'ltr' },
  prs: { code: 'prs', englishName: 'Dari', nativeName: 'دری', dir: 'rtl' },
  ps: { code: 'ps', englishName: 'Pashto', nativeName: 'پښتو', dir: 'rtl' },
}

export const LANGUAGE_CODES = Object.keys(LANGUAGES) as LanguageCode[]

/** Only a last resort. Real selection is the user's choice, then (Phase 2) the facility default. */
export const FALLBACK_LANGUAGE: LanguageCode = 'en'

const STORAGE_KEY = 'redmars.language'

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in LANGUAGES
}

/**
 * The user's explicit choice, or null if they have never picked one.
 * null is what triggers the first-run picker.
 *
 * Phase 2: when settings exist, the chain becomes
 *   stored choice -> facility default (DB) -> picker.
 */
export function getStoredLanguage(): LanguageCode | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLanguageCode(stored) ? stored : null
  } catch {
    // Storage can throw (private mode, disabled). Never let that break boot.
    return null
  }
}

export function storeLanguage(code: LanguageCode): void {
  try {
    localStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Non-fatal: they just get asked again next visit.
  }
}
