import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { getTheme, applyTheme, applyAllCustomizations } from './store/theme'
import { applyAllIconSettings } from './store/iconStyle'
import { applyAllCinematic } from './store/lut'
import './styles/theme.css'
import './styles/neuro-icons.css'

// Apply saved theme, customizations, icon style, and cinematic before first render to avoid flash
applyTheme(getTheme())
applyAllCustomizations()
applyAllIconSettings()
applyAllCinematic()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
