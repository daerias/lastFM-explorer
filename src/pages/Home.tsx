import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import { hasCredentials } from '../store/credentials'
import {
  getUserInfo,
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
  DEMO_STATS,
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

/** Convert Date to Unix timestamp (seconds) */
function toUnix(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

/** Get the start of a date (midnight UTC) */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** Get the end of a date (23:59:59.999) */
function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

// ---- Bucketing ----

function bucketTracks(
  tracks: Track[],
  startDate: Date,
  endDate: Date,
  aggregation: Aggregation,
): ChartBucket[] {
  const start = startOfDay(startDate)
  const end = endOfDay(endDate)
  const map = new Map<string, number>()

  if (aggregation === 'day') {
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      map.set(d.toISOString().slice(0, 10), 0)
    }
    for (const t of tracks) {
      if (!t.date) continue
      const ts = new Date(parseInt(t.date.uts, 10) * 1000)
      if (ts < start || ts > end) continue
      const key = ts.toISOString().slice(0, 10)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries()).map(([date, count]) => ({
      date,
      label: DAY_LABELS[new Date(date + 'T00:00:00').getDay()],
      count,
    }))
  }

  if (aggregation === 'week') {
    // ISO week: group by Monday date
    for (const t of tracks) {
      if (!t.date) continue
      const ts = new Date(parseInt(t.date.uts, 10) * 1000)
      if (ts < start || ts > end) continue
      const day = ts.getDay() || 7
      const monday = new Date(ts)
      monday.setDate(ts.getDate() - day + 1)
      const key = monday.toISOString().slice(0, 10)
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => {
        const d = new Date(date + 'T00:00:00')
        const mon = d.getDate()
        const month = MONTH_LABELS[d.getMonth()]
        return { date, label: `${mon} ${month}`, count }
      })
  }

  // month
  for (const t of tracks) {
    if (!t.date) continue
    const ts = new Date(parseInt(t.date.uts, 10) * 1000)
    if (ts < start || ts > end) continue
    const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [y, m] = key.split('-')
      return { date: key, label: `${MONTH_LABELS[parseInt(m, 10) - 1]} ${y.slice(2)}`, count }
    })
}

// ---- Top Artists ----

interface ArtistCount {
  name: string
  count: number
}

function computeTopArtists(tracks: Track[], limit = 10): ArtistCount[] {
  const map = new Map<string, number>()
  for (const t of tracks) {
    const name = t.artist?.['#text'] || 'Unknown'
    map.set(name, (map.get(name) ?? 0) + 1)
  }
  return Array.from(map.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

// ---- Component ----

export default function Home() {
  const { isAuthenticated, username, login } = useAuth()
  const { isOpen: musicPlaying, resolving: npResolving, artist: npArtist, track: npTrack } = useMusicPlayer()
  const isMusicLive = musicPlaying && !npResolving
  const navigate = useNavigate()
  const configured = hasCredentials()

  const isDemo = !isAuthenticated

  // Stats — initialized with demo data, replaced by real API data when authenticated
  const [totalScrobbles, setTotalScrobbles] = useState<number | null>(isDemo ? DEMO_STATS.totalScrobbles : null)
  const [topArtistPlays, setTopArtistPlays] = useState<number | null>(isDemo ? DEMO_STATS.topArtistPlays : null)
  const [topTrack, setTopTrack] = useState<TopTrack | null>(isDemo ? { ...DEMO_TOP_TRACK, playcount: String(DEMO_TOP_TRACK.plays), url: '', artist: { name: DEMO_TOP_TRACK.artist, mbid: undefined, url: undefined }, image: [] } as TopTrack : null)
  const [memberSince, setMemberSince] = useState<Date | null>(isDemo ? DEMO_STATS.memberSince : null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Filters — default to last 14 days (local date, not UTC)
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setDate(d.getDate() - 14)
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

  // ---- Tag detail: three-column explore (Genre | Artist | Tracks) ----
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
  // Ref: which tag is currently being loaded (cancellation sentinel + genre→artist map)
  const activeExploreTagRef = useRef<string | null>(null)
  const genreArtistRef = useRef<Map<string, Set<string>>>(new Map())

  const [aggregation, setAggregation] = useState<Aggregation>('day')
  const [compareMode, setCompareMode] = useState(false)
  const [compareFrom, setCompareFrom] = useState<string>('')
  const [compareTo, setCompareTo] = useState<string>('')

  // ---- Rotary dial state ----
  const dialRef = useRef<HTMLDivElement>(null)
  const [dialPos, setDialPos] = useState(0) // 0=14d, 1=30d, 2=90d, 3=1y, 4=all
  const TIME_PRESETS = ['14d', '30d', '90d', '1y', 'all'] as const
  const TIME_LABELS: Record<string, string> = { '14d': '14d', '30d': '30d', '90d': '90d', '1y': '1y', 'all': 'All' }

  // Data
  const [tracks, setTracks] = useState<Track[]>([])
  const [compareTracks, setCompareTracks] = useState<Track[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)

  // ---- Rotary dial: drag-to-turn handler ----
  const dialCleanupRef = useRef<(() => void) | null>(null)

  const handleDialMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const knob = dialRef.current
    if (!knob) return
    const rect = knob.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2

    // Clean up any previous zombie listeners
    dialCleanupRef.current?.()

    const onMove = (ev: MouseEvent) => {
      const angle = Math.atan2(ev.clientY - cy, ev.clientX - cx)
      let deg = (angle * 180) / Math.PI + 90 // normalize: 0=top
      if (deg < 0) deg += 360
      // Map 0-360 to 0-4 positions
      const pos = Math.round((deg / 360) * 5) % 5
      setDialPos(pos)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      dialCleanupRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    dialCleanupRef.current = onUp
  }, [])

  // Cleanup zombie dial listeners on unmount
  useEffect(() => () => { dialCleanupRef.current?.() }, [])

  // Sync dial position to time presets
  useEffect(() => {
    if (TIME_PRESETS[dialPos] === 'all') {
      setDateFrom('')
      setDateTo('')
    } else {
      handleTimePreset(TIME_PRESETS[dialPos])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialPos])

  // ---- Stats fetch ----
  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    setStatsLoading(true)

    Promise.all([
      getUserInfo(username),
      getTopArtists(username, 'overall', 1),
      getTopTracks(username, 'overall', 1),
    ])
      .then(([user, artists, tracks_]) => {
        if (cancelled) return
        if (user) {
          setTotalScrobbles(parseInt(user.playcount, 10) || 0)
          if (user.registered?.unixtime) {
            setMemberSince(new Date(parseInt(user.registered.unixtime, 10) * 1000))
          }
        }
        if (artists.length > 0) setTopArtistPlays(parseInt(artists[0].playcount ?? '0', 10) || 0)
        if (tracks_.length > 0) setTopTrack(tracks_[0])
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatsLoading(false) })

    return () => { cancelled = true }
  }, [isAuthenticated, username])

  // ---- Main chart data fetch ----
  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    setChartLoading(true)

    const from = dateFrom ? toUnix(new Date(dateFrom + 'T00:00:00')) : undefined
    const to = dateTo ? toUnix(new Date(dateTo + 'T23:59:59')) : undefined

    getAllRecentTracks(username, from, to)
      .then((result) => {
        if (cancelled) return
        setTracks(result)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChartLoading(false) })

    return () => { cancelled = true }
  }, [isAuthenticated, username, dateFrom, dateTo])

  // ---- Load user's top tags ----
  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    getUserTopTags(username, 500)
      .then((result) => { if (!cancelled) { setTopTags(result); tagsFetched.current = true } })
      .catch(() => { if (!cancelled) { setTopTags([]); tagsFetched.current = true } })
    return () => { cancelled = true }
  }, [isAuthenticated, username])

  // ---- Compute genres from user's top artists' community tags ----
  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    setGenresLoading(true)

    const loadGenres = async () => {
      try {
        const artists = await getTopArtists(username, 'overall', 20)
        if (cancelled) return

        const genreMap = new Map<string, number>()
        const BATCH = 5

        for (let i = 0; i < artists.length; i += BATCH) {
          if (cancelled) return
          const batch = artists.slice(i, i + BATCH)
          const results = await Promise.allSettled(
            batch.map((a) => getArtistTopTags(a.name)),
          )
          if (cancelled) return
          for (const result of results) {
            if (result.status === 'fulfilled') {
              for (const tag of result.value) {
                genreMap.set(tag.name, (genreMap.get(tag.name) ?? 0) + tag.count)
              }
            }
          }
        }

        if (!cancelled) {
          const genres = Array.from(genreMap.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
          setTopGenres(genres)
        }
      } catch {
        if (!cancelled) setTopGenres([])
      } finally {
        if (!cancelled) setGenresLoading(false)
      }
    }

    loadGenres()
    return () => { cancelled = true }
  }, [isAuthenticated, username])

  // ---- Multi-tag filter fetch (debounced, intersects artist sets) ----
  useEffect(() => {
    if (!isAuthenticated || !username || tagFilters.length === 0) {
      setTagArtists(null)
      setTagLoading(false)
      return
    }
    let cancelled = false
    setTagLoading(true)

    const timer = setTimeout(() => {
      Promise.all(tagFilters.map((tag) => getPersonalTags(username, tag, 200, 1)))
        .then((results) => {
          if (cancelled) return
          if (tagFilters.length === 1) {
            setTagArtists(new Set(results[0].artists.map((a) => a.name.toLowerCase())))
          } else {
            // Intersection without mutating during iteration
            const nameSets = results.map(
              (r) => new Set(r.artists.map((a) => a.name.toLowerCase())),
            )
            const common = new Set<string>()
            for (const name of nameSets[0]) {
              let inAll = true
              for (let i = 1; i < nameSets.length; i++) {
                if (!nameSets[i].has(name)) { inAll = false; break }
              }
              if (inAll) common.add(name)
            }
            setTagArtists(common)
          }
        })
        .catch(() => { if (!cancelled) setTagArtists(null) })
        .finally(() => { if (!cancelled) setTagLoading(false) })
    }, 400)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [isAuthenticated, username, tagFilters])

  // ---- Compare data fetch ----
  useEffect(() => {
    if (!isAuthenticated || !username || !compareMode) return
    if (!compareFrom && !compareTo) { setCompareTracks([]); return }
    let cancelled = false
    setCompareLoading(true)

    const from = compareFrom ? toUnix(new Date(compareFrom + 'T00:00:00')) : undefined
    const to = compareTo ? toUnix(new Date(compareTo + 'T23:59:59')) : undefined

    getAllRecentTracks(username, from, to)
      .then((result) => {
        if (cancelled) return
        setCompareTracks(result)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setCompareLoading(false) })

    return () => { cancelled = true }
  }, [isAuthenticated, username, compareFrom, compareTo, compareMode])

  // ---- Filter tracks client-side (shared logic) ----
  const applyFilters = (source: Track[]): Track[] => {
    let result = source
    if (artistFilter.trim()) {
      const q = artistFilter.trim().toLowerCase()
      result = result.filter((t) => (t.artist?.['#text'] || '').toLowerCase().includes(q))
    }
    if (trackFilter.trim()) {
      const q = trackFilter.trim().toLowerCase()
      result = result.filter((t) => t.name.toLowerCase().includes(q))
    }
    if (tagArtists) {
      result = result.filter((t) => {
        const artistName = (t.artist?.['#text'] || '').toLowerCase()
        return tagArtists.has(artistName)
      })
    }
    return result
  }

  const filteredTracks = useMemo(() => applyFilters(tracks), [tracks, artistFilter, trackFilter, tagArtists])
  const filteredCompare = useMemo(() => applyFilters(compareTracks), [compareTracks, artistFilter, trackFilter, tagArtists])

  // ---- Bucket into chart data ----
  const chartData = useMemo(() => {
    if (isDemo && filteredTracks.length === 0) return DEMO_CHART_DAYS as ChartBucket[]
    if (filteredTracks.length === 0) return []
    const dates = filteredTracks
      .filter((t) => t.date)
      .map((t) => new Date(parseInt(t.date!.uts, 10) * 1000))
      .sort((a, b) => a.getTime() - b.getTime())
    if (dates.length === 0) return []

    const start = dateFrom
      ? new Date(dateFrom + 'T00:00:00')
      : startOfDay(dates[0])
    const end = dateTo
      ? new Date(dateTo + 'T23:59:59')
      : endOfDay(dates[dates.length - 1])

    return bucketTracks(filteredTracks, start, end, aggregation)
  }, [filteredTracks, dateFrom, dateTo, aggregation])

  const compareData = useMemo(() => {
    if (filteredCompare.length === 0) return []
    const dates = filteredCompare
      .filter((t) => t.date)
      .map((t) => new Date(parseInt(t.date!.uts, 10) * 1000))
      .sort((a, b) => a.getTime() - b.getTime())
    if (dates.length === 0) return []

    const start = compareFrom
      ? new Date(compareFrom + 'T00:00:00')
      : startOfDay(dates[0])
    const end = compareTo
      ? new Date(compareTo + 'T23:59:59')
      : endOfDay(dates[dates.length - 1])

    return bucketTracks(filteredCompare, start, end, aggregation)
  }, [filteredCompare, compareFrom, compareTo, aggregation])

  // ---- Top Artists ----
  const topArtists = useMemo(() => {
    if (isDemo && filteredTracks.length === 0) return DEMO_TOP_ARTISTS as unknown as ArtistCount[]
    return computeTopArtists(filteredTracks, 10)
  }, [filteredTracks, isDemo])

  // ---- Clear filters ----
  const clearFilters = useCallback(() => {
    setDateFrom('')
    setDateTo('')
    setArtistFilter('')
    setTrackFilter('')
    setTagFilters([])
    setTagArtists(null)
  }, [])

  // ---- Time range presets ----
  const handleTimePreset = useCallback((preset: string) => {
    const today = new Date()
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    let from: string
    let to = ''

    switch (preset) {
      case '14d': {
        const d = new Date(today)
        d.setDate(d.getDate() - 14)
        from = fmt(d)
        break
      }
      case '30d': {
        const d = new Date(today)
        d.setDate(d.getDate() - 30)
        from = fmt(d)
        break
      }
      case '90d': {
        const d = new Date(today)
        d.setDate(d.getDate() - 90)
        from = fmt(d)
        break
      }
      case '1y': {
        const d = new Date(today)
        d.setFullYear(d.getFullYear() - 1)
        from = fmt(d)
        break
      }
      default:
        return
    }

    setDateFrom(from)
    setDateTo(to)
  }, [])

  // ---- Tag explore: load ALL tracks for a clicked tag ----
  const loadTagExplore = useCallback(async (tag: string) => {
    if (exploreTag === tag) { setExploreTag(null); return }
    if (!username) return

    // Cancel any in-flight explore for a different tag
    activeExploreTagRef.current = tag

    genreArtistRef.current = new Map()

    setExploreTag(tag)
    setExploreTracks([])
    setExploreTotal(0)
    setExploreArtists([])
    setExploreGenres([])
    setExploreError(null)
    setSelectedGenre(null)
    setSelectedArtist(null)
    setExploreLoading(true)

    const thisTag = tag

    try {
      const page1 = await getPersonalTracks(username, tag, 200, 1)
      if (activeExploreTagRef.current !== thisTag) return

      const allTracks = [...page1.tracks]
      const totalPages = page1.totalPages
      let failedPages = 0

      setExploreTracks([...allTracks])
      setExploreTotal(page1.total || 0)

      if (totalPages > 1) {
        const BATCH = 5
        for (let start = 2; start <= totalPages; start += BATCH) {
          if (activeExploreTagRef.current !== thisTag) return
          const end = Math.min(start + BATCH - 1, totalPages)
          const batch = await Promise.allSettled(
            Array.from({ length: end - start + 1 }, (_, i) =>
              getPersonalTracks(username, tag, 200, start + i),
            ),
          )
          if (activeExploreTagRef.current !== thisTag) return
          for (const r of batch) {
            if (r.status === 'fulfilled') {
              allTracks.push(...r.value.tracks)
            } else {
              failedPages++
            }
          }
          setExploreTracks([...allTracks])
        }
      }

      if (activeExploreTagRef.current !== thisTag) return
      if (failedPages > 0) {
        setExploreError(`${failedPages} page(s) failed — showing ${allTracks.length} of ${page1.total}`)
      }
    } catch (err: any) {
      if (activeExploreTagRef.current !== thisTag) return
      setExploreError(err.message || 'Failed to load tracks')
    } finally {
      if (activeExploreTagRef.current === thisTag) {
        setExploreLoading(false)
      }
    }
  }, [exploreTag, username])

  // ---- Extract unique artists + fetch community genres once all tracks loaded ----
  useEffect(() => {
    if (!username || exploreTracks.length === 0 || exploreLoading) {
      if (exploreTracks.length === 0) {
        setExploreArtists([])
        setExploreGenres([])
      }
      return
    }

    let cancelled = false
    setExploreGenresLoading(true)

    const compute = async () => {
      // Unique artists with counts
      const artistMap = new Map<string, number>()
      for (const t of exploreTracks) {
        const name = t.artist.name
        artistMap.set(name, (artistMap.get(name) ?? 0) + 1)
      }
      const artists = Array.from(artistMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)

      if (cancelled) return
      setExploreArtists(artists)

      // Fetch community tags (genres) for each unique artist — batch of 5
      // Also build genre → artist mapping for filtering
      const genreMap = new Map<string, number>()
      const genreToArtists = new Map<string, Set<string>>()
      const artistNames = artists.map((a) => a.name)
      const BATCH = 5

      for (let i = 0; i < artistNames.length; i += BATCH) {
        if (cancelled) return
        const batch = artistNames.slice(i, i + BATCH)
        const results = await Promise.allSettled(
          batch.map((name) => getArtistTopTags(name)),
        )
        for (let j = 0; j < results.length; j++) {
          const r = results[j]
          const artistName = batch[j]
          if (r.status === 'fulfilled') {
            for (const tag of r.value) {
              const lower = tag.name.toLowerCase()
              genreMap.set(lower, (genreMap.get(lower) ?? 0) + tag.count)
              if (!genreToArtists.has(lower)) {
                genreToArtists.set(lower, new Set())
              }
              genreToArtists.get(lower)!.add(artistName.toLowerCase())
            }
          }
        }
      }

      if (cancelled) return
      genreArtistRef.current = genreToArtists

      const genres = Array.from(genreMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20)
      setExploreGenres(genres)
      setExploreGenresLoading(false)
    }

    compute()
    return () => { cancelled = true }
  }, [username, exploreTracks, exploreLoading])

  // ---- Filter tracks by selected genre and/or artist ----
  const filteredExploreTracks = useMemo(() => {
    let result = exploreTracks

    // Filter by genre: only tracks whose artist has the selected genre
    if (selectedGenre) {
      const genreArtists = genreArtistRef.current.get(selectedGenre.toLowerCase())
      if (genreArtists && genreArtists.size > 0) {
        result = result.filter((t) =>
          genreArtists.has(t.artist.name.toLowerCase()),
        )
      } else {
        // Genre exists but no artists mapped — show nothing
        result = []
      }
    }

    // Filter by artist (can be combined with genre filter)
    if (selectedArtist) {
      result = result.filter(
        (t) => t.artist.name.toLowerCase() === selectedArtist.toLowerCase(),
      )
    }

    return result
  }, [exploreTracks, selectedGenre, selectedArtist])

  // ---- Filter artists list by selected genre ----
  const filteredExploreArtists = useMemo(() => {
    if (!selectedGenre) return exploreArtists
    const genreArtists = genreArtistRef.current.get(selectedGenre.toLowerCase())
    if (!genreArtists || genreArtists.size === 0) return []
    return exploreArtists.filter((a) => genreArtists.has(a.name.toLowerCase()))
  }, [exploreArtists, selectedGenre])

  // ---- Compute years scrobbling from memberSince ----
  const yearsScrobbling = useMemo(() => {
    if (!memberSince) return null
    const now = new Date()
    const diffMs = now.getTime() - memberSince.getTime()
    const years = diffMs / (1000 * 60 * 60 * 24 * 365.25)
    return years < 1 ? '< 1' : String(Math.floor(years))
  }, [memberSince])

  // ---- Gauge percentages (relative indicators) ----
  const scrobblePct = useMemo(() => {
    if (totalScrobbles === null) return 0
    return Math.min(Math.round((totalScrobbles / 200_000) * 100), 100)
  }, [totalScrobbles])

  const artistPlaysPct = useMemo(() => {
    if (topArtistPlays === null) return 0
    return Math.min(Math.round((topArtistPlays / 5_000) * 100), 100)
  }, [topArtistPlays])

  const memberYearsPct = useMemo(() => {
    if (!memberSince) return 0
    const now = new Date()
    const years = (now.getTime() - memberSince.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    return Math.min(Math.round((years / 15) * 100), 100)
  }, [memberSince])

  return (
    <div className={styles.home}>
      {/* --- Hero --- */}
      <section className={styles.hero}>
        {isAuthenticated ? (
          <>
            <h1>Welcome back, {username}</h1>
            <p className={styles.subtitle}>
              Your listening pulse. Every beat, every day.
            </p>
          </>
        ) : (
          <>
            <h1>
              {username || DEMO_USERNAME}'s Last.fm Explorer
              <span className={styles.demoBadge}>Demo</span>
            </h1>
            <p className={styles.subtitle}>
              Your listening pulse. Every beat, every day.{' '}
              {configured ? (
                <button className="neuro-btn neuro-btn-accent" onClick={login} style={{ padding: '6px 16px', fontSize: '0.8rem', marginLeft: '8px', verticalAlign: 'middle' }}>
                  Login with Last.fm
                </button>
              ) : (
                <Link to="/settings" className="neuro-btn neuro-btn-accent" style={{ padding: '6px 16px', fontSize: '0.8rem', marginLeft: '8px', verticalAlign: 'middle', display: 'inline-block' }}>
                  Connect your account
                </Link>
              )}
            </p>
          </>
        )}
      </section>

      {/* ── CONTROL PANEL ── */}
      {(isAuthenticated || isDemo) && (
        <div className={`neuro-pressed ${styles.controlPanel}`}>
          {/* Rotary Dial — Time Range */}
          <div
            className={styles.rotaryDial}
            ref={dialRef}
            onMouseDown={handleDialMouseDown}
          >
            <span className={styles.controlLabel}>Time</span>
            <div className={styles.rotaryKnob}>
              <span className={styles.rotaryTicks} />
              <span className={styles.rotaryKnobInner} style={{ transform: `translate(-50%, -50%) rotate(${-120 + dialPos * 60}deg)` }} />
            </div>
            <span className={styles.rotaryValue}>{TIME_LABELS[TIME_PRESETS[dialPos]]}</span>
          </div>

          {/* Toggle Switch — Aggregation */}
          <div className={styles.toggleGroup}>
            <span className={styles.controlLabel}>View</span>
            <div className={styles.toggleSwitch}>
              {(['day','week','month'] as const).map((a) => (
                <button
                  key={a}
                  className={`${styles.toggleOption} ${aggregation === a ? styles.toggleOptionActive : ''}`}
                  onClick={() => setAggregation(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Crossfader — Compare Mode */}
          <div className={styles.crossfaderGroup}>
            <span className={styles.controlLabel}>{compareMode ? 'Compare' : 'Crossfade'}</span>
            <div
              className={styles.crossfaderTrack}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                const pct = (e.clientX - rect.left) / rect.width
                if (pct < 0.3) { setCompareMode(false) }
                else { setCompareMode(true); setCompareFrom(dateFrom); setCompareTo(dateTo) }
              }}
            >
              <span className={styles.crossfaderThumb} style={{ left: `${compareMode ? 85 : 15}%` }} />
            </div>
            <div className={styles.crossfaderLabels}>
              <span>Now</span>
              <span>vs</span>
              <span>Past</span>
            </div>
          </div>

          {/* VU Meter — Now Playing */}
          {isMusicLive && npArtist && npTrack && (
            <div className={styles.vuMeter}>
              <span className={styles.vuLabel}>Signal</span>
              <div className={styles.vuNeedleTrack}>
                <span className={styles.vuNeedle} />
              </div>
              <div className={styles.vuBars}>
                <span className={styles.vuBar} />
                <span className={styles.vuBar} />
                <span className={styles.vuBar} />
                <span className={styles.vuBar} />
                <span className={styles.vuBar} />
                <span className={styles.vuBar} />
              </div>
              <span className={styles.vuTrackInfo}>{npTrack}</span>
              <span className={styles.vuArtistInfo}>{npArtist}</span>
            </div>
          )}

          {/* Filter inputs */}
          <div className={styles.filterInputs}>
            <input type="text" className={styles.textInput} placeholder="Artist…" value={artistFilter} onChange={(e) => setArtistFilter(e.target.value)} />
            <input type="text" className={styles.textInput} placeholder="Track…" value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)} />
            {(artistFilter || trackFilter || tagFilters.length > 0) && (
              <button className={styles.filterClearBtn} onClick={clearFilters} title="Clear all filters">
                clear
              </button>
            )}
          </div>

          {/* Tag chips */}
          <div className={styles.tagChipsRow}>
            <TagChips
              tags={tagFilters}
              onAdd={(tag) => setTagFilters((prev) => [...prev, tag])}
              onRemove={(tag) => setTagFilters((prev) => prev.filter((t) => t !== tag))}
              onClear={() => { setTagFilters([]); setTagArtists(null) }}
              loading={tagLoading}
              suggestions={topTags}
            />
            {tagFilters.length > 0 && !tagLoading && (
              <p className={styles.tagResult}>
                {filteredTracks.length} track{filteredTracks.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>
      )}

      {/* --- Listening Chart --- */}
      {(isAuthenticated || isDemo) && (
        <ListeningChart
          days={chartData}
          compareDays={compareMode ? compareData : undefined}
          aggregation={aggregation}
          onAggregationChange={setAggregation}
          onBarClick={(date) => navigate(`/day/${date}`)}
          loading={chartLoading}
          compareLoading={compareLoading}
        />
      )}

      {/* --- Top Artists Panel --- */}
      {(isAuthenticated || isDemo) && topArtists.length > 0 && (
        <section className={`neuro-raised ${styles.topArtists}`}>
          <h3 className={styles.sectionTitle}>Top Artists</h3>
          <div className={styles.artistBars}>
            {topArtists.map((a, i) => {
              const maxCount = topArtists[0]?.count ?? 1
              const width = (a.count / maxCount) * 100
              return (
                <div key={a.name} className={styles.artistRow}>
                  <span className={styles.artistRank}>#{i + 1}</span>
                  <span className={styles.artistName}>{a.name}</span>
                  <div className={styles.artistBarTrack}>
                    <div
                      className={styles.artistBarFill}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                  <span className={styles.artistCount}>{a.count}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* --- Top Genres & Top Tags Row --- */}
      {(isAuthenticated || isDemo) && (
        <div className={styles.insightRow}>
          {/* Top Genres */}
          <section className={`neuro-raised ${styles.insightPanel}`}>
            <h3 className={`${styles.sectionTitle} ${styles.genreTitle}`}>Top Genres</h3>
            {genresLoading ? (
              <div className={styles.insightSkel}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={styles.skelBar} />
                ))}
              </div>
            ) : topGenres.length === 0 ? (
              <p className={styles.insightEmpty}>No genres yet</p>
            ) : (
              <div className={styles.insightBars}>
                {topGenres.map((g, i) => {
                  const maxCount = topGenres[0]?.count ?? 1
                  const width = (g.count / maxCount) * 100
                  return (
                    <div key={g.name} className={styles.insightItem}>
                      <span className={styles.insightRank}>#{i + 1}</span>
                      <span className={styles.insightName}>{g.name}</span>
                      <div className={styles.insightBarTrack}>
                        <div
                          className={`${styles.insightBarFill} ${styles.genreFill}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className={styles.insightCount}>{g.count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          {/* Top Tags */}
          <section className={`neuro-raised ${styles.insightPanel}`}>
            <h3 className={`${styles.sectionTitle} ${styles.tagTitle}`}>Top Tags</h3>
            {topTags.length === 0 && !tagsFetched.current ? (
              <div className={styles.insightSkel}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={styles.skelBar} />
                ))}
              </div>
            ) : topTags.length === 0 ? (
              <p className={styles.insightEmpty}>No tags yet</p>
            ) : (
              <div className={styles.insightBars}>
                {topTags.slice(0, 10).map((t, i) => {
                  const maxCount = topTags[0]?.count ?? 1
                  const width = (t.count / maxCount) * 100
                  const isActive = exploreTag === t.name
                  return (
                    <div
                      key={t.name}
                      className={`${styles.insightItem} ${styles.insightItemClickable} ${isActive ? styles.insightItemActive : ''}`}
                      onClick={() => loadTagExplore(t.name)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === 'Enter') loadTagExplore(t.name) }}
                      title={`Click to explore "${t.name}" tracks`}
                    >
                      <span className={styles.insightRank}>#{i + 1}</span>
                      <span className={styles.insightName}>{t.name}</span>
                      <div className={styles.insightBarTrack}>
                        <div
                          className={`${styles.insightBarFill} ${styles.tagFill}`}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className={styles.insightCount}>{t.count}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* --- Tag Explore: Three-Column (Genre | Artist | Tracks) --- */}
      {(isAuthenticated || isDemo) && exploreTag && (
        <section className={`neuro-raised ${styles.exploreSection}`}>
          <div className={styles.exploreHeader}>
            <h3 className={styles.sectionTitle}>
              Tag: <span className={styles.exploreTagName}>{exploreTag}</span>
              <span className={styles.exploreTrackCount}>
                {exploreTotal > 0 && <> — {exploreTotal} track{exploreTotal !== 1 ? 's' : ''}</>}
              </span>
            </h3>
            <button
              className={styles.exploreClose}
              onClick={() => setExploreTag(null)}
              title="Close"
            >
              <span className="neuro-icon neuro-icon-close" />
            </button>
          </div>

          {exploreError && (
            <p className={styles.exploreWarn}>{exploreError}</p>
          )}

          {exploreLoading ? (
            <div className={styles.exploreLoading}>Loading tracks...</div>
          ) : (
            <div className={styles.exploreColumns}>
              {/* Column 1: Genres */}
              <div className={`neuro-pressed ${styles.exploreCol}`}>
                <h4 className={styles.exploreColTitle}>
                  Genres
                  {selectedGenre && (
                    <button
                      className={styles.exploreClearFilter}
                      onClick={() => setSelectedGenre(null)}
                    >
                      clear
                    </button>
                  )}
                </h4>
                {exploreGenresLoading ? (
                  <div className={styles.exploreColLoading}>...</div>
                ) : exploreGenres.length === 0 ? (
                  <p className={styles.exploreColEmpty}>No genres found</p>
                ) : (
                  <div className={styles.exploreChipList}>
                    {exploreGenres.map((g) => (
                      <button
                        key={g.name}
                        className={`${styles.exploreChip} ${selectedGenre === g.name ? styles.exploreChipActive : ''}`}
                        onClick={() => setSelectedGenre(selectedGenre === g.name ? null : g.name)}
                      >
                        {g.name}
                        <span className={styles.exploreChipCount}>{g.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Column 2: Artists */}
              <div className={`neuro-pressed ${styles.exploreCol}`}>
                <h4 className={styles.exploreColTitle}>
                  Artists
                  {selectedArtist && (
                    <button
                      className={styles.exploreClearFilter}
                      onClick={() => setSelectedArtist(null)}
                    >
                      clear
                    </button>
                  )}
                </h4>
                {exploreArtists.length === 0 ? (
                  <p className={styles.exploreColEmpty}>No artists</p>
                ) : (
                  <div className={styles.exploreChipList}>
                    {filteredExploreArtists.map((a) => (
                      <button
                        key={a.name}
                        className={`${styles.exploreChip} ${selectedArtist === a.name ? styles.exploreChipActive : ''}`}
                        onClick={() => setSelectedArtist(selectedArtist === a.name ? null : a.name)}
                      >
                        {a.name}
                        <span className={styles.exploreChipCount}>{a.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Column 3: Tracks */}
              <div className={`neuro-pressed ${styles.exploreCol} ${styles.exploreColTracks}`}>
                <h4 className={styles.exploreColTitle}>
                  Tracks
                  <span className={styles.exploreColSub}>
                    {filteredExploreTracks.length} shown
                  </span>
                </h4>
                {filteredExploreTracks.length === 0 ? (
                  <p className={styles.exploreColEmpty}>
                    {selectedArtist || selectedGenre
                      ? 'No tracks match the selected filters.'
                      : 'No tracks found.'}
                  </p>
                ) : (
                  <div className={styles.exploreTrackGrid}>
                    {filteredExploreTracks.map((t) => (
                      <TrackCard
                        key={`${t.artist.name}-${t.name}`}
                        track={{
                          name: t.name,
                          playcount: '',
                          url: t.url,
                          artist: { name: t.artist.name, mbid: undefined, url: undefined },
                          image: [],
                        }}
                        variant="top"
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {/* --- Stat Gauges — Circular instruments --- */}
      {(isAuthenticated || isDemo) && (
        <section className={styles.gauges}>
          {/* Total Scrobbles */}
          <div className={`${styles.gauge} ${styles.gaugeAccent}`}>
            <div className={styles.gaugeFace}>
              <div className={styles.gaugeRing} style={{
                background: `conic-gradient(var(--accent) 0deg ${scrobblePct * 3.6}deg, transparent ${scrobblePct * 3.6}deg 360deg)`,
              }} />
              <div className={styles.gaugeCenter}>
                <span className={styles.gaugeValue}>
                  {statsLoading ? '...' : totalScrobbles !== null ? gaugeNumber(totalScrobbles) : '—'}
                </span>
              </div>
            </div>
            <span className={styles.gaugeLabel}>Scrobbles</span>
          </div>

          {/* Top Artist Plays */}
          <div className={`${styles.gauge} ${styles.gaugeTeal}`}>
            <div className={styles.gaugeFace}>
              <div className={styles.gaugeRing} style={{
                background: `conic-gradient(var(--toxic-teal) 0deg ${artistPlaysPct * 3.6}deg, transparent ${artistPlaysPct * 3.6}deg 360deg)`,
              }} />
              <div className={styles.gaugeCenter}>
                <span className={styles.gaugeValueSm}>
                  {statsLoading ? '...' : topArtistPlays !== null ? gaugeNumber(topArtistPlays) : '—'}
                </span>
              </div>
            </div>
            <span className={styles.gaugeLabel}>Top Artist</span>
          </div>

          {/* Top Track */}
          <div className={`${styles.gauge} ${styles.gaugeGold}`}>
            <div className={styles.gaugeFace}>
              <div className={styles.gaugeRing} style={{
                background: `conic-gradient(rgba(200,160,80,0.8) 0deg 280deg, transparent 280deg 360deg)`,
              }} />
              <div className={styles.gaugeCenter}>
                <span className={`${styles.gaugeValueSm} ${styles.gaugeValueEllipsis}`} title={topTrack?.name}>
                  {statsLoading ? '...' : topTrack ? topTrack.name : '—'}
                </span>
              </div>
            </div>
            <span className={styles.gaugeLabel}>Top Track</span>
          </div>

          {/* Member Since */}
          <div className={`${styles.gauge} ${styles.gaugeGold}`}>
            <div className={styles.gaugeFace}>
              <div className={styles.gaugeRing} style={{
                background: `conic-gradient(rgba(200,160,80,0.6) 0deg ${memberYearsPct * 3.6}deg, transparent ${memberYearsPct * 3.6}deg 360deg)`,
              }} />
              <div className={styles.gaugeCenter}>
                <span className={styles.gaugeValueSm}>
                  {statsLoading ? '...' : yearsScrobbling !== null ? yearsScrobbling : '—'}
                </span>
              </div>
            </div>
            <span className={styles.gaugeLabel}>{yearsScrobbling === '1' ? 'Year' : 'Years'}</span>
          </div>

          {/* Member Since date */}
          <div className={`${styles.gauge} ${styles.gaugeAccent}`}>
            <div className={styles.gaugeFace}>
              <div className={styles.gaugeRing} style={{
                background: `conic-gradient(var(--accent) 0deg 300deg, transparent 300deg 360deg)`,
              }} />
              <div className={styles.gaugeCenter}>
                <span className={styles.gaugeValueSm}>
                  {statsLoading ? '...' : memberSince
                    ? memberSince.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                    : '—'}
                </span>
              </div>
            </div>
            <span className={styles.gaugeLabel}>Since</span>
          </div>
        </section>
      )}
    </div>
  )
}
