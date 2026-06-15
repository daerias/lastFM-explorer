import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { MusicPlayerProvider } from './context/MusicPlayerContext'
import MusicPlayerPopup from './components/shared/MusicPlayerPopup'
import ParticleBackground from './components/shared/ParticleBackground'
import CommandPalette from './components/shared/CommandPalette'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import Library from './pages/Library'
import DayDetail from './pages/DayDetail'
import Settings from './pages/Settings'
import Tags from './pages/Tags'
import AuthCallback from './pages/AuthCallback'

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)

  // Ctrl+K → Command Palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((p) => !p)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <AuthProvider>
      <MusicPlayerProvider>
        <ParticleBackground />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="library" element={<Library />} />
            <Route path="day/:date" element={<DayDetail />} />
            <Route path="settings" element={<Settings />} />
            <Route path="tags" element={<Tags />} />
          </Route>
        </Routes>
        <MusicPlayerPopup />
        <CommandPalette isOpen={paletteOpen} onClose={() => setPaletteOpen(false)} />
      </MusicPlayerProvider>
    </AuthProvider>
  )
}
