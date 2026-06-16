import { useEffect, useState, useCallback, useRef } from 'react'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import styles from './MusicPlayerPopup.module.css'

function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3`
}

function youtubeSearchEmbed(artist: string, track: string): string {
  const q = encodeURIComponent(`${artist} ${track}`)
  return `https://www.youtube.com/embed?autoplay=1&listType=search&list=${q}&modestbranding=1&rel=0`
}

export default function MusicPlayerPopup() {
  const { isOpen, artist, track, source, resolving, closePlayer } = useMusicPlayer()
  const [closing, setClosing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastKey = useRef<string>('')

  // Soft close with exit animation
  const handleClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    closeTimer.current = setTimeout(() => {
      closePlayer()
      setClosing(false)
      setExpanded(false)
    }, 260)
  }, [closePlayer, closing])

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  // Cancel close animation when a new track opens
  useEffect(() => {
    if (isOpen && artist && track) {
      const key = `${artist}::${track}`
      if (key !== lastKey.current) {
        lastKey.current = key
        if (closeTimer.current) {
          clearTimeout(closeTimer.current)
          closeTimer.current = undefined
        }
        setClosing(false)
        setExpanded(false)
      }
    }
  }, [isOpen, artist, track])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (expanded) {
          setExpanded(false)
        } else {
          handleClose()
        }
      }
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [isOpen, expanded, handleClose])

  // Close when clicking outside the panel
  useEffect(() => {
    if (!isOpen || !expanded) return
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [isOpen, expanded])

  if (!isOpen || !artist || !track) return null

  const videoId = source?.youtubeVideoId
  const isMusicPlaying = isOpen && !resolving

  return (
    <div className={styles.orbAnchor}>
      {/* ── Expanded Panel ── */}
      {expanded && (
        <div ref={panelRef} className={`${styles.panel} ${closing ? styles.closing : ''}`}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerInfo}>
              <span className={styles.headerTrack}>{track}</span>
              <span className={styles.headerArtist}>{artist}</span>
            </div>
            <div className={styles.headerActions}>
              {resolving && (
                <span className={styles.sourceBadge}>
                  <span className={styles.spinnerSmall} />
                  searching
                </span>
              )}
              {!resolving && source?.type === 'youtube' && (
                <span className={styles.sourceBadge}>YouTube</span>
              )}
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${track}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.externalBtn}
                title="Open YouTube search"
              >
                <span className="neuro-icon neuro-icon-external" /> YT
              </a>
              <button className={styles.closeBtn} onClick={handleClose} title="Close player">
                <span className="neuro-icon neuro-icon-close" />
              </button>
            </div>
          </div>

          {/* Player area */}
          <div className={styles.playerWrap}>
            {resolving && (
              <div className={styles.checkingOverlay}>
                <div className={styles.spinner} />
                <span className={styles.checkingText}>Finding the best video...</span>
              </div>
            )}

            {videoId && (
              <iframe
                key={`yt-${videoId}`}
                className={styles.player}
                src={youtubeEmbedUrl(videoId)}
                allow="autoplay; fullscreen"
                allowFullScreen
                title={`${artist} - ${track} (YouTube)`}
              />
            )}

            {!resolving && !videoId && source?.type === 'youtube' && (
              <iframe
                key={`yt-search-${artist}-${track}`}
                className={styles.player}
                src={youtubeSearchEmbed(artist, track)}
                allow="autoplay; fullscreen"
                allowFullScreen
                title={`${artist} - ${track} (YouTube Search)`}
              />
            )}

            {!resolving && source?.type === 'none' && (
              <div className={styles.noSource}>
                <span style={{ fontSize: '2rem', opacity: 0.2, marginBottom: '4px' }}>🧪</span>
                <p>No video found for this track.</p>
                <a
                  href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${track}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neuro-btn neuro-btn-accent"
                  style={{ marginTop: '8px', display: 'inline-flex', textDecoration: 'none', fontSize: '0.72rem', padding: '8px 18px' }}
                >
                  Search YouTube →
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Toxic Orb ── */}
      <div
        className={`${styles.orb} ${isMusicPlaying ? styles.orbPlaying : ''}`}
        onClick={() => setExpanded((p) => !p)}
        title={`${artist} - ${track}`}
      >
        {/* Liquid fill */}
        <div className={styles.liquidFill} />

        {/* Bubbles */}
        <div className={styles.bubbles}>
          <span className={styles.bubble} />
          <span className={styles.bubble} />
          <span className={styles.bubble} />
          <span className={styles.bubble} />
          <span className={styles.bubble} />
          <span className={styles.bubble} />
        </div>

        {/* Drip particles */}
        <div className={styles.dripParticles}>
          <span className={styles.drip} />
          <span className={styles.drip} />
          <span className={styles.drip} />
          <span className={styles.drip} />
          <span className={styles.drip} />
          <span className={styles.drip} />
          <span className={styles.drip} />
          <span className={styles.drip} />
        </div>

        {/* Play icon */}
        <span className={styles.orbIcon}>
          {isMusicPlaying ? '⏸' : '▶'}
        </span>
      </div>

      {/* Tooltip label on hover */}
      <span className={styles.orbLabel}>
        {track} — {artist}
      </span>
    </div>
  )
}
