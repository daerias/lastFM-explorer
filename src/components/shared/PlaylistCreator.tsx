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

interface SavedPlaylist {
  id: string
  name: string
  description: string
  tracks: PlaylistTrack[]
  createdAt: number
  updatedAt: number
}

interface SearchResult {
  artist: string
  title: string
  album?: string
  score: number
}

// ── Fuzzy search scoring (subsequence match) ──

function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase()
  const q = query.toLowerCase()
  if (t === q) return 100
  if (t.startsWith(q)) return 85
  if (t.includes(q)) return 65
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  if (qi === q.length) return 40 + (q.length / t.length) * 20
  return 0
}

function searchScore(track: PlaylistTrack, query: string): number {
  const q = query.trim()
  if (!q) return 0
  return Math.max(
    fuzzyScore(track.artist, q),
    fuzzyScore(track.title, q),
    fuzzyScore(track.artist + ' ' + track.title, q),
    track.album ? fuzzyScore(track.album, q) : 0,
  )
}

// ── LocalStorage helpers ──

const LS_KEY = 'lastfm-playlists'

function loadPlaylists(): SavedPlaylist[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePlaylists(playlists: SavedPlaylist[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(playlists))
  } catch { /* quota exceeded — silently fail */ }
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

function csvEscape(f: string): string {
  if (f.includes(',') || f.includes('"') || f.includes('\n')) {
    return `"${f.replace(/"/g, '""')}"`
  }
  return f
}

function exportTxt(tracks: PlaylistTrack[]) {
  downloadFile('playlist.txt', tracks.map((t) => `${t.artist} - ${t.title}`).join('\n'), 'text/plain')
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

async function copyToClipboard(tracks: PlaylistTrack[]) {
  const content = tracks.map((t) => `${t.artist} - ${t.title}`).join('\n')
  await navigator.clipboard.writeText(content)
}

// ── Drag types ──

const DRAG_TYPE = 'application/x-playlist-track'

// ── Component ──

export default function PlaylistCreator({ visible = true }: { visible?: boolean }) {
  const { username, isAuthenticated } = useAuth()
  const { openPlayer } = useMusicPlayer()

  // ── History cache ──
  const [allTracks, setAllTracks] = useState<PlaylistTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)

  // ── Search state ──
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'tag'>('fuzzy')
  const [tagQuery, setTagQuery] = useState('')
  const [tagResults, setTagResults] = useState<PlaylistTrack[]>([])
  const [tagLoading, setTagLoading] = useState(false)
  const [topTags, setTopTags] = useState<string[]>([])

  // ── Playlist state ──
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>(() => loadPlaylists())
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)
  const [playlistName, setPlaylistName] = useState('')
  const [playlistDesc, setPlaylistDesc] = useState('')
  const [tracks, setTracks] = useState<PlaylistTrack[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // ── UI state ──
  const [collapsed, setCollapsed] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dragItem, setDragItem] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [undoStack, setUndoStack] = useState<PlaylistTrack[][]>([])

  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Load history (once) ──
  useEffect(() => {
    if (!isAuthenticated || !username || !visible) return
    if (allTracks.length > 0) return
    let cancelled = false
    setTracksLoading(true)
    getAllRecentTracks(username)
      .then((tracks) => {
        if (cancelled) return
        const seen = new Set<string>()
        const deduped: PlaylistTrack[] = []
        for (const t of tracks) {
          const artist = t.artist?.['#text'] || 'Unknown'
          const key = `${artist.toLowerCase()}::${t.name.toLowerCase()}`
          if (!seen.has(key)) {
            seen.add(key)
            deduped.push({ artist, title: t.name, album: t.album?.['#text'] })
          }
        }
        setAllTracks(deduped)
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTracksLoading(false) })
    return () => { cancelled = true }
  }, [username, isAuthenticated, visible])

  // ── Load top tags ──
  useEffect(() => {
    if (!isAuthenticated || !username || !visible) return
    if (topTags.length > 0) return
    getUserTopTags(username, 500)
      .then((tags) => setTopTags(tags.map((t) => t.name)))
      .catch(() => {})
  }, [username, isAuthenticated, visible])

  // ── Tag search ──
  useEffect(() => {
    if (searchMode !== 'tag' || !tagQuery.trim() || !username) {
      setTagResults([])
      return
    }
    let cancelled = false
    setTagLoading(true)
    getPersonalTracks(username, tagQuery, 50)
      .then((result) => {
        if (cancelled) return
        setTagResults(result.tracks.map((t) => ({ artist: t.artist.name, title: t.name })))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTagLoading(false) })
    return () => { cancelled = true }
  }, [searchMode, tagQuery, username])

  // ── Fuzzy search results ──
  const fuzzyResults = useMemo<SearchResult[]>(() => {
    if (searchMode !== 'fuzzy' || !query.trim() || allTracks.length === 0) return []
    return allTracks
      .map((t) => ({ ...t, score: searchScore(t, query) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)
  }, [query, allTracks, searchMode])

  // ── Auto-save on any change ──
  useEffect(() => {
    if (!activePlaylistId) return
    setPlaylists((prev) => {
      const updated = prev.map((p) =>
        p.id === activePlaylistId
          ? { ...p, name: playlistName, description: playlistDesc, tracks, updatedAt: Date.now() }
          : p,
      )
      savePlaylists(updated)
      return updated
    })
  }, [playlistName, playlistDesc, tracks, activePlaylistId])

  // ── Helpers ──

  const trackKey = (t: PlaylistTrack) => `${t.artist.toLowerCase()}::${t.title.toLowerCase()}`

  const addToPlaylist = useCallback((track: PlaylistTrack) => {
    if (!activePlaylistId) return
    setUndoStack((prev) => [...prev, tracks])
    setTracks((prev) => {
      if (prev.some((p) => trackKey(p) === trackKey(track))) return prev
      return [...prev, track]
    })
    // Auto-scroll to bottom
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    })
  }, [activePlaylistId, tracks])

  const removeFromPlaylist = useCallback((index: number) => {
    setUndoStack((prev) => [...prev, tracks])
    setTracks((prev) => prev.filter((_, i) => i !== index))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(trackKey(tracks[index]))
      return next
    })
  }, [tracks])

  const undoRemove = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev
      const restored = prev[prev.length - 1]
      setTracks(restored)
      return prev.slice(0, -1)
    })
  }, [setTracks])

  const toggleSelect = useCallback((t: PlaylistTrack) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const key = trackKey(t)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    if (selectedIds.size === tracks.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(tracks.map(trackKey)))
    }
  }, [tracks, selectedIds])

  const removeSelected = useCallback(() => {
    if (selectedIds.size === 0) return
    setUndoStack((prev) => [...prev, tracks])
    const toRemove = selectedIds
    setTracks((prev) => prev.filter((t) => !toRemove.has(trackKey(t))))
    setSelectedIds(new Set())
  }, [tracks, selectedIds])

  const clearPlaylist = useCallback(() => {
    if (tracks.length === 0) return
    setUndoStack((prev) => [...prev, tracks])
    setTracks([])
    setSelectedIds(new Set())
  }, [tracks])

  const shufflePlaylist = useCallback(() => {
    setTracks((prev) => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }, [])

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    setTracks((prev) => {
      const next = [...prev]
      const [item] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, item)
      return next
    })
  }, [])

  const createPlaylist = useCallback(() => {
    const id = `pl-${Date.now()}`
    const newPl: SavedPlaylist = {
      id,
      name: 'New Playlist',
      description: '',
      tracks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    const updated = [...playlists, newPl]
    setPlaylists(updated)
    savePlaylists(updated)
    setActivePlaylistId(id)
    setPlaylistName('New Playlist')
    setPlaylistDesc('')
    setTracks([])
    setSelectedIds(new Set())
    setUndoStack([])
    setTimeout(() => nameRef.current?.focus(), 100)
  }, [playlists])

  const deletePlaylist = useCallback((id: string) => {
    const pl = playlists.find((p) => p.id === id)
    if (!pl) return
    if (!window.confirm(`Delete "${pl.name}" with ${pl.tracks.length} tracks?`)) return
    const updated = playlists.filter((p) => p.id !== id)
    setPlaylists(updated)
    savePlaylists(updated)
    if (activePlaylistId === id) {
      setActivePlaylistId(updated.length > 0 ? updated[0].id : null)
    }
  }, [playlists, activePlaylistId])

  const switchPlaylist = useCallback((id: string) => {
    const pl = playlists.find((p) => p.id === id)
    if (!pl) return
    setActivePlaylistId(id)
    setPlaylistName(pl.name)
    setPlaylistDesc(pl.description)
    setTracks(pl.tracks)
    setSelectedIds(new Set())
    setUndoStack([])
    setExportOpen(false)
  }, [playlists])

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(tracks)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard denied — silently ignore
    }
  }, [tracks])

  const playAll = useCallback(() => {
    if (tracks.length === 0) return
    openPlayer(tracks[0].artist, tracks[0].title)
    // Note: full queue playback requires MusicPlayerContext queue support
  }, [tracks, openPlayer])

  // ── Drag & drop ──

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

  // ── Keyboard shortcuts ──

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        selectAll()
      }
      if (e.key === 'Delete' && selectedIds.size > 0) {
        e.preventDefault()
        removeSelected()
      }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        undoRemove()
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set())
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, selectedIds])

  // ── Init: auto-select first playlist or create one ──

  useEffect(() => {
    if (!isAuthenticated || !visible) return
    if (playlists.length > 0 && !activePlaylistId) {
      switchPlaylist(playlists[0].id)
    }
  }, [isAuthenticated, visible])

  if (!isAuthenticated) return null

  // ── Render ──

  return (
    <div className={`${styles.creator} ${!collapsed ? styles.creatorOpen : ''}`} style={{ display: visible ? undefined : 'none' }}>
      {/* ── Header ── */}
      <button
        className={styles.header}
        onClick={() => {
          setCollapsed(!collapsed)
          if (collapsed) setTimeout(() => inputRef.current?.focus(), 100)
        }}
        title={collapsed ? 'Open playlist creator' : 'Collapse'}
      >
        <span className={styles.headerIcon}>🎧</span>
        <span className={styles.headerLabel}>Playlists</span>
        {tracks.length > 0 && <span className={styles.headerCount}>{tracks.length}</span>}
        <span className={styles.headerChevron}>{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className={styles.body}>
          {/* ── Playlist Selector ── */}
          <div className={styles.playlistBar}>
            <select
              className={styles.playlistSelect}
              value={activePlaylistId ?? ''}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  createPlaylist()
                } else {
                  switchPlaylist(e.target.value)
                }
              }}
            >
              {playlists.length === 0 && <option value="">No playlists</option>}
              {playlists.map((pl) => (
                <option key={pl.id} value={pl.id}>
                  {pl.name} ({pl.tracks.length})
                </option>
              ))}
              <option value="__new__">+ New Playlist</option>
            </select>
            {activePlaylistId && (
              <button
                className={styles.deletePlaylistBtn}
                onClick={() => deletePlaylist(activePlaylistId)}
                title="Delete playlist"
              >
                🗑
              </button>
            )}
          </div>

          {/* ── Playlist Name + Description ── */}
          {activePlaylistId && (
            <div className={styles.metaSection}>
              <input
                ref={nameRef}
                className={styles.nameInput}
                type="text"
                placeholder="Playlist name..."
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
              />
              <input
                className={styles.descInput}
                type="text"
                placeholder="Description (optional)"
                value={playlistDesc}
                onChange={(e) => setPlaylistDesc(e.target.value)}
              />
            </div>
          )}

          {!activePlaylistId && (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}>🎧</span>
              <span className={styles.emptyText}>Create or select a playlist</span>
              <button className={styles.createBtn} onClick={createPlaylist}>
                + New Playlist
              </button>
            </div>
          )}

          {activePlaylistId && (
            <>
              {/* ── Search Section ── */}
              <div className={styles.searchSection}>
                <div className={styles.searchRow}>
                  <input
                    ref={inputRef}
                    className={styles.searchInput}
                    type="text"
                    placeholder={searchMode === 'tag' ? 'Search by tag...' : 'Search artist, title...'}
                    value={searchMode === 'tag' ? tagQuery : query}
                    onChange={(e) => searchMode === 'tag' ? setTagQuery(e.target.value) : setQuery(e.target.value)}
                    disabled={tracksLoading}
                  />
                  <button
                    className={`${styles.modeBtn} ${searchMode === 'tag' ? styles.modeBtnActive : ''}`}
                    onClick={() => {
                      setSearchMode(searchMode === 'tag' ? 'fuzzy' : 'tag')
                      setTagQuery('')
                      setQuery('')
                    }}
                    title={searchMode === 'tag' ? 'Switch to text search' : 'Switch to tag search'}
                  >
                    {searchMode === 'tag' ? '🏷' : '🔍'}
                  </button>
                </div>

                {/* Tag suggestions */}
                {searchMode === 'tag' && !tagQuery && topTags.length > 0 && (
                  <div className={styles.tagSuggestions}>
                    {topTags.slice(0, 16).map((tag) => (
                      <button key={tag} className={styles.tagChip} onClick={() => setTagQuery(tag)}>
                        {tag}
                      </button>
                    ))}
                  </div>
                )}

                {/* Results */}
                <div className={styles.results}>
                  {tracksLoading && <span className={styles.loadingHint}>Loading history...</span>}
                  {tagLoading && <span className={styles.loadingHint}>Searching tags...</span>}

                  {searchMode === 'fuzzy' && fuzzyResults.map((r) => (
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

                  {searchMode === 'tag' && tagResults.map((r) => (
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

                  {!tracksLoading && !tagLoading && searchMode === 'fuzzy' && query && fuzzyResults.length === 0 && (
                    <span className={styles.loadingHint}>No matches found</span>
                  )}
                  {!tagLoading && searchMode === 'tag' && tagQuery && tagResults.length === 0 && (
                    <span className={styles.loadingHint}>No tagged tracks found</span>
                  )}
                </div>
              </div>

              {/* ── Playlist Toolbar ── */}
              {tracks.length > 0 && (
                <div className={styles.toolbar}>
                  <div className={styles.toolbarLeft}>
                    <span className={styles.trackCount}>
                      {tracks.length} track{tracks.length !== 1 ? 's' : ''}
                      {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
                    </span>
                  </div>
                  <div className={styles.toolbarActions}>
                    {undoStack.length > 0 && (
                      <button className={styles.toolBtn} onClick={undoRemove} title="Undo (Ctrl+Z)">
                        ↩
                      </button>
                    )}
                    <button className={styles.toolBtn} onClick={selectAll} title="Select all (Ctrl+A)">
                      {selectedIds.size === tracks.length ? '◻' : '☐'}
                    </button>
                    {selectedIds.size > 0 && (
                      <button className={styles.toolBtn} onClick={removeSelected} title="Remove selected (Del)">
                        ✕
                      </button>
                    )}
                    <button className={styles.toolBtn} onClick={shufflePlaylist} title="Shuffle">
                      🔀
                    </button>
                    <button className={styles.toolBtn} onClick={clearPlaylist} title="Clear">
                      Clear
                    </button>
                    <button className={`${styles.toolBtn} ${styles.toolBtnAccent}`} onClick={playAll} title="Play first track">
                      ▶ Play
                    </button>
                  </div>
                </div>
              )}

              {/* ── Playlist Tracks ── */}
              <div
                ref={scrollRef}
                className={`${styles.trackList} ${dragOver ? styles.trackListDragOver : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {tracks.length === 0 && (
                  <div className={styles.dropHint}>
                    <span>Search above to add tracks</span>
                    <span className={styles.dropHintSub}>or drop from library</span>
                  </div>
                )}

                {tracks.map((track, i) => {
                  const key = trackKey(track)
                  const isSelected = selectedIds.has(key)
                  return (
                    <div
                      key={`${key}::${i}`}
                      className={`${styles.trackItem}
                        ${isSelected ? styles.trackItemSelected : ''}
                        ${dragItem === i ? styles.trackItemDragging : ''}`}
                      draggable
                      onDragStart={(e) => handleDragStart(e, i)}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => {
                        if (e.shiftKey) {
                          toggleSelect(track)
                        }
                      }}
                    >
                      <span className={styles.dragHandle} title="Drag to reorder">⠿</span>
                      <button
                        className={styles.playBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          openPlayer(track.artist, track.title)
                        }}
                        title="Play"
                      >
                        ▶
                      </button>
                      <span className={styles.itemIndex}>{i + 1}</span>
                      <span className={styles.itemInfo}>
                        <span className={styles.itemTitle}>{track.title}</span>
                        <span className={styles.itemArtist}>{track.artist}</span>
                      </span>
                      <button
                        className={styles.selectBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleSelect(track)
                        }}
                        title="Select"
                      >
                        {isSelected ? '●' : '○'}
                      </button>
                      <button
                        className={styles.removeBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          removeFromPlaylist(i)
                        }}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  )
                })}
              </div>

              {/* ── Export Section ── */}
              {tracks.length > 0 && (
                <div className={styles.exportSection}>
                  <button
                    className={styles.exportToggle}
                    onClick={() => setExportOpen(!exportOpen)}
                  >
                    📥 Export {exportOpen ? '▾' : '▸'}
                  </button>
                  {exportOpen && (
                    <div className={styles.exportOptions}>
                      <button className={styles.exportBtn} onClick={() => exportTxt(tracks)}>
                        TXT — artist - title
                      </button>
                      <button className={styles.exportBtn} onClick={() => exportCsv(tracks)}>
                        CSV — artist, title, album
                      </button>
                      <button className={styles.exportBtn} onClick={() => exportM3u(tracks)}>
                        M3U8 — playlist file
                      </button>
                      <button className={styles.exportBtn} onClick={handleCopy}>
                        {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Helper: find drop index from mouse Y ──

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
