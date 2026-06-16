import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { getTheme, applyTheme, applyAllCustomizations } from './store/theme'
import { applyAllIconSettings } from './store/iconStyle'
import { applyLut, getActiveLut, DOF_DEFAULTS, applyDof } from './store/lut'
import './styles/theme.css'
import './styles/neuro-icons.css'

// Apply saved theme, customizations, icon style before first render to avoid flash
applyTheme(getTheme())
applyAllCustomizations()
applyAllIconSettings()

// Only apply LUT color grading (no blur). DOF is NEVER auto-applied —
// it must be explicitly enabled in Settings to avoid accidental blur.
applyLut(getActiveLut())
// Force-disable DOF on startup (nuclear migration from old 100% blur sessions)
applyDof(DOF_DEFAULTS)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
