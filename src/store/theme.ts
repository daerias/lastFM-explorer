/* ── 5 Premium Themes — Plastic Neumorphism ── */

export type Theme = 'dark' | 'light' | 'teal' | 'crimson' | 'golden'

/* ── Effect types (preserved for fine-tuning) ── */

export type AnimSpeed = 0.5 | 1 | 2
export type GlassLevel = 'low' | 'normal' | 'high'
export type NoiseLevel = 'off' | 'subtle' | 'heavy'
export type ScanlineMode = 'off' | 'on'
export type ChromaticMode = 'off' | 'on'
export type VignetteLevel = 'off' | 'subtle' | 'heavy'
export type ParticleDensity = 'sparse' | 'normal' | 'dense'
export type GlowBoost = 'normal' | 'boosted' | 'max'
export type BorderPulseMode = 'off' | 'on'
export type Depth3D = 'off' | 'subtle' | 'strong'

export interface ThemeEffects {
  animSpeed: AnimSpeed
  glassLevel: GlassLevel
  noise: NoiseLevel
  scanlines: ScanlineMode
  chromatic: ChromaticMode
  vignette: VignetteLevel
  particles: ParticleDensity
  glow: GlowBoost
  borderPulse: BorderPulseMode
  depth3D: Depth3D
}

export interface ThemeProfile {
  id: string
  name: string
  baseTheme: Theme
  effects: ThemeEffects
  isCustom: boolean
}

/* ── Theme metadata ── */

export interface ThemeMeta {
  value: Theme
  label: string
  icon: string
  desc: string
  category: 'core'
  defaultEffects: ThemeEffects
}

/* ── Default effects ── */

const FX: ThemeEffects = {
  animSpeed: 1, glassLevel: 'normal',
  noise: 'off', scanlines: 'off', chromatic: 'off',
  vignette: 'off', particles: 'sparse', glow: 'normal', borderPulse: 'off',
  depth3D: 'subtle',
}

export const ALL_THEMES: ThemeMeta[] = [
  { value: 'dark', label: 'Dark', icon: '🌚', desc: 'Deep warm charcoal — velvet depth, glowing coral', category: 'core', defaultEffects: { ...FX } },
  { value: 'light', label: 'Light', icon: '🌞', desc: 'Warm cream — soft pillowy neumorphism, organic tactile feel', category: 'core', defaultEffects: { ...FX } },
  { value: 'teal', label: 'Teal', icon: '🧪', desc: 'Neon teal glow + warm amber — deep GitHub-dark base, electric green accents', category: 'core', defaultEffects: { ...FX, glow: 'boosted' } },
  { value: 'crimson', label: 'Crimson', icon: '🩸', desc: 'Velvet crimson + deep aubergine — dark, rich, premium red neumorphism', category: 'core', defaultEffects: { ...FX } },
  { value: 'golden', label: 'Golden', icon: '✨', desc: 'Warm euphoric golden hour — soft amber breathing, MDMA warmth without kitsch', category: 'core', defaultEffects: { ...FX, particles: 'normal', glow: 'boosted' } },
]

/* ── localStorage keys ── */

const STORAGE_KEY = 'lastfm_theme'
const ACTIVE_PROFILE_KEY = 'lastfm_active_profile'
const CUSTOM_PROFILES_KEY = 'lastfm_custom_profiles'
const DEFAULT: Theme = 'dark'
const CHANGE_EVENT = 'theme-changed'

/* ── Profile management ── */

function defaultEffectsFor(theme: Theme): ThemeEffects {
  return ALL_THEMES.find(t => t.value === theme)?.defaultEffects ?? FX
}

export function buildProfile(theme: Theme): ThemeProfile {
  const meta = ALL_THEMES.find(t => t.value === theme)
  return {
    id: theme,
    name: meta?.label ?? theme,
    baseTheme: theme,
    effects: defaultEffectsFor(theme),
    isCustom: false,
  }
}

export function getActiveProfile(): ThemeProfile {
  try {
    const stored = localStorage.getItem(ACTIVE_PROFILE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as ThemeProfile
      if (parsed.baseTheme && parsed.effects) return parsed
    }
  } catch { /* corrupted */ }
  return buildProfile(getTheme())
}

function setActiveProfile(profile: ThemeProfile): void {
  try { localStorage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(profile)) } catch {}
}

/* ── Custom profile storage ── */

export function getCustomProfiles(): ThemeProfile[] {
  try {
    const stored = localStorage.getItem(CUSTOM_PROFILES_KEY)
    if (stored) return JSON.parse(stored) as ThemeProfile[]
  } catch {}
  return []
}

export function saveProfile(profile: ThemeProfile): void {
  const profiles = getCustomProfiles().filter(p => p.id !== profile.id)
  let name = profile.name
  let counter = 1
  while (profiles.some(p => p.name === name)) {
    name = `${profile.name} (${counter})`
    counter++
  }
  profiles.push({ ...profile, name, id: profile.id || `custom-${Date.now()}` })
  try { localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(profiles)) } catch {}
}

export function deleteProfile(id: string): void {
  const profiles = getCustomProfiles().filter(p => p.id !== id)
  try { localStorage.setItem(CUSTOM_PROFILES_KEY, JSON.stringify(profiles)) } catch {}
  const active = getActiveProfile()
  if (active.id === id) {
    loadProfile(buildProfile('dark'))
  }
}

/* ── Load profile (apply all settings) ── */

export function loadProfile(profile: ThemeProfile): void {
  applyTheme(profile.baseTheme)
  applyEffects(profile.effects)
  setActiveProfile(profile)
  try { localStorage.setItem(STORAGE_KEY, profile.baseTheme) } catch {}
  window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: profile.baseTheme }))
}

/* ── Apply effects from an effects object ── */

export function applyEffects(fx: ThemeEffects): void {
  setAnimSpeed(fx.animSpeed)
  setGlassLevel(fx.glassLevel)
  setNoiseLevel(fx.noise)
  setScanlines(fx.scanlines)
  setChromatic(fx.chromatic)
  setVignette(fx.vignette)
  setParticles(fx.particles)
  setGlowBoost(fx.glow)
  setBorderPulse(fx.borderPulse)
  setDepth3D(fx.depth3D)
}

/* ── Export / Import as file ── */

export function downloadProfileFile(profile: ThemeProfile): void {
  const json = JSON.stringify(profile, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${profile.name.replace(/\s+/g, '-').toLowerCase()}.lastfm-theme.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function parseProfileFile(json: string): ThemeProfile {
  const obj = JSON.parse(json)
  if (!obj.baseTheme || !obj.effects || !obj.name) {
    throw new Error('Invalid theme profile file')
  }
  if (!ALL_THEMES.some(t => t.value === obj.baseTheme)) {
    throw new Error(`Unknown theme: ${obj.baseTheme}`)
  }
  const fx = obj.effects as ThemeEffects
  const base = defaultEffectsFor(obj.baseTheme as Theme)
  return {
    id: `import-${Date.now()}`,
    name: String(obj.name),
    baseTheme: obj.baseTheme as Theme,
    effects: {
      animSpeed: ([0.5, 1, 2] as AnimSpeed[]).includes(fx.animSpeed) ? fx.animSpeed : base.animSpeed,
      glassLevel: (['low', 'normal', 'high'] as GlassLevel[]).includes(fx.glassLevel) ? fx.glassLevel : base.glassLevel,
      noise: (['off', 'subtle', 'heavy'] as NoiseLevel[]).includes(fx.noise) ? fx.noise : base.noise,
      scanlines: (['off', 'on'] as ScanlineMode[]).includes(fx.scanlines) ? fx.scanlines : base.scanlines,
      chromatic: (['off', 'on'] as ChromaticMode[]).includes(fx.chromatic) ? fx.chromatic : base.chromatic,
      vignette: (['off', 'subtle', 'heavy'] as VignetteLevel[]).includes(fx.vignette) ? fx.vignette : base.vignette,
      particles: (['sparse', 'normal', 'dense'] as ParticleDensity[]).includes(fx.particles) ? fx.particles : base.particles,
      glow: (['normal', 'boosted', 'max'] as GlowBoost[]).includes(fx.glow) ? fx.glow : base.glow,
      borderPulse: (['off', 'on'] as BorderPulseMode[]).includes(fx.borderPulse) ? fx.borderPulse : base.borderPulse,
      depth3D: (['off', 'subtle', 'strong'] as Depth3D[]).includes(fx.depth3D) ? fx.depth3D : base.depth3D,
    },
    isCustom: true,
  }
}

/* ── Get current effects snapshot ── */

export function getCurrentEffects(): ThemeEffects {
  return {
    animSpeed: getAnimSpeed(),
    glassLevel: getGlassLevel(),
    noise: getNoiseLevel(),
    scanlines: getScanlines(),
    chromatic: getChromatic(),
    vignette: getVignette(),
    particles: getParticles(),
    glow: getGlowBoost(),
    borderPulse: getBorderPulse(),
    depth3D: getDepth3D(),
  }
}

/* ── Core theme functions ── */

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && ALL_THEMES.some(t => t.value === stored)) return stored as Theme
  } catch {}
  return DEFAULT
}

export function setTheme(theme: Theme): void {
  try { localStorage.setItem(STORAGE_KEY, theme) } catch {}
  applyTheme(theme)
  const profile = buildProfile(theme)
  applyEffects(profile.effects)
  setActiveProfile(profile)
  window.dispatchEvent(new CustomEvent<Theme>(CHANGE_EVENT, { detail: theme }))
}

export function onThemeChange(callback: (theme: Theme) => void): () => void {
  const handler = (e: Event) => callback((e as CustomEvent<Theme>).detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme)
}

/* ── Individual effect getters/setters ── */

export function getAnimSpeed(): AnimSpeed {
  try { const v = parseFloat(localStorage.getItem('lastfm_anim_speed') || '1'); if (v === 0.5 || v === 1 || v === 2) return v } catch {}
  return 1
}
export function setAnimSpeed(speed: AnimSpeed): void {
  try { localStorage.setItem('lastfm_anim_speed', String(speed)) } catch {}
  const mult = 1 / speed
  document.documentElement.style.setProperty('--anim-speed-mult', String(mult))
  document.documentElement.style.setProperty('--transition', `calc(280ms * ${mult}) cubic-bezier(0.4, 0, 0.2, 1)`)
  document.documentElement.style.setProperty('--anim-duration-slow', `calc(8s * ${mult})`)
  document.documentElement.style.setProperty('--anim-duration-atmos', `calc(22s * ${mult})`)
  document.documentElement.style.setProperty('--anim-duration-particles', `calc(26s * ${mult})`)
}

export function getGlassLevel(): GlassLevel {
  try { const v = localStorage.getItem('lastfm_glass_level'); if (v === 'low' || v === 'normal' || v === 'high') return v } catch {}
  return 'normal'
}
export function setGlassLevel(level: GlassLevel): void {
  try { localStorage.setItem('lastfm_glass_level', level) } catch {}
  const blurMap: Record<GlassLevel, string> = { low: 'blur(8px)', normal: 'blur(18px)', high: 'blur(36px)' }
  document.documentElement.style.setProperty('--glass-blur', blurMap[level])
  const bgMap: Record<GlassLevel, string> = { low: '0.35', normal: '0.65', high: '0.85' }
  document.documentElement.style.setProperty('--glass-bg-alpha', bgMap[level])
}

export function getNoiseLevel(): NoiseLevel {
  try { const v = localStorage.getItem('lastfm_noise'); if (v === 'off' || v === 'subtle' || v === 'heavy') return v } catch {}
  return 'off'
}
export function setNoiseLevel(level: NoiseLevel): void {
  try { localStorage.setItem('lastfm_noise', level) } catch {}
  const map: Record<NoiseLevel, string> = { off: '0', subtle: '0.02', heavy: '0.05' }
  document.documentElement.style.setProperty('--noise-opacity', map[level])
}

export function getScanlines(): ScanlineMode {
  try { const v = localStorage.getItem('lastfm_scanlines'); if (v === 'off' || v === 'on') return v } catch {}
  return 'off'
}
export function setScanlines(mode: ScanlineMode): void {
  try { localStorage.setItem('lastfm_scanlines', mode) } catch {}
  document.documentElement.style.setProperty('--scanlines-opacity', mode === 'on' ? '0.03' : '0')
}

export function getChromatic(): ChromaticMode {
  try { const v = localStorage.getItem('lastfm_chromatic'); if (v === 'off' || v === 'on') return v } catch {}
  return 'off'
}
export function setChromatic(mode: ChromaticMode): void {
  try { localStorage.setItem('lastfm_chromatic', mode) } catch {}
  document.documentElement.style.setProperty('--chromatic-shift', mode === 'on' ? '1px' : '0px')
}

export function getVignette(): VignetteLevel {
  try { const v = localStorage.getItem('lastfm_vignette'); if (v === 'off' || v === 'subtle' || v === 'heavy') return v } catch {}
  return 'off'
}
export function setVignette(level: VignetteLevel): void {
  try { localStorage.setItem('lastfm_vignette', level) } catch {}
  const map: Record<VignetteLevel, string> = { off: '0', subtle: '0.2', heavy: '0.45' }
  document.documentElement.style.setProperty('--vignette-opacity', map[level])
}

export function getParticles(): ParticleDensity {
  try { const v = localStorage.getItem('lastfm_particles'); if (v === 'sparse' || v === 'normal' || v === 'dense') return v } catch {}
  return 'sparse'
}
export function setParticles(density: ParticleDensity): void {
  try { localStorage.setItem('lastfm_particles', density) } catch {}
  const map: Record<ParticleDensity, string> = { sparse: '0.2', normal: '0.4', dense: '0.7' }
  document.documentElement.style.setProperty('--particle-opacity', map[density])
  const scaleMap: Record<ParticleDensity, string> = { sparse: '0.5', normal: '0.7', dense: '1' }
  document.documentElement.style.setProperty('--particle-scale', scaleMap[density])
}

export function getGlowBoost(): GlowBoost {
  try { const v = localStorage.getItem('lastfm_glow'); if (v === 'normal' || v === 'boosted' || v === 'max') return v } catch {}
  return 'normal'
}
export function setGlowBoost(boost: GlowBoost): void {
  try { localStorage.setItem('lastfm_glow', boost) } catch {}
  const multMap: Record<GlowBoost, string> = { normal: '0.6', boosted: '1', max: '1.5' }
  document.documentElement.style.setProperty('--glow-multiplier', multMap[boost])
}

export function getBorderPulse(): BorderPulseMode {
  try { const v = localStorage.getItem('lastfm_border'); if (v === 'off' || v === 'on') return v } catch {}
  return 'off'
}
export function setBorderPulse(mode: BorderPulseMode): void {
  try { localStorage.setItem('lastfm_border', mode) } catch {}
  document.documentElement.style.setProperty('--border-pulse-opacity', mode === 'on' ? '1' : '0')
  if (mode === 'on') {
    document.documentElement.classList.add('bpulse')
  } else {
    document.documentElement.classList.remove('bpulse')
  }
}

export function getDepth3D(): Depth3D {
  try { const v = localStorage.getItem('lastfm_depth3d'); if (v === 'off' || v === 'subtle' || v === 'strong') return v } catch {}
  return 'subtle'
}
export function setDepth3D(level: Depth3D): void {
  try { localStorage.setItem('lastfm_depth3d', level) } catch {}
  document.documentElement.classList.remove('depth3d-subtle', 'depth3d-strong')
  if (level === 'subtle') document.documentElement.classList.add('depth3d-subtle')
  if (level === 'strong') document.documentElement.classList.add('depth3d-strong')
  document.documentElement.style.setProperty('--depth3d-level', level)
}

/* ── Apply all customizations on boot ── */

export function applyAllCustomizations(): void {
  const profile = getActiveProfile()
  applyTheme(profile.baseTheme)
  applyEffects(profile.effects)
}
