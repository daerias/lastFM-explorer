import { useRef, useEffect, useCallback } from 'react'

export interface MicBands {
  bass: number
  mid: number
  treble: number
  beat: number
  energy: number
}

interface UseMicrophoneReactivityOptions {
  /** Whether mic capture is enabled */
  enabled: boolean
  /** Sensitivity multiplier (0.5 = less reactive, 2 = very jumpy) */
  sensitivity?: number
}

/**
 * Captures real microphone input via getUserMedia + Web Audio API.
 * Runs real-time FFT analysis (AnalyserNode) to extract frequency bands.
 * 
 * Sets CSS custom properties on the returned ref element every frame:
 *   --lava-bass, --lava-mid, --lava-treble, --lava-beat, --lava-energy
 * 
 * Works alongside or replaces useAudioReactiveLava.
 * 
 * Handles:
 * - Permission denied (calls onPermissionDenied)
 * - Browser not supporting getUserMedia
 * - Cleanup on unmount / disable
 * 
 * Privacy: audio is processed locally, never sent anywhere.
 */
export function useMicrophoneReactivity({
  enabled,
  sensitivity = 1,
}: UseMicrophoneReactivityOptions) {
  const elRef = useRef<HTMLElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  // Track previous energy for beat detection
  const prevEnergyRef = useRef<number>(0)
  const beatHoldRef = useRef<number>(0)

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    analyserRef.current = null
    // Fade CSS props to zero
    const el = elRef.current
    if (el) {
      el.style.setProperty('--lava-bass', '0')
      el.style.setProperty('--lava-mid', '0')
      el.style.setProperty('--lava-treble', '0')
      el.style.setProperty('--lava-beat', '0')
      el.style.setProperty('--lava-energy', '0')
    }
  }, [])

  useEffect(() => {
    if (!enabled) {
      cleanup()
      return
    }

    // Reset previous energy on re-enable
    prevEnergyRef.current = 0
    beatHoldRef.current = 0

    const startMic = async () => {
      try {
        // Request mic access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          },
        })
        streamRef.current = stream

        // Set up Web Audio graph: Mic → Analyser
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256 // Small FFT = faster, enough for 3 bands
        analyser.smoothingTimeConstant = 0.4 // Some smoothing for organic feel
        analyserRef.current = analyser

        const source = ctx.createMediaStreamSource(stream)
        source.connect(analyser)
        // Don't connect to destination — we don't play the mic audio back!
        sourceRef.current = source

        const bufferLength = analyser.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)

        // Beat detection state
        let beatActive = false
        let beatDecay = 0

        const loop = () => {
          analyser.getByteFrequencyData(dataArray)

          // Divide frequency bins into 3 bands
          const third = Math.floor(bufferLength / 3)
          let bassSum = 0, midSum = 0, trebleSum = 0

          for (let i = 0; i < third; i++) bassSum += dataArray[i]
          for (let i = third; i < third * 2; i++) midSum += dataArray[i]
          for (let i = third * 2; i < bufferLength; i++) trebleSum += dataArray[i]

          // Normalize to 0–1
          const maxVal = 255 * third
          const bass = Math.min(1, (bassSum / maxVal) * sensitivity * 1.8)
          const mid = Math.min(1, (midSum / maxVal) * sensitivity * 1.4)
          const treble = Math.min(1, (trebleSum / maxVal) * sensitivity * 1.2)

          // Energy = weighted average
          const energy = bass * 0.5 + mid * 0.3 + treble * 0.2

          // Beat detection: sharp energy rise triggers beat
          const energyDelta = energy - prevEnergyRef.current
          if (energyDelta > 0.15 && !beatActive) {
            beatActive = true
            beatDecay = 1
          }
          if (beatActive) {
            beatDecay *= 0.85 // Fast decay
            if (beatDecay < 0.02) {
              beatActive = false
              beatDecay = 0
            }
          }
          prevEnergyRef.current = energy
          const beat = Math.max(0, Math.min(1, beatDecay * energy * 1.5))

          // Write CSS custom properties
          const el = elRef.current
          if (el) {
            el.style.setProperty('--lava-bass', bass.toFixed(3))
            el.style.setProperty('--lava-mid', mid.toFixed(3))
            el.style.setProperty('--lava-treble', treble.toFixed(3))
            el.style.setProperty('--lava-beat', beat.toFixed(3))
            el.style.setProperty('--lava-energy', energy.toFixed(3))
          }

          rafRef.current = requestAnimationFrame(loop)
        }

        loop()
      } catch (err) {
        // Permission denied or not supported
        console.warn('Microphone access denied or not available:', err)
        // Dispatch event so UI can show feedback
        window.dispatchEvent(new CustomEvent('mic-permission-denied'))
        cleanup()
      }
    }

    startMic()

    return () => {
      cleanup()
    }
  }, [enabled, sensitivity, cleanup])

  return elRef
}
