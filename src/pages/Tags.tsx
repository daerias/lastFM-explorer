import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  getUserTopTags,
  getPersonalTracks,
  renameTagGlobally,
  deleteTagGlobally,
  type TaggedTrack,
} from '../services/lastfm'
import { DEMO_ALL_TAGS } from '../services/demoData'
import TrackCard from '../components/shared/TrackCard'
import TrackDetailPanel from '../components/shared/TrackDetailPanel'
import ToxicCleanupLoader from '../components/shared/ToxicCleanupLoader'
import styles from './Tags.module.css'

interface TagEntry {
  name: string
  count: number
}

export default function Tags() {
  const { username, isAuthenticated } = useAuth()

  // All user tags
  const [allTags, setAllTags] = useState<TagEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Search + sort
  const [query, setQuery] = useState('')
  const [sortMode, setSortMode] = useState<'alpha' | 'count' | 'regex'>('alpha')

  // Progressive disclosure
  const [showAll, setShowAll] = useState(false)
  const INITIAL_VISIBLE = 60

  // Expanded tag — shows tracks + leaders
  const [expandedTag, setExpandedTag] = useState<string | null>(null)
  const [tagTracks, setTagTracks] = useState<TaggedTrack[]>([])
  const [trackTotal, setTrackTotal] = useState(0)
  const [tracksLoading, setTracksLoading] = useState(false)
  const [tracksError, setTracksError] = useState<string | null>(null)

  // Rename
  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  // Delete
  const [deletingTag, setDeletingTag] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Track detail panel
  const [selectedTrack, setSelectedTrack] = useState<{ artist: string; name: string } | null>(null)

  // Ref for auto-scroll to expanded detail
  const detailRef = useRef<HTMLDivElement>(null)

  const isDemo = !isAuthenticated

  // Load demo tags when not authenticated
  useEffect(() => {
    if (!isDemo) return
    setAllTags(DEMO_ALL_TAGS)
    setLoading(false)
  }, [isDemo])

  // Load all tags
  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    setLoading(true)
    setError(null)

    getUserTopTags(username, 500)
      .then((tags) => { if (!cancelled) setAllTags(tags) })
      .catch((err) => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [username, isAuthenticated])

  // Filter and sort tags — supports substring, regex, alpha, and count sorting
  const filteredTags = useMemo(() => {
    const q = query.trim()
    let filtered = allTags

    if (q) {
      if (sortMode === 'regex') {
        try {
          const re = new RegExp(q, 'i')
          filtered = allTags.filter((t) => re.test(t.name))
        } catch {
          const ql = q.toLowerCase()
          filtered = allTags.filter((t) => t.name.toLowerCase().includes(ql))
        }
      } else {
        const ql = q.toLowerCase()
        filtered = allTags.filter((t) => t.name.toLowerCase().includes(ql))
      }
    }

    const sorted = sortMode === 'count'
      ? [...filtered].sort((a, b) => b.count - a.count)
      : [...filtered].sort((a, b) => a.name.localeCompare(b.name))

    return sorted
  }, [allTags, query, sortMode])

  // Group tags by first letter for scannable layout
  const letterGroups = useMemo(() => {
    const visible = showAll || filteredTags.length <= INITIAL_VISIBLE
      ? filteredTags
      : filteredTags.slice(0, INITIAL_VISIBLE)

    const groups = new Map<string, TagEntry[]>()
    for (const tag of visible) {
      const letter = /^[a-zA-Z]/.test(tag.name) ? tag.name[0].toUpperCase() : '#'
      if (!groups.has(letter)) groups.set(letter, [])
      groups.get(letter)!.push(tag)
    }

    // Sort groups: A-Z then #
    const sorted = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === '#') return 1
      if (b === '#') return -1
      return a.localeCompare(b)
    })

    return { groups: sorted, totalVisible: visible.length, total: filteredTags.length }
  }, [filteredTags, showAll])

  // Sentinel ref to cancel in-flight expands (avoids race conditions)
  const activeExpandTagRef = useRef<string | null>(null)

  // Expand tag — load ALL its tracks + compute leader artist stats
  const expandTag = useCallback(async (tag: string) => {
    if (expandedTag === tag) { setExpandedTag(null); return }
    if (!username) return

    // Cancel any in-flight expand for a different tag
    activeExpandTagRef.current = tag

    setExpandedTag(tag)
    setTagTracks([])
    setTrackTotal(0)
    setTracksLoading(true)
    setTracksError(null)

    const thisTag = tag

    try {
      const page1 = await getPersonalTracks(username, tag, 200, 1)
      if (activeExpandTagRef.current !== thisTag) return

      const allTracks = [...page1.tracks]
      const totalPages = page1.totalPages
      let failedPages = 0

      // Show page 1 immediately for progressive UI
      setTagTracks([...allTracks])
      setTrackTotal(page1.total || 0)

      if (totalPages > 1) {
        const BATCH = 5
        for (let start = 2; start <= totalPages; start += BATCH) {
          if (activeExpandTagRef.current !== thisTag) return
          const end = Math.min(start + BATCH - 1, totalPages)
          const batch = await Promise.allSettled(
            Array.from({ length: end - start + 1 }, (_, i) =>
              getPersonalTracks(username, tag, 200, start + i),
            ),
          )
          if (activeExpandTagRef.current !== thisTag) return
          for (const r of batch) {
            if (r.status === 'fulfilled') {
              allTracks.push(...r.value.tracks)
            } else {
              failedPages++
            }
          }
          // Progressive update after each batch
          setTagTracks([...allTracks])
        }
      }

      if (activeExpandTagRef.current !== thisTag) return
      if (failedPages > 0) {
        setTracksError(`${failedPages} page(s) failed to load — showing ${allTracks.length} of ${page1.total} tracks`)
      }
    } catch (err: any) {
      if (activeExpandTagRef.current !== thisTag) return
      setTracksError(err.message || 'Failed to load tracks')
    } finally {
      if (activeExpandTagRef.current === thisTag) {
        setTracksLoading(false)
      }
    }
  }, [expandedTag, username])

  // Compute leader artists from tag tracks (only when a tag is expanded)
  const tagLeaders = useMemo(() => {
    if (!expandedTag || tagTracks.length === 0) return []
    const counts = new Map<string, number>()
    for (const t of tagTracks) {
      const name = t.artist.name
      counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [tagTracks, expandedTag])

  // Rename handler
  const handleRename = async () => {
    const newName = renameInput.trim().toLowerCase()
    if (!renamingTag || !newName || newName === renamingTag.toLowerCase() || !username) return

    setRenameLoading(true)
    setActionMsg(null)

    try {
      const result = await renameTagGlobally(username, renamingTag, newName)
      setActionMsg(`Renamed "${renamingTag}" → "${newName}" on ${result.renamed} track${result.renamed !== 1 ? 's' : ''}`)
      // Update tag list: replace old with new
      setAllTags((prev) =>
        prev
          .filter((t) => t.name !== renamingTag)
          .map((t) => (t.name === newName ? { ...t, count: t.count + result.renamed } : t))
      )
      if (!allTags.some((t) => t.name === newName)) {
        setAllTags((prev) => [...prev, { name: newName, count: result.renamed }])
      }
      setRenamingTag(null)
      setRenameInput('')
      if (expandedTag === renamingTag) setExpandedTag(null)
    } catch (err: any) {
      setActionMsg(`Rename failed: ${err.message}`)
    } finally {
      setRenameLoading(false)
    }
  }

  // Delete handler
  const handleDelete = async (tag: string) => {
    if (!username) return
    setDeletingTag(tag)
    setActionMsg(null)

    try {
      const result = await deleteTagGlobally(username, tag)
      setActionMsg(`Deleted "${tag}" from ${result.removed} track${result.removed !== 1 ? 's' : ''}`)
      setAllTags((prev) => prev.filter((t) => t.name !== tag))
      if (expandedTag === tag) setExpandedTag(null)
    } catch (err: any) {
      setActionMsg(`Delete failed: ${err.message}`)
    } finally {
      setDeletingTag(null)
      setDeleteConfirm(null)
    }
  }

  return (
    <div className={styles.tags}>
      <div className={styles.header}>
        <h1>Tag Management</h1>
        <p className={styles.subtitle}>{allTags.length} tags in your library</p>
      </div>

      {/* Search + Sort bar */}
      <div className={styles.searchWrap}>
        <input
          id="tags-search"
          className={styles.searchInput}
          type="text"
          placeholder={sortMode === 'regex' ? 'Regex filter (e.g. ^rock|^pop)...' : 'Search tags...'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className={styles.sortGroup}>
          <button
            className={`${styles.sortBtn} ${sortMode === 'alpha' ? styles.sortBtnActive : ''}`}
            onClick={() => setSortMode('alpha')}
            title="Sort alphabetically A–Z"
          >
            A–Z
          </button>
          <button
            className={`${styles.sortBtn} ${sortMode === 'count' ? styles.sortBtnActive : ''}`}
            onClick={() => setSortMode('count')}
            title="Sort by track count (most first)"
          >
            #
          </button>
          <button
            className={`${styles.sortBtn} ${sortMode === 'regex' ? styles.sortBtnActive : ''}`}
            onClick={() => setSortMode('regex')}
            title="Filter with regex (e.g. ^rock)"
          >
            .*
          </button>
        </div>
        {query && (
          <span className={styles.searchHint}>
            {filteredTags.length} match{filteredTags.length !== 1 ? 'es' : ''}
          </span>
        )}
      </div>

      {/* Toxic Cleanup Loader — shows during rename/delete */}
      {renameLoading && (
        <ToxicCleanupLoader
          progress={-1}
          label={`Renaming "${renamingTag}"…`}
        />
      )}
      {deletingTag && (
        <ToxicCleanupLoader
          progress={-1}
          label={`Deleting "${deletingTag}"…`}
        />
      )}

      {actionMsg && (
        <p className={`${styles.actionMsg} ${actionMsg.startsWith('Renamed') || actionMsg.startsWith('Deleted') ? styles.actionOk : styles.actionErr}`}>
          {actionMsg}
        </p>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {loading ? (
        <div className={styles.loading}>Loading tags...</div>
      ) : filteredTags.length === 0 ? (
        <div className="neuro-pressed" style={{ padding: '40px', textAlign: 'center' }}>
          <p style={{ color: 'var(--text-muted)' }}>{query ? 'No tags match your search.' : 'No tags yet — start tagging tracks!'}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
            {letterGroups.groups.map(([letter, tags]) => (
              <div key={letter} className={styles.letterGroup}>
                <span className={styles.letterHeader}>{letter}</span>
                <div className={styles.letterChips}>
                  {tags.map((tag) => {
                    const isExpanded = expandedTag === tag.name

                    return (
                      <div
                        key={tag.name}
                        className={`${styles.tagCard} ${isExpanded ? styles.tagCardExpanded : ''} ${renamingTag === tag.name ? styles.tagCardRenaming : ''} ${deleteConfirm === tag.name ? styles.tagCardDeleting : ''}`}
                        onClick={() => expandTag(tag.name)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') expandTag(tag.name) }}
                        title={`${tag.count} tracks tagged "${tag.name}"`}
                      >
                        <span className={styles.tagCardName}>{tag.name}</span>
                        <span className={styles.tagCardCount}>{tag.count}</span>

                        <span className={styles.tagCardActions}>
                          <button
                            className={styles.chipActionBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              setRenamingTag(tag.name)
                              setRenameInput(tag.name)
                              setActionMsg(null)
                            }}
                            disabled={!!deletingTag || !!renamingTag}
                            title="Rename"
                          >
                            <span className="neuro-icon neuro-icon-edit" />
                          </button>
                          <button
                            className={`${styles.chipActionBtn} ${styles.chipActionBtnDanger}`}
                            onClick={(e) => {
                              e.stopPropagation()
                              setDeleteConfirm(tag.name)
                            }}
                            disabled={!!deletingTag || !!renamingTag}
                            title="Delete"
                          >
                            <span className="neuro-icon neuro-icon-close" />
                          </button>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Progressive disclosure — show more / show less */}
          {letterGroups.total > INITIAL_VISIBLE && (
            <div className={styles.showMoreRow}>
              <button
                className={styles.showMoreBtn}
                onClick={() => setShowAll((s) => !s)}
              >
                {showAll
                  ? 'Show less'
                  : `Show all ${letterGroups.total} tags`}
                <span className={styles.remainingBadge}>
                  {showAll ? '' : `(${letterGroups.total - INITIAL_VISIBLE} hidden)`}
                </span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Rename toolbar — appears above the grid */}
      {renamingTag && (
        <div className={styles.inlineRename}>
          <span className={styles.inlineRenameLabel}>Renaming <strong>{renamingTag}</strong>:</span>
          <input
            id="tags-rename-input"
            className={styles.inlineRenameInput}
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') { setRenamingTag(null); setRenameInput('') }
            }}
            placeholder="New tag name..."
            autoFocus
          />
          <button className={`${styles.inlineBtn} ${styles.inlineBtnOk}`} onClick={handleRename} disabled={renameLoading}>
            {renameLoading ? '...' : 'Rename'}
          </button>
          <button className={`${styles.inlineBtn} ${styles.inlineBtnCancel}`} onClick={() => { setRenamingTag(null); setRenameInput('') }}>
            Cancel
          </button>
        </div>
      )}

      {/* Delete confirmation — appears above the grid */}
      {deleteConfirm && (
        <div className={styles.inlineDelete}>
          <span>Delete <strong>{deleteConfirm}</strong> from all {allTags.find(t => t.name === deleteConfirm)?.count ?? '?'} tracks?</span>
          <button
            className={`${styles.inlineBtn} ${styles.inlineBtnDanger}`}
            onClick={() => handleDelete(deleteConfirm)}
            disabled={!!deletingTag}
          >
            {deletingTag === deleteConfirm ? 'Deleting...' : 'Yes, delete'}
          </button>
          <button className={`${styles.inlineBtn} ${styles.inlineBtnCancel}`} onClick={() => setDeleteConfirm(null)}>
            Cancel
          </button>
        </div>
      )}

      {/* Expanded tag detail — below the grid */}
      {expandedTag && (
        <div
          className={styles.expandedDetail}
          ref={(el) => {
            detailRef.current = el
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          }}
        >
              {tracksLoading ? (
                <span className={styles.loadingSmall}>Loading tracks for "{expandedTag}"...</span>
              ) : tracksError && tagTracks.length === 0 ? (
                <span className={styles.error}>{tracksError}</span>
              ) : tagTracks.length === 0 && !tracksError ? (
                <span className={styles.noTracks}>No tracks tagged "{expandedTag}".</span>
              ) : (
                <>
                  <div className={styles.trackSummary}>
                    {tagTracks.length} track{tagTracks.length !== 1 ? 's' : ''}
                    {trackTotal > 0 && tagTracks.length !== trackTotal && <> of {trackTotal}</>}
                    {tracksError && <span className={styles.trackWarn}> — {tracksError}</span>}
                  </div>

                  {tagLeaders.length > 0 && (
                    <div className={styles.leaders}>
                      <span className={styles.leadersLabel}>Top Artists:</span>
                      {tagLeaders.map((l, i) => (
                        <span key={l.name} className={styles.leaderChip}>
                          <span className={styles.leaderRank}>#{i + 1}</span>
                          {l.name}
                          <span className={styles.leaderCount}>{l.count}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className={styles.trackGrid}>
                    {tagTracks.map((t) => (
                      <TrackCard
                        key={`${t.artist.name}-${t.name}`}
                        track={{
                          name: t.name,
                          playcount: '',
                          url: t.url,
                          artist: { name: t.artist.name, mbid: undefined, url: undefined },
                          image: [],
                        }}
                        variant="top"
                        onClick={() => setSelectedTrack({ artist: t.artist.name, name: t.name })}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

      {selectedTrack && (
        <TrackDetailPanel
          artistName={selectedTrack.artist}
          trackName={selectedTrack.name}
          onClose={() => setSelectedTrack(null)}
        />
      )}
    </div>
  )
}
