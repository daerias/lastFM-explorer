// ============================================================
// Cinematic LUT Store — 8 famous color grades + Depth of Field
// ============================================================

export interface LutPreset {
  id: string
  label: string
  icon: string
  desc: string
  /** CSS filter chain applied to #root (invert/sepia/saturate/hue-rotate etc.) */
  filter: string
  /** Optional ::after overlay with mix-blend-mode for advanced grading */
  overlay?: string
  blendMode?: string
}

export const LUT_PRESETS: LutPreset[] = [
  {
    id: 'none',
    label: 'None',
    icon: '⬜',
    desc: 'No color grading — pure original',
    filter: 'none',
  },
  {
    id: 'teal-orange',
    label: 'Teal & Orange',
    icon: '🎬',
    desc: 'Hollywood blockbuster — warm skin, cool shadows',
    filter: 'contrast(1.1) saturate(1.15)',
    overlay: 'linear-gradient(180deg, rgba(0,180,200,0.08) 0%, rgba(200,120,40,0.06) 100%)',
    blendMode: 'overlay',
  },
  {
    id: 'matrix',
    label: 'Matrix',
    icon: '🟢',
    desc: 'Neon green tint, crushed blacks, digital rain vibe',
    filter: 'contrast(1.25) saturate(0.7) brightness(0.9)',
    overlay: 'linear-gradient(180deg, rgba(0,255,100,0.1) 0%, rgba(0,60,20,0.05) 100%)',
    blendMode: 'overlay',
  },
  {
    id: 'wes-anderson',
    label: 'Wes Anderson',
    icon: '🎨',
    desc: 'Pastel warmth, symmetrical softness, slight desaturation',
    filter: 'saturate(0.75) brightness(1.05) contrast(0.95)',
    overlay: 'linear-gradient(180deg, rgba(255,200,150,0.06) 0%, rgba(255,180,120,0.04) 100%)',
    blendMode: 'overlay',
  },
  {
    id: 'noir',
    label: 'Noir',
    icon: '🕶️',
    desc: 'Black & white, high contrast, film grain mood',
    filter: 'grayscale(1) contrast(1.3) brightness(0.85)',
  },
  {
    id: 'vintage-70s',
    label: 'Vintage 70s',
    icon: '📸',
    desc: 'Warm fade, sepia warmth, slight glow',
    filter: 'sepia(0.2) saturate(0.8) contrast(0.95) brightness(1.05)',
    overlay: 'linear-gradient(180deg, rgba(255,200,100,0.05) 0%, rgba(200,150,80,0.04) 100%)',
    blendMode: 'overlay',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    icon: '🌃',
    desc: 'Neon blue/purple, crushed blacks, high contrast',
    filter: 'contrast(1.2) saturate(1.3) brightness(0.9)',
    overlay: 'linear-gradient(180deg, rgba(80,20,180,0.1) 0%, rgba(0,180,220,0.06) 100%)',
    blendMode: 'overlay',
  },
  {
    id: 'bleach-bypass',
    label: 'Bleach Bypass',
    icon: '🥈',
    desc: 'Desaturated silver, high contrast, metallic sheen',
    filter: 'saturate(0.3) contrast(1.35) brightness(0.95)',
    overlay: 'linear-gradient(180deg, rgba(180,180,180,0.05) 0%, rgba(100,100,100,0.04) 100%)',
    blendMode: 'overlay',
  },
  {
    id: 'copper',
    label: 'Copper',
    icon: '🪙',
    desc: 'Warm metallic browns, rich golden undertones',
    filter: 'sepia(0.25) saturate(0.9) contrast(1.05) brightness(1.02) hue-rotate(-5deg)',
    overlay: 'linear-gradient(180deg, rgba(200,140,60,0.06) 0%, rgba(140,80,30,0.04) 100%)',
    blendMode: 'overlay',
  },
]

// ── Depth of Field ──

export interface DofSettings {
  enabled: boolean
  intensity: number // 0–100 (blur amount at edges)
  focusPoint: number // 0–100 (50 = center focused, 0 = top, 100 = bottom)
}

export const DOF_DEFAULTS: DofSettings = {
  enabled: false,
  intensity: 20,
  focusPoint: 50,
}

// ── localStorage keys ──

const LUT_KEY = 'lastfm_lut'
const DOF_KEY = 'lastfm_dof'
export const CINEMATIC_CHANGE_EVENT = 'cinematic-changed'

// ── Store functions ──

export function getActiveLut(): string {
  try {
    const stored = localStorage.getItem(LUT_KEY)
    if (stored && LUT_PRESETS.some(l => l.id === stored)) return stored
  } catch {}
  return 'none'
}

export function setActiveLut(id: string): void {
  try { localStorage.setItem(LUT_KEY, id) } catch {}
  applyLut(id)
  window.dispatchEvent(new CustomEvent(CINEMATIC_CHANGE_EVENT))
}

export function getDofSettings(): DofSettings {
  try {
    const stored = localStorage.getItem(DOF_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as DofSettings
      if (
        typeof parsed.enabled === 'boolean' &&
        parsed.intensity >= 0 && parsed.intensity <= 100 &&
        parsed.focusPoint >= 0 && parsed.focusPoint <= 100
      ) {
        // Migration: cap old high-intensity stored values, disable if extreme
        if (parsed.intensity > 50) {
          parsed.enabled = false
          parsed.intensity = 20
          try { localStorage.setItem(DOF_KEY, JSON.stringify(parsed)) } catch {}
        } else if (parsed.intensity > 30) {
          parsed.intensity = 30
          try { localStorage.setItem(DOF_KEY, JSON.stringify(parsed)) } catch {}
        }
        return parsed
      }
    }
  } catch {}
  return { ...DOF_DEFAULTS }
}

export function setDofSettings(dof: DofSettings): void {
  try { localStorage.setItem(DOF_KEY, JSON.stringify(dof)) } catch {}
  applyDof(dof)
  window.dispatchEvent(new CustomEvent(CINEMATIC_CHANGE_EVENT))
}

export function onCinematicChange(callback: () => void): () => void {
  const handler = () => callback()
  window.addEventListener(CINEMATIC_CHANGE_EVENT, handler)
  return () => window.removeEventListener(CINEMATIC_CHANGE_EVENT, handler)
}

// ── Apply to DOM ──

export function applyLut(id: string): void {
  const preset = LUT_PRESETS.find(l => l.id === id)
  if (!preset || id === 'none') {
    document.documentElement.removeAttribute('data-lut')
    return
  }
  document.documentElement.setAttribute('data-lut', id)
}

export function applyDof(dof: DofSettings): void {
  if (dof.enabled) {
    document.documentElement.setAttribute('data-dof', 'on')
    document.documentElement.style.setProperty('--dof-intensity', String(dof.intensity))
    document.documentElement.style.setProperty('--dof-focus', String(dof.focusPoint))
    document.documentElement.style.setProperty('--dof-blur', `${dof.intensity * 0.03}px`)
  } else {
    document.documentElement.removeAttribute('data-dof')
  }
}

export function resetAllCinematic(): void {
  try { localStorage.removeItem(LUT_KEY) } catch {}
  try { localStorage.removeItem(DOF_KEY) } catch {}
  applyLut('none')
  applyDof(DOF_DEFAULTS)
  window.dispatchEvent(new CustomEvent(CINEMATIC_CHANGE_EVENT))
}

// ── Full apply ──

export function applyAllCinematic(): void {
  applyLut(getActiveLut())
  applyDof(getDofSettings())
}
