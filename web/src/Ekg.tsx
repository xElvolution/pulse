import { useEffect, useRef } from 'react'

/**
 * Scrolling EKG trace drawn on canvas.
 * vitality 1 → strong regular QRS complexes; vitality 0 → flatline.
 */
export default function Ekg({ vitality, height = 120 }: { vitality: number; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const vit = useRef(vitality)
  vit.current = vitality

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let x = 0
    let phase = 0
    let last = performance.now()

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.scale(dpr, dpr)
      ctx.fillStyle = 'rgba(8, 9, 12, 1)'
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      x = 0
    }
    resize()
    window.addEventListener('resize', resize)

    // Classic PQRST waveform sampled at a phase in [0,1)
    const wave = (p: number, v: number): number => {
      if (v < 0.02) return 0 // flatline
      let y = 0
      y += 0.08 * Math.exp(-(((p - 0.18) * 22) ** 2)) // P wave
      y -= 0.12 * Math.exp(-(((p - 0.36) * 55) ** 2)) // Q dip
      y += 1.0 * Math.exp(-(((p - 0.4) * 42) ** 2)) // R spike
      y -= 0.22 * Math.exp(-(((p - 0.45) * 48) ** 2)) // S dip
      y += 0.18 * Math.exp(-(((p - 0.62) * 18) ** 2)) // T wave
      return y * (0.25 + 0.75 * v)
    }

    const draw = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const v = vit.current
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      const midY = h * 0.58
      const speed = 110 // px/s sweep
      const bps = v < 0.02 ? 0.0001 : 0.35 + 0.85 * v

      // fade trail
      ctx.fillStyle = 'rgba(8, 9, 12, 0.06)'
      ctx.fillRect(0, 0, w, h)

      const steps = Math.max(1, Math.round(speed * dt))
      for (let i = 0; i < steps; i++) {
        const px = x % w
        const prevPhase = phase
        phase = (phase + (bps * dt) / steps) % 1
        const y1 = midY - wave(prevPhase, v) * h * 0.42
        const y2 = midY - wave(phase, v) * h * 0.42

        const alive = v > 0.5
        ctx.strokeStyle = alive ? '#ff3b4e' : v > 0.02 ? '#3ba7c9' : '#4a4d55'
        ctx.lineWidth = 1.6
        ctx.shadowBlur = 12
        ctx.shadowColor = ctx.strokeStyle
        ctx.beginPath()
        ctx.moveTo(px, y1)
        ctx.lineTo(px + 1, y2)
        ctx.stroke()
        ctx.shadowBlur = 0
        x++
        // clear a gap ahead of the sweep head
        ctx.fillStyle = 'rgba(8, 9, 12, 1)'
        ctx.fillRect((x % w) + 2, 0, 14, h)
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return <canvas ref={ref} style={{ width: '100%', height, display: 'block' }} />
}
