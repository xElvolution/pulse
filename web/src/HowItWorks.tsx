import { useEffect, useRef, useState, type ReactNode } from 'react'
import gsap from 'gsap'

/* ---------------------------------- tilt card ---------------------------------- */

function TiltCard({
  children,
  onClick,
  onHover,
}: {
  children: ReactNode
  onClick?: () => void
  onHover?: (hovered: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current!
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width
    const py = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${px * 100}%`)
    el.style.setProperty('--my', `${py * 100}%`)
    gsap.to(el, {
      rotateY: (px - 0.5) * 8,
      rotateX: (0.5 - py) * 8,
      duration: 0.5,
      ease: 'power2.out',
      transformPerspective: 900,
    })
  }
  const onLeave = () => {
    onHover?.(false)
    gsap.to(ref.current, { rotateX: 0, rotateY: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' })
  }

  return (
    <div
      className="tilt-card"
      ref={ref}
      onMouseMove={onMove}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      <div className="spotlight" />
      {children}
    </div>
  )
}

/* ------------------------------ canvas helpers ------------------------------ */

function useViz(draw: (ctx: CanvasRenderingContext2D, t: number, dt: number, w: number, h: number) => void) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawRef = useRef(draw)
  drawRef.current = draw

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let start = performance.now()
    let last = start

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2)
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      drawRef.current(ctx, (now - start) / 1000, dt, canvas.clientWidth, canvas.clientHeight)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return ref
}

const ALIVE = '#ff3b4e'
const DYING = '#3ba7c9'
const DEAD = '#4a4d55'
const INK_DIM = '#8b8e98'

/* ------------------------- 01 CREATE, vault fills up ------------------------- */

function CreateViz({ hovered }: { hovered: boolean }) {
  const fill = useRef(0.25)
  const coins = useRef<{ x: number; y: number; v: number }[]>([])

  const ref = useViz((ctx, t, dt, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const target = hovered ? 1 : 0.25
    fill.current += (target - fill.current) * dt * 2.2

    if (hovered && Math.random() < 0.25) {
      coins.current.push({ x: w * (0.35 + Math.random() * 0.3), y: -6, v: 60 + Math.random() * 80 })
    }

    const vx = w * 0.22, vy = h * 0.14, vw = w * 0.56, vh = h * 0.62
    const level = vy + vh - vh * fill.current

    const grad = ctx.createLinearGradient(0, level, 0, vy + vh)
    grad.addColorStop(0, 'rgba(255,59,78,0.55)')
    grad.addColorStop(1, 'rgba(255,59,78,0.12)')
    ctx.save()
    ctx.beginPath()
    ctx.roundRect(vx, vy, vw, vh, 10)
    ctx.clip()
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(vx, level + Math.sin(t * 2.1) * 3)
    for (let x = 0; x <= vw; x += 8) {
      ctx.lineTo(vx + x, level + Math.sin(t * 2.1 + x * 0.05) * 3)
    }
    ctx.lineTo(vx + vw, vy + vh)
    ctx.lineTo(vx, vy + vh)
    ctx.fill()
    ctx.restore()

    ctx.strokeStyle = hovered ? ALIVE : 'rgba(242,239,233,0.25)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(vx, vy, vw, vh, 10)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(vx + vw * 0.3, vy)
    ctx.lineTo(vx + vw * 0.7, vy)
    ctx.strokeStyle = hovered ? ALIVE : INK_DIM
    ctx.lineWidth = 3
    ctx.stroke()

    coins.current = coins.current.filter((c) => c.y < level - 4)
    for (const c of coins.current) {
      c.y += c.v * dt
      c.v += 400 * dt
      ctx.beginPath()
      ctx.arc(c.x, c.y, 3.2, 0, Math.PI * 2)
      ctx.fillStyle = ALIVE
      ctx.shadowColor = ALIVE
      ctx.shadowBlur = 8
      ctx.fill()
      ctx.shadowBlur = 0
    }

    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.fillStyle = hovered ? ALIVE : INK_DIM
    ctx.textAlign = 'center'
    ctx.fillText(`${Math.round(fill.current * 100)}% LOCKED`, w / 2, vy + vh + 20)
  })

  return <canvas ref={ref} className="viz" />
}

/* -------------------- 02 BEAT, click to send a heartbeat -------------------- */

function BeatViz({ beats, lastBeatAt }: { beats: number; lastBeatAt: number }) {
  const ref = useViz((ctx, t, _dt, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const midY = h * 0.45
    const since = (performance.now() - lastBeatAt) / 1000

    ctx.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const p = x / w
      let y = Math.sin(t * 3 + p * 12) * 2
      const spikeCenter = Math.min(since / 0.9, 1.2)
      const d = (p - spikeCenter) * 14
      y -= 26 * Math.exp(-d * d) * Math.max(0, 1 - since * 0.55)
      if (x === 0) ctx.moveTo(x, midY + y)
      else ctx.lineTo(x, midY + y)
    }
    const hot = since < 0.9
    ctx.strokeStyle = hot ? ALIVE : 'rgba(255,59,78,0.45)'
    ctx.lineWidth = 1.8
    ctx.shadowColor = ALIVE
    ctx.shadowBlur = hot ? 14 : 4
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = hot ? ALIVE : INK_DIM
    ctx.fillText(`${beats} HEARTBEAT${beats === 1 ? '' : 'S'} SENT. CLICK ME`, w / 2, h - 10)
  })

  return <canvas ref={ref} className="viz" />
}

/* ------------------- 03 FLATLINE, hover to watch it die ------------------- */

function FlatlineViz({ hovered }: { hovered: boolean }) {
  const life = useRef(1)

  const ref = useViz((ctx, t, dt, w, h) => {
    ctx.clearRect(0, 0, w, h)
    const target = hovered ? 0 : 1
    life.current += (target - life.current) * dt * (hovered ? 1.6 : 2.5)
    const v = life.current
    const midY = h * 0.45

    ctx.beginPath()
    for (let x = 0; x <= w; x += 2) {
      const p = (x / w) * 3 + t * 1.4
      const cycle = p % 1
      let y = 0
      y += 0.12 * Math.exp(-(((cycle - 0.2) * 20) ** 2))
      y += 1.0 * Math.exp(-(((cycle - 0.42) * 38) ** 2))
      y -= 0.25 * Math.exp(-(((cycle - 0.48) * 42) ** 2))
      y += 0.2 * Math.exp(-(((cycle - 0.66) * 16) ** 2))
      const yy = midY - y * h * 0.3 * v
      if (x === 0) ctx.moveTo(x, yy)
      else ctx.lineTo(x, yy)
    }
    const col = v > 0.5 ? ALIVE : v > 0.06 ? DYING : DEAD
    ctx.strokeStyle = col
    ctx.lineWidth = 1.8
    ctx.shadowColor = col
    ctx.shadowBlur = 10 * v + 2
    ctx.stroke()
    ctx.shadowBlur = 0

    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.textAlign = 'center'
    if (v <= 0.06) {
      ctx.fillStyle = ALIVE
      ctx.fillText('FLATLINED. VAULT CLAIMABLE', w / 2, h - 10)
    } else {
      ctx.fillStyle = INK_DIM
      ctx.fillText(hovered ? 'LOSING SIGNAL…' : 'HOVER TO MISS YOUR WINDOW', w / 2, h - 10)
    }
  })

  return <canvas ref={ref} className="viz" />
}

/* ----------------- the playable demo, a tiny two-wallet story ----------------- */

const DEMO_NOTE = 'the seed phrase is in the blue notebook, second shelf. i love you.'
const DEMO_SECONDS = 10

function LifeDemo() {
  const vitality = useRef(1)
  const [phase, setPhase] = useState<'alive' | 'dead' | 'claimed'>('alive')
  const [beats, setBeats] = useState(1)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const claimAnim = useRef(0) // 0..1 coins flying vault -> Sarah
  const zoneRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  const ref = useViz((ctx, t, dt, w, h) => {
    ctx.clearRect(0, 0, w, h)
    if (phaseRef.current === 'alive') {
      vitality.current = Math.max(0, vitality.current - dt / DEMO_SECONDS)
      if (vitality.current <= 0) setPhase('dead')
    }
    if (phaseRef.current === 'claimed' && claimAnim.current < 1) {
      claimAnim.current = Math.min(1, claimAnim.current + dt * 0.8)
    }
    const v = vitality.current
    const dead = phaseRef.current !== 'alive'
    const claimed = phaseRef.current === 'claimed'

    const youX = w * 0.14, vaultX = w * 0.5, sarahX = w * 0.86
    const cy = h * 0.44

    /* --- connection lines: you -> vault (heartbeat wire), vault -> sarah --- */
    const wireY = cy
    // left wire carries little pulse dots while alive
    ctx.strokeStyle = dead ? 'rgba(74,77,85,0.4)' : 'rgba(255,59,78,0.25)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 5])
    ctx.beginPath(); ctx.moveTo(youX + 42, wireY); ctx.lineTo(vaultX - 52, wireY); ctx.stroke()
    ctx.strokeStyle = claimed ? 'rgba(255,59,78,0.5)' : 'rgba(139,142,152,0.2)'
    ctx.beginPath(); ctx.moveTo(vaultX + 52, wireY); ctx.lineTo(sarahX - 42, wireY); ctx.stroke()
    ctx.setLineDash([])

    if (!dead) {
      // pulse dot travelling from you to the vault, one per heartbeat cycle
      const p = (t * 0.7) % 1
      const px = youX + 42 + (vaultX - 52 - youX - 42) * p
      ctx.beginPath(); ctx.arc(px, wireY, 3, 0, Math.PI * 2)
      ctx.fillStyle = ALIVE; ctx.shadowColor = ALIVE; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0
    }
    if (claimed) {
      // coins flying from vault to Sarah
      for (let i = 0; i < 5; i++) {
        const p = Math.max(0, Math.min(1, claimAnim.current * 1.4 - i * 0.08))
        if (p <= 0 || p >= 1) continue
        const px = vaultX + 52 + (sarahX - 42 - vaultX - 52) * p
        const py = wireY - Math.sin(p * Math.PI) * 26
        ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fillStyle = ALIVE; ctx.shadowColor = ALIVE; ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0
      }
    }

    /* --- YOU node --- */
    ctx.strokeStyle = dead ? DEAD : ALIVE
    ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(youX, cy, 34, 0, Math.PI * 2); ctx.stroke()
    ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(dead ? '🪦' : '🫀', youX, cy - 2)
    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.fillStyle = dead ? DEAD : '#f2efe9'
    ctx.fillText('YOU', youX, cy + 52)
    ctx.fillStyle = INK_DIM
    ctx.fillText(dead ? 'stopped checking in' : 'alive & checking in', youX, cy + 68)

    /* --- SARAH node --- */
    ctx.strokeStyle = claimed ? ALIVE : 'rgba(139,142,152,0.5)'
    ctx.beginPath(); ctx.arc(sarahX, cy, 34, 0, Math.PI * 2); ctx.stroke()
    ctx.font = '20px sans-serif'
    ctx.fillText('👩', sarahX, cy - 2)
    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.fillStyle = claimed ? ALIVE : '#f2efe9'
    ctx.fillText('SARAH', sarahX, cy + 52)
    ctx.fillStyle = claimed ? ALIVE : INK_DIM
    ctx.fillText(claimed ? 'received 5 MON ♥' : 'your beneficiary', sarahX, cy + 68)

    /* --- VAULT node: heart in a box with countdown ring --- */
    const bps = dead ? 0 : 0.5 + 1.1 * v
    const cycle = (t * bps) % 1
    const env = dead ? 0 : Math.exp(-(((cycle - 0.12) * 18) ** 2)) + 0.55 * Math.exp(-(((cycle - 0.34) * 16) ** 2))
    const col = dead ? (claimed ? DEAD : ALIVE) : v > 0.4 ? ALIVE : DYING

    // countdown ring around the vault
    ctx.beginPath()
    ctx.arc(vaultX, cy, 46, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * v)
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke()
    ctx.beginPath(); ctx.arc(vaultX, cy, 46, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(242,239,233,0.08)'; ctx.stroke()

    // the money inside: shrinks away when claimed
    const moneyScale = claimed ? 1 - claimAnim.current : 1
    if (moneyScale > 0.01) {
      const r = (16 + env * 5) * moneyScale
      ctx.beginPath(); ctx.arc(vaultX, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 24 * (0.4 + env); ctx.fill(); ctx.shadowBlur = 0
      ctx.font = `600 ${Math.max(9, 11 * moneyScale)}px JetBrains Mono, monospace`
      ctx.fillStyle = '#0b0507'
      ctx.fillText('5', vaultX, cy)
    }
    ctx.font = '600 11px JetBrains Mono, monospace'
    ctx.fillStyle = INK_DIM
    ctx.fillText(claimed ? 'VAULT EMPTY' : 'VAULT · 5 MON', vaultX, cy + 68)

    // big countdown number under the ring
    if (!dead) {
      ctx.font = '600 13px JetBrains Mono, monospace'
      ctx.fillStyle = v > 0.4 ? ALIVE : DYING
      ctx.fillText(`${Math.ceil(v * DEMO_SECONDS)}s`, vaultX, cy - 62)
    }
  })

  const narration =
    phase === 'alive'
      ? vitality.current > 0.4
        ? 'You locked 5 MON for Sarah. Keep pressing the button before the ring runs out, like you would once a week in real life.'
        : 'The ring is almost empty. This is what "forgetting to check in" looks like. Press the button!'
      : phase === 'dead'
        ? 'You stopped checking in. The vault flatlined, and now only Sarah can take what you left.'
        : 'The vault paid Sarah automatically. No lawyer, no exchange, no one to ask permission.'

  const beat = () => {
    if (phaseRef.current !== 'alive') return
    vitality.current = 1
    setBeats((b) => b + 1)
    gsap.fromTo(btnRef.current, { scale: 1 }, { scale: 1.12, duration: 0.09, yoyo: true, repeat: 1, ease: 'power2.out' })
  }
  const restart = () => {
    vitality.current = 1
    claimAnim.current = 0
    setPhase('alive')
    setBeats(1)
  }

  return (
    <div className={`demo-zone ${phase !== 'alive' ? 'dead' : ''}`} ref={zoneRef}>
      <div className="demo-head">
        <span className="demo-title">Try it. This is the whole product in 10 seconds</span>
        <span className="demo-beats">{beats} check-in{beats === 1 ? '' : 's'}</span>
      </div>

      <canvas ref={ref} className="viz demo-canvas" />

      <p className="demo-narration">{narration}</p>

      <div className="demo-controls">
        {phase === 'alive' && (
          <button ref={btnRef} className="btn primary demo-beat-btn" onClick={beat}>
            ♥ I'm alive, reset my timer
          </button>
        )}
        {phase === 'dead' && (
          <button className="btn primary demo-beat-btn" onClick={() => setPhase('claimed')}>
            Now be Sarah: claim the vault
          </button>
        )}
        {phase === 'claimed' && (
          <>
            <p className="note-reveal">Sarah also gets your last words: “{DEMO_NOTE}”</p>
            <button className="btn" onClick={restart}>↺ Replay</button>
          </>
        )}
      </div>
    </div>
  )
}

/* --------------------------------- section --------------------------------- */

export default function HowItWorks() {
  const [createHover, setCreateHover] = useState(false)
  const [flatHover, setFlatHover] = useState(false)
  const [beats, setBeats] = useState(0)
  const [lastBeatAt, setLastBeatAt] = useState(0)

  return (
    <section className="section">
      <h2 className="reveal">How it works</h2>
      <p className="lede reveal">
        Three moves. One promise: your assets outlive your access, not the other way around.
        Don't just read it. <em>Play it.</em>
      </p>

      <div className="steps interactive">
        <TiltCard onHover={setCreateHover}>
          <span className="num">01 / CREATE</span>
          <h3>Lock a vault</h3>
          <CreateViz hovered={createHover} />
          <p>Deposit MON or any token. Name who inherits it, add their email, and leave last words only they will ever read.</p>
        </TiltCard>

        <TiltCard onClick={() => { setBeats((b) => b + 1); setLastBeatAt(performance.now()) }}>
          <span className="num">02 / BEAT</span>
          <h3>Keep the pulse</h3>
          <BeatViz beats={beats} lastBeatAt={lastBeatAt} />
          <p>One click, one tiny transaction, and the countdown resets. Every check-in is a heartbeat recorded onchain.</p>
        </TiltCard>

        <TiltCard onHover={setFlatHover}>
          <span className="num">03 / FLATLINE</span>
          <h3>It passes on</h3>
          <FlatlineViz hovered={flatHover} />
          <p>Miss a full interval and your person can paste their address, see what you left, and claim it. Trustless, unstoppable.</p>
        </TiltCard>
      </div>

      <LifeDemo />
    </section>
  )
}
