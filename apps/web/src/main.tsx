import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Side-effect import: i18next must be initialised before any component renders.
import '@/i18n/config'
import { AppRoot } from '@/AppRoot'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppRoot />
  </StrictMode>,
)
