import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import { getAllRecentTracks, getUserTopTags, getPersonalTracks } from '../../services/lastfm'
import styles from './PlaylistCreator.module.css'

// ── Types ──

interface PlaylistTrack {
  artist: string
  title: string
  album?: string
}

interface SearchResult {
  artist: string
  title: string
  album?: string
  score: number // 0–100, higher = better match
}

// ── Fuzzy search scoring ──

function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 85
  if (t.includes(q)) return 65
  // Character-by-character fuzzy match (subsequence)
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  if (qi === q.length) return 40 + (q.length / t.length) * 20 // partial subsequence
  return 0
}

function searchScore(track: { artist: string; title: string; album?: string }, query: string): number {
  const q = query.trim()
  if (!q) return 0
  const scores = [
    fuzzyScore(track.artist, q),
    fuzzyScore(track.title, q),
    fuzzyScore(track.artist + ' ' + track.title, q),
    track.album ? fuzzyScore(track.album, q) : 0,
  ]
  return Math.max(...scores)
}

// ── Export helpers ──

function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportTxt(tracks: PlaylistTrack[]) {
  const content = tracks.map((t) => `${t.artist} - ${t.title}`).join('\n')
  downloadFile('playlist.txt', content, 'text/plain')
}

function csvEscape(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`
  }
  return field
}

function exportCsv(tracks: PlaylistTrack[]) {
  const header = 'artist,title,album'
  const rows = tracks.map((t) => `${csvEscape(t.artist)},${csvEscape(t.title)},${csvEscape(t.album ?? '')}`)
  downloadFile('playlist.csv', [header, ...rows].join('\n'), 'text/csv')
}

function exportM3u(tracks: PlaylistTrack[]) {
  const lines = ['#EXTM3U']
  for (const t of tracks) {
    lines.push(`#EXTINF:-1,${t.artist} - ${t.title}`)
    lines.push(`# ${t.artist} - ${t.title}${t.album ? ` [${t.album}]` : ''}`)
  }
  downloadFile('playlist.m3u8', lines.join('\n'), 'audio/x-mpegurl')
}

// ── Drag types ──

const DRAG_TYPE = 'application/x-playlist-track'

// ── Component ──

export default function PlaylistCreator({ visible = true }: { visible?: boolean }) {
  const { username, isAuthenticated } = useAuth()
  const { openPlayer } = useMusicPlayer()

  const [allTracks, setAllTracks] = useState<PlaylistTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [playlist, setPlaylist] = useState<PlaylistTrack[]>([])
  const [collapsed, setCollapsed] = useState(true)
  const [exportOpen, setExportOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dragItem, setDragItem] = useState<number | null>(null)

  // Tag search
  const [tagMode, setTagMode] = useState(false)
  const [tagQuery, setTagQuery] = useState('')
  const [tagResults, setTagResults] = useState<PlaylistTrack[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  const [topTags, setTopTags] = useState<string[]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const playlistEndRef = useRef<HTMLDivElement>(null)

  // Load user's listening history once (only when first visible — avoid premature fetch)
  useEffect(() => {
    if (!isAuthenticated || !username || !visible) return
    if (allTracks.length > 0) return // already loaded
    let cancelled = false
    setTracksLoading(true)
    getAllRecentTracks(username)
      .then((tracks) => {
        if (cancelled) return
        // Deduplicate by artist+title
        const seen = new Set<string>()
        const deduped: PlaylistTrack[] = []
        for (const t of tracks) {
          const artist = t.artist?.['#text'] || 'Unknown'
          const key = `${artist.toLowerCase()}::${t.name.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            deduped.push({
              artist,
              title: t.name,
              album: t.album?.['#text'],
            })
          }
        }
        setAllTracks(deduped)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTracksLoading(false) })
    return () => { cancelled = true }
  }, [username, isAuthenticated, visible])

  // Load top tags for tag search (only when visible)
  useEffect(() => {
    if (!isAuthenticated || !username || !visible) return
    if (topTags.length > 0) return
    getUserTopTags(username, 500)
      .then((tags) => setTopTags(tags.map((t) => t.name)))
      .catch(() => {})
  }, [username, isAuthenticated, visible])

  // Fuzzy search across history
  const searchResults = useMemo<SearchResult[]>(() => {
    if (tagMode) return []
    if (!query.trim() || allTracks.length === 0) return []
    const scored = allTracks
      .map((t) => ({ ...t, score: searchScore(t, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
    return scored
  }, [query, allTracks, tagMode])

  // Tag search
  useEffect(() => {
    if (!tagMode || !tagQuery.trim() || !username) {
      setTagResults([])
      return
    }
    let cancelled = false
    setTagLoading(true)
    getPersonalTracks(username, tagQuery, 50)
      .then((result) => {
        if (cancelled) return
        setTagResults(
          result.tracks.map((t) => ({
            artist: t.artist.name,
            title: t.name,
          })),
        )
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTagLoading(false) })
    return () => { cancelled = true }
  }, [tagMode, tagQuery, username])

  // Add track to playlist (deduplicate)
  const addToPlaylist = useCallback((track: PlaylistTrack) => {
    setPlaylist((prev) => {
      const key = (t: PlaylistTrack) => `${t.artist.toLowerCase()}::${t.title.toLowerCase()}`
      if (prev.some((p) => key(p) === key(track))) return prev
      return [...prev, track]
    })
  }, [])

  const removeFromPlaylist = useCallback((index: number) => {
    setPlaylist((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    setPlaylist((prev) => {
      const next = [...prev]
      const [item] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, item)
      return next
    })
  }, [])

  const clearPlaylist = useCallback(() => setPlaylist([]), [])

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragItem(index)
    e.dataTransfer.setData(DRAG_TYPE, String(index))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOver(true)
  }

  const handleDragLeave = () => setDragOver(false)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const fromIndex = parseInt(e.dataTransfer.getData(DRAG_TYPE), 10)
    if (isNaN(fromIndex)) return
    // Find drop index based on mouse position
    const dropIndex = getDropIndex(e)
    if (dropIndex !== null && dropIndex !== fromIndex) {
      moveItem(fromIndex, dropIndex)
    }
    setDragItem(null)
  }

  const handleDragEnd = () => {
    setDragItem(null)
    setDragOver(false)
  }

  // Auto-scroll playlist to bottom when tracks added
  useEffect(() => {
    playlistEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [playlist.length])

  if (!isAuthenticated) return null

  return (
    <div className={`${styles.creator} ${!collapsed ? styles.creatorOpen : ''}`} style={{ display: visible ? undefined : 'none' }}>
      {/* Header — click to toggle */}
      <button
        className={styles.header}
        onClick={() => {
          setCollapsed(!collapsed)
          if (collapsed) setTimeout(() => inputRef.current?.focus(), 100)
        }}
        title={collapsed ? 'Open playlist creator' : 'Collapse'}
      >
        <span className={styles.headerIcon}>🎧</span>
        <span className={styles.headerLabel}>Playlist</span>
        <span className={styles.headerCount}>{playlist.length > 0 ? playlist.length : ''}</span>
        <span className={styles.headerChevron}>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          {/* Search bar */}
          <div className={styles.searchSection}>
            <div className={styles.searchRow}>
              <input
                ref={inputRef}
                className={styles.searchInput}
                type="text"
                placeholder={tagMode ? 'Search by tag...' : 'Fuzzy search artist, title...'}
                value={tagMode ? tagQuery : query}
                onChange={(e) => tagMode ? setTagQuery(e.target.value) : setQuery(e.target.value)}
                disabled={tracksLoading}
              />
              <button
                className={`${styles.modeBtn} ${tagMode ? styles.modeBtnActive : ''}`}
                onClick={() => { setTagMode(!tagMode); setTagQuery(''); setQuery('') }}
                title={tagMode ? 'Switch to text search' : 'Switch to tag search'}
              >
                {tagMode ? '🏷️' : '🔍'}
              </button>
            </div>

            {/* Tag suggestions */}
            {tagMode && !tagQuery && topTags.length > 0 && (
              <div className={styles.tagSuggestions}>
                {topTags.slice(0, 12).map((tag) => (
                  <button key={tag} className={styles.tagChip} onClick={() => setTagQuery(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            )}

            {/* Search results */}
            <div className={styles.results}>
              {tracksLoading && (
                <span className={styles.loadingHint}>Loading your history...</span>
              )}
              {tagLoading && (
                <span className={styles.loadingHint}>Searching tags...</span>
              )}

              {/* Text search results */}
              {!tagMode && searchResults.map((r) => (
                <button
                  key={`${r.artist}::${r.title}`}
                  className={styles.resultItem}
                  onClick={() => addToPlaylist({ artist: r.artist, title: r.title, album: r.album })}
                  title={`Add "${r.artist} - ${r.title}"`}
                >
                  <span className={styles.resultPlus}>+</span>
                  <span className={styles.resultInfo}>
                    <span className={styles.resultTitle}>{r.title}</span>
                    <span className={styles.resultArtist}>{r.artist}</span>
                  </span>
                  <span className={styles.resultScore}>{r.score}%</span>
                </button>
              ))}

              {/* Tag search results */}
              {tagMode && tagResults.map((r) => (
                <button
                  key={`${r.artist}::${r.title}`}
                  className={styles.resultItem}
                  onClick={() => addToPlaylist(r)}
                >
                  <span className={styles.resultPlus}>+</span>
                  <span className={styles.resultInfo}>
                    <span className={styles.resultTitle}>{r.title}</span>
                    <span className={styles.resultArtist}>{r.artist}</span>
                  </span>
                </button>
              ))}

              {!tracksLoading && !tagLoading && query && !tagMode && searchResults.length === 0 && (
                <span className={styles.loadingHint}>No matches.</span>
              )}
              {!tagLoading && tagMode && tagQuery && tagResults.length === 0 && (
                <span className={styles.loadingHint}>No tagged tracks found.</span>
              )}
            </div>
          </div>

          {/* Playlist — droppable zone */}
          <div
            className={`${styles.playlist} ${dragOver ? styles.playlistDragOver : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={styles.playlistHeader}>
              <span className={styles.playlistTitle}>
                {playlist.length === 0 ? 'Drop tracks here' : `${playlist.length} track${playlist.length !== 1 ? 's' : ''}`}
              </span>
              {playlist.length > 0 && (
                <button className={styles.clearBtn} onClick={clearPlaylist} title="Clear playlist">
                  Clear
                </button>
              )}
            </div>

            <div className={styles.playlistTracks}>
              {playlist.map((track, i) => (
                <div
                  key={`${track.artist}::${track.title}`}
                  className={`${styles.playlistItem} ${dragItem === i ? styles.playlistItemDragging : ''}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, i)}
                  onDragEnd={handleDragEnd}
                >
                  <span className={styles.dragHandle} title="Drag to reorder">⠿</span>
                  <span className={styles.playBtn} onClick={() => openPlayer(track.artist, track.title)} title="Play">▶</span>
                  <span className={styles.itemInfo}>
                    <span className={styles.itemTitle}>{track.title}</span>
                    <span className={styles.itemArtist}>{track.artist}</span>
                  </span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => removeFromPlaylist(i)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
              <div ref={playlistEndRef} />
            </div>

            {/* Export */}
            {playlist.length > 0 && (
              <div className={styles.exportSection}>
                <button
                  className={styles.exportToggle}
                  onClick={() => setExportOpen(!exportOpen)}
                >
                  📥 Download {exportOpen ? '▾' : '▸'}
                </button>
                {exportOpen && (
                  <div className={styles.exportOptions}>
                    <button className={styles.exportBtn} onClick={() => exportTxt(playlist)}>
                      TXT — artist - title
                    </button>
                    <button className={styles.exportBtn} onClick={() => exportCsv(playlist)}>
                      CSV — artist,title,album
                    </button>
                    <button className={styles.exportBtn} onClick={() => exportM3u(playlist)}>
                      M3U8 — playlist file
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helper: find drop index from mouse Y position ──

function getDropIndex(e: React.DragEvent): number | null {
  const container = e.currentTarget
  const items = container.querySelectorAll('[draggable]')
  if (items.length === 0) return 0
  const mouseY = e.clientY
  for (let i = 0; i < items.length; i++) {
    const rect = items[i].getBoundingClientRect()
    if (mouseY < rect.top + rect.height / 2) return i
  }
  return items.length
}
