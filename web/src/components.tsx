import { useEffect, useRef, useState } from 'react'
import { useReadContract } from 'wagmi'
import { formatEther, parseEther } from 'viem'
import gsap from 'gsap'
import { erc20Abi } from './abi'
import { usePulseWrite, useCountdown, fmtDuration, NATIVE, type Will, type Beneficiary, type BeneficiaryInput } from './hooks'

export const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`
const ZERO = '0x0000000000000000000000000000000000000000'
export const isAddr = (a: string) => /^0x[a-fA-F0-9]{40}$/.test(a)

export const INTERVALS = [
  { label: '5 minutes (demo)', secs: 300n },
  { label: '1 day', secs: 86400n },
  { label: '1 week', secs: 604800n },
  { label: '1 month', secs: 2592000n },
  { label: '3 months', secs: 7776000n },
]

export function useTokenSymbol(token: `0x${string}`) {
  const { data } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: 'symbol',
    query: { enabled: token !== NATIVE },
  })
  return token === NATIVE ? 'MON' : (data ?? short(token))
}

/* -------------------------------- will card ------------------------------- */

export function WillCard({
  will,
  isMine,
  myIndexes = [],
  refetch,
}: {
  will: Will
  isMine: boolean
  myIndexes?: number[]
  refetch: () => void
}) {
  const { secondsLeft, fraction } = useCountdown(will)
  const tx = usePulseWrite(refetch)
  const [topUp, setTopUp] = useState('')
  const [pullOut, setPullOut] = useState('')
  const cardRef = useRef<HTMLDivElement>(null)
  const symbol = useTokenSymbol(will.token)

  const flatlined = !will.closed && secondsLeft === 0
  const status = will.closed ? 'dead' : flatlined ? 'dead' : fraction > 0.33 ? 'alive' : 'fading'
  const statusText = will.closed ? 'closed' : flatlined ? 'flatlined' : fraction > 0.33 ? 'alive' : 'critical'

  useEffect(() => {
    cardRef.current?.style.setProperty('--heat', String(Math.max(0.1, fraction)))
  }, [fraction])

  const heartbeatPop = () => {
    if (!cardRef.current) return
    gsap.fromTo(cardRef.current, { scale: 1 }, { scale: 1.012, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.out' })
  }

  const allocated = will.beneficiaries.reduce((s, b) => s + b.allocation, 0n)
  const rationed = allocated <= will.balance && will.beneficiaries.length > 1

  return (
    <div ref={cardRef} className={`vault-card ${flatlined ? 'flatlined' : ''} ${will.closed ? 'claimed' : ''}`}>
      <div className="vault-head">
        <span className="title">
          {isMine ? <>Your will</> : <>Left for you</>}
          <span className="vault-id"> · #{will.id.toString()}</span>
        </span>
        <span className={`status ${status}`}>● {statusText}</span>
      </div>

      <div className="vault-meta">
        <div className="kv">
          <span className="k">{will.closed ? 'Final pool' : 'Pool'}</span>
          <span className="v big">{formatEther(will.balance)} {symbol}</span>
        </div>
        <div className="kv">
          <span className="k">Time left</span>
          <span className="v big">{will.closed ? '—' : fmtDuration(secondsLeft)}</span>
        </div>
        <div className="kv">
          <span className="k">Heirs</span>
          <span className="v">{will.beneficiaries.length}{rationed ? ' · rationed' : ' · first-come'}</span>
        </div>
        <div className="kv">
          <span className="k">Heartbeats</span>
          <span className="v">{will.beats}</span>
        </div>
      </div>

      {!will.closed && (
        <div className="lifebar">
          <div className="fill" style={{ width: `${fraction * 100}%` }} />
        </div>
      )}

      {/* beneficiary breakdown */}
      <div className="heir-list">
        {will.beneficiaries.map((b, i) => {
          const mine = myIndexes.includes(i)
          const fullyClaimed = b.claimed >= b.allocation && b.allocation > 0n
          const claimable = !will.closed && flatlined && !fullyClaimed
          const target = b.wallet === ZERO ? (b.email || 'email claim') : short(b.wallet)
          return (
            <div key={i} className={`heir ${mine ? 'mine' : ''} ${fullyClaimed ? 'done' : ''}`}>
              <div className="heir-id">
                <span className="heir-name">{b.name || `Heir ${i + 1}`}{mine && <span className="you-tag"> you</span>}</span>
                <span className="heir-target">{target}</span>
              </div>
              <div className="heir-amt">
                <span className="v">{formatEther(b.allocation)} {symbol}</span>
                {b.claimed > 0n && <span className="heir-claimed">claimed {formatEther(b.claimed)}</span>}
              </div>
              {!isMine && mine && (
                <button
                  className="btn primary sm"
                  disabled={tx.isPending || !claimable}
                  onClick={() => tx.claim(will.id, BigInt(i))}
                >
                  {fullyClaimed ? 'claimed' : claimable ? `Claim` : 'locked'}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!isMine && flatlined && will.note && <div className="note-reveal">“{will.note}”</div>}

      {isMine && !will.closed && (
        <div className="vault-actions">
          <button className="btn primary" disabled={tx.isPending} onClick={() => { heartbeatPop(); tx.beat(will.id) }}>
            ♥ I'm alive
          </button>
          {will.token === NATIVE && (
            <>
              <input style={{ width: 100 }} placeholder="MON" value={topUp} onChange={(e) => setTopUp(e.target.value)} />
              <button className="btn" disabled={tx.isPending || !topUp} onClick={() => { tx.deposit(will.id, parseEther(topUp), will.token); setTopUp('') }}>
                Top up
              </button>
              <input style={{ width: 100 }} placeholder="MON" value={pullOut} onChange={(e) => setPullOut(e.target.value)} />
              <button className="btn" disabled={tx.isPending || !pullOut} onClick={() => { tx.withdraw(will.id, parseEther(pullOut)); setPullOut('') }}>
                Withdraw
              </button>
            </>
          )}
          <button className="btn ghost-danger" disabled={tx.isPending} onClick={() => tx.close(will.id)}>
            Close & refund
          </button>
        </div>
      )}

      {tx.isPending && <span className="tx-status">tx pending…</span>}
      {tx.error && <span className="tx-status err">{(tx.error as Error).message.split('\n')[0].slice(0, 90)}</span>}
    </div>
  )
}

/* ------------------------------ will builder ------------------------------ */

export type HeirDraft = {
  name: string
  email: string
  wallet: string
  allocation: string
}

export type WillDraft = {
  heirs: HeirDraft[]
  amount: string
  interval: bigint
  note: string
  mode: 'fcfs' | 'ration'
}

const emptyHeir = (): HeirDraft => ({ name: '', email: '', wallet: '', allocation: '' })

export function CreatePanel({
  refetch,
  onDraft,
}: {
  refetch: () => void
  onDraft?: (d: WillDraft) => void
}) {
  const [heirs, setHeirs] = useState<HeirDraft[]>([emptyHeir()])
  const [tokenMode, setTokenMode] = useState<'native' | 'erc20'>('native')
  const [tokenAddr, setTokenAddr] = useState('')
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'fcfs' | 'ration'>('fcfs')
  const [interval, setInterval_] = useState(INTERVALS[0].secs)
  const [note, setNote] = useState('')
  const [confirming, setConfirming] = useState(false)

  const tx = usePulseWrite(() => {
    refetch()
    setHeirs([emptyHeir()]); setAmount(''); setNote('')
  })

  useEffect(() => {
    onDraft?.({ heirs, amount, interval, note, mode })
  }, [heirs, amount, interval, note, mode])

  const setHeir = (i: number, patch: Partial<HeirDraft>) =>
    setHeirs((hs) => hs.map((h, j) => (j === i ? { ...h, ...patch } : h)))
  const addHeir = () => setHeirs((hs) => (hs.length < 20 ? [...hs, emptyHeir()] : hs))
  const removeHeir = (i: number) => setHeirs((hs) => (hs.length > 1 ? hs.filter((_, j) => j !== i) : hs))

  const poolNum = Number(amount) || 0
  const heirValid = (h: HeirDraft) =>
    h.name.trim().length > 0 &&
    (isAddr(h.wallet.trim()) || (h.wallet.trim() === '' && h.email.trim().length > 3)) &&
    (mode === 'fcfs' || Number(h.allocation) > 0)
  const allHeirsValid = heirs.every(heirValid)
  const allocSum = mode === 'ration' ? heirs.reduce((s, h) => s + (Number(h.allocation) || 0), 0) : 0
  const overAllocated = mode === 'ration' && allocSum > poolNum + 1e-12
  const valid =
    poolNum > 0 &&
    allHeirsValid &&
    heirs.length > 0 &&
    !overAllocated &&
    (tokenMode === 'native' || isAddr(tokenAddr))

  const doCreate = async () => {
    const people: BeneficiaryInput[] = heirs.map((h) => {
      const hasWallet = isAddr(h.wallet.trim())
      // FCFS: everyone may take the whole pool; ration: their explicit share
      const allocation = mode === 'fcfs' ? parseEther(amount) : parseEther(h.allocation || '0')
      return {
        wallet: (hasWallet ? h.wallet.trim() : ZERO) as `0x${string}`,
        allocation,
        name: h.name.trim(),
        email: h.email.trim().toLowerCase(),
      }
    })
    setConfirming(false)
    tx.createWill({
      token: tokenMode === 'native' ? NATIVE : (tokenAddr as `0x${string}`),
      amount: parseEther(amount),
      interval,
      note,
      people,
    })
  }

  const symbol = tokenMode === 'native' ? 'MON' : 'tokens'

  return (
    <div className="create-panel">
      <div className="heir-rows">
        {heirs.map((h, i) => (
          <div className="heir-row" key={i}>
            <div className="heir-row-head">
              <span className="heir-row-label">Heir {i + 1}</span>
              {heirs.length > 1 && (
                <button className="heir-remove" onClick={() => removeHeir(i)} title="remove">✕</button>
              )}
            </div>
            <div className="row-2">
              <label>
                Their name
                <input placeholder="Maxwell" value={h.name} onChange={(e) => setHeir(i, { name: e.target.value })} />
              </label>
              <label>
                Their email {h.wallet.trim() === '' && <em className="req-tag">required without a wallet</em>}
                <input placeholder="max@mail.com" value={h.email} onChange={(e) => setHeir(i, { email: e.target.value })} />
              </label>
            </div>
            <div className={mode === 'ration' ? 'row-2' : ''}>
              <label>
                Their wallet address (optional)
                <input placeholder="0x… or leave empty, they claim by verifying their email" value={h.wallet} onChange={(e) => setHeir(i, { wallet: e.target.value })} />
              </label>
              {mode === 'ration' && (
                <label>
                  Their share ({symbol})
                  <input placeholder="0.0" value={h.allocation} onChange={(e) => setHeir(i, { allocation: e.target.value })} />
                </label>
              )}
            </div>
          </div>
        ))}
        <button className="btn ghost add-heir" onClick={addHeir} disabled={heirs.length >= 20}>
          + Add another heir
        </button>
      </div>

      <div className="divider" />

      <div className="row-2">
        <label>
          Asset
          <select value={tokenMode} onChange={(e) => setTokenMode(e.target.value as 'native' | 'erc20')}>
            <option value="native">MON (native)</option>
            <option value="erc20">ERC20 token…</option>
          </select>
        </label>
        <label>
          Total pool
          <input placeholder="1000" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>
      {tokenMode === 'erc20' && (
        <label>
          Token contract address
          <input placeholder="0x… (18 decimals assumed)" value={tokenAddr} onChange={(e) => setTokenAddr(e.target.value)} />
        </label>
      )}

      <label>
        How is the pool divided?
        <select value={mode} onChange={(e) => setMode(e.target.value as 'fcfs' | 'ration')}>
          <option value="fcfs">First to claim takes it all (any heir can claim the full pool)</option>
          <option value="ration">Ration it (each heir gets a fixed share)</option>
        </select>
      </label>
      {mode === 'ration' && (
        <div className={`alloc-summary ${overAllocated ? 'over' : ''}`}>
          Allocated {allocSum} / {poolNum} {symbol}
          {overAllocated && ' — shares exceed the pool'}
        </div>
      )}

      <label>
        Heartbeat interval
        <select value={interval.toString()} onChange={(e) => setInterval_(BigInt(e.target.value))}>
          {INTERVALS.map((iv) => (
            <option key={iv.label} value={iv.secs.toString()}>{iv.label}</option>
          ))}
        </select>
      </label>

      <label>
        Last words, revealed to them on flatline (optional)
        <textarea rows={2} placeholder="The seed phrase is in the blue notebook…" value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <button className="btn primary" disabled={!valid || tx.isPending} onClick={() => setConfirming(true)}>
        {tx.isPending ? 'Confirm in wallet…' : 'Review & create will'}
      </button>
      {tokenMode === 'erc20' && <span className="tx-status">ERC20 wills need two confirmations: approve, then create.</span>}
      {tx.error && <span className="tx-status err">{(tx.error as Error).message.split('\n')[0].slice(0, 90)}</span>}

      {confirming && (
        <ReconfirmModal
          heirs={heirs}
          amount={amount}
          symbol={symbol}
          mode={mode}
          interval={interval}
          note={note}
          onCancel={() => setConfirming(false)}
          onConfirm={doCreate}
        />
      )}
    </div>
  )
}

/* ---------------------------- reconfirm modal ----------------------------- */

function ReconfirmModal({
  heirs, amount, symbol, mode, interval, note, onCancel, onConfirm,
}: {
  heirs: HeirDraft[]
  amount: string
  symbol: string
  mode: 'fcfs' | 'ration'
  interval: bigint
  note: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const [checked, setChecked] = useState(false)
  const intervalLabel = INTERVALS.find((iv) => iv.secs === interval)?.label ?? `${interval}s`
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gsap.fromTo(ref.current, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' })
  }, [])

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" ref={ref} onClick={(e) => e.stopPropagation()}>
        <h3 className="code-title">Confirm every detail</h3>
        <p className="claim-hint">
          This is the important step. Once created, these details govern who receives your funds
          if your heartbeat stops. Wallet addresses and amounts cannot be edited later — only
          topped up, withdrawn, or closed. Read carefully.
        </p>

        <div className="confirm-block">
          <div className="confirm-line"><span>Pool</span><b>{amount} {symbol}</b></div>
          <div className="confirm-line"><span>Division</span><b>{mode === 'fcfs' ? 'First to claim takes all' : 'Rationed shares'}</b></div>
          <div className="confirm-line"><span>Heartbeat</span><b>every {intervalLabel}</b></div>
          {note.trim() && <div className="confirm-line"><span>Last words</span><b className="confirm-note">“{note.trim()}”</b></div>}
        </div>

        <div className="confirm-heirs">
          {heirs.map((h, i) => (
            <div className="confirm-heir" key={i}>
              <span className="confirm-heir-name">{h.name || `Heir ${i + 1}`}</span>
              <span className="confirm-heir-detail">
                {h.email || 'no email'} · {isAddr(h.wallet.trim()) ? short(h.wallet.trim()) : 'claims by email verification'}
                {mode === 'ration' && ` · ${h.allocation || 0} ${symbol}`}
              </span>
            </div>
          ))}
        </div>

        <label className="confirm-check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          I have verified every name, address, and amount is correct.
        </label>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Go back & edit</button>
          <button className="btn primary" disabled={!checked} onClick={onConfirm}>Create will</button>
        </div>
      </div>
    </div>
  )
}
