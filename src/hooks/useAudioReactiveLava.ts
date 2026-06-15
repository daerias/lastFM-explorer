import { useRef, useEffect, useCallback } from 'react'
import { useMusicPlayer } from '../context/MusicPlayerContext'

export interface AudioBands {
  bass: number   // 0..1 — low frequency energy
  mid: number    // 0..1 — mid frequency energy
  treble: number // 0..1 — high frequency energy
  beat: number   // 0..1 — beat/kick intensity (spikes on beat)
  energy: number // 0..1 — overall energy
}

interface UseAudioReactiveLavaOptions {
  /** Whether audio reactivity is enabled (opt-in) */
  enabled: boolean
  /** Base BPM for simulated beat detection */
  bpm?: number
}

/**
 * Generates simulated audio-reactive frequency bands and beat detection
 * using musical sine-wave combinations that feel organic.
 * 
 * Only active when the MusicPlayer is playing and `enabled` is true.
 * 
 * Returns a ref to attach to the lava element. CSS custom properties
 * (--lava-bass, --lava-mid, --lava-treble, --lava-beat, --lava-energy)
 * are set directly on the DOM element every animation frame — no React
 * re-renders needed.
 */
export function useAudioReactiveLava({ enabled, bpm = 120 }: UseAudioReactiveLavaOptions) {
  const { isOpen: musicPlaying } = useMusicPlayer()
  const isActive = enabled && musicPlaying
  const elRef = useRef<HTMLElement | null>(null)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const beatPhaseRef = useRef<number>(Math.random() * Math.PI * 2)

  const updateBands = useCallback((now: number) => {
    if (!startRef.current) startRef.current = now
    const elapsed = (now - startRef.current) / 1000 // seconds
    const bps = bpm / 60 // beats per second
    const beatDuration = 1 / bps
    const beatPhase = (elapsed % beatDuration) / beatDuration // 0..1 within current beat

    // Beat detection: sharp attack, fast decay — simulates kick drum
    const beatRaw = beatPhase < 0.1
      ? Math.sin((beatPhase / 0.1) * Math.PI)  // attack curve
      : Math.exp(-(beatPhase - 0.1) * 8) * 0.4  // decay
    const beat = Math.max(0, beatRaw)

    // Bass (0-0.3 range): slow, heavy sine — like bassline
    const bassFreq = bps * 0.5  // half-beat bass pattern
    const bass = (
      0.5 + 0.5 * Math.sin(elapsed * Math.PI * 2 * bassFreq + beatPhaseRef.current)
    ) * (0.6 + beat * 0.4)

    // Mid (0.3-0.6 range): chord-like sines — pads/synths
    const midFreq1 = bps * 1.0
    const midFreq2 = bps * 1.33
    const mid = (
      0.35 +
      0.15 * Math.sin(elapsed * Math.PI * 2 * midFreq1 + 1.2) +
      0.15 * Math.sin(elapsed * Math.PI * 2 * midFreq2 + 2.8) +
      0.1 * Math.sin(elapsed * Math.PI * 2 * bps * 0.75 + 0.5) +
      beat * 0.25
    )

    // Treble (0.6-1.0 range): fast hi-hat/percussion patterns
    const trebleFreq1 = bps * 4  // 16th notes
    const trebleFreq2 = bps * 2  // 8th notes
    const treble = (
      0.3 +
      0.2 * Math.sin(elapsed * Math.PI * 2 * trebleFreq1 + beatPhaseRef.current * 3) +
      0.15 * Math.sin(elapsed * Math.PI * 2 * trebleFreq2 + 4.1) +
      0.1 * Math.sin(elapsed * Math.PI * 2 * bps * 6 + 1.7) +
      (beatPhase < 0.05 ? 0.25 : 0)
    )

    // Energy: overall loudness
    const energy = bass * 0.4 + mid * 0.35 + treble * 0.25

    const el = elRef.current
    if (el) {
      el.style.setProperty('--lava-bass', String(Math.max(0, Math.min(1, bass))))
      el.style.setProperty('--lava-mid', String(Math.max(0, Math.min(1, mid))))
      el.style.setProperty('--lava-treble', String(Math.max(0, Math.min(1, treble))))
      el.style.setProperty('--lava-beat', String(Math.max(0, Math.min(1, beat))))
      el.style.setProperty('--lava-energy', String(Math.max(0, Math.min(1, energy))))
    }
  }, [bpm])

  useEffect(() => {
    if (!isActive) {
      // Fade to zero when inactive
      const el = elRef.current
      if (el) {
        el.style.setProperty('--lava-bass', '0')
        el.style.setProperty('--lava-mid', '0')
        el.style.setProperty('--lava-treble', '0')
        el.style.setProperty('--lava-beat', '0')
        el.style.setProperty('--lava-energy', '0')
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
      startRef.current = 0
      return
    }

    beatPhaseRef.current = Math.random() * Math.PI * 2
    startRef.current = 0

    const loop = (now: number) => {
      updateBands(now)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      startRef.current = 0
    }
  }, [isActive, updateBands])

  return elRef
}
