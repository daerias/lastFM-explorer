import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { getCredentials, saveCredentials, clearCredentials, hasCredentials } from '../store/credentials'
import { useAuth } from '../context/AuthContext'
import {
  setAnimSpeed, setGlassLevel, setVignette, setParticles, setGlowBoost, setDepth3D,
  getActiveProfile, loadProfile,
  getCustomProfiles, saveProfile, deleteProfile,
  downloadProfileFile, parseProfileFile,
  getTheme, setTheme, ALL_THEMES,
  type ThemeProfile, type Theme,
  type AnimSpeed, type GlassLevel, type VignetteLevel,
  type ParticleDensity, type GlowBoost, type Depth3D,
} from '../store/theme'
import {
  ICON_STYLES, getIconStyle, setIconStyle, getFineTune, setFineTune,
  resetFineTune, onIconStyleChange,
  type IconStyle, type IconFineTune,
} from '../store/iconStyle'
import {
  LUT_PRESETS, getActiveLut, setActiveLut, getDofSettings, setDofSettings,
  onCinematicChange, type DofSettings,
} from '../store/lut'
import styles from './Settings.module.css'

export default function Settings() {
  const { isAuthenticated, logout } = useAuth()
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  useEffect(() => {
    const creds = getCredentials()
    if (creds) { setApiKey(creds.apiKey); setApiSecret(creds.apiSecret) }
  }, [])

  const handleSave = () => {
    if (!apiKey.trim() || !apiSecret.trim()) return
    saveCredentials(apiKey, apiSecret)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const configured = hasCredentials()

  return (
    <div className={styles.settings}>
      <div className={styles.headerRow}>
        <h1>Settings</h1>
        <p className={styles.desc}>Configure your Last.fm Explorer</p>
      </div>

      {/* ── API Credentials + Account ── */}
      <div className={styles.card}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          <h2>API Credentials</h2>
        </div>
        <p className={styles.helpText}>
          <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">
            Get your API key here →
          </a>
        </p>
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="api-key">API Key</label>
            <input id="api-key" className={styles.input} type="text" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} placeholder="Paste your API key" />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="api-secret">Shared Secret</label>
            <div className={styles.secretRow}>
              <input id="api-secret" className={styles.input}
                type={showSecret ? 'text' : 'password'} value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)} placeholder="Paste your shared secret" />
              <button className={styles.toggleBtn} onClick={() => setShowSecret(!showSecret)}
                title={showSecret ? 'Hide secret' : 'Show secret'}>
                {showSecret ? '🙈' : '👁'}
              </button>
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          <button className="neuro-btn neuro-btn-accent" onClick={handleSave}>
            {saved ? '✓ Saved' : 'Save Credentials'}
          </button>
          {configured && (
            <button className="neuro-btn" onClick={() => { clearCredentials(); setApiKey(''); setApiSecret(''); if (isAuthenticated) logout() }}>
              Clear
            </button>
          )}
          {isAuthenticated && (
            <button className="neuro-btn" onClick={() => logout()} style={{ background: 'var(--accent-glass)', border: '1px solid var(--accent-glow)' }}>
              🚪 Logout
            </button>
          )}
        </div>
        {configured && <p className={styles.statusOk}>✓ Credentials configured — you can now log in</p>}
      </div>

      {/* ── Appearance: Theme + Fine-Tune ── */}
      <div className={styles.card}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          <h2>Appearance</h2>
        </div>
        <InlineFineTuneStudio />
      </div>

      {/* ── Icon Style + Cinematic ── */}
      <div className={styles.sectionGrid}>
        <div className={styles.card}>
          <div className={styles.sectionHead}>
            <span className={`${styles.sectionDot} ${styles.sectionDotTeal}`} />
            <h2>Icon Style</h2>
          </div>
          <InlineIconStylePicker />
        </div>
        <div className={styles.card}>
          <div className={styles.sectionHead}>
            <span className={`${styles.sectionDot} ${styles.sectionDotGold}`} />
            <h2>Cinematic Look</h2>
          </div>
          <InlineCinematicPicker />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// Inline Theme Studio
// ═══════════════════════════════════════════════════════

function InlineFineTuneStudio() {
  const activeProfile = getActiveProfile()
  const [animSpeed, setAnimSpeedState] = useState<AnimSpeed>(activeProfile.effects.animSpeed)
  const [glassLevel, setGlassLevelState] = useState<GlassLevel>(activeProfile.effects.glassLevel)
  const [vignette, setVignetteState] = useState<VignetteLevel>(activeProfile.effects.vignette)
  const [particles, setParticlesState] = useState<ParticleDensity>(activeProfile.effects.particles)
  const [glow, setGlow] = useState<GlowBoost>(activeProfile.effects.glow)
  const [depth3D, setDepth3DState] = useState<Depth3D>(activeProfile.effects.depth3D)
  const [customProfiles, setCustomProfiles] = useState<ThemeProfile[]>(getCustomProfiles)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [profileName, setProfileName] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTheme, setActiveTheme] = useState<Theme>(getTheme)

  const currentFx = {
    animSpeed, glassLevel, vignette, particles, glow, depth3D,
    noise: 'off' as const, scanlines: 'off' as const, chromatic: 'off' as const, borderPulse: 'off' as const,
  }
  const profileFx = activeProfile.effects
  const hasChanges = Object.keys(currentFx).some(k => currentFx[k as keyof typeof currentFx] !== profileFx[k as keyof typeof profileFx])

  const handleThemeToggle = (theme: Theme) => {
    setTheme(theme)
    setActiveTheme(theme)
  }

  const handleSaveProfile = () => {
    const name = profileName.trim()
    if (!name) return
    const profile: ThemeProfile = { id: `custom-${Date.now()}`, name, baseTheme: activeTheme, effects: currentFx, isCustom: true }
    saveProfile(profile)
    loadProfile(profile)
    setCustomProfiles(getCustomProfiles())
    setShowSaveDialog(false)
    setProfileName('')
  }

  const handleLoadCustomProfile = (profile: ThemeProfile) => {
    loadProfile(profile)
    setAnimSpeedState(profile.effects.animSpeed)
    setGlassLevelState(profile.effects.glassLevel)
    setVignetteState(profile.effects.vignette)
    setParticlesState(profile.effects.particles)
    setGlow(profile.effects.glow)
    setDepth3DState(profile.effects.depth3D)
  }

  const handleDeleteProfile = (id: string) => {
    deleteProfile(id)
    setCustomProfiles(getCustomProfiles())
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const profile = parseProfileFile(reader.result as string)
        saveProfile(profile)
        handleLoadCustomProfile(profile)
        setCustomProfiles(getCustomProfiles())
      } catch (err) {
        alert(`Invalid profile file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className={styles.studio}>
      {/* Active profile indicator */}
      <div className={styles.activeBar}>
        <span className={styles.activeDot} />
        <span className={styles.activeName}>Active: <strong>{activeProfile.name}</strong></span>
        {hasChanges && <span className={styles.badgeUnsaved}>✏️ Unsaved</span>}
      </div>

      {/* Theme Toggle */}
      <div className={styles.themeGrid}>
        {ALL_THEMES.map(t => {
          const isActive = activeTheme === t.value
          return (
            <button key={t.value} onClick={() => handleThemeToggle(t.value)}
              className={`${styles.themeCard} ${isActive ? styles.themeCardActive : ''}`}>
              <span className={styles.themeIcon}>{t.icon}</span>
              <div className={styles.themeInfo}>
                <span className={styles.themeName}>{t.label}</span>
                <span className={styles.themeDesc}>{t.desc}</span>
              </div>
              {isActive && <span className={styles.themeCheck}>✓</span>}
            </button>
          )
        })}
      </div>

      {/* Saved Profiles */}
      {customProfiles.length > 0 && (
        <div className={styles.profiles}>
          <span className={styles.profilesTitle}>💾 Saved Profiles</span>
          <div className={styles.profilesRow}>
            {customProfiles.map(profile => {
              const isActiveProfile = activeProfile.id === profile.id
              return (
                <div key={profile.id} className={`${styles.profileChip} ${isActiveProfile ? styles.profileChipActive : ''}`}>
                  <span className={styles.profileChipName}>{profile.name}</span>
                  <button className={styles.profileChipBtn} onClick={() => handleLoadCustomProfile(profile)}>Load</button>
                  <button className={styles.profileChipBtn} onClick={() => downloadProfileFile(profile)}>📥</button>
                  <button className={styles.profileChipBtn} onClick={() => handleDeleteProfile(profile.id)} style={{ color: 'var(--accent)' }}>🗑</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Effects Fine-Tune */}
      <div className={styles.effectsGrid}>
        <div className={styles.effectsCol}>
          <span className={styles.effectsTitle}>🎛️ Visual</span>
          <EffectGroup label="Animation Speed" active={animSpeed === 0.5 ? 'Slow' : animSpeed === 1 ? 'Normal' : 'Fast'}>
            {([0.5, 1, 2] as AnimSpeed[]).map(s => (
              <PillBtn key={s} label={`${s}×`} active={animSpeed === s} onClick={() => { setAnimSpeed(s); setAnimSpeedState(s) }} />
            ))}
          </EffectGroup>
          <EffectGroup label="Glass Intensity" active={glassLevel === 'low' ? 'Subtle' : glassLevel === 'normal' ? 'Balanced' : 'Heavy'}>
            {(['low', 'normal', 'high'] as GlassLevel[]).map(l => (
              <PillBtn key={l} label={l === 'low' ? 'Subtle' : l === 'normal' ? 'Balanced' : 'Heavy'} active={glassLevel === l} onClick={() => { setGlassLevel(l); setGlassLevelState(l) }} />
            ))}
          </EffectGroup>
          <EffectGroup label="Glow Boost" active={glow}>
            <PillBtn label="Normal" active={glow === 'normal'} onClick={() => { setGlowBoost('normal'); setGlow('normal') }} />
            <PillBtn label="Boosted" active={glow === 'boosted'} onClick={() => { setGlowBoost('boosted'); setGlow('boosted') }} />
            <PillBtn label="Max" active={glow === 'max'} onClick={() => { setGlowBoost('max'); setGlow('max') }} />
          </EffectGroup>
        </div>
        <div className={styles.effectsCol}>
          <span className={styles.effectsTitle}>🌫️ Atmosphere</span>
          <EffectGroup label="Vignette" active={vignette}>
            <PillBtn label="Off" active={vignette === 'off'} onClick={() => { setVignette('off'); setVignetteState('off') }} />
            <PillBtn label="Subtle" active={vignette === 'subtle'} onClick={() => { setVignette('subtle'); setVignetteState('subtle') }} />
            <PillBtn label="Heavy" active={vignette === 'heavy'} onClick={() => { setVignette('heavy'); setVignetteState('heavy') }} />
          </EffectGroup>
          <EffectGroup label="Particles" active={particles}>
            <PillBtn label="Sparse" active={particles === 'sparse'} onClick={() => { setParticles('sparse'); setParticlesState('sparse') }} />
            <PillBtn label="Normal" active={particles === 'normal'} onClick={() => { setParticles('normal'); setParticlesState('normal') }} />
            <PillBtn label="Dense" active={particles === 'dense'} onClick={() => { setParticles('dense'); setParticlesState('dense') }} />
          </EffectGroup>
          <EffectGroup label="3D Depth" active={depth3D}>
            <PillBtn label="Off" active={depth3D === 'off'} onClick={() => { setDepth3D('off'); setDepth3DState('off') }} />
            <PillBtn label="Subtle" active={depth3D === 'subtle'} onClick={() => { setDepth3D('subtle'); setDepth3DState('subtle') }} />
            <PillBtn label="Strong" active={depth3D === 'strong'} onClick={() => { setDepth3D('strong'); setDepth3DState('strong') }} />
          </EffectGroup>
        </div>
      </div>

      {/* Audio Reactivity */}
      <AudioReactiveSettings />

      {/* Footer Bar */}
      <div className={`${styles.footerBar} ${hasChanges ? styles.footerBarUnsaved : ''}`}>
        {hasChanges && (
          !showSaveDialog ? (
            <button className={styles.accentBtn} onClick={() => { setShowSaveDialog(true); setProfileName('') }}>
              💾 Save as Profile
            </button>
          ) : (
            <div className={styles.saveDialog}>
              <input autoFocus value={profileName} onChange={e => setProfileName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveProfile()}
                placeholder="Profile name..." className={styles.saveInput} />
              <button className={styles.accentBtn} onClick={handleSaveProfile}>✓ Save</button>
              <button className={styles.ghostBtn} onClick={() => setShowSaveDialog(false)}>✕</button>
            </div>
          )
        )}
        <button className={styles.ghostBtn} onClick={() => {
          const profile: ThemeProfile = { id: 'export', name: activeProfile.name, baseTheme: activeTheme, effects: currentFx, isCustom: true }
          downloadProfileFile(profile)
        }} title="Download as .lastfm-theme.json">📥 Export</button>
        <button className={styles.ghostBtn} onClick={() => fileInputRef.current?.click()}>📤 Import</button>
        <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileChange} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

/* ── Mini Components ── */

function PillBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`${styles.pillBtn} ${active ? styles.pillBtnActive : ''}`}>
      {label}
    </button>
  )
}

function EffectGroup({ label, active, children }: { label: string; active: string; children: ReactNode }) {
  return (
    <div className={styles.effectGroup}>
      <span className={styles.effectLabel}>
        {label}
        <span className={styles.badge}>{active}</span>
      </span>
      <div className={styles.pillRow}>{children}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// Icon Style Picker
// ═══════════════════════════════════════════════════════

function InlineIconStylePicker() {
  const [active, setActive] = useState<IconStyle>(getIconStyle)
  const [fineTune, setFineTuneState] = useState<IconFineTune>(getFineTune)

  useEffect(() => onIconStyleChange(() => {
    setActive(getIconStyle())
    setFineTuneState(getFineTune())
  }), [])

  const handleSelectStyle = (style: IconStyle) => {
    setActive(style)
    setIconStyle(style)
    resetFineTune(style)
    setFineTuneState(getFineTune())
  }

  const handleFineTune = (key: keyof IconFineTune, value: number) => {
    const next = { ...fineTune, [key]: value }
    setFineTuneState(next)
    setFineTune(next)
  }

  const activeMeta = ICON_STYLES.find(s => s.value === active)!
  const animSpeedLabel = fineTune.animSpeed === 0 ? 'Off' : fineTune.animSpeed === 0.5 ? '½×' : fineTune.animSpeed === 1 ? '1×' : '2×'

  return (
    <div className={styles.pickerWrap}>
      <div className={styles.pickerActive}>
        <span className={styles.pickerSwatch} style={{ background: activeMeta.preview }} />
        <div className={styles.pickerInfo}>
          <span className={styles.pickerName}>{activeMeta.icon} {activeMeta.label}</span>
          <span className={styles.pickerDesc}>{activeMeta.desc}</span>
        </div>
      </div>

      <div className={styles.iconGrid}>
        {ICON_STYLES.map(meta => {
          const isActive = active === meta.value
          return (
            <button key={meta.value} onClick={() => handleSelectStyle(meta.value)}
              className={`${styles.iconCard} ${isActive ? styles.iconCardActive : ''}`}>
              {isActive && <span className={styles.iconCheck}>✓</span>}
              <span className={styles.iconSwatch} style={{
                background: meta.preview,
                borderRadius: meta.value === 'brutal' ? '0' : meta.value === 'minimal' ? '6px' : meta.value === 'sketch' ? '30% 70% 50% 50% / 40% 60% 40% 60%' : '30%',
              }} />
              <span className={styles.iconCardLabel}>{meta.icon} {meta.label}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.iconPanel}>
        <div className={styles.iconPanelHead}>
          <span className={styles.iconPanelTitle}>Fine-Tune</span>
          <button className={styles.miniBtn} onClick={() => { resetFineTune(active); setFineTuneState(getFineTune()) }}>Reset</button>
        </div>
        <div className={styles.sliderGroup}>
          <span className={styles.sliderLabel}>✨ Glow <span className={styles.badge}>{fineTune.glow}%</span></span>
          <input type="range" min={0} max={100} step={5} value={fineTune.glow}
            onChange={e => handleFineTune('glow', Number(e.target.value))} className={styles.slider} />
        </div>
        <div className={styles.sliderGroup}>
          <span className={styles.sliderLabel}>🔍 Size <span className={styles.badge}>{fineTune.size}%</span></span>
          <input type="range" min={75} max={150} step={5} value={fineTune.size}
            onChange={e => handleFineTune('size', Number(e.target.value))} className={styles.slider} />
        </div>
        <EffectGroup label="🎬 Animation" active={animSpeedLabel}>
          {([0, 0.5, 1, 2] as const).map(speed => (
            <PillBtn key={speed}
              label={speed === 0 ? 'Off' : speed === 0.5 ? '½×' : speed === 1 ? '1×' : '2×'}
              active={fineTune.animSpeed === speed}
              onClick={() => handleFineTune('animSpeed', speed)} />
          ))}
        </EffectGroup>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// Cinematic Picker
// ═══════════════════════════════════════════════════════

function InlineCinematicPicker() {
  const [activeLut, setActiveLutState] = useState<string>(getActiveLut)
  const [dof, setDof] = useState<DofSettings>(getDofSettings)

  useEffect(() => onCinematicChange(() => {
    setActiveLutState(getActiveLut())
    setDof(getDofSettings())
  }), [])

  const activePreset = LUT_PRESETS.find(l => l.id === activeLut) || LUT_PRESETS[0]

  const getLutBg = (id: string) => {
    switch (id) {
      case 'none': return 'var(--bg-surface)'
      case 'teal-orange': return 'linear-gradient(135deg, #005577, #884411)'
      case 'matrix': return 'linear-gradient(135deg, #002200, #008800)'
      case 'wes-anderson': return 'linear-gradient(135deg, #e0b088, #c89870)'
      case 'noir': return 'linear-gradient(135deg, #222, #000)'
      case 'vintage-70s': return 'linear-gradient(135deg, #b09050, #705030)'
      case 'cyberpunk': return 'linear-gradient(135deg, #200880, #0088bb)'
      case 'bleach-bypass': return 'linear-gradient(135deg, #888, #444)'
      case 'copper': return 'linear-gradient(135deg, #a06830, #5e2a10)'
      default: return 'var(--bg-surface)'
    }
  }

  return (
    <div className={styles.pickerWrap}>
      <div className={styles.pickerActive}>
        <span className={styles.pickerSwatch} style={{
          background: activePreset.id === 'none' ? 'var(--bg-surface)' :
            activePreset.id === 'teal-orange' ? 'linear-gradient(135deg, #0088aa, #cc6622)' :
            activePreset.id === 'matrix' ? 'linear-gradient(135deg, #003300, #00aa00)' :
            activePreset.id === 'wes-anderson' ? 'linear-gradient(135deg, #f4c8a0, #e8b888)' :
            activePreset.id === 'noir' ? 'linear-gradient(135deg, #333, #000)' :
            activePreset.id === 'vintage-70s' ? 'linear-gradient(135deg, #c8a060, #886040)' :
            activePreset.id === 'cyberpunk' ? 'linear-gradient(135deg, #3010a0, #00aadd)' :
            activePreset.id === 'bleach-bypass' ? 'linear-gradient(135deg, #999, #555)' :
            'linear-gradient(135deg, #b87840, #6e3a1a)',
        }} />
        <div className={styles.pickerInfo}>
          <span className={styles.pickerName}>{activePreset.icon} {activePreset.label}</span>
          <span className={styles.pickerDesc}>{activePreset.desc}</span>
        </div>
      </div>

      <div className={styles.cineGrid}>
        {LUT_PRESETS.map(preset => {
          const isActive = activeLut === preset.id
          return (
            <button key={preset.id} onClick={() => { setActiveLutState(preset.id); setActiveLut(preset.id) }}
              className={`${styles.cineCard} ${isActive ? styles.cineCardActive : ''}`}>
              {isActive && <span className={styles.iconCheck}>✓</span>}
              <span className={styles.cineSwatch} style={{ background: getLutBg(preset.id) }} />
              <span className={styles.cineCardLabel}>{preset.icon} {preset.label}</span>
            </button>
          )
        })}
      </div>

      <div className={styles.dofPanel}>
        <div className={styles.dofRow}>
          <div className={styles.dofInfo}>
            <span className={styles.dofLabel}>🔍 Depth of Field</span>
            <span className={styles.dofDesc}>Cinematic blur vignette</span>
          </div>
          <button onClick={() => { const next = { ...dof, enabled: !dof.enabled }; setDof(next); setDofSettings(next) }}
            className={`${styles.toggle} ${dof.enabled ? styles.toggleOn : ''}`}>
            <span className={styles.toggleKnob} />
          </button>
        </div>
        {dof.enabled && (
          <div className={styles.sliderGroup}>
            <span className={styles.sliderLabel}>Blur <span className={styles.badge}>{dof.intensity}%</span></span>
            <input type="range" min={0} max={100} step={5} value={dof.intensity}
              onChange={e => { const next = { ...dof, intensity: Number(e.target.value) }; setDof(next); setDofSettings(next) }}
              className={styles.slider} />
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════
// Audio Reactive Settings
// ═══════════════════════════════════════════════════════

const AUDIO_REACTIVE_KEY = 'lastfm_audio_reactive'
const AUDIO_BPM_KEY = 'lastfm_audio_bpm'
const AUDIO_MIC_KEY = 'lastfm_audio_mic'
const AUDIO_MIC_SENSITIVITY_KEY = 'lastfm_audio_mic_sensitivity'

function getMicEnabled(): boolean {
  try { return localStorage.getItem(AUDIO_MIC_KEY) === 'true' } catch { return false }
}
function getMicSensitivity(): number {
  try { const v = parseFloat(localStorage.getItem(AUDIO_MIC_SENSITIVITY_KEY) || '1'); return v >= 0.3 && v <= 3 ? v : 1 } catch { return 1 }
}

function AudioReactiveSettings() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(AUDIO_REACTIVE_KEY) === 'true' } catch { return false }
  })
  const [bpm, setBpm] = useState(() => {
    try { const v = parseInt(localStorage.getItem(AUDIO_BPM_KEY) || '120', 10); return v >= 60 && v <= 200 ? v : 120 } catch { return 120 }
  })
  const [micEnabled, setMicEnabled] = useState(getMicEnabled)
  const [micSensitivity, setMicSensitivity] = useState(getMicSensitivity)
  const [micDenied, setMicDenied] = useState(false)

  useEffect(() => {
    const handler = () => setMicDenied(true)
    window.addEventListener('mic-permission-denied', handler)
    return () => window.removeEventListener('mic-permission-denied', handler)
  }, [])

  const toggleEnabled = useCallback(() => {
    const next = !enabled
    setEnabled(next)
    try { localStorage.setItem(AUDIO_REACTIVE_KEY, String(next)) } catch {}
    window.dispatchEvent(new CustomEvent('audio-reactive-changed'))
  }, [enabled])

  const toggleMic = useCallback(() => {
    const next = !micEnabled
    setMicEnabled(next)
    setMicDenied(false)
    try { localStorage.setItem(AUDIO_MIC_KEY, String(next)) } catch {}
    window.dispatchEvent(new CustomEvent('audio-reactive-changed'))
  }, [micEnabled])

  const updateBpm = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10)
    if (v >= 60 && v <= 200) {
      setBpm(v)
      try { localStorage.setItem(AUDIO_BPM_KEY, String(v)) } catch {}
      window.dispatchEvent(new CustomEvent('audio-reactive-changed'))
    }
  }, [])

  const updateMicSens = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setMicSensitivity(v)
    try { localStorage.setItem(AUDIO_MIC_SENSITIVITY_KEY, String(v)) } catch {}
    window.dispatchEvent(new CustomEvent('audio-reactive-changed'))
  }, [])

  return (
    <div className={styles.audioPanel}>
      <span className={styles.audioTitle}>🎵 LavaFM Audio Reactivity</span>

      <div className={styles.audioRow}>
        <div className={styles.audioInfo}>
          <span className={styles.audioLabel}>{enabled ? '🔊 Active' : '🔇 Disabled'}</span>
          <span className={styles.audioDesc}>{enabled ? 'LavaFM button pulses with music' : 'Enable rhythmic pulse'}</span>
        </div>
        <button onClick={toggleEnabled} className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}>
          <span className={styles.toggleKnob} />
        </button>
      </div>

      {enabled && (
        <div className={styles.sliderGroup}>
          <span className={styles.sliderLabel}>BPM <span className={styles.badge}>{bpm}</span></span>
          <input type="range" min={60} max={200} value={bpm} onChange={updateBpm} className={styles.slider} />
          <span className={styles.sliderRange}><span>60 · chill</span><span>200 · intense</span></span>
        </div>
      )}

      <div className={styles.audioDivider}>
        <div className={styles.audioRow}>
          <div className={styles.audioInfo}>
            <span className={styles.audioLabel}>🎤 Mic Mode</span>
            <span className={styles.audioDesc}>React to ambient music</span>
          </div>
          <button onClick={toggleMic} className={`${styles.toggle} ${micEnabled ? styles.toggleOn : ''}`}>
            <span className={styles.toggleKnob} />
          </button>
        </div>
        {micDenied && <div className={styles.audioDenied}>🚫 Mic denied. Check browser permissions.</div>}
        {micEnabled && (
          <div className={styles.sliderGroup}>
            <span className={styles.sliderLabel}>Sensitivity <span className={styles.badge}>{micSensitivity.toFixed(1)}×</span></span>
            <input type="range" min={0.3} max={3} step={0.1} value={micSensitivity} onChange={updateMicSens} className={styles.slider} />
            <span className={styles.sliderRange}><span>0.3 · subtle</span><span>3.0 · wild</span></span>
          </div>
        )}
      </div>
    </div>
  )
}
