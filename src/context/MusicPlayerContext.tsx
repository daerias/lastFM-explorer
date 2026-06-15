import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { findBestSource, type MusicSource } from '../services/freeMusicSearch'

interface PlayerState {
  artist: string
  track: string
  source: MusicSource | null // null = still checking
}

interface MusicPlayerCtx {
  isOpen: boolean
  artist: string | null
  track: string | null
  source: MusicSource | null
  checking: boolean
  openPlayer: (artist: string, track: string) => void
  closePlayer: () => void
  forceSource: (source: MusicSource) => void
}

const MusicPlayerContext = createContext<MusicPlayerCtx | null>(null)

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState | null>(null)

  const openPlayer = useCallback((artist: string, track: string) => {
    setState((prev) => {
      // 🚨 FIX #2: If the same track is already playing, don't reset source to null —
      // that would unmount the iframe and restart playback.
      if (prev?.artist === artist && prev?.track === track && prev?.source !== null) {
        return prev
      }
      return { artist, track, source: null }
    })

    // Check sources in the background
    findBestSource(artist, track).then((source) => {
      setState((prev) => {
        // Only update if still the same track AND user hasn't manually switched source
        if (prev?.artist === artist && prev?.track === track && prev?.source === null) {
          return { artist, track, source }
        }
        return prev
      })
    })
  }, [])

  const closePlayer = useCallback(() => {
    setState(null)
  }, [])

  const forceSource = useCallback((source: MusicSource) => {
    setState((prev) => {
      if (!prev) return prev
      return { ...prev, source }
    })
  }, [])

  return (
    <MusicPlayerContext.Provider
      value={{
        isOpen: !!state,
        artist: state?.artist ?? null,
        track: state?.track ?? null,
        source: state?.source ?? null,
        checking: !!state && !state?.source,
        openPlayer,
        closePlayer,
        forceSource,
      }}
    >
      {children}
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer(): MusicPlayerCtx {
  const ctx = useContext(MusicPlayerContext)
  if (!ctx) throw new Error('useMusicPlayer must be used within MusicPlayerProvider')
  return ctx
}
