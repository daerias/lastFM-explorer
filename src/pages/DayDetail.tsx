import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { getAllRecentTracks, getTrackInfo, type Track } from '../services/lastfm'
import TrackDetailPanel from '../components/shared/TrackDetailPanel'
import styles from './DayDetail.module.css'

function toUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

function formatTime(uts: string): string {
  const d = new Date(parseInt(uts, 10) * 1000)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function findCover(track: Track): string | null {
  const img = track.image?.find((i) => i.size === 'large' || i.size === 'extralarge')
  return img?.['#text'] || null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function DayDetail() {
  const { date } = useParams<{ date: string }>()
  const { username, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  const { openPlayer } = useMusicPlayer()

  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showTags, setShowTags] = useState(false)
  const [trackTags, setTrackTags] = useState<Map<string, string[]>>(new Map())
  const [tagsLoading, setTagsLoading] = useState(false)

  // Detail panel
  const [selectedTrack, setSelectedTrack] = useState<{ artist: string; track: string } | null>(null)

  useEffect(() => {
    if (!date || !isAuthenticated || !username) {
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    const dayStart = new Date(date + 'T00:00:00')
    const dayEnd = new Date(date + 'T23:59:59')
    const from = toUnix(dayStart)
    const to = toUnix(dayEnd)

    getAllRecentTracks(username, from, to)
      .then((result) => {
        if (cancelled) return
        setTracks(result)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.message || 'Failed to load tracks')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [date, username, isAuthenticated])

  const filtered = useMemo(() => {
    if (!search.trim()) return tracks
    const q = search.trim().toLowerCase()
    return tracks.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.artist?.['#text'] || '').toLowerCase().includes(q) ||
        (t.album?.['#text'] || '').toLowerCase().includes(q),
    )
  }, [tracks, search])

  // Format the date nicely
  const dateDisplay = useMemo(() => {
    if (!date) return ''
    const d = new Date(date + 'T12:00:00')
    return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }, [date])

  // Unique artists count
  const uniqueArtists = useMemo(() => {
    const set = new Set(tracks.map((t) => t.artist?.['#text']).filter(Boolean))
    return set.size
  }, [tracks])

  // Validate date param
  const dateValid = useMemo(() => {
    if (!date) return false
    const d = new Date(date + 'T00:00:00')
    return !isNaN(d.getTime())
  }, [date])

  // Load tags for displayed tracks when toggle is on
  useEffect(() => {
    if (!showTags || filtered.length === 0) return
    let cancelled = false
    setTagsLoading(true)

    const loadTags = async () => {
      const map = new Map(trackTags)
      for (const track of filtered) {
        const key = `${track.artist?.['#text'] || ''}::${track.name}`
        if (map.has(key)) continue
        try {
          const info = await getTrackInfo(track.artist?.['#text'] || '', track.name)
          const tags = info?.toptags?.tag
          if (tags) {
            const tagList = Array.isArray(tags) ? tags : [tags]
            map.set(key, tagList.map((t) => t.name))
          } else {
            map.set(key, [])
          }
        } catch {
          map.set(key, [])
        }
      }
      if (!cancelled) setTrackTags(new Map(map))
    }

    loadTags().finally(() => { if (!cancelled) setTagsLoading(false) })
    return () => { cancelled = true }
  }, [showTags, filtered])

  return (
    <div className={styles.page}>
      <button className={styles.backLink} onClick={() => navigate(-1)}>← Back to Home</button>

      {!dateValid ? (
        <div className="neuro-pressed" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ color: 'var(--accent)' }}>Invalid date.</p>
        </div>
      ) : (
        <>
          <div className={styles.header}>
            <h1>{dateDisplay}</h1>
            {!loading && (
              <p className={styles.sub}>
                {tracks.length} scrobble{tracks.length !== 1 ? 's' : ''}
                {uniqueArtists > 0 && <> · {uniqueArtists} artist{uniqueArtists !== 1 ? 's' : ''}</>}
              </p>
            )}
          </div>

          {!isAuthenticated ? (
            <div className="neuro-pressed" style={{ padding: '48px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)' }}>Login to see your listening history.</p>
            </div>
          ) : loading ? (
            <div className={styles.list}>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={`neuro-raised-sm ${styles.row} ${styles.skelRow}`} />
              ))}
            </div>
          ) : error ? (
            <div className="neuro-pressed" style={{ padding: '24px', textAlign: 'center' }}>
              <p style={{ color: 'var(--accent)' }}>{error}</p>
            </div>
          ) : (
            <>
              <div className={styles.searchWrap}>
                <input
                  className={styles.searchInput}
                  type="text"
                  placeholder={`Filter ${tracks.length} tracks...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {search && (
                  <span className={styles.searchCount}>
                    {filtered.length} / {tracks.length}
                  </span>
                )}
                <button
                  className={styles.tagsToggle}
                  onClick={() => setShowTags((p) => !p)}
                >
                  {showTags ? 'Hide tags' : tagsLoading ? 'Loading tags...' : 'Show tags'}
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="neuro-pressed" style={{ padding: '40px', textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-muted)' }}>
                    {search ? 'No tracks match your filter.' : 'No listening data for this day.'}
                  </p>
                </div>
              ) : (
                <div className={styles.list}>
                  {filtered.map((track, i) => {
                    const cover = findCover(track)
                    const key = `${track.artist?.['#text'] || ''}::${track.name}`
                    const tags = showTags ? trackTags.get(key) : undefined

                    return (
                      <div
                        key={`${track.name}-${track.artist?.['#text']}-${track.date?.uts}-${i}`}
                        className={`neuro-raised-sm ${styles.row}`}
                        onClick={() =>
                          setSelectedTrack({
                            artist: track.artist?.['#text'] || 'Unknown',
                            track: track.name,
                          })
                        }
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter')
                            setSelectedTrack({
                              artist: track.artist?.['#text'] || 'Unknown',
                              track: track.name,
                            })
                        }}
                      >
                        <span className={styles.rowIndex}>#{i + 1}</span>
                        <div className={styles.rowCover}>
                          {cover ? (
                            <img src={cover} alt={track.name} className={styles.rowImg} loading="lazy" />
                          ) : (
                          <span className={styles.rowNoImg}><span className="neuro-icon neuro-icon-note" /></span>
                          )}
                        </div>
                        <div className={styles.rowInfo}>
                          <span className={styles.rowName}>{track.name}</span>
                          <span className={styles.rowArtist}>{track.artist?.['#text'] || 'Unknown'}</span>
                          {tags && tags.length > 0 && (
                            <div className={styles.rowTags}>
                              {tags.slice(0, 4).map((t) => (
                                <span key={t} className={styles.rowTagChip}>{t}</span>
                              ))}
                              {tags.length > 4 && <span className={styles.rowTagMore}>+{tags.length - 4}</span>}
                            </div>
                          )}
                        </div>
                        <button
                          className={styles.rowPlayBtn}
                          onClick={(e) => {
                            e.stopPropagation()
                            openPlayer(track.artist?.['#text'] || 'Unknown', track.name)
                          }}
                          title={`Play`}
                        >
                          <span className="neuro-icon neuro-icon-play" />
                        </button>
                        <span className={styles.rowTime}>
                          {track.date ? formatTime(track.date.uts) : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {selectedTrack && (
            <TrackDetailPanel
              artistName={selectedTrack.artist}
              trackName={selectedTrack.track}
              onClose={() => setSelectedTrack(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
