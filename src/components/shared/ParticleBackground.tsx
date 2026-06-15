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
  burstSize: number // additive burst from clicks, decays over time
}

// ---- Config ----

const PARTICLE_COUNT = 80
const CONNECTION_DISTANCE = 140
const MOUSE_RADIUS = 160
const MOUSE_FORCE = 0.03
const IDLE_FORCE = 0.008 // weaker attraction when idle
const CLICK_FORCE = 6
const MAX_SPEED = 0.8
const LINE_OPACITY = 0.12
const MOUSE_LINE_OPACITY = 0.28 // brighter lines near cursor
const MOUSE_LINE_RADIUS = 100 // lines within this radius of cursor glow brighter
const IDLE_TIMEOUT = 1200 // ms before considered idle

// ---- Component ----

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: -1000, y: -1000 })
  const lastMoveRef = useRef(0)
  const animationRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let prevW = canvas.width
    let prevH = canvas.height

    // ---- Resize ----
    const resize = () => {
      const newW = window.innerWidth
      const newH = window.innerHeight
      const scaleX = newW / (prevW || newW)
      const scaleY = newH / (prevH || newH)

      // Scale existing particle positions proportionally
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
      const particles: Particle[] = []
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        particles.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: 1.2 + Math.random() * 1.8,
          baseSize: 1.2 + Math.random() * 1.8,
          opacity: 0.2 + Math.random() * 0.3,
          hue: 340 + Math.random() * 40, // warm reds: 340-380 (wraps to 0-20)
          burstSize: 0,
        })
      }
      particlesRef.current = particles
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
        if (dist < 300 && dist > 0) {
          const force = CLICK_FORCE * (1 - dist / 300)
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
          p.burstSize += p.baseSize * 2.5 // additive — smooth stacking
        }
      }
    }

    // ---- Animation loop ----
    const animate = () => {
      const w = canvas.width
      const h = canvas.height
      const particles = particlesRef.current
      const mouse = mouseRef.current
      const now = performance.now()
      const isIdle = now - lastMoveRef.current > IDLE_TIMEOUT

      ctx.clearRect(0, 0, w, h)

      // Update particles
      for (const p of particles) {
        // Mouse interaction: stronger attraction when active, weaker when idle
        const dx = mouse.x - p.x
        const dy = mouse.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (isIdle ? IDLE_FORCE : MOUSE_FORCE) * (1 - dist / MOUSE_RADIUS)
          p.vx += (dx / dist) * force
          p.vy += (dy / dist) * force
        }

        // Move
        p.x += p.vx
        p.y += p.vy

        // Damping
        p.vx *= 0.995
        p.vy *= 0.995

        // Speed limit
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > MAX_SPEED) {
          p.vx = (p.vx / speed) * MAX_SPEED
          p.vy = (p.vy / speed) * MAX_SPEED
        }

        // Smooth edge wrapping with fade margin
        const margin = 30
        if (p.x < -margin) p.x = w + margin
        if (p.x > w + margin) p.x = -margin
        if (p.y < -margin) p.y = h + margin
        if (p.y > h + margin) p.y = -margin

        // Burst size decay
        p.burstSize *= 0.92
        p.size = p.baseSize + p.burstSize

        // Draw particle
        const actualHue = p.hue > 360 ? p.hue - 360 : p.hue
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `hsla(${actualHue}, 70%, 55%, ${p.opacity})`
        ctx.fill()
      }

      // Draw neural network connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i]
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist < CONNECTION_DISTANCE) {
            // Check proximity to cursor for glow boost
            const midX = (a.x + b.x) / 2
            const midY = (a.y + b.y) / 2
            const mouseDist = Math.sqrt((midX - mouse.x) ** 2 + (midY - mouse.y) ** 2)
            const isNearMouse = mouseDist < MOUSE_LINE_RADIUS

            const baseAlpha = LINE_OPACITY * (1 - dist / CONNECTION_DISTANCE)
            const alpha = isNearMouse
              ? baseAlpha + (MOUSE_LINE_OPACITY - baseAlpha) * (1 - mouseDist / MOUSE_LINE_RADIUS)
              : baseAlpha

            const actualHueA = a.hue > 360 ? a.hue - 360 : a.hue
            const actualHueB = b.hue > 360 ? b.hue - 360 : b.hue
            const avgHue = (actualHueA + actualHueB) / 2

            ctx.beginPath()
            ctx.moveTo(a.x, a.y)
            ctx.lineTo(b.x, b.y)
            ctx.strokeStyle = `hsla(${avgHue}, 60%, 50%, ${alpha})`
            ctx.lineWidth = isNearMouse ? 1 : 0.5
            ctx.stroke()
          }
        }
      }

      // Draw mouse glow — subtle pulse
      if (mouse.x > 0 && mouse.y > 0) {
        const pulse = 0.6 + 0.4 * Math.sin(now * 0.002) // slow breathing pulse
        const gradient = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, MOUSE_RADIUS)
        gradient.addColorStop(0, `hsla(0, 80%, 55%, ${0.05 * pulse})`)
        gradient.addColorStop(0.5, `hsla(0, 70%, 50%, ${0.025 * pulse})`)
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
