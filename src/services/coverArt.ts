// ============================================================
// Cover Art Fallback — external sources when Last.fm has none
// ============================================================

// Use Vite proxies in dev to avoid CORS; in production these need a real backend
const ITUNES_SEARCH = '/api/itunes/search'
const DEEZER_API = '/api/deezer'

// Simple concurrency limiter: max 3 parallel external requests (Deezer + iTunes)
let activeRequests = 0
const MAX_CONCURRENT = 3
const waitingQueue: (() => void)[] = []

function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    waitingQueue.push(() => { activeRequests++; resolve() })
  })
}

function releaseSlot(): void {
  activeRequests--
  const next = waitingQueue.shift()
  if (next) next()
}

// Module-level caches: "artist::track" / "artist::" → image URL or null
const cache = new Map<string, string | null>()
const pendingFetches = new Map<string, Promise<string | null>>()

function cacheKey(artist: string, track?: string): string {
  const base = artist.toLowerCase().trim()
  return track ? `${base}::${track.toLowerCase().trim()}` : `${base}::`
}

/**
 * Convert iTunes artwork URL to high-resolution.
 * Apple returns 100x100 by default; we swap the dimensions for a larger version.
 */
function toHiRes(url: string): string {
  return url.replace(/\/\d+x\d+bb\.(jpg|png|jpeg)$/, '/600x600bb.$1')
}

// --- Deezer API (public, no key required) ---

interface DeezerArtist {
  id: number
  name: string
  picture_xl: string
}

interface DeezerTrack {
  id: number
  title: string
  album: { cover_xl: string }
}

/**
 * Search Deezer for artist artwork.
 * Returns picture_xl (high-res artist photo) or null.
 */
async function fetchFromDeezerArtist(artist: string): Promise<string | null> {
  await acquireSlot()
  try {
    const url = `${DEEZER_API}/search/artist?q=${encodeURIComponent(artist)}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const picture = (data.data as DeezerArtist[] | undefined)?.[0]?.picture_xl
    return picture || null
  } catch {
    return null
  } finally {
    releaseSlot()
  }
}

/**
 * Search Deezer for track/album artwork.
 * Returns album.cover_xl (high-res album cover) or null.
 */
async function fetchFromDeezerTrack(artist: string, track: string): Promise<string | null> {
  await acquireSlot()
  try {
    const query = encodeURIComponent(`${artist} ${track}`)
    const url = `${DEEZER_API}/search/track?q=${query}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const cover = (data.data as DeezerTrack[] | undefined)?.[0]?.album?.cover_xl
    return cover || null
  } catch {
    return null
  } finally {
    releaseSlot()
  }
}

/**
 * Search iTunes for artwork by artist + optional track name.
 * Returns a high-res image URL or null.
 * - With track: entity=song (most specific)
 * - Without track: entity=album (artist's most popular album cover)
 * Rate-limited: max 3 concurrent requests.
 */
async function fetchFromItunes(artist: string, track?: string): Promise<string | null> {
  await acquireSlot()
  try {
    const term = track
      ? encodeURIComponent(`${artist} ${track}`)
      : encodeURIComponent(artist)

    const entity = track ? 'song' : 'album'
    const url = `${ITUNES_SEARCH}?term=${term}&entity=${entity}&limit=1`

    const res = await fetch(url)
    if (!res.ok) return null

    const data = await res.json()
    const artworkUrl = data.results?.[0]?.artworkUrl100
    return artworkUrl ? toHiRes(artworkUrl) : null
  } catch {
    return null
  } finally {
    releaseSlot()
  }
}

/**
 * Resolve a cover image for an artist + optional track from external sources.
 * Used as a last-resort fallback when Last.fm has no cover art.
 *
 * Tries: Deezer → iTunes.
 * Cached globally by "artist::track" or "artist::" key.
 * In-flight requests are deduplicated.
 */
export async function resolveExternalCover(
  artist: string,
  track?: string,
): Promise<string | null> {
  const key = cacheKey(artist, track)

  if (cache.has(key)) return cache.get(key)!

  const pending = pendingFetches.get(key)
  if (pending) return pending

  const promise = (async () => {
    // 1) Try Deezer (best artist/track cover quality)
    const deezerUrl = track
      ? await fetchFromDeezerTrack(artist, track)
      : await fetchFromDeezerArtist(artist)
    if (deezerUrl) {
      cache.set(key, deezerUrl)
      return deezerUrl
    }

    // 2) Fallback to iTunes
    const itunesUrl = await fetchFromItunes(artist, track)
    cache.set(key, itunesUrl)
    return itunesUrl
  })()

  pendingFetches.set(key, promise)
  promise.finally(() => pendingFetches.delete(key))
  return promise
}

/**
 * Resolve an artist image from external sources.
 * Tries: Deezer → iTunes.
 * Cached globally by artist name.
 */
export async function resolveExternalArtistImage(artist: string): Promise<string | null> {
  const key = cacheKey(artist)

  if (cache.has(key)) return cache.get(key)!

  const pending = pendingFetches.get(key)
  if (pending) return pending

  const promise = (async () => {
    // 1) Try Deezer (best artist image quality)
    const deezerUrl = await fetchFromDeezerArtist(artist)
    if (deezerUrl) {
      cache.set(key, deezerUrl)
      return deezerUrl
    }

    // 2) Fallback to iTunes (entity=album for artist-only)
    const itunesUrl = await fetchFromItunes(artist)
    cache.set(key, itunesUrl)
    return itunesUrl
  })()

  pendingFetches.set(key, promise)
  promise.finally(() => pendingFetches.delete(key))
  return promise
}
