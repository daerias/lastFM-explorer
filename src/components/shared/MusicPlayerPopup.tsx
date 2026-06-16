import { useEffect, useState, useCallback, useRef } from 'react'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import styles from './MusicPlayerPopup.module.css'

/** Build a direct YouTube embed URL for a specific video */
function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&modestbranding=1&rel=0&iv_load_policy=3`
}

/** Build a YouTube search embed URL as fallback when no video ID is known */
function youtubeSearchEmbed(artist: string, track: string): string {
  const q = encodeURIComponent(`${artist} ${track}`)
  return `https://www.youtube.com/embed?autoplay=1&listType=search&list=${q}&modestbranding=1&rel=0`
}

export default function MusicPlayerPopup() {
  const { isOpen, artist, track, source, resolving, closePlayer } = useMusicPlayer()
  const [closing, setClosing] = useState(false)
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
    }, 280)
  }, [closePlayer, closing])

  // Cleanup timers on unmount
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
      }
    }
  }, [isOpen, artist, track])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [isOpen, handleClose])

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [isOpen, handleClose])

  if (!isOpen || !artist || !track) return null

  const videoId = source?.youtubeVideoId

  return (
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
          <button className={styles.closeBtn} onClick={handleClose}>
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

        {/* Fallback: if resolving finished with no videoId, use search embed */}
        {/* Fallback: search embed when no specific video ID was found */}
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
            <span style={{ fontSize: '2.2rem', opacity: 0.25, marginBottom: '4px' }}>🎵</span>
            <p>No video found for this track.</p>
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${track}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="neuro-btn neuro-btn-accent"
              style={{ marginTop: '8px', display: 'inline-flex', textDecoration: 'none', fontSize: '0.75rem', padding: '10px 22px' }}
            >
              Search YouTube →
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
