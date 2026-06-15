// Checks where a song is actually available to play for free.
// Prioritizes Deezer (full tracks with widget), falls back to YouTube.

export interface DeezerTrack {
  id: number
  title: string
  artist: { name: string }
  album: { title: string; cover_big: string }
  preview: string // 30s MP3 preview
}

export interface MusicSource {
  type: 'deezer' | 'youtube' | 'soundcloud' | 'applemusic' | 'none'
  deezerTrackId?: number
  deezerPreview?: string
  deezerSearched: boolean
}

interface DeezerSearchResponse {
  data: DeezerTrack[]
  total: number
}

// Cache to avoid re-checking the same track repeatedly
const sourceCache = new Map<string, MusicSource>()

function cacheKey(artist: string, track: string): string {
  return `${artist.toLowerCase()}::${track.toLowerCase()}`
}

/** Strip junk from track names that breaks search: (feat. X), [Remix], (Remastered), etc. */
function cleanTrackName(track: string): string {
  return track
    .replace(/\(feat\.?\s[^)]+\)/gi, '')
    .replace(/\(ft\.?\s[^)]+\)/gi, '')
    .replace(/\(featuring\s[^)]+\)/gi, '')
    .replace(/\[feat\.?\s[^\]]+\]/gi, '')
    .replace(/\(with\s[^)]+\)/gi, '')
    .replace(/\[remix\]/gi, '')
    .replace(/\(remix\)/gi, '')
    .replace(/\(remastered[^)]*\)/gi, '')
    .replace(/\(live[^)]*\)/gi, '')
    .replace(/\(bonus[^)]*\)/gi, '')
    .replace(/\(edit\)/gi, '')
    .replace(/\(radio[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Score a Deezer track result against the search target */
function scoreDeezerResult(t: DeezerTrack, artistLower: string, trackLower: string): number {
  let score = 0
  const tArtist = t.artist.name.toLowerCase()
  const tTitle = t.title.toLowerCase()

  if (tArtist === artistLower) score += 3
  else if (tArtist.includes(artistLower) || artistLower.includes(tArtist)) score += 1

  if (tTitle === trackLower) score += 3
  else if (tTitle.includes(trackLower) || trackLower.includes(tTitle)) score += 1

  return score
}

/** Run a single Deezer search query and return the best match */
async function tryDeezerQuery(query: string, artist: string, track: string): Promise<DeezerTrack | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const response = await fetch(`/api/deezer/search?q=${encodeURIComponent(query)}&limit=5`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (!response.ok) return null
    const data: DeezerSearchResponse = await response.json()
    if (!data.data || data.data.length === 0) return null

    const artistLower = artist.toLowerCase()
    const trackLower = track.toLowerCase()

    const scored = data.data.map((t) => ({
      track: t,
      score: scoreDeezerResult(t, artistLower, trackLower),
    }))
    scored.sort((a, b) => b.score - a.score)

    return scored[0].track
  } catch {
    return null
  }
}

/**
 * Search Deezer using a dual-strategy:
 * 1. Strict: `artist:"X" track:"Y"` — best for exact matches
 * 2. Loose: `X Y` — simpler query as fallback
 * Returns the best match from either strategy.
 */
async function searchDeezer(artist: string, track: string): Promise<DeezerTrack | null> {
  const cleaned = cleanTrackName(track)

  // Strategy 1: strict syntax with original name
  const strict = await tryDeezerQuery(`artist:"${artist}" track:"${track}"`, artist, track)
  if (strict) {
    const strictScore = scoreDeezerResult(strict, artist.toLowerCase(), track.toLowerCase())
    if (strictScore >= 2) return strict
  }

  // Strategy 2: loose query with original name
  const loose = await tryDeezerQuery(`${artist} ${track}`, artist, track)
  if (loose) {
    const looseScore = scoreDeezerResult(loose, artist.toLowerCase(), track.toLowerCase())
    if (looseScore >= 1) return loose
  }

  // Strategy 3: cleaned track name (strip feat./remix/etc.) - only if different and non-empty
  if (cleaned && cleaned !== track) {
    const cleanedResult = await tryDeezerQuery(`${artist} ${cleaned}`, artist, cleaned)
    if (cleanedResult) {
      const cleanedScore = scoreDeezerResult(cleanedResult, artist.toLowerCase(), cleaned.toLowerCase())
      if (cleanedScore >= 1) return cleanedResult
    }
  }

  return strict ?? null
}

/**
 * Find the best free source for a track.
 * Checks Deezer first (full tracks via widget), falls back to YouTube.
 * Results are cached to avoid redundant API calls.
 */
export async function findBestSource(
  artist: string,
  track: string,
): Promise<MusicSource> {
  const key = cacheKey(artist, track)
  const cached = sourceCache.get(key)
  if (cached) return cached

  // Try Deezer first
  const deezerTrack = await searchDeezer(artist, track)
  if (deezerTrack) {
    const source: MusicSource = {
      type: 'deezer',
      deezerTrackId: deezerTrack.id,
      deezerPreview: deezerTrack.preview,
      deezerSearched: true,
    }
    sourceCache.set(key, source)
    return source
  }

  // Fall back to YouTube (always works with search embed)
  const source: MusicSource = { type: 'youtube', deezerSearched: true }
  sourceCache.set(key, source)
  return source
}

/** Clear the cache (useful for testing) */
export function clearSourceCache(): void {
  sourceCache.clear()
}
