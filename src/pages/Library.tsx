import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { getTrackTags, getUserTopTags, addTrackTags, getRecentTracks, getPersonalTracks, type Track, type TaggedTrack } from '../services/lastfm'
import { getCachedAllTracks, getCachedTrackCount, startFullSync, incrementalSync, getSyncMeta, clearTrackCache, processRetryQueue, queueRetryTask, type SyncProgress } from '../services/indexedDB'
import { DEMO_TOP_TAGS, generateDemoTimeline } from '../services/demoData'
import { useCoverFallback } from '../hooks/useCoverFallback'
import { useVirtualScroll } from '../hooks/useVirtualScroll'
import { findBestImage } from '../lib/coverSource'
import TrackDetailPanel from '../components/shared/TrackDetailPanel'
import ArtistDetailPanel from '../components/shared/ArtistDetailPanel'
import TagChips from '../components/shared/TagChips'
import styles from './Library.module.css'

// ── Genre quick-filter presets ──
const GENRE_PRESETS = [
  { label: 'DnB', tag: 'drum and bass' },
  { label: 'Techno', tag: 'techno' },
  { label: 'House', tag: 'house' },
  { label: 'Psytrance', tag: 'psytrance' },
  { label: 'Dubstep', tag: 'dubstep' },
  { label: 'Jungle', tag: 'jungle' },
  { label: 'Hip-Hop', tag: 'hip-hop' },
  { label: 'Metal', tag: 'metal' },
]

// ── Helpers ──

function formatTime(track: Track): string {
  if (!track.date) return ''
  const d = new Date(parseInt(track.date.uts, 10) * 1000)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (diffDays === 0) return `Today ${time}`
  if (diffDays === 1) return `Yesterday ${time}`
  if (diffDays < 7) return `${diffDays}d ago ${time}`
  return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) + ` ${time}`
}

function getArtistName(track: Track): string {
  return track.artist?.['#text'] || 'Unknown'
}

/** Convert TaggedTrack from LastFM API to Track shape for timeline display */
function taggedToTrack(tt: TaggedTrack): Track {
  return {
    name: tt.name,
    artist: { '#text': tt.artist.name },
    url: tt.url,
    image: [],
  }
}

// ── TimelineRow (module-level, pure) ──

function TimelineRow({
  track, tags, showTags, tagsLoading, onClick, isSelected, onToggleSelect, selectMode, style,
}: {
  track: Track; tags?: string[]; showTags: boolean; tagsLoading: boolean
  onClick: () => void; isSelected?: boolean; onToggleSelect?: () => void; selectMode?: boolean
  style?: React.CSSProperties
}) {
  const artistName = track.artist?.['#text'] || 'Unknown'
  const existingImg = findBestImage(track.image)
  const { cover, source } = useCoverFallback(artistName, track.name, existingImg)
  const { openPlayer } = useMusicPlayer()
  const time = formatTime(track)
  const isNow = track['@attr']?.nowplaying === 'true'
  const isExternalSource = source !== 'lastfm' && source !== null

  return (
    <div
      className={`${styles.row} ${isSelected ? styles.rowSelected : ''} ${selectMode ? styles.rowSelectMode : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
      style={style}
    >
      {selectMode && (
        <div className={styles.rowCheckbox} onClick={(e) => { e.stopPropagation(); onToggleSelect?.() }}>
          <span className={`${styles.checkbox} ${isSelected ? styles.checkboxChecked : ''}`}>
            {isSelected && '✓'}
          </span>
        </div>
      )}
      <div className={styles.rowTime}>
        {isNow && <span className={styles.nowBadge}>LIVE</span>}
        {!isNow && <span className={styles.timeText}>{time}</span>}
      </div>
      <div className={styles.rowLine}><div className={styles.dot} /></div>
      <button
        className={styles.rowPlayBtn}
        onClick={(e) => { e.stopPropagation(); openPlayer(artistName, track.name) }}
        title={`Play ${artistName} - ${track.name}`}
      >
        <span className="neuro-icon neuro-icon-play" />
      </button>
      <div className={styles.rowContent}>
        <div className={styles.rowImageWrap}>
          {cover ? (
            <>
              <img src={cover} alt={track.name} className={styles.rowImage} loading="lazy" />
              {isExternalSource && (
                <span className={styles.sourceBadge} title={`Cover via ${source}`}>
                  <span className={source === 'deezer' ? 'neuro-icon neuro-icon-deezer' : 'neuro-icon neuro-icon-itunes'} />
                </span>
              )}
              {isExternalSource && track.url && (
                <a href={track.url} target="_blank" rel="noopener noreferrer" className={styles.lastfmLink}
                  onClick={(e) => e.stopPropagation()} title="Open on Last.fm to upload cover art">
                  <span className="neuro-icon neuro-icon-external" />
                </a>
              )}
            </>
          ) : (
            <span className={styles.rowNoImg}><span className="neuro-icon neuro-icon-note" /></span>
          )}
        </div>
        <div className={styles.rowInfo}>
          <span className={styles.rowArtistLine}>
            <span className={styles.rowArtist}>{artistName}</span>
            <span className={styles.rowDash}>–</span>
            <span className={styles.rowName}>{track.name}</span>
          </span>
          {track.album?.['#text'] && <span className={styles.rowAlbum}> · {track.album['#text']}</span>}
          {tags !== undefined && tags.length > 0 && (
            <div className={styles.rowTags}>
              {tags.slice(0, 5).map((t) => <span key={t} className={styles.rowTagChip}>{t}</span>)}
              {tags.length > 5 && <span className={styles.rowTagMore}>+{tags.length - 5}</span>}
            </div>
          )}
          {tags !== undefined && tags.length === 0 && <span className={styles.rowNoTags}>no tags</span>}
          {tags === undefined && showTags && tagsLoading && <span className={styles.rowTagsLoading}>...</span>}
        </div>
      </div>
    </div>
  )
}

// ── Sync Progress Bar ──
function SyncBar({ progress, onCancel }: { progress: SyncProgress | null; onCancel: () => void }) {
  if (!progress) return null
  const pct = progress.totalPages > 0 ? Math.round((progress.page / progress.totalPages) * 100) : 0
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px',
      background: 'var(--accent-glass)', border: '1px solid var(--accent-glow)',
      borderRadius: '10px', marginBottom: '10px', fontSize: '0.7rem', fontWeight: 600,
      color: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)',
    }}>
      <span style={{ flexShrink: 0 }}>📡</span>
      <div style={{
        flex: 1, height: '4px', background: 'var(--bg-primary)', borderRadius: '2px', overflow: 'hidden',
        boxShadow: 'inset 1px 1px 2px var(--shadow-warm)',
      }}>
        <div style={{
          height: '100%', width: `${pct}%`, background: 'var(--accent)',
          borderRadius: '2px', transition: 'width 0.3s ease',
          boxShadow: '0 0 8px var(--accent-glow)',
        }} />
      </div>
      <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
        {progress.tracksSoFar.toLocaleString()} tracks
      </span>
      {!progress.done && (
        <button onClick={onCancel} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px',
        }}>✕</button>
      )}
    </div>
  )
}

// ── Main Library ──

export default function Library() {
  const { username, isAuthenticated } = useAuth()
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [syncWarning, setSyncWarning] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showTags, setShowTags] = useState(false)
  const [trackTags, setTrackTags] = useState<Map<string, string[]>>(new Map())
  const [tagsLoading, setTagsLoading] = useState(false)
  const [selectedTrack, setSelectedTrack] = useState<{ artist: string; name: string } | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)

  // Sync state
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null)
  const [syncActive, setSyncActive] = useState(false)
  const syncActiveRef = useRef(false)
  const [cachedCount, setCachedCount] = useState(0)
  const abortRef = useRef(false)

  // Bulk tagging
  const [selectMode, setSelectMode] = useState(false)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkTagInput, setBulkTagInput] = useState('')
  const [bulkTagLoading, setBulkTagLoading] = useState(false)
  const [bulkTagMsg, setBulkTagMsg] = useState<string | null>(null)

  // Tag filter
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [tagFilteredKeys, setTagFilteredKeys] = useState<Set<string> | null>(null)
  const [tagLoading, setTagLoading] = useState(false)
  const [suggestions, setSuggestions] = useState<{ name: string; count: number }[]>([])

  // Direct tag loading — fetch tagged tracks on-demand from API
  const [directTagTracks, setDirectTagTracks] = useState<Track[] | null>(null)
  const [directTagLoading, setDirectTagLoading] = useState(false)
  const [directTagError, setDirectTagError] = useState<string | null>(null)
  const [directTagLabel, setDirectTagLabel] = useState<string | null>(null)
  const directTagAbortRef = useRef(0)
  const tracksCountRef = useRef(0)

  // Genre quick-filter
  const [activeGenre, setActiveGenre] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const timelineRef = useRef<HTMLDivElement>(null)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (e.key === 'x' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        setSelectMode((s) => {
          if (s) { setSelectedKeys(new Set()); setBulkTagInput(''); setBulkTagMsg(null) }
          return !s
        })
      }
      if (e.key === 'Escape' && selectMode) {
        setSelectMode(false); setSelectedKeys(new Set()); setBulkTagInput(''); setBulkTagMsg(null)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectMode])

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }, [])

  const handleBulkTag = useCallback(async () => {
    const tag = bulkTagInput.trim().toLowerCase()
    if (!tag || selectedKeys.size === 0 || !username) return
    setBulkTagLoading(true); setBulkTagMsg(null)
    let done = 0; let failed = 0
    for (const key of selectedKeys) {
      const [artist, track] = key.split('::')
      try { await addTrackTags(artist, track, [tag]); done++ } catch { failed++ }
    }
    setBulkTagMsg(`Tagged ${done} track${done !== 1 ? 's' : ''}${failed > 0 ? ` (${failed} failed)` : ''}`)
    setBulkTagLoading(false); setBulkTagInput(''); setSelectedKeys(new Set()); setSelectMode(false)
  }, [bulkTagInput, selectedKeys, username])

  // Load tag suggestions
  useEffect(() => {
    if (!isAuthenticated || !username) return
    getUserTopTags(username, 500).then(setSuggestions).catch(() => setSuggestions([]))
  }, [username, isAuthenticated])

  // Fetch tag-filtered tracks — uses track-level tags so it works whether the user
  // tagged artists or individual tracks on Last.fm.
  useEffect(() => {
    if (filterTags.length === 0 && !activeGenre) { setTagFilteredKeys(null); return }
    if (!username) return
    let cancelled = false
    setTagLoading(true)

    const fetchAndIntersect = async () => {
      try {
        const allTags = [...filterTags]
        if (activeGenre && !allTags.includes(activeGenre)) allTags.push(activeGenre)

        // Fetch track-level tagged data — returns tracks the user has personally tagged
        const results = await Promise.all(allTags.map((tag) => getPersonalTracks(username, tag, 200, 1)))
        if (cancelled) return

        // Build sets of composite "artist::track" keys for intersection
        const sets = results.map((r) => {
          const keys = new Set<string>()
          for (const t of r.tracks) keys.add(`${t.artist.name.toLowerCase()}::${t.name.toLowerCase()}`)
          return keys
        })

        // Intersect: tracks must be tagged with ALL specified tags
        const common = new Set(sets[0])
        for (let i = 1; i < sets.length; i++) {
          for (const key of common) { if (!sets[i].has(key)) common.delete(key) }
        }

        if (!cancelled) setTagFilteredKeys(common)
      } catch {
        // On API error, reset filter so the user sees all tracks rather than stale results
        if (!cancelled) setTagFilteredKeys(null)
      }
    }

    fetchAndIntersect().finally(() => { if (!cancelled) setTagLoading(false) })
    return () => { cancelled = true }
  }, [filterTags, activeGenre, username])

  const toggleGenre = useCallback(async (tag: string) => {
    if (activeGenre === tag) {
      // Deselect — cancel any in-flight request + clear everything
      directTagAbortRef.current += 1
      setActiveGenre(null)
      setDirectTagTracks(null)
      setDirectTagLabel(null)
      setDirectTagError(null)
      return
    }

    setActiveGenre(tag)

    // If we have cached tracks, let the existing filter logic handle it
    if (tracksCountRef.current > 0) {
      setDirectTagTracks(null)
      setDirectTagLabel(null)
      return
    }

    // No cached tracks — fetch tagged tracks directly from LastFM API
    if (!username) return

    // Cancel any stale in-flight request
    directTagAbortRef.current += 1
    const requestId = directTagAbortRef.current

    setDirectTagLoading(true)
    setDirectTagError(null)
    setDirectTagLabel(tag)

    try {
      const result = await getPersonalTracks(username, tag, 200, 1)
      // Discard stale results if a newer request was fired
      if (directTagAbortRef.current !== requestId) return
      const converted = result.tracks.map(taggedToTrack)
      setDirectTagTracks(converted)
    } catch (err: any) {
      if (directTagAbortRef.current !== requestId) return
      setDirectTagError(err.message || 'Failed to load tagged tracks')
    } finally {
      if (directTagAbortRef.current !== requestId) return
      setDirectTagLoading(false)
    }
  }, [activeGenre, username])

  // ── Smart Load: recent tracks first (fast), full sync in background ──
  const loadFromCache = useCallback(async () => {
    if (!isAuthenticated || !username) { setLoading(false); return }
    setLoading(true); setError(null); setSyncWarning(null)

    let didShowTracks = false
    let syncType: 'full' | 'incremental' | null = null

    try {
      // 1. Try cached data first (instant if available)
      const cached = await getCachedAllTracks(username)
      const meta = await getSyncMeta(username)

      if (cached.length > 0) {
        // We have cached data — show immediately
        if (!abortRef.current) {
          setTracks(cached)
          setCachedCount(meta?.totalTracks ?? cached.length)
          setLoading(false)
          didShowTracks = true
        }

        // 2. Incremental sync in background (only fetch new tracks since last sync)
        syncType = 'incremental'
        if (!abortRef.current) setSyncActive(true)
        const incResult = await incrementalSync(username, (prog) => {
          if (!abortRef.current && prog.tracksSoFar > 0) setSyncProgress(prog)
        })
        if (!abortRef.current) {
          setSyncActive(false)
          setSyncProgress(null)
          if (incResult.failedPages > 0) {
            setSyncWarning(`${incResult.failedPages} page(s) failed — some tracks may be missing.`)
          }
          if (incResult.newTracks > 0 || incResult.failedPages > 0) {
            const fresh = await getCachedAllTracks(username)
            setTracks(fresh)
            const count = await getCachedTrackCount(username)
            setCachedCount(count)
          }
          if (!meta?.syncComplete) {
            setSyncWarning((prev) => prev ? `${prev} Full sync recommended.` : 'Full sync recommended to cache your entire history.')
          }
        }
      } else {
        // No cache — fetch recent tracks immediately (1 fast API call)
        const recent = await getRecentTracks(username, 200, 1)
        if (!abortRef.current) {
          setTracks(recent.tracks)
          setCachedCount(recent.tracks.length)
          setLoading(false)
          didShowTracks = true
        }

        // Start full sync silently in background (don't block UI)
        syncType = 'full'
        if (!abortRef.current) {
          setSyncActive(true)
        }
        await startFullSync(username, (prog) => {
          if (!abortRef.current) setSyncProgress(prog)
        })
        if (!abortRef.current) {
          setSyncActive(false)
          setSyncProgress(null)
          // Reload from cache to get the full dataset
          const fresh = await getCachedAllTracks(username)
          setTracks(fresh)
          const count = await getCachedTrackCount(username)
          setCachedCount(count)
          const updatedMeta = await getSyncMeta(username)
          if (updatedMeta && !updatedMeta.syncComplete) {
            setSyncWarning('Some pages failed during sync — not all tracks cached. Full Sync to retry.')
          }
        }
      }

      // Process any queued retry tasks after sync settles
      if (!abortRef.current) {
        processRetry()
      }
    } catch (err: any) {
      if (!abortRef.current) {
        syncActiveRef.current = false
        setSyncActive(false)
        // Queue the failed sync for offline retry
        if (syncType) {
          queueRetryTask(username, syncType)
        }
        // If we already have tracks showing, don't replace with error
        if (!didShowTracks) {
          setError(err.message || 'Failed to load')
        } else {
          setSyncWarning(`Background sync failed: ${err.message || 'Unknown error'}. Will retry later.`)
        }
        // Process any other queued retry tasks
        processRetry()
        setLoading(false)
      }
    }
  }, [username, isAuthenticated])

  useEffect(() => {
    abortRef.current = false
    loadFromCache()
    return () => { abortRef.current = true }
  }, [loadFromCache])

  // Manual full resync
  const handleFullResync = useCallback(async () => {
    if (!username || syncActive) return
    abortRef.current = false
    setSyncActive(true); setSyncProgress(null); setError(null); setSyncWarning(null)
    try {
      await startFullSync(username, (prog) => {
        if (!abortRef.current) setSyncProgress(prog)
      })
      const fresh = await getCachedAllTracks(username)
      if (!abortRef.current) {
        setTracks(fresh)
        const count = await getCachedTrackCount(username)
        setCachedCount(count)
        // Check if sync was incomplete
        const meta = await getSyncMeta(username)
        if (meta && !meta.syncComplete) {
          setSyncWarning('Some pages failed during sync — not all tracks cached. Retry or check connection.')
        }
      }
    } catch (err: any) {
      if (!abortRef.current) {
        queueRetryTask(username, 'full')
      }
      setError(err.message || 'Sync failed')
    } finally {
      if (!abortRef.current) { setSyncActive(false); setSyncProgress(null) }
    }
  }, [username, syncActive])

  const handleCancelSync = useCallback(() => {
    abortRef.current = true
    setSyncActive(false)
    setSyncProgress(null)
  }, [])

  const handleClearCache = useCallback(async () => {
    if (!username || !window.confirm('Clear all cached tracks? You can re-sync afterward.')) return
    await clearTrackCache(username)
    setTracks([])
    setCachedCount(0)
    setSyncActive(false)
    setSyncProgress(null)
  }, [username])

  // Demo mode
  const isDemo = !isAuthenticated
  useEffect(() => { if (!isDemo) return; setTracks(generateDemoTimeline() as unknown as Track[]); setLoading(false); setCachedCount(20) }, [isDemo])
  useEffect(() => { if (!isDemo) return; setSuggestions(DEMO_TOP_TAGS) }, [isDemo])

  // Keep refs in sync with state
  useEffect(() => { syncActiveRef.current = syncActive }, [syncActive])
  useEffect(() => { tracksCountRef.current = tracks.length }, [tracks.length])

  // ── Offline Retry Queue — process after sync + when coming back online ──
  const processRetry = useCallback(async () => {
    if (!username || isDemo || syncActiveRef.current) return

    const result = await processRetryQueue(username, (msg) => {
      console.log(`[retry-queue] ${msg}`)
    })
    if (result.processed > 0) {
      console.log(
        `[retry-queue] Processed ${result.processed} task(s): ${result.succeeded} succeeded, ${result.failed} failed`,
      )
      // Reload tracks if any retry succeeded
      if (result.succeeded > 0) {
        const fresh = await getCachedAllTracks(username)
        setTracks(fresh)
        const count = await getCachedTrackCount(username)
        setCachedCount(count)
        // Only clear warning if sync is actually complete
        const meta = await getSyncMeta(username)
        if (meta?.syncComplete) {
          setSyncWarning(null)
        }
      }
    }
  }, [username, isDemo])

  // Process retry queue when coming back online
  useEffect(() => {
    if (!username || isDemo) return
    const handleOnline = () => {
      console.log('[retry-queue] Back online — processing pending sync tasks…')
      processRetry()
    }
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [username, isDemo, processRetry])

  // ── API Health Indicator ──
  const healthStatus: 'green' | 'yellow' | 'red' | 'idle' = useMemo(() => {
    if (isDemo) return 'idle'
    if (error) return 'red'
    if (syncWarning) return 'yellow'
    if (syncActive) return 'yellow'
    if (cachedCount === 0 && !loading) return 'idle'
    if (cachedCount > 0 && !loading && !syncActive) return 'green'
    return 'idle'
  }, [error, syncWarning, syncActive, cachedCount, loading, isDemo])

  const healthLabel = useMemo(() => {
    switch (healthStatus) {
      case 'green': return `API healthy — ${cachedCount.toLocaleString()} tracks cached`
      case 'yellow': return syncWarning || (syncActive ? 'Syncing in progress…' : 'API degraded')
      case 'red': return error || 'API error'
      case 'idle': return isDemo ? 'Demo mode' : 'Not synced yet'
    }
  }, [healthStatus, cachedCount, syncWarning, syncActive, error, isDemo])

  // ── Fast in-memory search ──
  const filtered = useMemo(() => {
    // Direct tag mode — show API-fetched tagged tracks
    let result = directTagTracks ?? tracks

    if (directTagTracks) {
      // In direct tag mode, only apply search filter (tag filter is the source)
      if (search.trim()) {
        const q = search.toLowerCase()
        result = result.filter((t) =>
          t.name.toLowerCase().includes(q) || getArtistName(t).toLowerCase().includes(q),
        )
      }
      return result
    }

    // Normal mode — filter cached tracks by tag-filtered track keys
    if (tagFilteredKeys && tagFilteredKeys.size > 0) {
      result = result.filter((t) => tagFilteredKeys.has(`${getArtistName(t).toLowerCase()}::${t.name.toLowerCase()}`))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) =>
        t.name.toLowerCase().includes(q) || getArtistName(t).toLowerCase().includes(q),
      )
    }
    return result
  }, [tracks, directTagTracks, search, tagFilteredKeys])

  // Fetch personal tags for displayed tracks
  useEffect(() => {
    if (!showTags || filtered.length === 0 || !username) return
    let cancelled = false; setTagsLoading(true)
    const BATCH = 5
    const loadTags = async () => {
      const map = new Map(trackTags)
      const toFetch = filtered.filter((t) => { const key = `${getArtistName(t)}::${t.name}`; return !map.has(key) })
      for (let i = 0; i < toFetch.length; i += BATCH) {
        if (cancelled) return
        const batch = toFetch.slice(i, i + BATCH)
        const results = await Promise.allSettled(batch.map((track) => getTrackTags(getArtistName(track), track.name, username)))
        for (let j = 0; j < batch.length; j++) {
          const track = batch[j]; const key = `${getArtistName(track)}::${track.name}`
          const result = results[j]
          map.set(key, result.status === 'fulfilled' ? result.value.map((t) => t.name) : [])
        }
        if (!cancelled) setTrackTags(new Map(map))
      }
    }
    loadTags().finally(() => { if (!cancelled) setTagsLoading(false) })
    return () => { cancelled = true }
  }, [showTags, filtered, username])

  // Virtual scrolling
  const ROW_HEIGHT = 32
  const { virtualItems, totalHeight } = useVirtualScroll(filtered, ROW_HEIGHT, timelineRef, 15)

  const hasActiveFilters = search || filterTags.length > 0 || activeGenre

  return (
    <div className={styles.library}>
      <div className={styles.header}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            Library
            {!isDemo && (
              <span
                className={`${styles.healthDot} ${styles[`healthDot${healthStatus.charAt(0).toUpperCase()}${healthStatus.slice(1)}`]}`}
                title={healthLabel}
                aria-label={healthLabel}
              />
            )}
          </h1>
          <p className={styles.desc}>
            {cachedCount > 0 ? `${cachedCount.toLocaleString()} tracks cached` : `${tracks.length} recent tracks`}
            {hasActiveFilters ? ` · ${filtered.length} shown` : ''}
            {syncActive && !loading && <span className={styles.syncSpinner}><span className={styles.spinDot} /> Syncing…</span>}
          </p>
        </div>
        {isAuthenticated && !isDemo && (
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            {!syncActive && !syncProgress && (
              <button
                className={styles.syncBtn}
                onClick={handleFullResync}
                title="Re-sync full scrobble history from Last.fm"
              >
                🔄 Full Sync
              </button>
            )}
            <button
              className={styles.syncBtn}
              onClick={handleClearCache}
              title="Clear all cached tracks"
              style={{ opacity: 0.5, fontSize: '0.55rem' }}
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="neuro-pressed" style={{ padding: '20px 24px', textAlign: 'center', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <p style={{ color: 'var(--accent)', margin: 0 }}>{error}</p>
          <button className="neuro-btn" onClick={handleFullResync} style={{ fontSize: '0.7rem', padding: '6px 14px' }}>
            Retry
          </button>
        </div>
      )}

      {syncWarning && !error && (
        <div style={{
          padding: '10px 16px', marginBottom: '10px', borderRadius: '10px',
          background: 'var(--accent-glass)', border: '1px solid var(--accent-glow)',
          color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px',
          boxShadow: '0 0 10px var(--accent-glass)',
        }}>
          <span>⚠️ {syncWarning}</span>
          <button
            onClick={() => setSyncWarning(null)}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: '0.8rem', padding: '2px 6px',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Sync Progress */}
      <SyncBar progress={syncProgress} onCancel={handleCancelSync} />

      {/* ── Sticky Filter Header ── */}
      <div className={styles.stickyFilter}>
        <div className={styles.filterRow1}>
          <div className={styles.searchWrap}>
            <span className="neuro-icon neuro-icon-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1 }} />
            <input
              ref={searchInputRef}
              className={styles.searchInput}
              type="text"
              placeholder={`Search ${tracks.length.toLocaleString()} tracks… (press /)`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className={styles.searchClear} onClick={() => { setSearch(''); searchInputRef.current?.focus() }}>
                ✕
              </button>
            )}
          </div>
          <button
            className={`${styles.filterChip} ${showTags ? styles.filterChipActive : ''}`}
            onClick={() => setShowTags((p) => !p)}
            title="Show/hide tags on each track"
          >
            {showTags ? '🏷️ Tags on' : '🏷️ Tags'}
          </button>
          {(hasActiveFilters || directTagTracks) && (
            <button className={styles.filterChip} onClick={() => { setSearch(''); setFilterTags([]); setActiveGenre(null); setDirectTagTracks(null); setDirectTagLabel(null); setDirectTagError(null) }}>
              Clear
            </button>
          )}
        </div>

        <div className={styles.filterRow2}>
          <span className={styles.genreLabel}>Quick:</span>
          {GENRE_PRESETS.map((g) => (
            <button
              key={g.tag}
              className={`${styles.genreChip} ${activeGenre === g.tag ? styles.genreChipActive : ''}`}
              onClick={() => toggleGenre(g.tag)}
            >
              {g.label}
            </button>
          ))}
          <TagChips
            tags={filterTags}
            onAdd={(tag) => setFilterTags((p) => [...p, tag])}
            onRemove={(tag) => setFilterTags((p) => p.filter((t) => t !== tag))}
            onClear={() => { setFilterTags([]); setActiveGenre(null) }}
            loading={tagLoading}
            suggestions={suggestions}
          />
        </div>
      </div>

      {/* ── Virtual Scrolling Timeline ── */}
      {loading ? (
        <div className={styles.timeline}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={styles.row} style={{ padding: '16px', minHeight: '46px', opacity: 0.3, animation: 'none' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="neuro-pressed" style={{ padding: '48px', textAlign: 'center' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '12px' }}>
            {hasActiveFilters ? '🔍' : syncActive ? '📡' : '📭'}
          </span>
          <p style={{ color: 'var(--text-muted)' }}>
            {directTagLoading ? `Loading tagged tracks for "${directTagLabel}"…`
              : directTagError ? directTagError
              : hasActiveFilters ? 'No tracks match.'
              : syncActive ? 'Loading your tracks…'
              : isDemo ? 'Demo mode — no real tracks.' : 'No tracks found. Try Full Sync.'}
          </p>
          {(hasActiveFilters || directTagTracks) && (
            <button className="neuro-btn" onClick={() => { setSearch(''); setFilterTags([]); setActiveGenre(null); setDirectTagTracks(null); setDirectTagLabel(null); setDirectTagError(null) }} style={{ marginTop: 12 }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.timeline} ref={timelineRef} style={{ height: Math.min(totalHeight, 560), overflowY: 'auto', position: 'relative' }}>
          <div style={{ height: totalHeight, position: 'relative' }}>
            {virtualItems.map(({ item: track, index, translateY }) => {
              const artistName = getArtistName(track)
              const key = `${artistName}::${track.name}`
              return (
                <TimelineRow
                  key={`${track.name}-${artistName}-${track.date?.uts ?? index}`}
                  track={track}
                  tags={showTags ? trackTags.get(key) : undefined}
                  showTags={showTags}
                  tagsLoading={tagsLoading}
                  onClick={() => selectMode ? toggleSelect(key) : setSelectedTrack({ artist: artistName, name: track.name })}
                  isSelected={selectedKeys.has(key)}
                  onToggleSelect={() => toggleSelect(key)}
                  selectMode={selectMode}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${translateY}px)`, animation: 'none' }}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Bulk Tag Bar */}
      {selectMode && (
        <div className={styles.bulkTagBar}>
          <span className={styles.bulkTagCount}>{selectedKeys.size} track{selectedKeys.size !== 1 ? 's' : ''} selected</span>
          <input className={styles.bulkTagInput} type="text" placeholder="Tag name..." value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleBulkTag() }} autoFocus />
          <button className={`neuro-btn neuro-btn-accent ${styles.bulkTagBtn}`} onClick={handleBulkTag}
            disabled={bulkTagLoading || !bulkTagInput.trim()}>
            {bulkTagLoading ? '...' : 'Tag All'}
          </button>
          {bulkTagMsg && <span className={styles.bulkTagMsg}>{bulkTagMsg}</span>}
        </div>
      )}

      {/* Keyboard hints */}
      <div className={styles.kbHints}>
        <span><kbd>/</kbd> search</span>
        <span><kbd>x</kbd> multi-select</span>
        <span><kbd>Esc</kbd> clear</span>
        <span><kbd>j</kbd><kbd>k</kbd> scroll</span>
        <span><kbd>Ctrl+P</kbd> playlist</span>
      </div>

      {selectedTrack && (
        <TrackDetailPanel artistName={selectedTrack.artist} trackName={selectedTrack.name} onClose={() => setSelectedTrack(null)} />
      )}
      {selectedArtist && (
        <ArtistDetailPanel artistName={selectedArtist} onClose={() => setSelectedArtist(null)} />
      )}
    </div>
  )
}
