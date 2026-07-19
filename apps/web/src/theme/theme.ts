export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'redmars.theme'

/**
 * Theme is a per-browser preference in localStorage for now. Task note: this moves
 * to a user/facility setting on the settings page in a later phase — until then it
 * lives here, deliberately, exactly like the language choice did before it.
 */
export function getStoredTheme(): Theme | null {
  const value = localStorage.getItem(STORAGE_KEY)
  return value === 'light' || value === 'dark' ? value : null
}

export function storeTheme(theme: Theme): void {
  localStorage.setItem(STORAGE_KEY, theme)
}

/** The OS preference, used as the default the first time — before the user has chosen. */
export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
