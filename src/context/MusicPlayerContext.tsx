import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { findBestSource, type MusicSource } from '../services/freeMusicSearch'

interface PlayerState {
  artist: string
  track: string
  source: MusicSource | null // null = still resolving
}

interface MusicPlayerCtx {
  isOpen: boolean
  artist: string | null
  track: string | null
  source: MusicSource | null
  resolving: boolean   // true = still searching for a video
  openPlayer: (artist: string, track: string) => void
  closePlayer: () => void
}

const MusicPlayerContext = createContext<MusicPlayerCtx | null>(null)

export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PlayerState | null>(null)

  const openPlayer = useCallback((artist: string, track: string) => {
    setState((prev) => {
      // Same track already playing — don't interrupt
      if (
        prev?.artist === artist &&
        prev?.track === track &&
        prev?.source?.type === 'youtube'
      ) {
        return prev
      }
      return { artist, track, source: null }
    })

    // Resolve source asynchronously — fast YouTube search via proxy
    findBestSource(artist, track).then((source) => {
      setState((prev) => {
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

  return (
    <MusicPlayerContext.Provider
      value={{
        isOpen: !!state,
        artist: state?.artist ?? null,
        track: state?.track ?? null,
        source: state?.source ?? null,
        resolving: !!state && state.source === null,
        openPlayer,
        closePlayer,
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
