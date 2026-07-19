import { useTranslation } from 'react-i18next'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/theme/themeContext'

/**
 * One-click light/dark flip. Shows the icon of the theme you would switch TO — a
 * sun in dark mode, a moon in light — which is the convention users expect.
 */
export function ThemeToggle() {
  const { t } = useTranslation()
  const { theme, toggle } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
    >
      {theme === 'dark' ? <Sun /> : <Moon />}
    </Button>
  )
}
