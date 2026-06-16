import { useState, useEffect, useRef, useCallback } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useMusicPlayer } from '../../context/MusicPlayerContext'
import { getUserInfo, getTrackTags, addTrackTags, removeTrackTag, getUserTopTags } from '../../services/lastfm'
import styles from './Sidebar.module.css'

const PIN_STORAGE_KEY = 'lastfm_sidebar_pinned'
const PLAYLIST_LS_KEY = 'lastfm-playlists'

function getPinned(): boolean {
  try { return localStorage.getItem(PIN_STORAGE_KEY) === 'true' } catch { return false }
}
function setPinnedStorage(v: boolean): void {
  try { localStorage.setItem(PIN_STORAGE_KEY, String(v)) } catch {}
}

function getPlaylistCount(): number {
  try {
    const raw = localStorage.getItem(PLAYLIST_LS_KEY)
    if (!raw) return 0
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch { return 0 }
}

interface NavItem {
  to: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { to: '/',          label: 'Home',     icon: 'home' },
  { to: '/library',   label: 'Library',  icon: 'library' },
  { to: '/tags',      label: 'Tags',     icon: 'tags' },
  { to: '/settings',  label: 'Settings', icon: 'settings' },
]

function triggerPlaylistCreator() {
  window.dispatchEvent(new Event('toggle-playlist-creator'))
}

export default function Sidebar() {
  const { isAuthenticated, username, login } = useAuth()
  const { isOpen: musicPlaying, resolving, artist: currentArtist, track: currentTrack } = useMusicPlayer()
  const isMusicActive = musicPlaying && !resolving
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFallback, setAvatarFallback] = useState<string | null>(null)
  // Now Playing tag editor
  const [nowPlayingTags, setNowPlayingTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [tagSuggestions, setTagSuggestions] = useState<{ name: string; count: number }[]>([])
  const [tagsLoading, setTagsLoading] = useState(false)
  const [tagSaving, setTagSaving] = useState<string | null>(null) // tag being added/removed
  const [focusedSuggestion, setFocusedSuggestion] = useState(-1) // keyboard nav
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(getPinned)
  const [crystalAnim, setCrystalAnim] = useState<'idle' | 'activating' | 'deactivating'>('idle')
  const [playlistCount, setPlaylistCount] = useState(getPlaylistCount)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const animTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Fetch real Last.fm avatar on mount
  useEffect(() => {
    if (!isAuthenticated || !username) return
    let cancelled = false
    getUserInfo(username).then((info) => {
      if (cancelled || !info) return
      const images = info.image
      if (images && images.length > 0) {
        // Prefer animated GIF — look for .gif in URL, then extralarge, then medium
        const gif = images.find((i) => i['#text'].toLowerCase().includes('.gif'))
        const extralarge = images.find((i) => i.size === 'extralarge')
        const medium = images.find((i) => i.size === 'medium')
        const best = gif || extralarge || medium || images[images.length - 1]
        if (best['#text']) {
          let url = best['#text']
          // If using medium (no GIF/extralarge), upgrade resolution
          if (!gif && !extralarge && medium && medium['#text']) {
            url = medium['#text'].replace(/\/\d+s\//, '/300s/')
          }
          // Store static fallback in case the GIF attempt fails
          setAvatarFallback(url)
          // If no GIF found in API, try the avatar300s GIF path (Last.fm CDN stores GIFs separately)
          if (!gif) {
            const hash = url.match(/\/([a-f0-9]{10,})\.[^.]+$/i)?.[1]
            if (hash) {
              setAvatarUrl(`https://lastfm.freetls.fastly.net/i/u/avatar300s/${hash}.gif`)
            } else {
              setAvatarUrl(url)
            }
          } else {
            setAvatarUrl(url)
          }
        }
      }
    }).catch(() => {})
    return () => { cancelled = true }
  }, [username, isAuthenticated])

  // Load tag suggestions (user's top tags)
  useEffect(() => {
    if (!isAuthenticated || !username) return
    getUserTopTags(username, 500).then(setTagSuggestions).catch(() => setTagSuggestions([]))
  }, [username, isAuthenticated])

  // Fetch current track tags when Now Playing changes
  useEffect(() => {
    if (!isAuthenticated || !username || !currentArtist || !currentTrack) {
      setNowPlayingTags([])
      return
    }
    let cancelled = false
    setTagsLoading(true)
    // Don't clear existing tags — prevents flash between tracks
    getTrackTags(currentArtist, currentTrack, username)
      .then((tags) => {
        if (!cancelled) setNowPlayingTags(tags.map((t) => t.name))
      })
      .catch(() => { /* keep existing tags on error */ })
      .finally(() => { if (!cancelled) setTagsLoading(false) })
    return () => { cancelled = true }
  }, [currentArtist, currentTrack, username, isAuthenticated])

  const handleAddTag = async (tag: string) => {
    if (!currentArtist || !currentTrack || !tag.trim()) return
    const trimmed = tag.trim()
    if (nowPlayingTags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return
    setTagSaving(trimmed)
    setFocusedSuggestion(-1)
    try {
      await addTrackTags(currentArtist, currentTrack, [trimmed])
      setNowPlayingTags((prev) => [...prev, trimmed])
      setTagInput('')
    } catch { /* silently fail */ }
    finally { setTagSaving(null) }
  }

  const handleRemoveTag = async (tag: string) => {
    if (!currentArtist || !currentTrack) return
    setTagSaving(tag)
    try {
      await removeTrackTag(currentArtist, currentTrack, tag)
      setNowPlayingTags((prev) => prev.filter((t) => t !== tag))
    } catch { /* silently fail */ }
    finally { setTagSaving(null) }
  }

  // Filtered suggestions based on input
  const filteredSuggestions = tagInput.trim()
    ? tagSuggestions
        .filter((s) =>
          s.name.toLowerCase().includes(tagInput.toLowerCase()) &&
          !nowPlayingTags.some((t) => t.toLowerCase() === s.name.toLowerCase())
        )
        .slice(0, 6)
    : tagSuggestions
        .filter((s) => !nowPlayingTags.some((t) => t.toLowerCase() === s.name.toLowerCase()))
        .slice(0, 4)

  // Reset focused suggestion when input or suggestions change
  useEffect(() => {
    setFocusedSuggestion(-1)
  }, [tagInput])

  const handleTagInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (focusedSuggestion >= 0 && focusedSuggestion < filteredSuggestions.length) {
        handleAddTag(filteredSuggestions[focusedSuggestion].name)
      } else {
        handleAddTag(tagInput)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedSuggestion((prev) =>
        prev < filteredSuggestions.length - 1 ? prev + 1 : 0
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedSuggestion((prev) =>
        prev > 0 ? prev - 1 : filteredSuggestions.length - 1
      )
    } else if (e.key === 'Escape') {
      setTagInput('')
      setFocusedSuggestion(-1)
    }
  }

  // Listen for playlist changes (localStorage updates from PlaylistCreator)
  useEffect(() => {
    const handler = () => setPlaylistCount(getPlaylistCount())
    window.addEventListener('storage', handler)
    // Also poll for same-tab changes (PlaylistCreator saves to same origin)
    const interval = setInterval(() => {
      const current = getPlaylistCount()
      setPlaylistCount((prev) => prev !== current ? current : prev)
    }, 2000)
    return () => {
      window.removeEventListener('storage', handler)
      clearInterval(interval)
    }
  }, [])
  useEffect(() => () => {
    clearTimeout(hoverTimer.current)
    clearTimeout(animTimer.current)
  }, [])

  const onMouseEnter = () => {
    if (pinned) return
    clearTimeout(hoverTimer.current)
    setHovered(true)
  }
  const onMouseLeave = () => {
    if (pinned) return
    hoverTimer.current = setTimeout(() => setHovered(false), 400)
  }

  const togglePin = useCallback(() => {
    clearTimeout(animTimer.current)
    const nextPinned = !pinned
    setPinned(nextPinned)
    setPinnedStorage(nextPinned)
    setCrystalAnim(nextPinned ? 'activating' : 'deactivating')

    if (nextPinned) {
      setHovered(true)
      animTimer.current = setTimeout(() => setCrystalAnim('idle'), 800)
    } else {
      animTimer.current = setTimeout(() => {
        setHovered(false)
        setCrystalAnim('idle')
      }, 600)
    }
  }, [pinned])

  const expanded = hovered || pinned
  const profileUrl = username ? `https://www.last.fm/user/${encodeURIComponent(username)}` : '#'

  return (
    <aside
      className={`${styles.sidebar} ${expanded ? styles.expanded : ''}`}
      data-expanded={expanded ? 'true' : 'false'}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Brand */}
      <div className={styles.brand}>
        <span className={styles.brandGlow} />
        <span className={styles.brandIcon}>
          <span className="neuro-icon neuro-icon-brand">
            <span className={styles.brandSpark} />
            <span className={styles.brandParticle} />
            <span className={styles.brandParticle} />
            <span className={styles.brandParticle} />
          </span>
        </span>
        <span className={styles.brandLabel}>Explorer</span>
      </div>

      {/* Navigation — floating glass cards */}
      <nav className={styles.nav}>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
            }
          >
            <span className={styles.navIconWrap}>
              <span className={`neuro-icon neuro-icon-${item.icon}`} />
            </span>
            <span className={styles.navLabel}>{item.label}</span>
          </NavLink>
        ))}

        {/* Playlist Creator trigger */}
        <button
          className={`${styles.navItem} ${styles.navItemPlaylist}`}
          onClick={triggerPlaylistCreator}
          title="Open Playlist Creator (Ctrl+P)"
        >
          <span className={styles.navIconWrap}>
            <span className={styles.playlistNavIcon}>🎧</span>
          </span>
          <span className={styles.navLabel}>Playlists</span>
          {playlistCount > 0 && (
            <span className={styles.playlistCountBadge}>{playlistCount}</span>
          )}
        </button>
      </nav>

      {/* ── Now Playing + Tag Editor ── */}
      {musicPlaying && currentArtist && currentTrack && (
        <div className={styles.nowPlaying}>
          <div className={styles.nowPlayingHeader}>
            <div className={styles.nowPlayingBars}>
              <span className={styles.nowPlayingBar} />
              <span className={styles.nowPlayingBar} />
              <span className={styles.nowPlayingBar} />
              <span className={styles.nowPlayingBar} />
            </div>
            <div className={styles.nowPlayingInfo}>
              <span className={styles.nowPlayingTrack}>{currentTrack}</span>
              <span className={styles.nowPlayingArtist}>{currentArtist}</span>
            </div>
          </div>

          {/* Tag editor — visible when expanded */}
          <div className={styles.nowPlayingTags}>
            <span className={styles.nowPlayingTagLabel}>Tag this track</span>
            {tagsLoading && nowPlayingTags.length === 0 ? (
              <span className={styles.nowPlayingTagsLoading}>loading tags...</span>
            ) : (
              <>
                <div className={styles.nowPlayingTagChips}>
                  {nowPlayingTags.map((tag) => (
                    <span
                      key={tag}
                      className={`${styles.nowPlayingTagChip} ${tagSaving === tag ? styles.nowPlayingTagSaving : ''}`}
                    >
                      <span className={styles.nowPlayingTagName}>{tag}</span>
                      <button
                        className={styles.nowPlayingTagRemove}
                        onClick={(e) => { e.stopPropagation(); handleRemoveTag(tag) }}
                        disabled={tagsLoading || tagSaving === tag}
                        title={`Remove tag "${tag}"`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className={styles.nowPlayingTagAddRow}>
                  <input
                    className={styles.nowPlayingTagInput}
                    type="text"
                    placeholder="+ add tag…"
                    aria-label="Add tag to current track"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagInputKeyDown}
                    disabled={!!tagSaving}
                  />
                  {tagInput.trim() && focusedSuggestion < 0 && (
                    <button
                      className={styles.nowPlayingTagAddBtn}
                      onClick={() => handleAddTag(tagInput)}
                      disabled={!!tagSaving}
                    >
                      +
                    </button>
                  )}
                </div>
                {/* Smart suggestions dropdown */}
                {filteredSuggestions.length > 0 && (
                  <div className={styles.nowPlayingTagSuggestions} role="listbox">
                    {filteredSuggestions.map((s, i) => (
                      <button
                        key={s.name}
                        className={`${styles.nowPlayingTagSuggestion} ${i === focusedSuggestion ? styles.nowPlayingTagSuggestionFocused : ''}`}
                        onClick={() => handleAddTag(s.name)}
                        disabled={!!tagSaving}
                        role="option"
                        aria-selected={i === focusedSuggestion}
                      >
                        <span className={styles.nowPlayingTagSuggestionName}>{s.name}</span>
                        <span className={styles.nowPlayingTagSuggestionCount}>{s.count}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Neon Crystal Lock ── */}

      {/* ── Neon Crystal Lock ── */}
      <button
        className={`${styles.crystalLock} ${pinned ? styles.crystalLocked : ''} ${crystalAnim === 'activating' ? styles.crystalActivating : ''} ${crystalAnim === 'deactivating' ? styles.crystalDeactivating : ''}`}
        onClick={togglePin}
        title={pinned ? 'Unlock — let sidebar float' : 'Lock sidebar open'}
        aria-label={pinned ? 'Unlock sidebar' : 'Lock sidebar open'}
      >
        <span className={styles.crystalGem}>
          <span className={styles.crystalCore} />
          <span className={styles.crystalFacet1} />
          <span className={styles.crystalFacet2} />
          <span className={styles.crystalSpark} />
        </span>
        <span className={styles.crystalRays}>
          <span className={styles.crystalRay} />
          <span className={styles.crystalRay} />
          <span className={styles.crystalRay} />
          <span className={styles.crystalRay} />
        </span>
        <span className={styles.crystalParticles}>
          <span className={styles.crystalParticle} />
          <span className={styles.crystalParticle} />
          <span className={styles.crystalParticle} />
          <span className={styles.crystalParticle} />
          <span className={styles.crystalParticle} />
          <span className={styles.crystalParticle} />
        </span>
        <span className={styles.crystalLabel}>{pinned ? 'Unlock' : 'Lock'}</span>
      </button>

      {/* Footer */}
      <div className={styles.footer}>
        {/* LavaFM Profile button (authenticated) */}
        {isAuthenticated ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.lavaProfile} ${isMusicActive ? styles.lavaBeating : ''}`}
            ref={() => {}}
            title={`Open ${username} on Last.fm`}
          >
            {/* Lava blobs */}
            <span className={styles.lavaBlobs}>
              <span className={styles.lavaBlob} />
              <span className={styles.lavaBlob} />
              <span className={styles.lavaBlob} />
            </span>
            {/* Bubbles */}
            <span className={styles.lavaBubbles}>
              <span className={styles.lavaBubble} />
              <span className={styles.lavaBubble} />
              <span className={styles.lavaBubble} />
            </span>
            {/* Sacred geometry ripples */}
            <span className={styles.lavaRipples}>
              <span className={styles.lavaRipple} />
              <span className={styles.lavaRipple} />
            </span>
            {/* Content */}
            {avatarUrl ? (
              <span className={styles.lavaAvatar}>
                <img
                  src={avatarUrl}
                  alt={username ?? 'avatar'}
                  className={styles.lavaAvatarImg}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    // GIF attempt failed — fall back to static PNG
                    if (avatarFallback && e.currentTarget.src !== avatarFallback) {
                      e.currentTarget.src = avatarFallback
                    }
                  }}
                />
              </span>
            ) : (
              <span className={styles.lavaAvatar}>👤</span>
            )}
            <span className={styles.lavaUsername}>{username}</span>
            <span className={styles.lavaBadge}>Last.fm</span>
          </a>
        ) : (
          <button className={styles.loginBtn} onClick={login}>
            <span className="neuro-icon neuro-icon-play" />
            <span className={styles.loginLabel}>Login</span>
          </button>
        )}
      </div>
    </aside>
  )
}
