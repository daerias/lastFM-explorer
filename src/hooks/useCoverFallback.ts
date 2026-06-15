import { useState, useEffect, useRef } from 'react'
import { getTrackInfo, getArtistInfo } from '../services/lastfm'
import { resolveExternalCover, resolveExternalArtistImage } from '../services/coverArt'
import { detectCoverSource, type CoverSource, findBestImage } from '../lib/coverSource'

// Module-level caches survive re-renders and dedupe across all components
const artistCoverCache = new Map<string, string | null>()
const trackCoverCache = new Map<string, string | null>()
const pendingFetches = new Map<string, Promise<string | null>>()

function cacheKey(artist: string, track: string): string {
  return `${artist.toLowerCase()}::${track.toLowerCase()}`
}

/** Resolve a cover image: track.getInfo.album.image → artist.getInfo.image → null */
async function resolveCover(artist: string, track: string): Promise<string | null> {
  const key = cacheKey(artist, track)
  const isArtistOnly = artist.toLowerCase() === track.toLowerCase()

  // Return cached result (even if null — don't retry failed ones)
  if (trackCoverCache.has(key)) return trackCoverCache.get(key)!

  // Dedupe in-flight requests
  const pending = pendingFetches.get(key)
  if (pending) return pending

  const promise = (async () => {
    // 1) Try track.getInfo → album image (skip when track === artist — pointless call)
    if (!isArtistOnly) {
      try {
        const info = await getTrackInfo(artist, track)
        const albumImg = findBestImage(info?.album?.image)
        if (albumImg) {
          trackCoverCache.set(key, albumImg)
          return albumImg
        }

        // Also try artist image from track info
        const trackArtistImg = findBestImage(info?.artist?.image)
        if (trackArtistImg) {
          trackCoverCache.set(key, trackArtistImg)
          return trackArtistImg
        }
      } catch {
        // Track info failed — try artist directly
      }
    }

    // 2) Fallback: artist.getInfo → artist image
    const artistKey = artist.toLowerCase()
    if (artistCoverCache.has(artistKey)) {
      const img = artistCoverCache.get(artistKey)!
      trackCoverCache.set(key, img)
      return img
    }

    try {
      const artistInfo = await getArtistInfo(artist)
      const artistImg = findBestImage(artistInfo?.image)
      if (artistImg) {
        artistCoverCache.set(artistKey, artistImg)
        trackCoverCache.set(key, artistImg)
        return artistImg
      }
      // No image in artist info — fall through to external
    } catch {
      // artist.getInfo failed — fall through to external
    }

    // 3) Last resort: external sources
    // For artist-only lookups, use resolveExternalArtistImage (searches Deezer artists, not tracks)
    // For track lookups, use resolveExternalCover (searches Deezer tracks + iTunes songs)
    const externalUrl = isArtistOnly
      ? await resolveExternalArtistImage(artist)
      : await resolveExternalCover(artist, track)
    if (externalUrl) {
      // 🚨 FIXED: only cache in artistCoverCache for artist-only lookups.
      // Track-specific covers (album art) must NOT pollute the artist cache.
      if (isArtistOnly) {
        artistCoverCache.set(artistKey, externalUrl)
      }
      trackCoverCache.set(key, externalUrl)
      return externalUrl
    }

    // Only cache null when all sources failed
    if (isArtistOnly) {
      artistCoverCache.set(artistKey, null)
    }
    trackCoverCache.set(key, null)
    return null
  })()

  pendingFetches.set(key, promise)
  promise.finally(() => pendingFetches.delete(key))
  return promise
}

/**
 * Hook: resolves a cover image for a track when no image is available.
 *
 * - If `existingImage` is truthy, returns it immediately.
 * - Otherwise fetches getTrackInfo → getArtistInfo as fallback.
 * - Results are cached globally by `artist::track` key.
 * - Deduplicates in-flight requests.
 *
 * Returns `{ cover: imageUrl | null }`.  Initially `cover === existingImage`;
 * once the fallback resolves, the component re-renders with the new value.
 */
export function useCoverFallback(
  artistName: string,
  trackName: string,
  existingImage: string | null,
): { cover: string | null; source: CoverSource } {
  const [cover, setCover] = useState<string | null>(existingImage)
  const lastKey = useRef<string | null>(null)

  useEffect(() => {
    const key = cacheKey(artistName, trackName)

    // If the key changed, reset to existing image immediately
    if (lastKey.current !== key) {
      lastKey.current = key
      setCover(existingImage)
    }

    // Already have a cover — nothing to do
    if (existingImage) {
      setCover(existingImage)
      return
    }

    // Check module-level cache synchronously
    if (trackCoverCache.has(key)) {
      setCover(trackCoverCache.get(key)!)
      return
    }

    let cancelled = false

    resolveCover(artistName, trackName).then((url) => {
      if (!cancelled && lastKey.current === key) {
        setCover(url)
      }
    })

    return () => {
      cancelled = true
    }
  }, [artistName, trackName, existingImage])

  const source = detectCoverSource(cover)

  return { cover, source }
}
