/** Where a cover image was sourced from */
export type CoverSource = 'lastfm' | 'deezer' | 'itunes' | null

/** Detect the source of a cover image URL by its domain */
export function detectCoverSource(url: string | null): CoverSource {
  if (!url) return null
  if (url.includes('dzcdn.net') || url.includes('api.deezer.com')) return 'deezer'
  if (url.includes('mzstatic.com') || url.includes('itunes.apple.com')) return 'itunes'
  return 'lastfm'
}

/** Human-readable label for a cover source */
export function coverSourceLabel(source: CoverSource): string {
  switch (source) {
    case 'lastfm': return 'Last.fm'
    case 'deezer': return 'Deezer'
    case 'itunes': return 'iTunes'
    default: return ''
  }
}

// ============================================================
// Shared image helpers — used across hooks, pages, and components
// ============================================================

/** Last.fm's generic "no image" placeholder GUID */
const PLACEHOLDER_GUID = '2a96cbd8b46e442fc41c2b86b821562f'

/** Check if a URL is Last.fm's generic placeholder — if so, ignore it */
export function isPlaceholder(url: string): boolean {
  return url.includes(PLACEHOLDER_GUID)
}

type ImageEntry = { size: string; '#text': string }

/**
 * Find the best available image from a Last.fm image array.
 * Filters out the generic "no image" placeholder.
 * Priority: extralarge > large > mega.
 */
export function findBestImage(images?: ImageEntry[]): string | null {
  if (!images) return null
  const img = images.find(
    (i) => i.size === 'extralarge' || i.size === 'large' || i.size === 'mega',
  )
  const url = img?.['#text'] || null
  return url && !isPlaceholder(url) ? url : null
}
