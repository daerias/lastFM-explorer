import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { hasCredentials } from '../store/credentials'
import {
  getTopArtists,
  getTopTracks,
  getAllRecentTracks,
  getPersonalTags,
  getUserTopTags,
  getPersonalTracks,
  getArtistTopTags,
  type Track,
  type TopTrack,
  type TaggedTrack,
} from '../services/lastfm'
import {
  DEMO_USERNAME,
  DEMO_TOP_ARTISTS,
  DEMO_TOP_TRACK,
  DEMO_TOP_TAGS,
  DEMO_TOP_GENRES,
  DEMO_CHART_DAYS,
} from '../services/demoData'
import ListeningChart, { type ChartBucket, type Aggregation } from '../components/shared/ListeningChart'
import TagChips from '../components/shared/TagChips'
import TrackCard from '../components/shared/TrackCard'
import styles from './Home.module.css'

// ---- Helpers ----

function gaugeNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toUnix(date: Date): number { return Math.floor(date.getTime() / 1000) }
function startOfDay(date: Date): Date { const d = new Date(date); d.setHours(0, 0, 0, 0); return d }
function endOfDay(date: Date): Date { const d = new Date(date); d.setHours(23, 59, 59, 999); return d }

// ---- Bucketing ----

function bucketTracks(tracks: Track[], startDate: Date, endDate: Date, aggregation: Aggregation): ChartBucket[] {
  const start = startOfDay(startDate)
  const end = endOfDay(endDate)
  const map = new Map<string, number>()

  if (aggregation === 'day') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) map.set(d.toISOString().slice(0, 10), 0)
    for (const t of tracks) {
      if (!t.date) continue
      const ts = new Date(parseInt(t.date.uts, 10) * 1000)
      if (ts < start || ts > end) continue
      map.set(ts.toISOString().slice(0, 10), (map.get(ts.toISOString().slice(0, 10)) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([date, count]) => ({
      date, label: DAY_LABELS[new Date(date + 'T00:00:00').getDay()], count,
    }))
  }

  if (aggregation === 'week') {
    for (const t of tracks) {
      if (!t.date) continue
      const ts = new Date(parseInt(t.date.uts, 10) * 1000)
      if (ts < start || ts > end) continue
      const day = ts.getDay() || 7
      const monday = new Date(ts); monday.setDate(ts.getDate() - day + 1)
      map.set(monday.toISOString().slice(0, 10), (map.get(monday.toISOString().slice(0, 10)) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => {
      const d = new Date(date + 'T00:00:00')
      return { date, label: `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`, count }
    })
  }

  for (const t of tracks) {
    if (!t.date) continue
    const ts = new Date(parseInt(t.date.uts, 10) * 1000)
    if (ts < start || ts > end) continue
    const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => {
    const [y, m] = key.split('-')
    return { date: key, label: `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y.slice(2)}`, count }
  })
}

// ---- Top Artists / Tracks ----

interface CountItem { name: string; count: number }

function computeTopArtists(tracks: Track[], limit = 8): CountItem[] {
  const map = new Map<string, number>()
  for (const t of tracks) map.set(t.artist?.['#text'] || 'Unknown', (map.get(t.artist?.['#text'] || 'Unknown') ?? 0) + 1)
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit)
}

function computeTopTracks(tracks: Track[], limit = 8): CountItem[] {
  const map = new Map<string, number>()
  for (const t of tracks) {
    const artist = t.artist?.['#text'] || 'Unknown'
    const key = `${artist} — ${t.name}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return Array.from(map.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit)
}

// ---- Component ----

export default function Home() {
  const { isAuthenticated, username, login } = useAuth()
  const { isOpen: musicPlaying, resolving: npResolving, artist: npArtist, track: npTrack } = useMusicPlayer()
  const isMusicLive = musicPlaying && !npResolving
  const navigate = useNavigate()
  const configured = hasCredentials()
  const isDemo = !isAuthenticated

  // Stats
  const [topTrack, setTopTrack] = useState<TopTrack | null>(isDemo ? { ...DEMO_TOP_TRACK, playcount: String(DEMO_TOP_TRACK.plays), url: '', artist: { name: DEMO_TOP_TRACK.artist, mbid: undefined, url: undefined }, image: [] } as TopTrack : null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Filters
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(); d.setDate(d.getDate() - 14)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })
  const [dateTo, setDateTo] = useState<string>('')
  const [artistFilter, setArtistFilter] = useState('')
  const [trackFilter, setTrackFilter] = useState('')
  const [tagFilters, setTagFilters] = useState<string[]>([])
  const [tagArtists, setTagArtists] = useState<Set<string> | null>(null)
  const [tagLoading, setTagLoading] = useState(false)
  const [topTags, setTopTags] = useState<{ name: string; count: number }[]>(isDemo ? DEMO_TOP_TAGS : [])
  const tagsFetched = useRef(isDemo)
  const [topGenres, setTopGenres] = useState<{ name: string; count: number }[]>(isDemo ? DEMO_TOP_GENRES : [])
  const [genresLoading, setGenresLoading] = useState(false)

  // Tag explore
  const [exploreTag, setExploreTag] = useState<string | null>(null)
  const [exploreTracks, setExploreTracks] = useState<TaggedTrack[]>([])
  const [exploreTotal, setExploreTotal] = useState(0)
  const [exploreLoading, setExploreLoading] = useState(false)
  const [exploreError, setExploreError] = useState<string | null>(null)
  const [exploreArtists, setExploreArtists] = useState<{ name: string; count: number }[]>([])
  const [exploreGenres, setExploreGenres] = useState<{ name: string; count: number }[]>([])
  const [exploreGenresLoading, setExploreGenresLoading] = useState(false)
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const activeExploreTagRef = useRef<string | null>(null)
  const genreArtistRef = useRef<Map<string, Set<string>>>(new Map())

  const [aggregation, setAggregation] = useState<Aggregation>('day')
  const [compareMode, setCompareMode] = useState(false)
  const [compareFrom, setCompareFrom] = useState<string>('')
  const [compareTo, setCompareTo] = useState<string>('')

  // Time presets (pill-based, no rotary dial)
  const [dialPos, setDialPos] = useState(0)
  const TIME_PRESETS = ['14d', '30d', '90d', '1y', 'all'] as const
  const TIME_LABELS: Record<string, string> = { '14d': '14d', '30d': '30d', '90d': '90d', '1y': '1y', 'all': 'All' }

  const [tracks, setTracks] = useState<Track[]>([])
  const [compareTracks, setCompareTracks] = useState<Track[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)

  useEffect(() => {
    if (TIME_PRESETS[dialPos] === 'all') { setDateFrom(''); setDateTo('') }
    else handleTimePreset(TIME_PRESETS[dialPos])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialPos])

  // ── Data fetching ──

  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false; setStatsLoading(true)
    getTopTracks(username, 'overall', 1)
      .then(tracks_ => { if (!cancelled && tracks_.length > 0) setTopTrack(tracks_[0]) })
      .catch(() => {}).finally(() => { if (!cancelled) setStatsLoading(false) })
    return () => { cancelled = true }
  }, [isAuthenticated, username])

  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false; setChartLoading(true)
    const from = dateFrom ? toUnix(new Date(dateFrom + 'T00:00:00')) : undefined
    const to = dateTo ? toUnix(new Date(dateTo + 'T23:59:59')) : undefined
    getAllRecentTracks(username, from, to).then(r => { if (!cancelled) setTracks(r) }).catch(() => {}).finally(() => { if (!cancelled) setChartLoading(false) })
    return () => { cancelled = true }
  }, [isAuthenticated, username, dateFrom, dateTo])

  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    getUserTopTags(username, 500).then(r => { if (!cancelled) { setTopTags(r); tagsFetched.current = true } }).catch(() => { if (!cancelled) { setTopTags([]); tagsFetched.current = true } })
    return () => { cancelled = true }
  }, [isAuthenticated, username])

  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false; setGenresLoading(true)
    ;(async () => {
      try {
        const artists = await getTopArtists(username, 'overall', 20); if (cancelled) return
        const genreMap = new Map<string, number>()
        for (let i = 0; i < artists.length; i += 5) {
          if (cancelled) return
          const batch = artists.slice(i, i + 5)
          const results = await Promise.allSettled(batch.map(a => getArtistTopTags(a.name)))
          if (cancelled) return
          for (const r of results) { if (r.status === 'fulfilled') for (const t of r.value) genreMap.set(t.name, (genreMap.get(t.name) ?? 0) + t.count) }
        }
        if (!cancelled) setTopGenres(Array.from(genreMap.entries()).map(([n,c]) => ({ name: n, count: c })).sort((a,b) => b.count - a.count).slice(0, 10))
      } catch { if (!cancelled) setTopGenres([]) } finally { if (!cancelled) setGenresLoading(false) }
    })()
    return () => { cancelled = true }
  }, [isAuthenticated, username])

  useEffect(() => {
    if (!isAuthenticated || !username || tagFilters.length === 0) { setTagArtists(null); setTagLoading(false); return }
    let cancelled = false; setTagLoading(true)
    const timer = setTimeout(() => {
      Promise.all(tagFilters.map(tag => getPersonalTags(username, tag, 200, 1)))
        .then(results => {
          if (cancelled) return
          if (tagFilters.length === 1) setTagArtists(new Set(results[0].artists.map(a => a.name.toLowerCase())))
          else {
            const sets = results.map(r => new Set(r.artists.map(a => a.name.toLowerCase())))
            const common = new Set<string>()
            for (const name of sets[0]) { let ok = true; for (let i = 1; i < sets.length; i++) if (!sets[i].has(name)) { ok = false; break }; if (ok) common.add(name) }
            setTagArtists(common)
          }
        }).catch(() => { if (!cancelled) setTagArtists(null) }).finally(() => { if (!cancelled) setTagLoading(false) })
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [isAuthenticated, username, tagFilters])

  useEffect(() => {
    if (!isAuthenticated || !username || !compareMode) return
    if (!compareFrom && !compareTo) { setCompareTracks([]); return }
    let cancelled = false; setCompareLoading(true)
    const from = compareFrom ? toUnix(new Date(compareFrom + 'T00:00:00')) : undefined
    const to = compareTo ? toUnix(new Date(compareTo + 'T23:59:59')) : undefined
    getAllRecentTracks(username, from, to).then(r => { if (!cancelled) setCompareTracks(r) }).catch(() => {}).finally(() => { if (!cancelled) setCompareLoading(false) })
    return () => { cancelled = true }
  }, [isAuthenticated, username, compareFrom, compareTo, compareMode])

  // ── Client-side filtering ──

  const applyFilters = (source: Track[]): Track[] => {
    let result = source
    if (artistFilter.trim()) { const q = artistFilter.trim().toLowerCase(); result = result.filter(t => (t.artist?.['#text'] || '').toLowerCase().includes(q)) }
    if (trackFilter.trim()) { const q = trackFilter.trim().toLowerCase(); result = result.filter(t => t.name.toLowerCase().includes(q)) }
    if (tagArtists) result = result.filter(t => tagArtists.has((t.artist?.['#text'] || '').toLowerCase()))
    return result
  }

  const filteredTracks = useMemo(() => applyFilters(tracks), [tracks, artistFilter, trackFilter, tagArtists])
  const filteredCompare = useMemo(() => applyFilters(compareTracks), [compareTracks, artistFilter, trackFilter, tagArtists])

  // ── Chart data ──

  const chartData = useMemo(() => {
    if (isDemo && filteredTracks.length === 0) return DEMO_CHART_DAYS as ChartBucket[]
    if (filteredTracks.length === 0) return []
    const dates = filteredTracks.filter(t => t.date).map(t => new Date(parseInt(t.date!.uts, 10) * 1000)).sort((a, b) => a.getTime() - b.getTime())
    if (dates.length === 0) return []
    const start = dateFrom ? new Date(dateFrom + 'T00:00:00') : startOfDay(dates[0])
    const end = dateTo ? new Date(dateTo + 'T23:59:59') : endOfDay(dates[dates.length - 1])
    return bucketTracks(filteredTracks, start, end, aggregation)
  }, [filteredTracks, dateFrom, dateTo, aggregation])

  const compareData = useMemo(() => {
    if (filteredCompare.length === 0) return []
    const dates = filteredCompare.filter(t => t.date).map(t => new Date(parseInt(t.date!.uts, 10) * 1000)).sort((a, b) => a.getTime() - b.getTime())
    if (dates.length === 0) return []
    const start = compareFrom ? new Date(compareFrom + 'T00:00:00') : startOfDay(dates[0])
    const end = compareTo ? new Date(compareTo + 'T23:59:59') : endOfDay(dates[dates.length - 1])
    return bucketTracks(filteredCompare, start, end, aggregation)
  }, [filteredCompare, compareFrom, compareTo, aggregation])

  // ── Computed analytics ──

  const topArtists = useMemo(() => {
    if (isDemo && filteredTracks.length === 0) return DEMO_TOP_ARTISTS as unknown as CountItem[]
    return computeTopArtists(filteredTracks, 8)
  }, [filteredTracks, isDemo])

  const topTracks = useMemo(() => {
    if (isDemo && filteredTracks.length === 0) return [] as CountItem[]
    return computeTopTracks(filteredTracks, 8)
  }, [filteredTracks, isDemo])

  const periodScrobbles = useMemo(() => filteredTracks.length, [filteredTracks])

  const dailyAvg = useMemo(() => {
    if (filteredTracks.length === 0) return 0
    const dates = filteredTracks.filter(t => t.date).map(t => new Date(parseInt(t.date!.uts, 10) * 1000).toISOString().slice(0, 10))
    if (dates.length === 0) return 0
    const uniqueDays = new Set(dates).size
    return uniqueDays > 0 ? Math.round(filteredTracks.length / uniqueDays) : filteredTracks.length
  }, [filteredTracks])

  // ── Actions ──

  const clearFilters = useCallback(() => {
    setDateFrom(''); setDateTo(''); setArtistFilter(''); setTrackFilter(''); setTagFilters([]); setTagArtists(null)
  }, [])

  const handleTimePreset = useCallback((preset: string) => {
    const today = new Date()
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const days: Record<string, number> = { '14d': 14, '30d': 30, '90d': 90, '1y': 365 }
    if (days[preset]) { const d = new Date(today); d.setDate(d.getDate() - days[preset]); setDateFrom(fmt(d)); setDateTo('') }
  }, [])

  // ── Tag explore (identical to original) ──

  const loadTagExplore = useCallback(async (tag: string) => {
    if (exploreTag === tag) { setExploreTag(null); return }
    if (!username) return
    activeExploreTagRef.current = tag; genreArtistRef.current = new Map()
    setExploreTag(tag); setExploreTracks([]); setExploreTotal(0); setExploreArtists([]); setExploreGenres([]); setExploreError(null); setSelectedGenre(null); setSelectedArtist(null); setExploreLoading(true)
    const thisTag = tag
    try {
      const page1 = await getPersonalTracks(username, tag, 200, 1)
      if (activeExploreTagRef.current !== thisTag) return
      const allTracks = [...page1.tracks]; const totalPages = page1.totalPages; let failedPages = 0
      setExploreTracks([...allTracks]); setExploreTotal(page1.total || 0)
      if (totalPages > 1) {
        for (let start = 2; start <= totalPages; start += 5) {
          if (activeExploreTagRef.current !== thisTag) return
          const end = Math.min(start + 4, totalPages)
          const batch = await Promise.allSettled(Array.from({ length: end - start + 1 }, (_, i) => getPersonalTracks(username, tag, 200, start + i)))
          if (activeExploreTagRef.current !== thisTag) return
          for (const r of batch) { if (r.status === 'fulfilled') allTracks.push(...r.value.tracks); else failedPages++ }
          setExploreTracks([...allTracks])
        }
      }
      if (activeExploreTagRef.current !== thisTag) return
      if (failedPages > 0) setExploreError(`${failedPages} page(s) failed — showing ${allTracks.length} of ${page1.total}`)
    } catch (err: any) { if (activeExploreTagRef.current !== thisTag) return; setExploreError(err.message || 'Failed') }
    finally { if (activeExploreTagRef.current === thisTag) setExploreLoading(false) }
  }, [exploreTag, username])

  useEffect(() => {
    if (!username || exploreTracks.length === 0 || exploreLoading) { if (exploreTracks.length === 0) { setExploreArtists([]); setExploreGenres([]) }; return }
    let cancelled = false; setExploreGenresLoading(true)
    ;(async () => {
      const artistMap = new Map<string, number>()
      for (const t of exploreTracks) artistMap.set(t.artist.name, (artistMap.get(t.artist.name) ?? 0) + 1)
      const artists = Array.from(artistMap.entries()).map(([n,c]) => ({ name: n, count: c })).sort((a,b) => b.count - a.count)
      if (cancelled) return; setExploreArtists(artists)
      const genreMap = new Map<string, number>(); const genreToArtists = new Map<string, Set<string>>()
      const names = artists.map(a => a.name)
      for (let i = 0; i < names.length; i += 5) {
        if (cancelled) return
        const batch = names.slice(i, i + 5)
        const results = await Promise.allSettled(batch.map(name => getArtistTopTags(name)))
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          if (r.status === 'fulfilled') for (const tag of r.value) {
            const lower = tag.name.toLowerCase(); genreMap.set(lower, (genreMap.get(lower) ?? 0) + tag.count)
            if (!genreToArtists.has(lower)) genreToArtists.set(lower, new Set()); genreToArtists.get(lower)!.add(batch[j].toLowerCase())
          }
        }
      }
      if (cancelled) return; genreArtistRef.current = genreToArtists
      setExploreGenres(Array.from(genreMap.entries()).map(([n,c]) => ({ name: n, count: c })).sort((a,b) => b.count - a.count).slice(0, 20))
      setExploreGenresLoading(false)
    })()
    return () => { cancelled = true }
  }, [username, exploreTracks, exploreLoading])

  const filteredExploreTracks = useMemo(() => {
    let result = exploreTracks
    if (selectedGenre) { const ga = genreArtistRef.current.get(selectedGenre.toLowerCase()); result = ga && ga.size > 0 ? result.filter(t => ga.has(t.artist.name.toLowerCase())) : [] }
    if (selectedArtist) result = result.filter(t => t.artist.name.toLowerCase() === selectedArtist.toLowerCase())
    return result
  }, [exploreTracks, selectedGenre, selectedArtist])

  const filteredExploreArtists = useMemo(() => {
    if (!selectedGenre) return exploreArtists
    const ga = genreArtistRef.current.get(selectedGenre.toLowerCase())
    return ga && ga.size > 0 ? exploreArtists.filter(a => ga.has(a.name.toLowerCase())) : []
  }, [exploreArtists, selectedGenre])

  // ── Render ──

  return (
    <div className={styles.home}>
      {/* Hero */}
      <section className={styles.hero}>
        {isAuthenticated ? (
          <>
            <h1>Welcome back, {username}</h1>
            <p className={styles.subtitle}>Your listening pulse. Every beat, every day.</p>
          </>
        ) : (
          <>
            <h1>{username || DEMO_USERNAME}'s Last.fm Explorer <span className={styles.demoBadge}>Demo</span></h1>
            <p className={styles.subtitle}>
              Your listening pulse. Every beat, every day.{' '}
              {configured ? (
                <button className="neuro-btn neuro-btn-accent" onClick={login} style={{ padding: '6px 16px', fontSize: '0.8rem', marginLeft: '8px', verticalAlign: 'middle' }}>Login with Last.fm</button>
              ) : (
                <Link to="/settings" className="neuro-btn neuro-btn-accent" style={{ padding: '6px 16px', fontSize: '0.8rem', marginLeft: '8px', verticalAlign: 'middle', display: 'inline-block' }}>Connect your account</Link>
              )}
            </p>
          </>
        )}
      </section>

      {/* ═══ STATS ROW — at-a-glance key metrics ═══ */}
      {(isAuthenticated || isDemo) && (
        <div className={styles.statsRow}>
          <div className={`neuro-raised-sm ${styles.statCard}`}>
            <span className={styles.statIcon}>📊</span>
            <span className={styles.statValue}>{statsLoading ? '...' : gaugeNumber(periodScrobbles)}</span>
            <span className={styles.statLabel}>Scrobbles</span>
            <span className={styles.statSub}>this period</span>
          </div>
          <div className={`neuro-raised-sm ${styles.statCard}`}>
            <span className={styles.statIcon}>📅</span>
            <span className={styles.statValue}>{statsLoading ? '...' : dailyAvg}</span>
            <span className={styles.statLabel}>Daily Avg</span>
            <span className={styles.statSub}>tracks/day</span>
          </div>
          <div className={`neuro-raised-sm ${styles.statCard}`}>
            <span className={styles.statIcon}>🎤</span>
            <span className={styles.statValue} style={{ fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
              {statsLoading ? '...' : topArtists[0]?.name || '—'}
            </span>
            <span className={styles.statLabel}>Top Artist</span>
            <span className={styles.statSub}>{topArtists[0] ? `${topArtists[0].count} plays` : ''}</span>
          </div>
          <div className={`neuro-raised-sm ${styles.statCard} ${styles.statCardAccent}`}>
            <span className={styles.statIcon}>🎵</span>
            <span className={styles.statValue} style={{ fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '110px' }}>
              {statsLoading ? '...' : topTracks[0]?.name?.split(' — ')[1] || topTrack?.name || '—'}
            </span>
            <span className={styles.statLabel}>Top Track</span>
            <span className={styles.statSub}>{topTracks[0] ? `${topTracks[0].count} plays` : topTrack ? `${topTrack.playcount} total` : ''}</span>
          </div>
        </div>
      )}

      {/* ═══ CONTROL BAR — clean plastic neumorphism ═══ */}
      {(isAuthenticated || isDemo) && (
        <div className={`neuro-pressed ${styles.controlBar}`}>
          {/* Time presets */}
          <div className={styles.timePresets}>
            {(['14d', '30d', '90d', '1y', 'all'] as const).map(p => (
              <button key={p} className={`${styles.timePill} ${TIME_LABELS[TIME_PRESETS[dialPos]] === TIME_LABELS[p] ? styles.timePillActive : ''}`}
                onClick={() => p === 'all' ? (setDateFrom(''), setDateTo(''), setDialPos(4)) : handleTimePreset(p)}>
                {TIME_LABELS[p]}
              </button>
            ))}
          </div>
          {/* Aggregation */}
          <div className={styles.aggPills}>
            {(['day', 'week', 'month'] as const).map(a => (
              <button key={a} className={`${styles.aggPill} ${aggregation === a ? styles.aggPillActive : ''}`} onClick={() => setAggregation(a)}>{a}</button>
            ))}
          </div>
          {/* Compare toggle */}
          <button className={`${styles.comparePill} ${compareMode ? styles.comparePillActive : ''}`}
            onClick={() => { if (!compareMode) { setCompareFrom(dateFrom); setCompareTo(dateTo) }; setCompareMode(!compareMode) }}>
            {compareMode ? '⟳ Comparing' : '⇆ Compare'}
          </button>
          {/* Now playing indicator */}
          {isMusicLive && npArtist && npTrack && (
            <span className={styles.nowPlaying}>
              <span className={styles.npDot} />
              {npTrack} — {npArtist}
            </span>
          )}
          {/* Filter inputs */}
          <div className={styles.filterInputs}>
            <input type="text" className={styles.textInput} placeholder="Artist…" value={artistFilter} onChange={e => setArtistFilter(e.target.value)} />
            <input type="text" className={styles.textInput} placeholder="Track…" value={trackFilter} onChange={e => setTrackFilter(e.target.value)} />
            {(artistFilter || trackFilter || tagFilters.length > 0) && (
              <button className={styles.filterClearBtn} onClick={clearFilters}>clear</button>
            )}
          </div>
          {/* Tag chips */}
          <div className={styles.tagChipsRow}>
            <TagChips tags={tagFilters} onAdd={t => setTagFilters(p => [...p, t])} onRemove={t => setTagFilters(p => p.filter(x => x !== t))}
              onClear={() => { setTagFilters([]); setTagArtists(null) }} loading={tagLoading} suggestions={topTags} />
            {tagFilters.length > 0 && !tagLoading && <span className={styles.tagResult}>{filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      )}

      {/* ═══ LISTENING CHART ═══ */}
      {(isAuthenticated || isDemo) && (
        <ListeningChart days={chartData} compareDays={compareMode ? compareData : undefined}
          aggregation={aggregation} onAggregationChange={setAggregation}
          onBarClick={date => navigate(`/day/${date}`)} loading={chartLoading} compareLoading={compareLoading} />
      )}

      {/* ═══ TOP ARTISTS + TOP TRACKS (two-column) ═══ */}
      {(isAuthenticated || isDemo) && (topArtists.length > 0 || topTracks.length > 0) && (
        <div className={styles.topSections}>
          {topArtists.length > 0 && (
            <section className={`neuro-raised ${styles.topPanel}`}>
              <h3 className={styles.sectionTitle}>🎤 Top Artists</h3>
              <div className={styles.barList}>
                {topArtists.map((a, i) => {
                  const max = topArtists[0]?.count ?? 1; const w = (a.count / max) * 100
                  return (
                    <div key={a.name} className={styles.barRow}>
                      <span className={styles.barRank}>#{i + 1}</span>
                      <span className={styles.barName}>{a.name}</span>
                      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${w}%` }} /></div>
                      <span className={styles.barCount}>{a.count}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          {topTracks.length > 0 && (
            <section className={`neuro-raised ${styles.topPanel}`}>
              <h3 className={styles.sectionTitle}>🎵 Top Tracks</h3>
              <div className={styles.barList}>
                {topTracks.map((t, i) => {
                  const max = topTracks[0]?.count ?? 1; const w = (t.count / max) * 100
                  const parts = t.name.split(' — '); const trackName = parts[1] || t.name; const artistName = parts[0]
                  return (
                    <div key={t.name} className={styles.barRow}>
                      <span className={styles.barRank}>#{i + 1}</span>
                      <span className={styles.barName}>
                        <span className={styles.trackTitle}>{trackName}</span>
                        <span className={styles.trackArtist}>{artistName}</span>
                      </span>
                      <div className={styles.barTrack}><div className={`${styles.barFill} ${styles.barFillTrack}`} style={{ width: `${w}%` }} /></div>
                      <span className={styles.barCount}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ═══ TOP GENRES + TOP TAGS ═══ */}
      {(isAuthenticated || isDemo) && (
        <div className={styles.topSections}>
          <section className={`neuro-raised ${styles.topPanel}`}>
            <h3 className={`${styles.sectionTitle} ${styles.genreTitle}`}>🎸 Top Genres</h3>
            {genresLoading ? (
              <div className={styles.skelList}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBar} />)}</div>
            ) : topGenres.length === 0 ? (
              <p className={styles.emptyHint}>No genres yet</p>
            ) : (
              <div className={styles.barList}>
                {topGenres.map((g, i) => { const max = topGenres[0]?.count ?? 1; const w = (g.count / max) * 100
                  return (<div key={g.name} className={styles.barRow}><span className={styles.barRank}>#{i + 1}</span><span className={styles.barName}>{g.name}</span><div className={styles.barTrack}><div className={`${styles.barFill} ${styles.barFillGenre}`} style={{ width: `${w}%` }} /></div><span className={styles.barCount}>{g.count}</span></div>)
                })}
              </div>
            )}
          </section>
          <section className={`neuro-raised ${styles.topPanel}`}>
            <h3 className={`${styles.sectionTitle} ${styles.tagTitle}`}>🏷️ Top Tags</h3>
            {topTags.length === 0 && !tagsFetched.current ? (
              <div className={styles.skelList}>{Array.from({ length: 5 }).map((_, i) => <div key={i} className={styles.skelBar} />)}</div>
            ) : topTags.length === 0 ? (
              <p className={styles.emptyHint}>No tags yet</p>
            ) : (
              <div className={styles.barList}>
                {topTags.slice(0, 10).map((t, i) => { const max = topTags[0]?.count ?? 1; const w = (t.count / max) * 100; const active = exploreTag === t.name
                  return (
                    <div key={t.name} className={`${styles.barRow} ${styles.barRowClickable} ${active ? styles.barRowActive : ''}`}
                      onClick={() => loadTagExplore(t.name)} role="button" tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter') loadTagExplore(t.name) }} title={`Explore "${t.name}"`}>
                      <span className={styles.barRank}>#{i + 1}</span><span className={styles.barName}>{t.name}</span>
                      <div className={styles.barTrack}><div className={`${styles.barFill} ${styles.barFillTag}`} style={{ width: `${w}%` }} /></div>
                      <span className={styles.barCount}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ═══ TAG EXPLORE ═══ */}
      {(isAuthenticated || isDemo) && exploreTag && (
        <section className={`neuro-raised ${styles.exploreSection}`}>
          <div className={styles.exploreHeader}>
            <h3 className={styles.sectionTitle}>Tag: <span className={styles.exploreTagName}>{exploreTag}</span>
              <span className={styles.exploreTrackCount}>{exploreTotal > 0 && <> — {exploreTotal} track{exploreTotal !== 1 ? 's' : ''}</>}</span></h3>
            <button className={styles.exploreClose} onClick={() => setExploreTag(null)} title="Close">✕</button>
          </div>
          {exploreError && <p className={styles.exploreWarn}>{exploreError}</p>}
          {exploreLoading ? <div className={styles.exploreLoading}>Loading tracks...</div> : (
            <div className={styles.exploreColumns}>
              <div className={`neuro-pressed ${styles.exploreCol}`}>
                <h4 className={styles.exploreColTitle}>Genres {selectedGenre && <button className={styles.exploreClearFilter} onClick={() => setSelectedGenre(null)}>clear</button>}</h4>
                {exploreGenresLoading ? <div className={styles.exploreColLoading}>...</div> : exploreGenres.length === 0 ? <p className={styles.exploreColEmpty}>No genres found</p> : (
                  <div className={styles.exploreChipList}>
                    {exploreGenres.map(g => (<button key={g.name} className={`${styles.exploreChip} ${selectedGenre === g.name ? styles.exploreChipActive : ''}`} onClick={() => setSelectedGenre(selectedGenre === g.name ? null : g.name)}>{g.name}<span className={styles.exploreChipCount}>{g.count}</span></button>))}
                  </div>
                )}
              </div>
              <div className={`neuro-pressed ${styles.exploreCol}`}>
                <h4 className={styles.exploreColTitle}>Artists {selectedArtist && <button className={styles.exploreClearFilter} onClick={() => setSelectedArtist(null)}>clear</button>}</h4>
                {exploreArtists.length === 0 ? <p className={styles.exploreColEmpty}>No artists</p> : (
                  <div className={styles.exploreChipList}>
                    {filteredExploreArtists.map(a => (<button key={a.name} className={`${styles.exploreChip} ${selectedArtist === a.name ? styles.exploreChipActive : ''}`} onClick={() => setSelectedArtist(selectedArtist === a.name ? null : a.name)}>{a.name}<span className={styles.exploreChipCount}>{a.count}</span></button>))}
                  </div>
                )}
              </div>
              <div className={`neuro-pressed ${styles.exploreCol} ${styles.exploreColTracks}`}>
                <h4 className={styles.exploreColTitle}>Tracks <span className={styles.exploreColSub}>{filteredExploreTracks.length} shown</span></h4>
                {filteredExploreTracks.length === 0 ? <p className={styles.exploreColEmpty}>{selectedArtist || selectedGenre ? 'No tracks match filters.' : 'No tracks found.'}</p> : (
                  <div className={styles.exploreTrackGrid}>
                    {filteredExploreTracks.map(t => (<TrackCard key={`${t.artist.name}-${t.name}`} track={{ name: t.name, playcount: '', url: t.url, artist: { name: t.artist.name, mbid: undefined, url: undefined }, image: [] }} variant="top" />))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ═══ QUICK ACTIONS ═══ */}
      {(isAuthenticated || isDemo) && filteredTracks.length > 0 && (
        <div className={styles.quickActions}>
          <span className={styles.qaLabel}>{filteredTracks.length} tracks in this period</span>
          <button className={styles.qaBtn} onClick={() => window.dispatchEvent(new CustomEvent('toggle-playlist-creator'))} title="Open Playlist Creator (Ctrl+P)">🎧 Create Playlist</button>
          <button className={styles.qaBtn} onClick={() => navigate('/library')}>📚 View in Library</button>
        </div>
      )}
    </div>
  )
}
