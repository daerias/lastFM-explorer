// Free music source resolver — YouTube-first with multi-strategy search.
// Finds the best YouTube video for any artist+track combo via our search proxy.
// No API keys. No Deezer dependency. Every song is playable.

export interface MusicSource {
  type: 'youtube' | 'none'
  youtubeVideoId?: string
}

// Module-level cache — avoids redundant API calls during a session
const MAX_CACHE_SIZE = 500

function evictOldest<K, V>(map: Map<K, V>, maxSize: number): void {
  if (map.size <= maxSize) return
  const keysToDelete = map.size - maxSize
  for (const key of Array.from(map.keys()).slice(0, keysToDelete)) {
    map.delete(key)
  }
}

const videoCache = new Map<string, string | null>()
const pendingFetches = new Map<string, Promise<string | null>>()

function cacheKey(artist: string, track: string): string {
  return `${artist.toLowerCase().trim()}::${track.toLowerCase().trim()}`
}

/** Strip junk from track names that breaks search */
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

/**
 * Search YouTube via our proxy and return the best video ID.
 * Tries multiple query strategies in parallel — returns the first result.
 * Fast: typically resolves in 300-800ms (proxy fetches and parses YouTube HTML).
 */
async function searchYouTube(artist: string, track: string): Promise<string | null> {
  const key = cacheKey(artist, track)

  // Return cached result
  if (videoCache.has(key)) return videoCache.get(key)!

  // Dedupe in-flight requests
  const pending = pendingFetches.get(key)
  if (pending) return pending

  const promise = (async () => {
    const cleaned = cleanTrackName(track)

    // Build multiple search strategies — run them in parallel, take the first winner
    const queries: string[] = [
      `${artist} ${track}`,                          // Exact match
      `${artist} ${track} official audio`,            // Official audio version
      `${artist} ${track} lyrics`,                    // Lyrics version
    ]

    // Only add cleaned variant if it differs meaningfully
    if (cleaned && cleaned !== track && cleaned.length > 3) {
      queries.push(`${artist} ${cleaned}`)
    }

    // Also try just the artist + cleaned track (no feat/remix)
    if (cleaned && cleaned !== track) {
      queries.push(`${artist} ${cleaned} official audio`)
    }

    // Race all queries — first one to return with videoIds wins
    const fetchVideoIds = async (q: string): Promise<string[]> => {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 4000)
        const response = await fetch(
          `/api/youtube-search?q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        )
        clearTimeout(timeout)
        if (!response.ok) return []
        const data = await response.json()
        return (data.videoIds as string[]) ?? []
      } catch {
        return []
      }
    }

    // Start all queries in parallel
    const results = await Promise.allSettled(queries.map(fetchVideoIds))

    // Collect all unique video IDs, preserving order (first queries get priority)
    const allIds: string[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        for (const id of r.value) {
          if (!allIds.includes(id)) allIds.push(id)
        }
      }
    }

    const bestId = allIds[0] ?? null
    videoCache.set(key, bestId)
    evictOldest(videoCache, MAX_CACHE_SIZE)
    return bestId
  })()

  pendingFetches.set(key, promise)
  promise.finally(() => pendingFetches.delete(key))
  return promise
}

/**
 * Find the best free source for a track.
 * YouTube-only: searches via proxy, returns video ID for direct embed.
 * Results are cached to avoid redundant API calls.
 * Fast: parallel multi-query strategy, typically resolves in < 1s.
 */
export async function findBestSource(
  artist: string,
  track: string,
): Promise<MusicSource> {
  const videoId = await searchYouTube(artist, track)
  if (videoId) {
    return { type: 'youtube', youtubeVideoId: videoId }
  }
  // No specific video found — still return 'youtube' so the popup
  // can use the search embed as a last-resort fallback.
  return { type: 'youtube' }
}

/** Clear the cache (useful for testing) */
export function clearSourceCache(): void {
  videoCache.clear()
}
