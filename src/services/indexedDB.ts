// IndexedDB Sync-Engine — local cache for Last.fm data
// All UI reads from here (0ms load), background sync from Last.fm API
// Full-history sync: fetches ALL scrobbles, stores individually for O(1) lookup
import type { Track, Artist } from './lastfm'

const DB_NAME = 'lastfm_cache'
const DB_VERSION = 2

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
      // v2: full-history sync stores
      if (!db.objectStoreNames.contains('trackKeys')) {
        db.createObjectStore('trackKeys', { keyPath: 'user' })
      }
      if (!db.objectStoreNames.contains('syncMeta')) {
        db.createObjectStore('syncMeta', { keyPath: 'user' })
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

// ── Full-History Sync Engine ──

export interface SyncMeta {
  user: string
  lastSyncTimestamp: number  // Unix seconds of most recent track synced
  totalTracks: number        // Total tracks in cache
  syncComplete: boolean      // true when all history fetched
}

export interface SyncProgress {
  page: number
  totalPages: number
  tracksSoFar: number
  done: boolean
}

type ProgressCallback = (progress: SyncProgress) => void

/** Store many tracks in bulk — keyed individually for O(1) lookup */
async function bulkPutTracks(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return
  try {
    const db = await openDB()
    const store = getStore(db, 'tracks', 'readwrite')
    for (const t of tracks) {
      if (!t.date?.uts) continue
      const key = `${getArtistNameFromTrack(t)}::${t.name}::${t.date.uts}`
      store.put({ key, data: t, updatedAt: Date.now() })
    }
    await new Promise<void>((resolve, reject) => {
      store.transaction.oncomplete = () => resolve()
      store.transaction.onerror = () => reject(store.transaction.error)
    })
    db.close()
  } catch {
    // Bulk put is best-effort
  }
}

function getArtistNameFromTrack(t: Track): string {
  return t.artist?.['#text'] || 'Unknown'
}

function trackSortKey(t: Track): number {
  return t.date?.uts ? parseInt(t.date.uts, 10) : 0
}

/** Start a full-history sync: fetches ALL pages, stores individually, reports progress.
 *  Use `onProgress` callback for UI progress bar.
 *  Returns total number of tracks synced. */
export async function startFullSync(
  user: string,
  onProgress?: ProgressCallback,
): Promise<number> {
  const lastfm = await getLastfmModule()

  // Get page 1 to discover total pages
  const page1 = await lastfm.getRecentTracks(user, 200, 1)
  const totalPages = page1.totalPages

  // Store page 1
  await bulkPutTracks(page1.tracks)
  let totalTracks = page1.tracks.length

  if (onProgress) {
    onProgress({ page: 1, totalPages, tracksSoFar: totalTracks, done: totalPages <= 1 })
  }

  if (totalPages <= 1) {
    await updateSyncMeta(user, totalTracks, true)
    return totalTracks
  }

  // Fetch remaining pages in batches of 5
  const BATCH = 5
  for (let start = 2; start <= totalPages; start += BATCH) {
    const end = Math.min(start + BATCH - 1, totalPages)
    const batch = await Promise.all(
      Array.from({ length: end - start + 1 }, (_, i) =>
        lastfm.getRecentTracks(user, 200, start + i),
      ),
    )

    for (const r of batch) {
      await bulkPutTracks(r.tracks)
      totalTracks += r.tracks.length
    }

    const done = end >= totalPages
    if (onProgress) {
      onProgress({ page: end, totalPages, tracksSoFar: totalTracks, done })
    }

    if (done) break
  }

  await updateSyncMeta(user, totalTracks, true)
  return totalTracks
}

/** Incremental sync: fetch only tracks newer than last sync timestamp */
export async function incrementalSync(
  user: string,
  onProgress?: ProgressCallback,
): Promise<{ newTracks: number; totalCached: number }> {
  const meta = await getSyncMeta(user)
  const lastfm = await getLastfmModule()

  const from = meta?.lastSyncTimestamp ?? undefined

  const page1 = await lastfm.getRecentTracks(user, 200, 1, from)
  const totalPages = page1.totalPages

  // Only store tracks newer than our last sync (defensive)
  const newTracks = from
    ? page1.tracks.filter((t: Track) => trackSortKey(t) > from)
    : page1.tracks

  await bulkPutTracks(newTracks)
  let totalNew = newTracks.length

  if (onProgress) {
    onProgress({ page: 1, totalPages, tracksSoFar: totalNew, done: totalPages <= 1 })
  }

  if (totalPages > 1) {
    const BATCH = 5
    for (let start = 2; start <= totalPages; start += BATCH) {
      const end = Math.min(start + BATCH - 1, totalPages)
      const batch = await Promise.all(
        Array.from({ length: end - start + 1 }, (_, i) =>
          lastfm.getRecentTracks(user, 200, start + i, from),
        ),
      )
      const batchNew: Track[] = []
      for (const r of batch) {
        const filtered = from
          ? r.tracks.filter((t: Track) => trackSortKey(t) > from)
          : r.tracks
        batchNew.push(...filtered)
      }
      await bulkPutTracks(batchNew)
      totalNew += batchNew.length
      if (onProgress) {
        onProgress({ page: end, totalPages, tracksSoFar: totalNew, done: end >= totalPages })
      }
    }
  }

  const totalCached = (meta?.totalTracks ?? 0) + totalNew
  await updateSyncMeta(user, totalCached, meta?.syncComplete ?? false)
  return { newTracks: totalNew, totalCached }
}

/** Get sync metadata for a user */
export async function getSyncMeta(user: string): Promise<SyncMeta | null> {
  return cacheGet<SyncMeta>('syncMeta', user)
}

/** Update sync metadata */
async function updateSyncMeta(user: string, totalTracks: number, syncComplete: boolean): Promise<void> {
  await cacheSet<SyncMeta>('syncMeta', user, {
    user,
    lastSyncTimestamp: Math.floor(Date.now() / 1000),
    totalTracks,
    syncComplete,
  })
}

/** Get ALL cached tracks for a user, sorted by date descending (newest first).
 *  Uses getAll() from IndexedDB — fast for up to hundreds of thousands of records. */
export async function getCachedAllTracks(user: string): Promise<Track[]> {
  try {
    const meta = await getSyncMeta(user)
    if (!meta || meta.totalTracks === 0) return []

    const db = await openDB()
    const store = getStore(db, 'tracks')
    const entries = (await promisify(store.getAll())) as CacheEntry<Track>[] | undefined
    db.close()

    if (!entries || entries.length === 0) return []

    // Sort by date descending (newest first)
    const tracks = entries.map((e) => e.data)
    tracks.sort((a, b) => trackSortKey(b) - trackSortKey(a))
    return tracks
  } catch {
    return []
  }
}

/** Get total cached track count (fast — reads only meta) */
export async function getCachedTrackCount(user: string): Promise<number> {
  const meta = await getSyncMeta(user)
  return meta?.totalTracks ?? 0
}

/** Clear all cached tracks and sync metadata for a user */
export async function clearTrackCache(user: string): Promise<void> {
  try {
    const db = await openDB()
    const store = getStore(db, 'tracks', 'readwrite')
    await promisify(store.clear())
    db.close()
    await cacheSet<SyncMeta>('syncMeta', user, {
      user,
      lastSyncTimestamp: 0,
      totalTracks: 0,
      syncComplete: false,
    })
  } catch {
    // Best-effort
  }
}
