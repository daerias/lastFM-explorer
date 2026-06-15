import { useState, useEffect } from 'react'
import { getArtistInfo, getUserArtistTracks, type ArtistInfo, type TopTrack } from '../../services/lastfm'
import { formatPlaycount } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import { useCoverFallback } from '../../hooks/useCoverFallback'
import styles from './ArtistDetailPanel.module.css'

interface Props {
  artistName: string
  onClose: () => void
}

function stripHtml(html?: string): string {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

function TrackRow({ track }: { track: TopTrack }) {
  const { cover } = useCoverFallback(track.artist.name, track.name, null)
  const { openPlayer } = useMusicPlayer()
  return (
    <div className={styles.trackRow}>
      <div className={styles.trackCover}>
        {cover ? <img src={cover} alt={track.name} /> : <span className="neuro-icon neuro-icon-note" />}
      </div>
      <div className={styles.trackInfo}>
        <span className={styles.trackName}>{track.name}</span>
        <span className={styles.trackPlays}>{formatPlaycount(track.playcount)} plays</span>
      </div>
      <button
        className={styles.trackPlayBtn}
        onClick={() => openPlayer(track.artist.name, track.name)}
        title={`Play ${track.name}`}
      >
        <span className="neuro-icon neuro-icon-play" />
      </button>
    </div>
  )
}

export default function ArtistDetailPanel({ artistName, onClose }: Props) {
  const { username } = useAuth()
  const [info, setInfo] = useState<ArtistInfo | null>(null)
  const [tracks, setTracks] = useState<TopTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    getArtistInfo(artistName)
      .then((data) => {
        if (!cancelled) setInfo(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    // Fetch user's top tracks from this artist
    if (username) {
      setTracksLoading(true)
      getUserArtistTracks(username, artistName, 50)
        .then((data) => {
          if (!cancelled) setTracks(data)
        })
        .catch(() => {
          if (!cancelled) setTracks([])
        })
        .finally(() => {
          if (!cancelled) setTracksLoading(false)
        })
    }

    return () => { cancelled = true }
  }, [artistName, username])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const img = info?.image?.find((i) => i.size === 'extralarge' || i.size === 'large')?.['#text']

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}><span className="neuro-icon neuro-icon-close" /></button>

        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : info ? (
          <div className={styles.content}>
            <div className={styles.hero}>
              {img && <img src={img} alt={info.name} className={styles.heroImg} />}
              <div>
                <h2>{info.name}</h2>
                {info.stats && (
                  <p className={styles.stats}>
                    {formatPlaycount(info.stats.listeners)} listeners · {formatPlaycount(info.stats.playcount)} plays
                  </p>
                )}
              </div>
            </div>

            {info.tags?.tag?.length > 0 && (
              <div className={styles.tags}>
                {info.tags.tag.slice(0, 12).map((t) => (
                  <span key={t.name} className={styles.tag}>{t.name}</span>
                ))}
              </div>
            )}

            {info.bio?.summary && (
              <div className={styles.bio}>
                <h3>About</h3>
                <p>{stripHtml(info.bio.summary)}</p>
              </div>
            )}

            {tracks.length > 0 && (
              <div>
                <h3 className={styles.sectionHeading}>Your Tracks ({tracks.length})</h3>
                <div className={styles.trackList}>
                  {tracks.map((t) => (
                    <TrackRow key={`${t.name}-${t.artist.name}`} track={t} />
                  ))}
                </div>
              </div>
            )}
            {tracksLoading && (
              <div className={styles.loading}>Loading tracks...</div>
            )}

            {info.similar?.artist?.length > 0 && (
              <div>
                <h3 className={styles.sectionHeading}>Similar Artists</h3>
                <div className={styles.similarList}>
                  {info.similar.artist.slice(0, 10).map((a) => (
                    <span key={a.name} className={styles.similarItem}>{a.name}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
