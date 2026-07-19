import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useConnect } from 'wagmi'
import { formatEther } from 'viem'
import gsap from 'gsap'
import Ekg from './Ekg'
import { WillCard, useTokenSymbol, short } from './components'
import { useWillSearchByContact, useCountdown, fmtDuration, useMyWills, usePulseWrite, type Will } from './hooks'

const ALIVE = '#ff3b4e'
const INK_DIM = '#8b8e98'

/* ---------------- sonar: listening for a pulse, ripples on touch ---------------- */

function Sonar({ found, searching }: { found: number; searching: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const state = useRef({
    ripples: [] as { x: number; y: number; r: number; a: number }[],
    blips: [] as { x: number; y: number; born: number }[],
    mouse: { x: -1, y: -1 },
    found,
    searching,
  })
  state.current.found = found
  state.current.searching = searching

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let raf = 0
    let start = performance.now()

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
      const w = canvas.clientWidth, h = canvas.clientHeight
      const s = state.current
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2, cy = h / 2
      const R = Math.min(w, h) * 0.42

      // rings
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath()
        ctx.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(242,239,233,0.07)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      // crosshair
      ctx.beginPath()
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy)
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R)
      ctx.stroke()

      // sweep
      const ang = t * (s.searching ? 2.4 : 0.8)
      const grad = typeof (ctx as any).createConicGradient === 'function'
        ? (ctx as any).createConicGradient(ang, cx, cy)
        : null
      if (grad) {
        grad.addColorStop(0, 'rgba(255,59,78,0.28)')
        grad.addColorStop(0.12, 'rgba(255,59,78,0)')
        grad.addColorStop(1, 'rgba(255,59,78,0)')
        ctx.save()
        ctx.beginPath()
        ctx.arc(cx, cy, R, 0, Math.PI * 2)
        ctx.clip()
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, w, h)
        ctx.restore()
      }
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R)
      ctx.strokeStyle = 'rgba(255,59,78,0.6)'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // spawn blips for found vaults, one heartbeat blip per found vault
      if (s.found > 0 && s.blips.length < s.found) {
        const a = Math.random() * Math.PI * 2
        const r = R * (0.3 + Math.random() * 0.55)
        s.blips.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, born: t })
      }
      if (s.found === 0) s.blips = []
      for (const b of s.blips) {
        const pulse = 1 + Math.sin((t - b.born) * 4) * 0.3
        ctx.beginPath()
        ctx.arc(b.x, b.y, 5 * pulse, 0, Math.PI * 2)
        ctx.fillStyle = ALIVE
        ctx.shadowColor = ALIVE
        ctx.shadowBlur = 16
        ctx.fill()
        ctx.shadowBlur = 0
        ctx.font = '600 10px JetBrains Mono, monospace'
        ctx.textAlign = 'center'
        ctx.fillStyle = ALIVE
        ctx.fillText('VAULT', b.x, b.y - 14)
      }

      // cursor ripples
      s.ripples = s.ripples.filter((rp) => rp.a > 0.01)
      for (const rp of s.ripples) {
        rp.r += 1.4
        rp.a *= 0.95
        ctx.beginPath()
        ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,59,78,${rp.a})`
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      // status text
      ctx.font = '600 11px JetBrains Mono, monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = s.found > 0 ? ALIVE : INK_DIM
      ctx.fillText(
        s.found > 0
          ? `${s.found} VAULT${s.found === 1 ? '' : 'S'} FOUND`
          : s.searching
            ? 'SCANNING THE CHAIN…'
            : 'LISTENING FOR A PULSE',
        cx,
        h - 12,
      )

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  const ripple = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect()
    state.current.ripples.push({ x: e.clientX - rect.left, y: e.clientY - rect.top, r: 4, a: 0.5 })
  }

  return (
    <canvas
      ref={ref}
      className="sonar"
      onPointerMove={(e) => { if (Math.random() < 0.3) ripple(e) }}
      onPointerDown={ripple}
    />
  )
}

/* ------------------------------ found will card ------------------------------ */

const ZERO = '0x0000000000000000000000000000000000000000'

const VERIFIER_API = import.meta.env.VITE_VERIFIER_API ?? 'http://localhost:8787'

/** Email-verified claim: request a code, prove the inbox, paste any address. */
function EmailClaim({ will, index, payout, symbol, email }: {
  will: Will; index: number; payout: bigint; symbol: string; email: string
}) {
  const [step, setStep] = useState<'start' | 'code' | 'done'>('start')
  const [code, setCode] = useState('')
  const [recipient, setRecipient] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [txHash, setTxHash] = useState('')

  const post = async (path: string, body: object) => {
    const res = await fetch(`${VERIFIER_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`)
    return data
  }

  const requestCode = async () => {
    setBusy(true); setErr('')
    try {
      await post('/request-code', { willId: will.id.toString(), index })
      setStep('code')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const submitClaim = async () => {
    setBusy(true); setErr('')
    try {
      const data = await post('/claim', { willId: will.id.toString(), index, code: code.trim(), recipient: recipient.trim() })
      setTxHash(data.txHash ?? '')
      setStep('done')
    } catch (e) { setErr((e as Error).message) } finally { setBusy(false) }
  }

  const masked = email.replace(/^(.{2}).*(@.*)$/, '$1…$2')

  if (step === 'done') {
    return (
      <div style={{ display: 'grid', gap: '0.5rem', justifyItems: 'start' }}>
        <p className="claim-hint">
          Done. {formatEther(payout)} {symbol} was sent to {recipient.slice(0, 6)}…{recipient.slice(-4)}.
        </p>
        {txHash && <span className="tx-status">tx {txHash.slice(0, 10)}…</span>}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
      {step === 'start' && (
        <>
          <p className="claim-hint">
            This share is claimed by proving you own <b>{masked}</b>. We email you a code -
            no wallet or crypto knowledge needed.
          </p>
          <button className="btn primary" disabled={busy} onClick={requestCode}>
            {busy ? 'Sending…' : 'Email me a verification code'}
          </button>
        </>
      )}
      {step === 'code' && (
        <>
          <p className="claim-hint">
            We sent a 6-digit code to {masked}. Enter it below, then paste the wallet
            address where you want to receive the funds.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <input style={{ width: 130 }} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} />
            <input style={{ width: 300 }} placeholder="0x… address to receive the funds" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              className="btn primary"
              disabled={busy || code.trim().length < 4 || !/^0x[a-fA-F0-9]{40}$/.test(recipient.trim())}
              onClick={submitClaim}
            >
              {busy ? 'Claiming…' : `Claim ${formatEther(payout)} ${symbol}`}
            </button>
            <button className="btn" disabled={busy} onClick={requestCode}>Resend code</button>
          </div>
        </>
      )}
      {err && <span className="tx-status err">{err}</span>}
    </div>
  )
}

function FoundWill({ will, indexes, refetch }: { will: Will; indexes: number[]; refetch: () => void }) {
  const { secondsLeft } = useCountdown(will)
  const symbol = useTokenSymbol(will.token)
  const { isConnected, address } = useAccount()
  const { connect, connectors } = useConnect()
  const tx = usePulseWrite(refetch)
  const flatlined = !will.closed && secondsLeft === 0

  return (
    <div className={`vault-card ${flatlined ? 'flatlined' : ''}`}>
      <div className="vault-head">
        <span className="title">
          {indexes.length === 1 && will.beneficiaries[indexes[0]]?.name
            ? `For ${will.beneficiaries[indexes[0]].name}`
            : 'A will names you'}
        </span>
        <span className={`status ${flatlined ? 'dead' : 'alive'}`}>
          ● {will.closed ? 'closed by owner' : flatlined ? 'ready to claim' : 'owner still alive'}
        </span>
      </div>
      <div className="vault-meta">
        <div className="kv">
          <span className="k">Pool</span>
          <span className="v big">{formatEther(will.balance)} {symbol}</span>
        </div>
        <div className="kv">
          <span className="k">From</span>
          <span className="v">{short(will.owner)}</span>
        </div>
        {!flatlined && !will.closed && (
          <div className="kv">
            <span className="k">Unlocks if they miss</span>
            <span className="v">{fmtDuration(secondsLeft)}</span>
          </div>
        )}
      </div>

      {flatlined && will.note && <div className="note-reveal">"{will.note}"</div>}

      {!will.closed && indexes.map((i) => {
        const b = will.beneficiaries[i]
        if (!b) return null
        const isCode = b.wallet === ZERO
        const fullyClaimed = b.claimed >= b.allocation && b.allocation > 0n
        const remaining = b.allocation - b.claimed
        const payout = remaining < will.balance ? remaining : will.balance
        const isMyWallet = isConnected && !isCode && address?.toLowerCase() === b.wallet.toLowerCase()

        return (
          <div key={i} className="vault-actions" style={{ display: 'grid', gap: '0.75rem', justifyItems: 'start' }}>
            <p className="claim-hint">
              <b>{b.name || `Heir ${i + 1}`}</b> - allocated {formatEther(b.allocation)} {symbol}
              {b.claimed > 0n && `, ${formatEther(b.claimed)} already claimed`}.
            </p>
            {fullyClaimed ? (
              <p className="claim-hint">This share has been fully claimed.</p>
            ) : !flatlined ? (
              <p className="claim-hint">They are still checking in. If that ever stops, come back and this becomes claimable.</p>
            ) : isCode ? (
              <EmailClaim will={will} index={i} payout={payout} symbol={symbol} email={b.email} />
            ) : isMyWallet ? (
              <button
                className="btn primary"
                disabled={tx.isPending}
                onClick={() => tx.claim(will.id, BigInt(i))}
              >
                {tx.isPending ? 'Claiming…' : `Claim ${formatEther(payout)} ${symbol}`}
              </button>
            ) : (
              <>
                <p className="claim-hint">This is yours. Connect the wallet ending in {b.wallet.slice(-4)} to claim it.</p>
                <button className="btn primary" onClick={() => connect({ connector: connectors[0] })}>Connect wallet & claim</button>
              </>
            )}
          </div>
        )
      })}
      {tx.error && <span className="tx-status err">{(tx.error as Error).message.split('\n')[0].slice(0, 90)}</span>}
      {tx.isSuccess && <span className="tx-status">Claimed. Check your wallet.</span>}
    </div>
  )
}

/* ---------------------------------- page ---------------------------------- */

export default function ClaimPage({ standalone = false }: { standalone?: boolean }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const { matches, isLoading, searched } = useWillSearchByContact(
    submitted ? name : '',
    submitted ? email : '',
    submitted,
  )
  const { isConnected } = useAccount()
  const { forMe, refetch } = useMyWills()
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    gsap.fromTo(rootRef.current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' })
  }, [])

  const canSearch = name.trim().length > 0 || email.trim().length > 0

  return (
    <div ref={rootRef}>
      <div className={standalone ? 'page-head claim-split' : 'claim-split in-app'}>
        <div>
          {standalone ? (
            <h1>Was something<br /><em>left for you?</em></h1>
          ) : (
            <h2 className="claim-h2">Was something left for you?</h2>
          )}
          <p className="lede">
            If someone you love named you in a Pulse will, you can find it here.
            Enter your name and email exactly as they would have written them.
            You don't need to know anything about crypto to look.
          </p>

          <div className="claim-form">
            <div className="row-2">
              <label>
                Your name
                <input
                  placeholder="Sarah"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setSubmitted(false) }}
                />
              </label>
              <label>
                Your email
                <input
                  placeholder="sarah@mail.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setSubmitted(false) }}
                />
              </label>
            </div>
            <button className="btn primary" disabled={!canSearch || isLoading} onClick={() => setSubmitted(true)}>
              {isLoading ? 'Scanning the chain…' : 'Search for my will'}
            </button>
          </div>
        </div>

        <div className="claim-sonar-wrap">
          <Sonar found={matches.length} searching={isLoading} />
        </div>
      </div>

      <div className={standalone ? 'section' : ''} style={standalone ? { paddingTop: 0 } : undefined}>
        {searched && matches.length === 0 && (
          <div className="empty" style={{ marginTop: '2rem' }}>
            <div className="serif">Nothing found</div>
            <p>
              No will names that name and email. Check the exact spelling they would
              have used, or ask them if they added your email at all.
            </p>
          </div>
        )}

        {matches.length > 0 && (
          <div className="dash" style={{ marginTop: '2rem' }}>
            <p className="claim-count">
              {matches.length} will{matches.length === 1 ? '' : 's'} found in your name
            </p>
            {matches.map((m) => <FoundWill key={m.will.id.toString()} will={m.will} indexes={m.indexes} refetch={() => setSubmitted(true)} />)}
          </div>
        )}

        {isConnected && forMe.length > 0 && matches.length === 0 && !searched && (
          <div className="dash" style={{ marginTop: '2rem' }}>
            <p className="claim-count">Wills already linked to your connected wallet</p>
            {forMe.map(({ will, indexes }) => <WillCard key={will.id.toString()} will={will} isMine={false} myIndexes={indexes} refetch={refetch} />)}
          </div>
        )}

        {standalone && (
          <div className="claim-alt">
            <p>Looking after your own vaults instead?</p>
            <button className="btn" onClick={() => navigate('/app')}>Go to your dashboard →</button>
          </div>
        )}
      </div>

      {standalone && <div className="ekg-strip"><Ekg vitality={1} height={90} /></div>}
    </div>
  )
}
