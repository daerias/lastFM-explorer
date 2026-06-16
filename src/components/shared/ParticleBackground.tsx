import { useEffect, useRef } from 'react'

// ---- Types ----

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  baseSize: number
  opacity: number
  hue: number
  targetHue: number
  sat: number
  burstSize: number
  life: number
  lifeSpeed: number
}

// ---- Config ----

const PARTICLE_COUNT = 120
const REDUCED_PARTICLE_COUNT = 20
const CONNECTION_DISTANCE = 150
const MOUSE_RADIUS = 170
const MOUSE_FORCE = 0.035
const IDLE_FORCE = 0.01
const CLICK_FORCE = 6
const MAX_SPEED = 0.8
const LINE_OPACITY = 0.1
const MOUSE_LINE_OPACITY = 0.26
const MOUSE_LINE_RADIUS = 110
const IDLE_TIMEOUT = 1200

// ---- Parse accent color to hue (called once, not per frame) ----
function parseHexHue(hex: string): number {
  if (!hex.startsWith('#')) return 15
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 15
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
  else if (max === g) h = ((b - r) / d + 2) * 60
  else h = ((r - g) / d + 4) * 60
  return h
}

function readAccentHue(): number {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return parseHexHue(accent)
}

// ---- Component ----

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const lastMoveRef = useRef(0)
  const animationRef = useRef<number>(0)
  const initDoneRef = useRef(false)
  // Cached values — never read from DOM in the animation loop
  const accentHueRef = useRef(15)
  const reducedMotionRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let prevW = canvas.width
    let prevH = canvas.height

    // Check reduced motion
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotionRef.current = motionQuery.matches
    const onMotionChange = (e: MediaQueryListEvent) => {
      reducedMotionRef.current = e.matches
    }
    motionQuery.addEventListener('change', onMotionChange)

    // ---- Resize ----
    const resize = () => {
      const newW = window.innerWidth
      const newH = window.innerHeight
      const scaleX = newW / (prevW || newW)
      const scaleY = newH / (prevH || newH)

      for (const p of particlesRef.current) {
        p.x *= scaleX
        p.y *= scaleY
      }

      canvas.width = newW
      canvas.height = newH
      prevW = newW
      prevH = newH
    }

    // ---- Init particles ----
    const initParticles = () => {
      accentHueRef.current = readAccentHue()
      const baseHue = accentHueRef.current
      const count = reducedMotionRef.current ? REDUCED_PARTICLE_COUNT : PARTICLE_COUNT
      const particles: Particle[] = []
      for (let i = 0; i < count; i++) {
        const isAccent = Math.random() < 0.7
        const hueOffset = isAccent
          ? (Math.random() - 0.5) * 50
          : 120 + Math.random() * 120
        const hue = (baseHue + hueOffset + 360) % 360

        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: 1.0 + Math.random() * 2.2,
          baseSize: 1.0 + Math.random() * 2.2,
          opacity: 0.18 + Math.random() * 0.32,
          hue,
          targetHue: hue,
          sat: 55 + Math.random() * 35,
          burstSize: 0,
          life: Math.random() * Math.PI * 2,
          lifeSpeed: 0.002 + Math.random() * 0.006,
        })
      }
      particlesRef.current = particles
      initDoneRef.current = true
    }

    // ---- Mouse tracking ----
    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
      lastMoveRef.current = performance.now()
    }

    const onClick = (e: MouseEvent) => {
      const mx = e.clientX
      const my = e.clientY
      for (const p of particlesRef.current) {
        const dx = p.x - mx
        const dy = p.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 320 && dist > 0) {
          const force = CLICK_FORCE * (1 - dist / 320)
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
          p.burstSize += p.baseSize * 2.5
        }
      }
    }

    // ---- Theme change -> update target hues (smoothly lerps) ----
    const themeObserver = new MutationObserver(() => {
      if (!initDoneRef.current) return
      accentHueRef.current = readAccentHue()
      const baseHue = accentHueRef.current
      for (const p of particlesRef.current) {
        const isAccent = Math.random() < 0.7
        const hueOffset = isAccent
          ? (Math.random() - 0.5) * 50
          : 120 + Math.random() * 120
        p.targetHue = (baseHue + hueOffset + 360) % 360
      }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    // ---- Animation loop ----
    const animate = (timestamp: number) => {
      const w = canvas.width
      const h = canvas.height
      const particles = particlesRef.current
      const mouse = mouseRef.current
      const now = performance.now()
      const isIdle = now - lastMoveRef.current > IDLE_TIMEOUT
      const reduced = reducedMotionRef.current

      ctx.clearRect(0, 0, w, h)

      // Smoothly lerp hues toward target (for theme transitions)
      const hueLerp = 0.03

      for (const p of particles) {
        // Lerp hue toward target
        let diff = p.targetHue - p.hue
        if (Math.abs(diff) > 180) diff = diff > 0 ? diff - 360 : diff + 360
        p.hue = (p.hue + diff * hueLerp + 360) % 360

        // Organic breathing size
        if (!reduced) {
          p.life += p.lifeSpeed
        }
        const breatheScale = 1 + Math.sin(p.life) * 0.25

        // Mouse interaction — skip in reduced motion
        if (!reduced) {
          const dx = mouse.x - p.x
          const dy = mouse.y - p.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < MOUSE_RADIUS && dist > 0) {
            const force = (isIdle ? IDLE_FORCE : MOUSE_FORCE) * (1 - dist / MOUSE_RADIUS)
            p.vx += (dx / dist) * force
            p.vy += (dy / dist) * force
          }
        }

        // Gentle drift
        if (Math.abs(p.vx) < 0.02 && Math.abs(p.vy) < 0.02) {
          p.vx += (Math.random() - 0.5) * 0.004
          p.vy += (Math.random() - 0.5) * 0.004
        }

        // Move (slower in reduced motion)
        const speedMult = reduced ? 0.3 : 1
        p.x += p.vx * speedMult
        p.y += p.vy * speedMult

        // Damping
        p.vx *= 0.995
        p.vy *= 0.995

        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > MAX_SPEED) {
          p.vx = (p.vx / speed) * MAX_SPEED
          p.vy = (p.vy / speed) * MAX_SPEED
        }

        // Smooth edge wrapping
        const margin = 35
        if (p.x < -margin) p.x = w + margin
        if (p.x > w + margin) p.x = -margin
        if (p.y < -margin) p.y = h + margin
        if (p.y > h + margin) p.y = -margin

        // Burst size decay
        p.burstSize *= 0.92
        p.size = (p.baseSize + p.burstSize) * breatheScale

        // Draw particle
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, 55%, ${p.opacity})`
        ctx.fill()

        // Subtle glow ring
        if (p.size > 2.5 && !reduced) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size + 1.5, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${p.hue}, ${p.sat}%, 60%, ${p.opacity * 0.15})`
          ctx.fill()
        }
      }

      // Draw connections — skip in reduced motion
      if (!reduced) {
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const a = particles[i]
            const b = particles[j]
            const dx = a.x - b.x
            const dy = a.y - b.y
            const dist = Math.sqrt(dx * dx + dy * dy)

            if (dist < CONNECTION_DISTANCE) {
              const midX = (a.x + b.x) / 2
              const midY = (a.y + b.y) / 2
              const mouseDist = Math.sqrt((midX - mouse.x) ** 2 + (midY - mouse.y) ** 2)
              const isNearMouse = mouseDist < MOUSE_LINE_RADIUS

              const baseAlpha = LINE_OPACITY * (1 - dist / CONNECTION_DISTANCE)
              const alpha = isNearMouse
                ? baseAlpha + (MOUSE_LINE_OPACITY - baseAlpha) * (1 - mouseDist / MOUSE_LINE_RADIUS)
                : baseAlpha

              const avgHue = (a.hue + b.hue) / 2
              const avgSat = (a.sat + b.sat) / 2

              ctx.beginPath()
              ctx.moveTo(a.x, a.y)
              ctx.lineTo(b.x, b.y)
              ctx.strokeStyle = `hsla(${avgHue}, ${avgSat}%, 48%, ${alpha})`
              ctx.lineWidth = isNearMouse ? 0.9 : 0.4
              ctx.stroke()
            }
          }
        }
      }

      // Mouse glow — uses cached accentHue (no getComputedStyle in loop!)
      if (mouse.x > 0 && mouse.y > 0 && !reduced) {
        const pulse = 0.55 + 0.45 * Math.sin(timestamp * 0.0018)
        const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, MOUSE_RADIUS)
        gradient.addColorStop(0, `hsla(${accentHueRef.current}, 75%, 55%, ${0.06 * pulse})`)
        gradient.addColorStop(0.4, `hsla(${accentHueRef.current}, 65%, 50%, ${0.03 * pulse})`)
        gradient.addColorStop(1, 'transparent')
        ctx.beginPath()
        ctx.arc(mouse.x, mouse.y, MOUSE_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    // ---- Start ----
    initParticles()
    resize()
    prevW = canvas.width
    prevH = canvas.height
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('click', onClick)
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animationRef.current)
      motionQuery.removeEventListener('change', onMotionChange)
      themeObserver.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('click', onClick)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
}
