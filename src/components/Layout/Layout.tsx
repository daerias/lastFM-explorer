import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import PlaylistCreator from '../shared/PlaylistCreator'
import styles from './Layout.module.css'

export default function Layout() {
  const [zenMode, setZenMode] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)

  // Listen for zen toggle from command palette
  useEffect(() => {
    const handler = () => setZenMode((z) => !z)
    window.addEventListener('toggle-zen', handler)
    return () => window.removeEventListener('toggle-zen', handler)
  }, [])

  // Listen for playlist creator toggle
  useEffect(() => {
    const handler = () => setPlaylistOpen((p) => !p)
    window.addEventListener('toggle-playlist-creator', handler)
    return () => window.removeEventListener('toggle-playlist-creator', handler)
  }, [])

  // Ctrl+P toggles playlist (z key handled by useVimKeys hook)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'p' && e.ctrlKey) {
        e.preventDefault()
        setPlaylistOpen((p) => !p)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Apply zen attribute
  useEffect(() => {
    if (zenMode) {
      document.documentElement.setAttribute('data-zen', 'on')
    } else {
      document.documentElement.removeAttribute('data-zen')
    }
  }, [zenMode])

  return (
    <div className={`${styles.layout} ${zenMode ? styles.zenMode : ''}`}>
      {!zenMode && <Sidebar />}
      <main className={styles.main}>
        <div className={styles.mainInner}>
          {zenMode && (
            <div className={styles.zenBar}>
              <span className={styles.zenTitle}>Zen Mode</span>
              <button className={styles.zenExit} onClick={() => setZenMode(false)} title="Exit Zen (z)">
                ✕
              </button>
            </div>
          )}
          <Outlet />
        </div>
      </main>

      {/* Global Playlist Creator — right slide-out panel */}
      <div className={`${styles.playlistOverlay} ${playlistOpen ? styles.playlistOverlayOpen : ''}`} onClick={() => setPlaylistOpen(false)} />
      <div className={`${styles.playlistPanel} ${playlistOpen ? styles.playlistPanelOpen : ''}`}>
        <div className={styles.playlistPanelHeader}>
          <span className={styles.playlistPanelTitle}>🎧 Playlist Creator</span>
          <button className={styles.playlistPanelClose} onClick={() => setPlaylistOpen(false)} title="Close (Ctrl+P)">✕</button>
        </div>
        <div className={styles.playlistPanelBody}>
          <PlaylistCreator visible={playlistOpen} />
        </div>
      </div>
    </div>
  )
}
