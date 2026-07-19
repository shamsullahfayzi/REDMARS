import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { getStoredTheme, storeTheme, systemTheme, type Theme } from './theme'
import { ThemeContext } from './themeContext'

/**
 * Applies the theme by toggling the `.dark` class on <html> — the hinge the shadcn
 * tokens hang off (see index.css `@custom-variant dark`). useLayoutEffect, not
 * useEffect, so the class lands before the browser paints and there is no flash of
 * the wrong theme on the first render.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme() ?? systemTheme())

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      storeTheme(next)
      return next
    })
  }, [])

  const value = useMemo(() => ({ theme, setTheme, toggle }), [theme, setTheme, toggle])

  return <ThemeContext value={value}>{children}</ThemeContext>
}
