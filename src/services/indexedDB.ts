// IndexedDB Sync-Engine — local cache for Last.fm data
// All UI reads from here (0ms load), background sync from Last.fm API
import type { Track, Artist } from './lastfm'

const DB_NAME = 'lastfm_cache'
const DB_VERSION = 1

interface CacheEntry<T> {
  key: string
  data: T
  updatedAt: number
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('artists')) {
        db.createObjectStore('artists', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('tags')) {
        db.createObjectStore('tags', { keyPath: 'key' })
      }
      if (!db.objectStoreNames.contains('stats')) {
        db.createObjectStore('stats', { keyPath: 'key' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getStore(db: IDBDatabase, storeName: string, mode: IDBTransactionMode = 'readonly') {
  const tx = db.transaction(storeName, mode)
  return tx.objectStore(storeName)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function promisify(req: IDBRequest): Promise<any> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ── Generic cache helpers ──

export async function cacheGet<T>(storeName: string, key: string): Promise<T | null> {
  try {
    const db = await openDB()
    const store = getStore(db, storeName)
    const entry = await promisify(store.get(key)) as CacheEntry<T> | undefined
    db.close()
    if (!entry) return null
    return entry.data
  } catch {
    return null
  }
}

export async function cacheSet<T>(storeName: string, key: string, data: T): Promise<void> {
  try {
    const db = await openDB()
    const store = getStore(db, storeName, 'readwrite')
    await promisify(store.put({ key, data, updatedAt: Date.now() }))
    db.close()
  } catch {
    // Silently fail — cache is optional
  }
}

export async function cacheGetAll<T>(storeName: string): Promise<T[]> {
  try {
    const db = await openDB()
    const store = getStore(db, storeName)
    const entries = (await promisify(store.getAll())) as CacheEntry<T>[] | undefined
    db.close()
    if (!entries) return []
    return entries.map((e: CacheEntry<T>) => e.data)
  } catch {
    return []
  }
}

export async function cacheClear(storeName: string): Promise<void> {
  try {
    const db = await openDB()
    const store = getStore(db, storeName, 'readwrite')
    await promisify(store.clear())
    db.close()
  } catch {
    // Silently fail
  }
}

// ── Domain-specific cache keys ──

function trackKey(user: string, from?: number, to?: number): string {
  const f = from ?? 'all'
  const t = to ?? 'now'
  return `tracks:${user}:${f}:${t}`
}

function statsKey(user: string): string {
  return `stats:${user}`
}

function tagsKey(user: string): string {
  return `tags:${user}`
}

function artistsKey(user: string, period: string): string {
  return `artists:${user}:${period}`
}

// ── Cached API wrappers (transparent) ──

let _lastfmModule: any = null
async function getLastfmModule() {
  if (!_lastfmModule) {
    _lastfmModule = await import('./lastfm')
  }
  return _lastfmModule
}

/** Get tracks with IndexedDB cache — returns cached data instantly, then updates in background */
export async function getCachedTracks(
  user: string,
  from?: number,
  to?: number,
): Promise<{ tracks: Track[]; stale: boolean }> {
  const key = trackKey(user, from, to)

  // Return cached immediately
  const cached = await cacheGet<Track[]>(`tracks`, key)
  if (cached) {
    // Background refresh
    const lastfm = await getLastfmModule()
    lastfm.getAllRecentTracks(user, from, to).then((fresh: Track[]) => {
      cacheSet('tracks', key, fresh)
    }).catch(() => {})
    return { tracks: cached, stale: true }
  }

  // No cache — fetch from API
  const lastfm = await getLastfmModule()
  const tracks = await lastfm.getAllRecentTracks(user, from, to)
  cacheSet('tracks', key, tracks)
  return { tracks, stale: false }
}

/** Get recent tracks (paginated) with cache */
export async function getCachedRecentTracks(
  user: string,
  limit = 200,
): Promise<{ tracks: Track[]; stale: boolean }> {
  const key = `recent:${user}:${limit}`
  const cached = await cacheGet<Track[]>('tracks', key)
  if (cached) {
    const lastfm = await getLastfmModule()
    lastfm.getRecentTracks(user, limit).then((r: { tracks: Track[] }) => {
      cacheSet('tracks', key, r.tracks)
    }).catch(() => {})
    return { tracks: cached, stale: true }
  }
  const lastfm = await getLastfmModule()
  const result = await lastfm.getRecentTracks(user, limit)
  cacheSet('tracks', key, result.tracks)
  return { tracks: result.tracks, stale: false }
}

/** Get cached top artists */
export async function getCachedTopArtists(
  user: string,
  period: string,
  limit = 20,
): Promise<{ artists: Artist[]; stale: boolean }> {
  const key = artistsKey(user, period)
  const cached = await cacheGet<Artist[]>('artists', key)
  if (cached) {
    const lastfm = await getLastfmModule()
    lastfm.getTopArtists(user, period as any, limit).then((fresh: Artist[]) => {
      cacheSet('artists', key, fresh)
    }).catch(() => {})
    return { artists: cached, stale: true }
  }
  const lastfm = await getLastfmModule()
  const artists = await lastfm.getTopArtists(user, period as any, limit)
  cacheSet('artists', key, artists)
  return { artists, stale: false }
}

/** Get cached user tags */
export async function getCachedUserTags(
  user: string,
  limit = 500,
): Promise<{ tags: { name: string; count: number }[]; stale: boolean }> {
  const key = tagsKey(user)
  const cached = await cacheGet<{ name: string; count: number }[]>('tags', key)
  if (cached) {
    const lastfm = await getLastfmModule()
    lastfm.getUserTopTags(user, limit).then((fresh: { name: string; count: number }[]) => {
      cacheSet('tags', key, fresh)
    }).catch(() => {})
    return { tags: cached, stale: true }
  }
  const lastfm = await getLastfmModule()
  const tags = await lastfm.getUserTopTags(user, limit)
  cacheSet('tags', key, tags)
  return { tags, stale: false }
}

/** Cache any value with a generic key */
export async function cacheUserStats(user: string, data: Record<string, any>): Promise<void> {
  await cacheSet('stats', statsKey(user), data)
}

export async function getCachedUserStats(user: string): Promise<Record<string, any> | null> {
  return cacheGet('stats', statsKey(user))
}

/** Sync all user data in background */
export async function backgroundSync(user: string): Promise<void> {
  const lastfm = await getLastfmModule()
  try {
    const [tracks, artists, tags, userInfo] = await Promise.all([
      lastfm.getAllRecentTracks(user).catch(() => [] as Track[]),
      lastfm.getTopArtists(user, 'overall', 50).catch(() => [] as Artist[]),
      lastfm.getUserTopTags(user, 500).catch(() => [] as { name: string; count: number }[]),
      lastfm.getUserInfo(user).catch(() => null),
    ])
    await Promise.all([
      cacheSet('tracks', trackKey(user), tracks),
      cacheSet('artists', artistsKey(user, 'overall'), artists),
      cacheSet('tags', tagsKey(user), tags),
      userInfo ? cacheSet('stats', statsKey(user), {
        playcount: userInfo.playcount,
        registered: userInfo.registered,
        country: userInfo.country,
      }) : Promise.resolve(),
    ])
  } catch {
    // Background sync is best-effort
  }
}
