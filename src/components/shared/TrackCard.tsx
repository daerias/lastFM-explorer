import type { TopTrack, Track } from '../../services/lastfm'
import { formatPlaycount } from '../../lib/format'
import { useCoverFallback } from '../../hooks/useCoverFallback'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import styles from './TrackCard.module.css'

interface Props {
  track: TopTrack | Track
  rank?: number
  variant?: 'top' | 'recent'
  onClick?: (artistName: string) => void
}

function getImage(track: TopTrack | Track): string | null {
  const img = track.image.find((i) => i.size === 'large' || i.size === 'extralarge')
  return img?.['#text'] || null
}

function getArtist(track: TopTrack | Track): string {
  if ('artist' in track && typeof track.artist === 'object') {
    if ('name' in track.artist) return track.artist.name
    if ('#text' in track.artist) return track.artist['#text'] || 'Unknown'
  }
  return 'Unknown'
}

function getTrackName(track: TopTrack | Track): string {
  return track.name
}

export default function TrackCard({ track, rank, variant = 'top', onClick }: Props) {
  const existingImg = getImage(track)
  const artist = getArtist(track)
  const trackName = getTrackName(track)
  const { cover, source } = useCoverFallback(artist, trackName, existingImg)
  const playcount = 'playcount' in track ? track.playcount : undefined
  const { openPlayer } = useMusicPlayer()
  const trackUrl = track.url || undefined
  const isExternalSource = source !== 'lastfm' && source !== null

  return (
    <div
      className={`neuro-raised-sm ${styles.card}`}
      onClick={() => onClick?.(artist)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onClick) onClick(artist)
      }}
    >
      <button
        className={styles.playBtn}
        onClick={(e) => { e.stopPropagation(); openPlayer(artist, trackName) }}
        title={`Play ${artist} - ${trackName}`}
      >
        <span className="neuro-icon neuro-icon-play" />
      </button>
      {rank !== undefined && <span className={styles.rank}>#{rank}</span>}
      <div className={styles.imageWrap}>
        {cover ? (
          <>
            <img src={cover} alt={track.name} className={styles.image} loading="lazy" />
            {isExternalSource && (
              <span className={styles.sourceBadge} title={`Cover via ${source}`}>
                <span className={source === 'deezer' ? 'neuro-icon neuro-icon-deezer' : 'neuro-icon neuro-icon-itunes'} />
              </span>
            )}
            {isExternalSource && trackUrl && (
              <a
                href={trackUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.lastfmLink}
                onClick={(e) => e.stopPropagation()}
                title="Open on Last.fm to upload cover art"
              >
                <span className="neuro-icon neuro-icon-external" />
              </a>
            )}
          </>
        ) : (
          <span className={styles.noImage}>
            <span className={variant === 'recent' ? 'neuro-icon neuro-icon-note' : 'neuro-icon neuro-icon-trophy'} />
          </span>
        )}
      </div>
      <div className={styles.info}>
        <h3 className={styles.name}>{track.name}</h3>
        <span className={styles.artist}>{artist}</span>
        {playcount && (
          <span className={styles.playcount}>
            {formatPlaycount(playcount)} plays
          </span>
        )}
      </div>
    </div>
  )
}
