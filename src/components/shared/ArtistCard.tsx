import { useState, useEffect, useCallback } from 'react'
import type { Artist } from '../../services/lastfm'
import { resolveExternalArtistImage } from '../../services/coverArt'
import { formatPlaycount } from '../../lib/format'
import { detectCoverSource } from '../../lib/coverSource'
import styles from './ArtistCard.module.css'

/** Extract image URL — tries ALL sizes, returns first non-empty. */
function getBestImage(
  images: { size: string; '#text': string }[] | undefined | null,
): string | null {
  if (!images || !Array.isArray(images)) return null
  for (const size of ['mega', 'extralarge', 'large', 'medium', 'small']) {
    const img = images.find((i) => i.size === size)
    if (img?.['#text']) return img['#text']
  }
  return null
}

interface Props {
  artist: Artist
  rank?: number
  onClick?: (name: string) => void
}

export default function ArtistCard({ artist, rank, onClick }: Props) {
  const directImg = getBestImage(artist.image)
  const [imgSrc, setImgSrc] = useState<string | null>(directImg)
  const [imgFailed, setImgFailed] = useState(false)

  // Simple: if Last.fm doesn't provide an image, fetch from Deezer/iTunes
  useEffect(() => {
    if (directImg) return
    let cancelled = false
    resolveExternalArtistImage(artist.name).then((url) => {
      if (!cancelled && url) setImgSrc(url)
    })
    return () => { cancelled = true }
  }, [artist.name, directImg])

  const onError = useCallback(() => setImgFailed(true), [])

  const showImg = imgSrc && !imgFailed
  const imgSource = detectCoverSource(showImg ? imgSrc : null)

  return (
    <div
      className={`neuro-raised-sm ${styles.card}`}
      onClick={() => onClick?.(artist.name)}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && onClick) onClick(artist.name)
      }}
    >
      {rank !== undefined && <span className={styles.rank}>#{rank}</span>}
      <div className={styles.imageWrap}>
        {showImg ? (
          <>
            <img
              src={imgSrc}
              alt={artist.name}
              className={styles.image}
              loading="lazy"
              onError={onError}
            />
            {imgSource !== 'lastfm' && imgSource !== null && (
              <span className={styles.sourceBadge} title={`Cover via ${imgSource}`}>
                <span className={imgSource === 'deezer' ? 'neuro-icon neuro-icon-deezer' : 'neuro-icon neuro-icon-itunes'} />
              </span>
            )}
          </>
        ) : (
          <span className={styles.noImage}><span className="neuro-icon neuro-icon-note" /></span>
        )}
      </div>
      <div className={styles.info}>
        <h3 className={styles.name}>{artist.name}</h3>
        {artist.playcount && (
          <span className={styles.playcount}>
            {formatPlaycount(artist.playcount)} plays
          </span>
        )}
      </div>
    </div>
  )
}
