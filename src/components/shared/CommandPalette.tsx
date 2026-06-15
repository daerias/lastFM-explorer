// Command Palette — Ctrl+K to open, keyboard-first navigation
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import styles from './CommandPalette.module.css'

interface Command {
  id: string
  label: string
  shortcut?: string
  category: 'nav' | 'action' | 'search'
  action: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  recentTracks?: { artist: string; track: string }[]
  topArtists?: string[]
}

export default function CommandPalette({ isOpen, onClose, recentTracks = [], topArtists = [] }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const { openPlayer } = useMusicPlayer()

  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [
      // Navigation
      { id: 'nav-home', label: 'Go to Home', shortcut: 'g h', category: 'nav', action: () => navigate('/') },
      { id: 'nav-library', label: 'Go to Library', shortcut: 'g l', category: 'nav', action: () => navigate('/library') },
      { id: 'nav-tags', label: 'Go to Tags', shortcut: 'g t', category: 'nav', action: () => navigate('/tags') },
      { id: 'nav-settings', label: 'Go to Settings', shortcut: 'g s', category: 'nav', action: () => navigate('/settings') },
      // Actions
      { id: 'zen-toggle', label: 'Toggle Zen Mode', shortcut: 'z', category: 'action', action: () => { window.dispatchEvent(new CustomEvent('toggle-zen')); onClose() } },
      { id: 'cmd-close', label: 'Close Command Palette', shortcut: 'Esc', category: 'action', action: onClose },
    ]

    // Add recent tracks for quick play
    for (const t of recentTracks.slice(0, 10)) {
      cmds.push({
        id: `play-${t.artist}-${t.track}`,
        label: `Play: ${t.artist} — ${t.track}`,
        category: 'search',
        action: () => { openPlayer(t.artist, t.track); onClose() },
      })
    }

    // Add top artists for quick search
    for (const a of topArtists.slice(0, 10)) {
      cmds.push({
        id: `artist-${a}`,
        label: `Artist: ${a}`,
        category: 'search',
        action: () => { navigate(`/library?artist=${encodeURIComponent(a)}`); onClose() },
      })
    }

    return cmds
  }, [navigate, openPlayer, onClose, recentTracks, topArtists])

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter((c) => c.label.toLowerCase().includes(q))
  }, [commands, query])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[selectedIndex]?.action()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [filtered, selectedIndex, onClose])

  if (!isOpen) return null

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.palette} onClick={(e) => e.stopPropagation()}>
        <div className={styles.searchWrap}>
          <span className="neuro-icon neuro-icon-search" style={{ opacity: 0.5, marginRight: '8px' }} />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Type a command or search..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
          />
          <span className={styles.hint}>esc</span>
        </div>
        <div className={styles.list}>
          {filtered.map((cmd, i) => (
            <div
              key={cmd.id}
              className={`${styles.item} ${i === selectedIndex ? styles.itemSelected : ''}`}
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span className={styles.itemCategory}>
                {cmd.category === 'nav' ? '🧭' : cmd.category === 'action' ? '⚡' : '🔍'}
              </span>
              <span className={styles.itemLabel}>{cmd.label}</span>
              {cmd.shortcut && <span className={styles.itemShortcut}>{cmd.shortcut}</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className={styles.empty}>No matching commands</div>
          )}
        </div>
      </div>
    </div>
  )
}
