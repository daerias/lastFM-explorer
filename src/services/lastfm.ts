import { getCredentials } from '../store/credentials'

const AUTH_URL = 'https://www.last.fm/api/auth/'

function getApiKey(): string {
  const creds = getCredentials()
  if (!creds) throw new Error('API credentials not configured. Add them in Settings.')
  return creds.apiKey
}

/** The URL to redirect the user to for Last.fm authorization */
export function getAuthUrl(): string {
  const cb = `${window.location.origin}/auth/callback`
  return `${AUTH_URL}?api_key=${getApiKey()}&cb=${encodeURIComponent(cb)}`
}

/** Exchange a token for a session key via our Vite dev proxy */
export async function getSession(token: string): Promise<{ sessionKey: string; username: string }> {
  const creds = getCredentials()
  if (!creds) throw new Error('API credentials not configured. Add them in Settings.')

  const res = await fetch(
    `/api/auth/session?token=${encodeURIComponent(token)}&api_key=${encodeURIComponent(creds.apiKey)}&api_secret=${encodeURIComponent(creds.apiSecret)}`,
  )
  const data = await res.json()

  if (data.error) {
    throw new Error(data.error)
  }

  if (!data.session?.key) {
    throw new Error('No session key returned')
  }

  return {
    sessionKey: data.session.key,
    username: data.session.name,
  }
}

// ── Retry helpers ──

/** Jittered sleep — avoids thundering herd on retry */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms + Math.random() * 300))
}

/** Generic Last.fm API call with exponential-backoff retry.
 *  Retries up to 3 times for 5xx/server errors (1s→2s→4s backoff + jitter).
 *  Retries once for 429 rate limits (5s wait).
 *  Retries network errors (fetch failures) with backoff.
 *  Does NOT retry on 4xx client errors (bad request, not found, etc.). */
export async function apiCall(
  method: string,
  params: Record<string, string> = {},
  sessionKey?: string,
): Promise<any> {
  const allParams: Record<string, string> = {
    method,
    api_key: getApiKey(),
    format: 'json',
    ...params,
  }

  if (sessionKey) {
    allParams.sk = sessionKey
  }

  const query = new URLSearchParams(allParams).toString()
  const url = `/api/lastfm?${query}`
  const maxRetries = 3

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ── Fetch with network-error-only retry ──
    let res: Response
    try {
      res = await fetch(url)
    } catch (err: any) {
      // Network error (DNS, connection refused, timeout) — retry with backoff
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000
        console.warn(`[lastfm] Network error, retry ${attempt + 1}/${maxRetries} in ${Math.round(delay / 1000)}s…`)
        await sleep(delay)
        continue
      }
      throw new Error(`Last.fm API unreachable after ${maxRetries + 1} attempts`)
    }

    // ── HTTP success ──
    if (res.ok) {
      return res.json()
    }

    // ── Rate limit (429) — longer backoff, fewer retries ──
    if (res.status === 429) {
      if (attempt < 1) {
        console.warn(`[lastfm] Rate limited (429), waiting 5s before retry…`)
        await sleep(5000)
        continue
      }
      throw new Error(`Last.fm rate limit exceeded`)
    }

    // ── Server error (5xx) — exponential backoff retry ──
    if (res.status >= 500) {
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 // 1s, 2s, 4s
        console.warn(`[lastfm] Server error ${res.status}, retry ${attempt + 1}/${maxRetries} in ${Math.round(delay / 1000)}s…`)
        await sleep(delay)
        continue
      }
    }

    // ── 4xx client error (or 5xx exhausted retries) — no retry, throw immediately ──
    throw new Error(`Last.fm API error: ${res.status}`)
  }

  throw new Error('Last.fm API call failed after retries')
}

export interface LastfmUser {
  name: string
  realname: string
  url: string
  image: { size: string; '#text': string }[]
  playcount: string
  country: string
  registered?: { unixtime: string; '#text': number }
}

/** Get user info */
export async function getUserInfo(user?: string): Promise<LastfmUser | null> {
  const data = await apiCall('user.getInfo', user ? { user } : {})
  return data.user ?? null
}

export interface Track {
  name: string
  artist: { '#text': string; mbid?: string }
  album?: { '#text': string }
  url: string
  image: { size: string; '#text': string }[]
  playcount?: string
  date?: { uts: string; '#text': string }
  '@attr'?: { nowplaying: string }
}

export interface TopTrack {
  name: string
  playcount: string
  url: string
  artist: { name: string; mbid?: string; url?: string }
  image: { size: string; '#text': string }[]
}

/** Last.fm returns a single object instead of an array when there's 1 result */
function normalizeArray<T>(val: T | T[] | undefined): T[] {
  if (Array.isArray(val)) return val
  if (val) return [val]
  return []
}

/** Get recent tracks for a user — supports pagination and date range.
 *  Pass `from`/`to` as Unix timestamps (seconds) to filter by date. */
export async function getRecentTracks(
  user: string,
  limit = 20,
  page = 1,
  from?: number,
  to?: number,
): Promise<{ tracks: Track[]; totalPages: number }> {
  const params: Record<string, string> = {
    user,
    limit: String(limit),
    page: String(page),
  }
  if (from !== undefined) params.from = String(from)
  if (to !== undefined) params.to = String(to)

  const data = await apiCall('user.getRecentTracks', params)
  return {
    tracks: normalizeArray(data.recenttracks?.track),
    totalPages: parseInt(data.recenttracks?.['@attr']?.totalPages, 10) || 1,
  }
}

/** Fetch ALL recent tracks by auto-paginating through all pages.
 *  Use `from`/`to` to limit the date range (Unix timestamps in seconds).
 *  Fetches in batches of 5 pages to avoid rate limiting. */
export async function getAllRecentTracks(
  user: string,
  from?: number,
  to?: number,
): Promise<Track[]> {
  const page1 = await getRecentTracks(user, 200, 1, from, to)
  if (page1.totalPages <= 1) return page1.tracks

  const allTracks: Track[] = [...page1.tracks]
  const totalPages = page1.totalPages
  const BATCH = 5

  // Fetch remaining pages in batches to avoid overwhelming the API
  for (let start = 2; start <= totalPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, totalPages)
    const batch = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) =>
        getRecentTracks(user, 200, start + i, from, to),
      ),
    )
    for (const r of batch) allTracks.push(...r.tracks)
  }

  return allTracks
}

/** Get list of available weekly chart periods for a user.
 *  Returns from/to Unix timestamps for each week with listening data. */
export async function getWeeklyChartList(
  user: string,
): Promise<{ from: number; to: number }[]> {
  const data = await apiCall('user.getWeeklyChartList', { user })
  const raw = normalizeArray(data.weeklychartlist?.chart)
  return raw
    .map((c: any) => ({
      from: parseInt(c.from, 10),
      to: parseInt(c.to, 10),
    }))
    .filter((c: { from: number }) => c.from > 0)
}

export interface Artist {
  name: string
  playcount?: string
  url: string
  image: { size: string; '#text': string }[]
}

/** Get top tracks for a user */
export async function getTopTracks(
  user: string,
  period: '7day' | '1month' | '3month' | '6month' | '12month' | 'overall' = 'overall',
  limit = 50,
): Promise<TopTrack[]> {
  const data = await apiCall('user.getTopTracks', {
    user,
    period,
    limit: String(limit),
  })
  return normalizeArray(data.toptracks?.track)
}

/** Get top artists for a user */
export async function getTopArtists(
  user: string,
  period: '7day' | '1month' | '3month' | '6month' | '12month' | 'overall' = 'overall',
  limit = 20,
): Promise<Artist[]> {
  const data = await apiCall('user.getTopArtists', {
    user,
    period,
    limit: String(limit),
  })
  return normalizeArray(data.topartists?.artist)
}

// ============================================================
// Tag-based search (user-scoped)
// ============================================================

/** Get artists the authenticated user has personally tagged with a specific tag.
 *  Supports pagination — pass page to scroll through results. */
export async function getPersonalTags(
  user: string,
  tag: string,
  limit = 200,
  page = 1,
): Promise<{ artists: Artist[]; total: number; totalPages: number }> {
  const data = await apiCall('user.getPersonalTags', {
    user,
    tag,
    taggingtype: 'artist',
    limit: String(limit),
    page: String(page),
  })
  const taggings = data.taggings ?? {}
  return {
    artists: normalizeArray(taggings.artists?.artist),
    total: parseInt(taggings['@attr']?.total, 10) || 0,
    totalPages: parseInt(taggings['@attr']?.totalPages, 10) || 1,
  }
}

/** Get tags the authenticated user has used, with counts */
export async function getUserTopTags(
  user: string,
  limit = 50,
): Promise<{ name: string; count: number }[]> {
  const data = await apiCall('user.getTopTags', { user, limit: String(limit) })
  const raw = normalizeArray(data.toptags?.tag)
  return raw.map((t: any) => ({ name: t.name, count: parseInt(t.count, 10) || 0 }))
}

/** Track reference from user.getPersonalTags (taggingtype=track) */
export interface TaggedTrack {
  name: string
  artist: { name: string; mbid?: string }
  url: string
}

/** Get tracks the authenticated user has personally tagged with a specific tag.
 *  Supports pagination. */
export async function getPersonalTracks(
  user: string,
  tag: string,
  limit = 200,
  page = 1,
): Promise<{ tracks: TaggedTrack[]; total: number; totalPages: number }> {
  const data = await apiCall('user.getPersonalTags', {
    user,
    tag,
    taggingtype: 'track',
    limit: String(limit),
    page: String(page),
  })
  const taggings = data.taggings ?? {}
  return {
    tracks: normalizeArray(taggings.tracks?.track),
    total: parseInt(taggings['@attr']?.total, 10) || 0,
    totalPages: parseInt(taggings['@attr']?.totalPages, 10) || 1,
  }
}

/** Fetch ALL pages of a user's personally tagged tracks for a given tag */
async function getAllPersonalTracks(user: string, tag: string): Promise<TaggedTrack[]> {
  const page1 = await getPersonalTracks(user, tag, 200, 1)
  if (page1.totalPages <= 1) return page1.tracks
  const remaining = await Promise.all(
    Array.from({ length: page1.totalPages - 1 }, (_, i) =>
      getPersonalTracks(user, tag, 200, i + 2),
    ),
  )
  return [...page1.tracks, ...remaining.flatMap((r) => r.tracks)]
}

/** Bulk delete a tag from ALL tracks that have it.
 *  Returns { removed: number } — count of tracks the tag was removed from. */
export async function deleteTagGlobally(
  user: string,
  tag: string,
): Promise<{ removed: number }> {
  const tracks = await getAllPersonalTracks(user, tag)
  let removed = 0

  for (const t of tracks) {
    try {
      await removeTrackTag(t.artist.name, t.name, tag)
      removed++
    } catch {
      // Continue — tag may already be gone
    }
  }

  return { removed }
}

/** Bulk rename a tag across all tracks: remove oldTag, add newTag on every track.
 *  Returns { renamed: number } — count of tracks successfully processed. */
export async function renameTagGlobally(
  user: string,
  oldTag: string,
  newTag: string,
): Promise<{ renamed: number }> {
  const tracks = await getAllPersonalTracks(user, oldTag)
  let renamed = 0

  for (const t of tracks) {
    try {
      // Remove the old tag (ignore if it fails — tag might already be gone)
      await removeTrackTag(t.artist.name, t.name, oldTag)
    } catch {
      // Continue — the tag may already have been removed
    }
    try {
      await addTrackTags(t.artist.name, t.name, [newTag])
      renamed++
    } catch {
      // Skip tracks where add fails
    }
  }

  return { renamed }
}

// ============================================================
// Artist detail
// ============================================================

export interface ArtistInfo {
  name: string
  url: string
  image: { size: string; '#text': string }[]
  stats: { listeners: string; playcount: string }
  bio: { summary: string; content: string }
  tags: { tag: { name: string; url: string }[] }
  similar: { artist: Artist[] }
}

/** Get tracks by an artist that the authenticated user has scrobbled, sorted by playcount descending */
export async function getUserArtistTracks(
  user: string,
  artist: string,
  limit = 50,
): Promise<TopTrack[]> {
  const data = await apiCall('user.getArtistTracks', {
    user,
    artist,
    limit: String(limit),
  })
  return normalizeArray(data.artisttracks?.track)
}

/** Get detailed artist info */
export async function getArtistInfo(artist: string): Promise<ArtistInfo | null> {
  const data = await apiCall('artist.getInfo', { artist, autocorrect: '1' })
  return data.artist ?? null
}

/** Get community-applied top tags for an artist (genre-like labels).
 *  Returns up to 10 tags sorted by popularity. */
export async function getArtistTopTags(
  artist: string,
): Promise<{ name: string; count: number }[]> {
  const data = await apiCall('artist.getTopTags', { artist, autocorrect: '1' })
  const raw = normalizeArray(data.toptags?.tag)
  return raw.map((t: any) => ({ name: t.name, count: parseInt(t.count, 10) || 0 }))
}

// ============================================================
// Track detail
// ============================================================

export interface TrackInfo {
  name: string
  url: string
  duration: string
  listeners: string
  playcount: string
  artist: { name: string; url: string; image?: { size: string; '#text': string }[] }
  album?: {
    title: string
    url?: string
    image: { size: string; '#text': string }[]
  }
  toptags?: { tag: { name: string; url: string }[] }
  wiki?: { summary: string; content: string }
}

/** Get detailed track info */
export async function getTrackInfo(artist: string, track: string): Promise<TrackInfo | null> {
  const data = await apiCall('track.getInfo', { artist, track, autocorrect: '1' })
  return data.track ?? null
}

/** Get tags a specific user has applied to a track (personal tags, not community) */
export async function getTrackTags(
  artist: string,
  track: string,
  user: string,
): Promise<{ name: string; url: string }[]> {
  const data = await apiCall('track.getTags', { artist, track, user, autocorrect: '1' })
  return normalizeArray(data.tags?.tag)
}

// ============================================================
// Tag management (authenticated write)
// ============================================================

/** Send an authenticated write call through the signing proxy */
async function authPost(params: Record<string, string>): Promise<any> {
  const creds = getCredentials()
  if (!creds) throw new Error('API credentials not configured.')

  const sessionKey = localStorage.getItem('lastfm_session')
  if (!sessionKey) throw new Error('Not authenticated.')

  const body = new URLSearchParams({
    ...params,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    sk: sessionKey,
  })

  const res = await fetch('/api/lastfm-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data
}

/** Add tags to a track — Last.fm appends, does not replace. Use removeTrackTag for removals. */
export async function addTrackTags(
  artist: string,
  track: string,
  tags: string[],
): Promise<void> {
  await authPost({ method: 'track.addTags', artist, track, tags: tags.join(',') })
}

/** Remove a single tag from a track */
export async function removeTrackTag(
  artist: string,
  track: string,
  tag: string,
): Promise<void> {
  await authPost({ method: 'track.removeTag', artist, track, tag })
}
