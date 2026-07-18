import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { WillCard, CreatePanel, short, INTERVALS, isAddr, type WillDraft } from './components'
import { useMyWills, usePulseWrite } from './hooks'

export function VaultsPage() {
  const { address } = useAccount()
  const { mine, forMe, refetch } = useMyWills()
  const tx = usePulseWrite(refetch)
  const navigate = useNavigate()
  const alive = mine.filter((w) => !w.closed)

  return (
    <>
      <div className="app-page-head">
        <div>
          <h2>My wills</h2>
          <p className="lede" style={{ marginBottom: 0 }}>
            {alive.length} alive · {short(address!)}
          </p>
        </div>
        {alive.length > 1 && (
          <button className="btn primary" disabled={tx.isPending} onClick={() => tx.beatAll()}>
            ♥ One beat for all {alive.length}
          </button>
        )}
      </div>

      <div className="dash">
        {mine.length === 0 && (
          <div className="empty">
            <div className="serif">Nothing here yet</div>
            <p style={{ marginBottom: '1.25rem' }}>Write your first will. It takes one transaction.</p>
            <button className="btn primary" onClick={() => navigate('/app/new')}>+ New will</button>
          </div>
        )}
        {mine.map((w) => <WillCard key={`m${w.id}`} will={w} isMine refetch={refetch} />)}

        {forMe.length > 0 && (
          <>
            <h2 style={{ marginTop: '2rem' }}>Left for you</h2>
            {forMe.map(({ will, indexes }) => (
              <WillCard key={`f${will.id}`} will={will} isMine={false} myIndexes={indexes} refetch={refetch} />
            ))}
          </>
        )}
      </div>
    </>
  )
}

/* ------------- live will preview: reacts to the form as you type ------------- */

const ALIVE = '#ff3b4e'
const INK = '#f2efe9'
const INK_DIM = '#8b8e98'

function WillPreview({ draft }: { draft: WillDraft }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef(draft)
  const amountPop = useRef(0)
  const prevAmount = useRef('')
  if (draft.amount !== prevAmount.current) {
    prevAmount.current = draft.amount
    amountPop.current = 1
  }
  draftRef.current = draft

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const start = performance.now()
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
      const t = (now - start) / 1000
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const d = draftRef.current
      const w = canvas.clientWidth, h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h * 0.38
      const scale = Math.min(w, h) / 300

      amountPop.current = Math.max(0, amountPop.current - dt * 2.5)
      const pop = 1 + amountPop.current * 0.25

      const hasAmount = Number(d.amount) > 0
      const heirs = d.heirs.filter((x) => x.name.trim().length > 0)

      // heartbeat
      const cycle = (t * 0.9) % 1
      const env = Math.exp(-(((cycle - 0.12) * 18) ** 2)) + 0.55 * Math.exp(-(((cycle - 0.34) * 16) ** 2))

      // the pool heart in the middle
      const baseR = 52 * scale * pop
      const r = baseR + (hasAmount ? env * 11 * scale : 0)
      const col = hasAmount ? ALIVE : 'rgba(139,142,152,0.5)'

      // heir satellites arranged around the heart, each fed by a line
      const n = Math.max(heirs.length, 1)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / n + t * 0.1
        const dist = 118 * scale
        const hx = cx + Math.cos(a) * dist
        const hy = cy + Math.sin(a) * dist * 0.72
        const heir = heirs[i]

        // connection line with a travelling pulse dot
        ctx.strokeStyle = heir ? 'rgba(255,59,78,0.28)' : 'rgba(139,142,152,0.15)'
        ctx.lineWidth = 1.2
        ctx.setLineDash([3, 4])
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(hx, hy); ctx.stroke()
        ctx.setLineDash([])
        if (heir && hasAmount) {
          const p = (t * 0.5 + i / n) % 1
          ctx.beginPath()
          ctx.arc(cx + (hx - cx) * p, cy + (hy - cy) * p, 2.4, 0, Math.PI * 2)
          ctx.fillStyle = ALIVE
          ctx.shadowColor = ALIVE; ctx.shadowBlur = 8
          ctx.fill(); ctx.shadowBlur = 0
        }

        // satellite node
        ctx.beginPath()
        ctx.arc(hx, hy, 17 * scale, 0, Math.PI * 2)
        ctx.strokeStyle = heir ? ALIVE : 'rgba(139,142,152,0.4)'
        ctx.lineWidth = 1.4
        ctx.stroke()
        ctx.font = `600 ${Math.round(11 * scale)}px JetBrains Mono, monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillStyle = heir ? INK : INK_DIM
        ctx.fillText(heir ? heir.name.trim().slice(0, 8) : '?', hx, hy - 26 * scale)
        if (heir) {
          ctx.fillStyle = INK_DIM
          ctx.font = `600 ${Math.round(9 * scale)}px JetBrains Mono, monospace`
          const sub = d.mode === 'ration'
            ? `${heir.allocation || '0'} MON`
            : 'first-come'
          ctx.fillText(sub, hx, hy + 28 * scale)
          // small key/wallet glyph inside
          ctx.font = `${Math.round(12 * scale)}px sans-serif`
          ctx.fillText(isAddr(heir.wallet.trim()) ? '👛' : '🗝', hx, hy)
        }
      }

      // pool on top of the lines
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.shadowColor = ALIVE
      ctx.shadowBlur = hasAmount ? 24 * (0.4 + env) : 0
      ctx.fill()
      ctx.shadowBlur = 0
      ctx.font = `600 ${Math.round(17 * scale)}px JetBrains Mono, monospace`
      ctx.fillStyle = hasAmount ? '#0b0507' : INK_DIM
      ctx.fillText(hasAmount ? d.amount : '?', cx, cy)

      // labels
      const label = INTERVALS.find((iv) => iv.secs === d.interval)?.label ?? ''
      ctx.font = `600 ${Math.round(12 * scale)}px JetBrains Mono, monospace`
      ctx.fillStyle = INK_DIM
      ctx.fillText('HEARTBEAT EVERY ' + label.toUpperCase().replace(' (DEMO)', ''), cx, h - 46 * scale)
      ctx.font = `400 ${Math.round(20 * scale)}px Instrument Serif, serif`
      ctx.fillStyle = heirs.length ? INK : INK_DIM
      ctx.fillText(
        heirs.length === 0
          ? 'name your heirs…'
          : d.mode === 'fcfs'
            ? `${heirs.length} heir${heirs.length > 1 ? 's' : ''}, first to claim takes all`
            : `${heirs.length} heir${heirs.length > 1 ? 's' : ''}, each with their share`,
        cx, h - 20 * scale,
      )

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div className="vault-preview">
      <span className="vault-preview-label">LIVE PREVIEW</span>
      <canvas ref={ref} className="vault-preview-canvas" />
    </div>
  )
}

export function NewVaultPage() {
  const { refetch } = useMyWills()
  const navigate = useNavigate()
  const [draft, setDraft] = useState<WillDraft>({
    heirs: [], amount: '', interval: INTERVALS[0].secs, note: '', mode: 'fcfs',
  })

  return (
    <>
      <div className="app-page-head">
        <div>
          <h2>New will</h2>
          <p className="lede" style={{ marginBottom: 0 }}>
            Pool funds for the people you love. They can only touch it if your heartbeat stops.
          </p>
        </div>
      </div>
      <div className="new-vault-split">
        <CreatePanel refetch={() => { refetch(); navigate('/app') }} onDraft={setDraft} />
        <WillPreview draft={draft} />
      </div>
    </>
  )
}
