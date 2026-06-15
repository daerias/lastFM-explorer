// ============================================================
// Icon Style Store — 7 presets + fine-tuning
// Apple-easy: pick a style, tweak glow/size/speed
// ============================================================

export type IconStyle = 'neon' | 'glass' | 'minimal' | 'brutal' | 'retro' | 'sketch' | 'chrome'

export interface IconStyleMeta {
  value: IconStyle
  label: string
  icon: string
  desc: string
  preview: string // CSS gradient for preview card
}

export interface IconFineTune {
  glow: number     // 0–100
  size: number     // 75–150 (percentage)
  animSpeed: number // 0 (off), 0.5 (slow), 1 (normal), 2 (fast)
}

export const ICON_STYLES: IconStyleMeta[] = [
  {
    value: 'neon',
    label: 'Neon',
    icon: '⚡',
    desc: 'Cyberpunk glow, sharp edges, fast animations',
    preview: 'linear-gradient(135deg, #d418d4, #3bf07a)',
  },
  {
    value: 'glass',
    label: 'Glass',
    icon: '🫧',
    desc: 'Frosted glass, soft blur, subtle reflections',
    preview: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    icon: '◻️',
    desc: 'Flat colors, no shadows, clean precision',
    preview: 'linear-gradient(135deg, #888, #444)',
  },
  {
    value: 'brutal',
    label: 'Brutal',
    icon: '⬛',
    desc: 'Sharp geometric, no curves, stark mono',
    preview: 'linear-gradient(135deg, #fff, #000)',
  },
  {
    value: 'retro',
    label: 'Retro',
    icon: '👾',
    desc: 'Pixel corners, 8-bit feel, blocky charm',
    preview: 'linear-gradient(135deg, #ff6b6b, #ffd93d, #6bcb77, #4d96ff)',
  },
  {
    value: 'sketch',
    label: 'Sketch',
    icon: '✏️',
    desc: 'Hand-drawn, slight rotation, organic warmth',
    preview: 'linear-gradient(135deg, #c9a96e, #8b7355)',
  },
  {
    value: 'chrome',
    label: 'Chrome',
    icon: '🪩',
    desc: 'Metallic gradients, liquid reflections',
    preview: 'linear-gradient(135deg, #e8e8e8, #888, #444, #e8e8e8)',
  },
]

// ── Default fine-tune per style ──

const DEFAULTS: Record<IconStyle, IconFineTune> = {
  neon:    { glow: 100, size: 100, animSpeed: 1 },
  glass:   { glow: 40,  size: 105, animSpeed: 0.5 },
  minimal: { glow: 0,   size: 90,  animSpeed: 0 },
  brutal:  { glow: 0,   size: 85,  animSpeed: 0 },
  retro:   { glow: 30,  size: 95,  animSpeed: 0.5 },
  sketch:  { glow: 15,  size: 100, animSpeed: 0.5 },
  chrome:  { glow: 60,  size: 100, animSpeed: 1 },
}

// ── localStorage keys ──

const STYLE_KEY = 'lastfm_icon_style'
const FINE_TUNE_KEY = 'lastfm_icon_finetune'
const DEFAULT_STYLE: IconStyle = 'neon'
export const ICON_CHANGE_EVENT = 'icon-style-changed'

// ── Store functions ──

export function getIconStyle(): IconStyle {
  try {
    const stored = localStorage.getItem(STYLE_KEY)
    if (stored && ICON_STYLES.some(s => s.value === stored)) return stored as IconStyle
  } catch {}
  return DEFAULT_STYLE
}

export function setIconStyle(style: IconStyle): void {
  try { localStorage.setItem(STYLE_KEY, style) } catch {}
  applyIconStyle(style)
  window.dispatchEvent(new CustomEvent<IconStyle>(ICON_CHANGE_EVENT, { detail: style }))
}

export function getFineTune(): IconFineTune {
  try {
    const stored = localStorage.getItem(FINE_TUNE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as IconFineTune
      // Validate ranges
      if (
        parsed.glow >= 0 && parsed.glow <= 100 &&
        parsed.size >= 75 && parsed.size <= 150 &&
        [0, 0.5, 1, 2].includes(parsed.animSpeed)
      ) return parsed
    }
  } catch {}
  return DEFAULTS[getIconStyle()]
}

export function setFineTune(ft: IconFineTune): void {
  try { localStorage.setItem(FINE_TUNE_KEY, JSON.stringify(ft)) } catch {}
  applyFineTune(ft)
  window.dispatchEvent(new CustomEvent(ICON_CHANGE_EVENT))
}

export function onIconStyleChange(callback: () => void): () => void {
  const handler = () => callback()
  window.addEventListener(ICON_CHANGE_EVENT, handler)
  return () => window.removeEventListener(ICON_CHANGE_EVENT, handler)
}

// ── Apply to DOM ──

export function applyIconStyle(style: IconStyle): void {
  document.documentElement.setAttribute('data-icon-style', style)
}

export function applyFineTune(ft: IconFineTune): void {
  document.documentElement.style.setProperty('--icon-glow', String(ft.glow / 100))
  document.documentElement.style.setProperty('--icon-size-mult', String(ft.size / 100))
  document.documentElement.style.setProperty('--icon-anim-speed', String(ft.animSpeed))
  // Derived properties
  const animMult = ft.animSpeed === 0 ? '0' : String(1 / ft.animSpeed)
  document.documentElement.style.setProperty('--icon-anim-mult', animMult)
  document.documentElement.style.setProperty('--icon-anim-state', ft.animSpeed === 0 ? 'paused' : 'running')
}

// ── Full apply (style + fine-tune) ──

export function applyAllIconSettings(): void {
  const style = getIconStyle()
  const ft = getFineTune()
  applyIconStyle(style)
  applyFineTune(ft)
}

// ── Reset fine-tune to style defaults ──

export function resetFineTune(style: IconStyle): void {
  setFineTune(DEFAULTS[style])
}
