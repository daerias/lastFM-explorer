import { useEffect, useState, useCallback, useRef } from 'react'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import styles from './MusicPlayerPopup.module.css'

const DEEZER_WIDGET_URL = 'https://widget.deezer.com/widget/dark/track/'

/** Build a YouTube search embed URL — no mute, no videoseries (deprecated) */
function youtubeSearchUrl(artist: string, track: string): string {
  const q = encodeURIComponent(`${artist} ${track} official audio`)
  return `https://www.youtube.com/embed?autoplay=1&listType=search&list=${q}&modestbranding=1&rel=0`
}
const FALLBACK_DELAY = 8000 // 8s timeout before forcing YouTube (was 6s)

function soundcloudQuery(artist: string, track: string): string {
  return encodeURIComponent(`${artist} ${track}`)
}

function sourceLabel(type: string): string {
  switch (type) {
    case 'deezer': return 'Deezer'
    case 'youtube': return 'YouTube'
    case 'soundcloud': return 'SoundCloud'
    case 'applemusic': return 'Apple Music'
    default: return ''
  }
}

export default function MusicPlayerPopup() {
  const { isOpen, artist, track, source, checking, closePlayer, forceSource } = useMusicPlayer()
  const [closing, setClosing] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const panelRef = useRef<HTMLDivElement>(null)
  const lastArtistTrack = useRef<string>('')

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
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
    }
  }, [])

  // 🚨 FIX #1: Clear the close timer when a new track opens —
  // prevents the old 280ms close timer from killing the new player
  useEffect(() => {
    if (isOpen && artist && track) {
      const key = `${artist}::${track}`
      if (key !== lastArtistTrack.current) {
        lastArtistTrack.current = key
        // Cancel any in-flight close animation
        if (closeTimer.current) {
          clearTimeout(closeTimer.current)
          closeTimer.current = undefined
        }
        setClosing(false)
      }
    }
  }, [isOpen, artist, track])

  // Auto-fallback timer: if still checking after FALLBACK_DELAY, force YouTube
  useEffect(() => {
    if (!isOpen) return
    if (fallbackTimer.current) clearTimeout(fallbackTimer.current)

    if (checking && artist && track) {
      fallbackTimer.current = setTimeout(() => {
        forceSource({ type: 'youtube', deezerSearched: true })
      }, FALLBACK_DELAY)
    }

    return () => {
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current)
    }
  }, [isOpen, checking, artist, track, forceSource])

  // Auto-force YouTube when source resolves to 'none' (defensive)
  useEffect(() => {
    if (!isOpen || !artist || !track) return
    if (source?.type === 'none') {
      forceSource({ type: 'youtube', deezerSearched: true })
    }
  }, [source?.type, isOpen, artist, track, forceSource])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [isOpen, handleClose])

  // Close when clicking outside the panel
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

  const activeSource = source?.type ?? null

  const handleDeezer = () => {
    if (source?.type === 'deezer' && source.deezerTrackId) {
      forceSource({ type: 'deezer', deezerTrackId: source.deezerTrackId, deezerSearched: true })
    } else {
      forceSource({ type: 'youtube', deezerSearched: true })
    }
  }

  const handleYouTube = () => {
    forceSource({ type: 'youtube', deezerSearched: source?.deezerSearched ?? false })
  }

  const handleSoundCloud = () => {
    forceSource({ type: 'soundcloud', deezerSearched: source?.deezerSearched ?? false })
  }

  return (
    <div ref={panelRef} className={`${styles.panel} ${closing ? styles.closing : ''}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerInfo}>
          <span className={styles.headerTrack}>{track}</span>
          <span className={styles.headerArtist}>{artist}</span>
        </div>
        <div className={styles.headerActions}>
          {!checking && source && source.type !== 'none' && (
            <span className={styles.sourceBadge}>
              {sourceLabel(source.type)}
            </span>
          )}

          <button
            className={`${styles.externalBtn} ${activeSource === 'deezer' ? styles.externalBtnActive : ''}`}
            onClick={handleDeezer}
            title={source?.type === 'deezer' ? 'Playing via Deezer' : checking ? 'Checking Deezer...' : 'Not on Deezer — falls back to YouTube'}
          >
            Deezer
          </button>

          <button
            className={`${styles.externalBtn} ${activeSource === 'youtube' ? styles.externalBtnActive : ''}`}
            onClick={handleYouTube}
            title="Play via YouTube"
          >
            YouTube
          </button>

          <button
            className={`${styles.externalBtn} ${activeSource === 'soundcloud' ? styles.externalBtnActive : ''}`}
            onClick={handleSoundCloud}
            title="Search SoundCloud"
          >
            SoundCloud
          </button>

          <button className={styles.closeBtn} onClick={handleClose}>
            <span className="neuro-icon neuro-icon-close" />
          </button>
        </div>
      </div>

      {/* Player area */}
      <div className={styles.playerWrap}>
        {checking && source?.type !== 'youtube' && (
          <div className={styles.checkingOverlay}>
            <div className={styles.spinner} />
            <span className={styles.checkingText}>Checking where to play...</span>
          </div>
        )}

        {source?.type === 'deezer' && source.deezerTrackId && (
          <iframe
            key={`deezer-${source.deezerTrackId}`}
            className={styles.player}
            src={`${DEEZER_WIDGET_URL}${source.deezerTrackId}?autoplay=true`}
            allow="autoplay; clipboard-write; fullscreen"
            allowFullScreen
            title={`${artist} - ${track} (Deezer)`}
          />
        )}

        {source?.type === 'youtube' && (
          <iframe
            key={`yt-${artist}-${track}`}
            className={styles.player}
            src={youtubeSearchUrl(artist, track)}
            allow="autoplay; fullscreen"
            allowFullScreen
            title={`${artist} - ${track} (YouTube)`}
          />
        )}

        {source?.type === 'soundcloud' && (
          <iframe
            key={`sc-${artist}-${track}`}
            className={styles.player}
            src={`https://w.soundcloud.com/player/?url=https%3A%2F%2Fsoundcloud.com%2Fsearch%2Fsounds%3Fq%3D${soundcloudQuery(artist, track)}&color=%23e31b23&auto_play=true&buying=false&sharing=false&download=false&show_artwork=true`}
            allow="autoplay"
            title={`${artist} - ${track} (SoundCloud)`}
            scrolling="no"
          />
        )}

        {!checking && source?.type === 'none' && (
          <div className={styles.noSource}>
            <p>No source found — trying YouTube...</p>
          </div>
        )}
      </div>
    </div>
  )
}
