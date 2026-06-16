import { useState, useEffect, useMemo } from 'react'
import { getTrackInfo, getArtistInfo, getTrackTags, addTrackTags, removeTrackTag, getUserTopTags, renameTagGlobally, type TrackInfo } from '../../services/lastfm'
import { resolveExternalCover } from '../../services/coverArt'
import { formatPlaycount } from '../../lib/format'
import { useAuth } from '../../context/AuthContext'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import styles from './TrackDetailPanel.module.css'

interface Props {
  artistName: string
  trackName: string
  onClose: () => void
}

function findImage(images?: { size: string; '#text': string }[]): string | null {
  if (!images) return null
  const img = images.find((i) => i.size === 'extralarge' || i.size === 'large' || i.size === 'mega')
  return img?.['#text'] || null
}

function formatDuration(ms: string): string {
  const secs = Math.floor(parseInt(ms, 10) / 1000)
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function TrackDetailPanel({ artistName, trackName, onClose }: Props) {
  const [info, setInfo] = useState<TrackInfo | null>(null)
  const [artistImg, setArtistImg] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tag editing — originalTags are the baseline from Last.fm, tags is the working set
  const { username } = useAuth()
  const { openPlayer } = useMusicPlayer()

  const [tagInput, setTagInput] = useState('')
  const [originalTags, setOriginalTags] = useState<string[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<string | null>(null)
  const [topTags, setTopTags] = useState<{ name: string; count: number }[]>([])
  const [showAllTags, setShowAllTags] = useState(false)
  const [renamingTag, setRenamingTag] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)
  const [renameMsg, setRenameMsg] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setExternalCover(null) // reset on track change

    Promise.all([
      getTrackInfo(artistName, trackName),
      getArtistInfo(artistName),
      // Fetch user's personal tags for this track (if authenticated)
      username ? getTrackTags(artistName, trackName, username).catch(() => [] as { name: string; url: string }[]) : Promise.resolve([] as { name: string; url: string }[]),
    ])
      .then(([trackData, artistData, userTags]) => {
        if (cancelled) return
        setInfo(trackData)
        if (artistData) setArtistImg(findImage(artistData.image))
        // Prefer user's personal tags over community tags
        if (userTags.length > 0) {
          const names = userTags.map((t) => t.name)
          setOriginalTags(names)
          setTags(names)
        } else {
          const rawTags = trackData?.toptags?.tag
          if (rawTags) {
            const tagList: { name: string; url: string }[] = Array.isArray(rawTags) ? rawTags : [rawTags]
            const names = tagList.map((t) => t.name)
            setOriginalTags(names)
            setTags(names)
          } else {
            setOriginalTags([])
            setTags([])
          }
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [artistName, trackName])

  // Load user's top tags for autocomplete suggestions
  useEffect(() => {
    if (!username) return
    getUserTopTags(username, 500)
      .then(setTopTags)
      .catch(() => setTopTags([]))
  }, [username])

  // Reset state when switching to a different track
  useEffect(() => {
    setShowAllTags(false)
    setRenamingTag(null)
    setRenameInput('')
    setRenameMsg(null)
  }, [artistName, trackName])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  // Filtered tag suggestions based on current input
  const tagSuggestions = useMemo(() => {
    if (!tagInput.trim()) return []
    const q = tagInput.trim().toLowerCase()

    // Helper: case-insensitive check if a tag is already in the list
    const hasTag = (name: string) => tags.some((t) => t.toLowerCase() === name.toLowerCase())

    // Always include user's personal tags
    const myTags = topTags
      .filter((s) => !hasTag(s.name) && s.name.toLowerCase().includes(q))
      .map((s) => ({ name: s.name, count: s.count, isMine: true as const }))

    // Optionally include the track's community tags
    let communityTags: { name: string; count: number; isMine: false }[] = []
    if (showAllTags && info?.toptags?.tag) {
      const raw = Array.isArray(info.toptags.tag) ? info.toptags.tag : [info.toptags.tag]
      communityTags = raw
        .filter(
          (t) => !hasTag(t.name) && t.name.toLowerCase().includes(q) && !myTags.some((m) => m.name.toLowerCase() === t.name.toLowerCase()),
        )
        .map((t) => ({ name: t.name, count: 0, isMine: false as const }))
    }

    return [...myTags, ...communityTags].slice(0, 10)
  }, [tagInput, tags, topTags, showAllTags, info])

  // Cover fallback: track.album.image → artist image → iTunes → null
  const [externalCover, setExternalCover] = useState<string | null>(null)

  // Try iTunes when Last.fm has no cover
  useEffect(() => {
    if (loading || !info) return
    const localCover = findImage(info.album?.image) || artistImg
    if (localCover) return

    let cancelled = false
    resolveExternalCover(artistName, trackName).then((url) => {
      if (!cancelled && url) setExternalCover(url)
    })
    return () => { cancelled = true }
  }, [loading])

  const coverImg = info
    ? (findImage(info.album?.image) || artistImg || externalCover)
    : (artistImg || externalCover)

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagInput('')
  }

  const handleRemoveTag = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag))

  const handleStartRename = (tag: string) => {
    setRenamingTag(tag)
    setRenameInput(tag)
    setRenameMsg(null)
  }

  const handleCancelRename = () => {
    setRenamingTag(null)
    setRenameInput('')
    setRenameMsg(null)
  }

  const handleRenameTag = async () => {
    const newName = renameInput.trim().toLowerCase()
    if (!renamingTag || !newName || newName === renamingTag.toLowerCase() || !username) return

    setRenameLoading(true)
    setRenameMsg(null)

    try {
      const result = await renameTagGlobally(username, renamingTag, newName)
      if (result.renamed === 0) {
        setRenameMsg(`No tracks found with your personal tag \u201c${renamingTag}\u201d. This tag may only exist as a community tag on this track.`)
      } else {
        setRenameMsg(`Renamed \u201c${renamingTag}\u201d \u2192 \u201c${newName}\u201d on ${result.renamed} track${result.renamed !== 1 ? 's' : ''}`)
      }
      // Update local tags: replace old tag with new on this track
      setTags((prev) => prev.map((t) => (t.toLowerCase() === renamingTag.toLowerCase() ? newName : t)))
      setOriginalTags((prev) => prev.map((t) => (t.toLowerCase() === renamingTag.toLowerCase() ? newName : t)))
      setRenamingTag(null)
      setRenameInput('')
    } catch (err: any) {
      setRenameMsg(`Rename failed: ${err.message}`)
    } finally {
      setRenameLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveMsg(null)

    const orig = new Set(originalTags.map((t) => t.toLowerCase()))
    const curr = new Set(tags.map((t) => t.toLowerCase()))
    const toAdd = tags.filter((t) => !orig.has(t.toLowerCase()))
    const toRemove = originalTags.filter((t) => !curr.has(t.toLowerCase()))

    // Remove deleted tags — catch per-tag errors so one failure doesn't block the rest
    for (const t of toRemove) {
      try {
        await removeTrackTag(artistName, trackName, t)
      } catch {
        // Tag already gone or network hiccup — continue
      }
    }

    // Add new tags
    if (toAdd.length > 0) {
      try {
        await addTrackTags(artistName, trackName, toAdd)
    } catch (err: any) {
      setSaveMsg(`✕ ${err.message}`)
      setSaving(false)
      // ⚠️ Don't update local state on error — desyncs UI from Last.fm reality
      return
    }
    }

    // Refetch to sync with Last.fm's real state
    try {
      const [fresh, freshUserTags] = await Promise.all([
        getTrackInfo(artistName, trackName),
        username ? getTrackTags(artistName, trackName, username).catch(() => [] as { name: string; url: string }[]) : Promise.resolve([] as { name: string; url: string }[]),
      ])
      // Prefer user's personal tags, fall back to community tags
      const source = freshUserTags.length > 0
        ? freshUserTags
        : fresh?.toptags?.tag
      if (source) {
        const tagList: { name: string }[] = Array.isArray(source) ? source : [source]
        const names = tagList.map((t: any) => t.name)
        setOriginalTags(names)
        setTags(names)
      } else {
        setOriginalTags([...tags])
      }
    } catch {
      // Best-effort: if refetch fails, trust our local changes
      setOriginalTags([...tags])
    }

    setSaveMsg('✓ Tags updated')
    setTimeout(() => setSaveMsg(null), 3000)
    setSaving(false)
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <button className={styles.close} onClick={onClose}><span className="neuro-icon neuro-icon-close" /></button>

        {loading ? (
          <div className={styles.loading}>Loading...</div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : info ? (
          <div className={styles.content}>
            <div className={styles.hero}>
              <div className={`${styles.coverWrap} neuro-raised-sm`}>
                {coverImg ? (
                  <img src={coverImg} alt={info.name} className={styles.coverImg} />
                ) : (
                  <span className={styles.noCover}><span className="neuro-icon neuro-icon-note" /></span>
                )}
              </div>
              <div>
                <h2>{info.name}</h2>
                <p className={styles.artistName}>{info.artist.name}</p>
                <div className={styles.actionRow}>
                  <button
                    className={styles.playInlineBtn}
                    onClick={() => openPlayer(info.artist.name, info.name)}
                    title="Play"
                  >
                    <span className="neuro-icon neuro-icon-play" style={{ marginRight: '6px' }} /> Play
                  </button>
                  <a
                    href={`https://www.last.fm/music/${encodeURIComponent(info.artist.name)}/${encodeURIComponent(info.name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.lastfmLink}
                    title="Open on Last.fm — delete scrobble from history, view stats, etc."
                  >
                    <span className="neuro-icon neuro-icon-external" /> Last.fm
                  </a>
                </div>
              </div>
            </div>

            <div className={styles.metaGrid}>
              {info.duration && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Duration</span>
                  <span className={styles.metaValue}>{formatDuration(info.duration)}</span>
                </div>
              )}
              {info.listeners && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Listeners</span>
                  <span className={styles.metaValue}>{formatPlaycount(info.listeners)}</span>
                </div>
              )}
              {info.playcount && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Plays</span>
                  <span className={styles.metaValue}>{formatPlaycount(info.playcount)}</span>
                </div>
              )}
              {info.album?.title && (
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Album</span>
                  <span className={styles.metaValue}>{info.album.title}</span>
                </div>
              )}
            </div>

            {info.wiki?.summary && (
              <div className={styles.section}>
                <h3>About</h3>
                <p className={styles.bio}>{info.wiki.summary.replace(/<[^>]+>/g, '')}</p>
              </div>
            )}

            <div className={styles.section}>
              <h3>Tags</h3>
              <div className={styles.tagsList}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tagChip}>
                    {renamingTag === tag ? (
                      <span className={styles.renameInline}>
                        <input
                          className={styles.renameInput}
                          value={renameInput}
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRenameTag()
                            if (e.key === 'Escape') handleCancelRename()
                          }}
                          autoFocus
                          disabled={renameLoading}
                        />
                        <button className={styles.renameConfirm} onClick={handleRenameTag} disabled={renameLoading}>{renameLoading ? '...' : 'OK'}</button>
                        <button className={styles.renameCancelBtn} onClick={handleCancelRename} disabled={renameLoading}><span className="neuro-icon neuro-icon-close" /></button>
                      </span>
                    ) : (
                      <>
                        {tag}
                        <button className={styles.renameBtn} onClick={() => handleStartRename(tag)} title="Rename this tag everywhere"><span className="neuro-icon neuro-icon-edit" /></button>
                        <button className={styles.tagX} onClick={() => handleRemoveTag(tag)}><span className="neuro-icon neuro-icon-close" /></button>
                      </>
                    )}
                  </span>
                ))}
              </div>
              {renameMsg && (
                <p className={renameMsg.startsWith('Renamed') ? styles.saveOk : styles.saveErr} style={{ fontSize: '0.78rem', marginTop: '4px', fontWeight: 600 }}>
                  {renameMsg}
                </p>
              )}
              <form
                className={styles.tagForm}
                onSubmit={(e) => { e.preventDefault(); handleAddTag() }}
              >
                <input
                  className={styles.tagInput}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Add tag..."
                />
                <button type="submit" className={styles.tagAddBtn} disabled={!tagInput.trim()}>+</button>
              </form>

              {tagSuggestions.length > 0 && (
                <div className={styles.tagSuggestions}>
                  {tagSuggestions.map((s) => (
                    <button
                      key={s.name}
                      className={`${styles.tagSuggestChip} ${!s.isMine ? styles.tagSuggestCommunity : ''}`}
                      onClick={() => {
                        const name = s.name.toLowerCase()
                        if (!tags.includes(name)) setTags((prev) => [...prev, name])
                        setTagInput('')
                      }}
                    >
                      {s.name}
                      {s.count > 0 && <span className={styles.tagSuggestCount}>{s.count}</span>}
                    </button>
                  ))}
                </div>
              )}

              {info.toptags?.tag && (Array.isArray(info.toptags.tag) ? info.toptags.tag : [info.toptags.tag]).length > 0 && (
                <button
                  className={styles.tagToggleBtn}
                  onClick={() => setShowAllTags((p) => !p)}
                >
                  {showAllTags ? 'Nur meine Tags' : 'Alle Tags anzeigen'}
                </button>
              )}
              <button
                className="neuro-btn neuro-btn-accent"
                onClick={handleSave}
                disabled={saving}
                style={{ marginTop: '14px', width: '100%' }}
              >
                {saving ? 'Saving...' : 'Update on Last.fm'}
              </button>
              {saveMsg && (
                <p className={`${styles.saveMsg} ${saveMsg.startsWith('✓') ? styles.saveOk : styles.saveErr}`}>
                  {saveMsg}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
