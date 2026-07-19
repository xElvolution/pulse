/**
 * Pulse watcher: the "are you still there?" email service.
 *
 * Polls every will on the PulseWill contract. When a will's remaining time
 * drops below the warning threshold, emails the OWNER a reminder to check in.
 * When a will flatlines, emails each BENEFICIARY that their share is claimable.
 *
 * This service holds no keys and has no onchain power. If it dies, the
 * protocol still works - beneficiaries can always check the site directly.
 * It is purely a courtesy layer, which is exactly what an email should be.
 *
 * Env:
 *   RPC_URL          Monad RPC (default: testnet)
 *   PULSE_ADDRESS    deployed PulseWill address (required)
 *   OWNER_EMAIL      where owner reminders go (demo: your own inbox)
 *   SMTP_HOST/PORT/USER/PASS   mail credentials (e.g. Gmail app password)
 *   POLL_SECONDS     poll cadence (default 60)
 *   WARN_FRACTION    warn when remaining/interval falls below this (default 0.25)
 */
import { createPublicClient, http, formatEther } from 'viem'
import nodemailer from 'nodemailer'

const RPC_URL = process.env.RPC_URL ?? 'https://testnet-rpc.monad.xyz'
const PULSE_ADDRESS = process.env.PULSE_ADDRESS
const OWNER_EMAIL = process.env.OWNER_EMAIL
const POLL_SECONDS = Number(process.env.POLL_SECONDS ?? 60)
const WARN_FRACTION = Number(process.env.WARN_FRACTION ?? 0.25)
const APP_URL = process.env.APP_URL ?? 'https://pulseonchain.xyz'

if (!PULSE_ADDRESS) {
  console.error('PULSE_ADDRESS is required')
  process.exit(1)
}

const abi = [
  { type: 'function', name: 'nextWillId', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function', name: 'getWill', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'owner', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'balance', type: 'uint256' },
        { name: 'interval', type: 'uint64' },
        { name: 'lastActive', type: 'uint64' },
        { name: 'beats', type: 'uint32' },
        { name: 'closed', type: 'bool' },
        { name: 'note', type: 'string' },
      ],
    }],
  },
  {
    type: 'function', name: 'beneficiariesOf', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'wallet', type: 'address' },
        { name: 'allocation', type: 'uint256' },
        { name: 'claimed', type: 'uint256' },
        { name: 'codeHash', type: 'bytes32' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
      ],
    }],
  },
]

const client = createPublicClient({ transport: http(RPC_URL) })

const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER
const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null

async function send(to, subject, text) {
  if (!to) return
  if (!transporter) {
    console.log(`[dry-run email] to=${to} subject="${subject}"\n${text}\n`)
    return
  }
  try {
    await transporter.sendMail({ from: process.env.SMTP_USER, to, subject, text })
    console.log(`[sent] to=${to} "${subject}"`)
  } catch (e) {
    console.error(`[mail error] ${e.message}`)
  }
}

// remember what we've already sent so we don't spam:
// per will, one warning per heartbeat-cycle (keyed by lastActive) and one flatline notice
const warned = new Map() // willId -> lastActive we warned for
const flatlined = new Set() // willId

async function tick() {
  const now = Math.floor(Date.now() / 1000)
  let count
  try {
    count = Number(await client.readContract({ address: PULSE_ADDRESS, abi, functionName: 'nextWillId' }))
  } catch (e) {
    console.error(`[rpc error] ${e.message}`)
    return
  }

  for (let id = 0; id < count; id++) {
    let w
    try {
      w = await client.readContract({ address: PULSE_ADDRESS, abi, functionName: 'getWill', args: [BigInt(id)] })
    } catch { continue }
    if (w.closed || w.balance === 0n) continue

    const lastActive = Number(w.lastActive)
    const interval = Number(w.interval)
    const deadline = lastActive + interval
    const remaining = deadline - now

    if (remaining <= 0) {
      // flatlined: tell each beneficiary their share is open
      if (flatlined.has(id)) continue
      flatlined.add(id)
      let bens = []
      try {
        bens = await client.readContract({ address: PULSE_ADDRESS, abi, functionName: 'beneficiariesOf', args: [BigInt(id)] })
      } catch { /* still notify owner below */ }
      for (const b of bens) {
        if (!b.email) continue
        await send(
          b.email,
          `Something was left for you${b.name ? ', ' + b.name : ''}`,
          `A Pulse will that names you has unlocked.\n\n` +
          `Your allocation: ${formatEther(b.allocation)} MON\n\n` +
          `Visit ${APP_URL}/claim and search your name and email to claim it.\n` +
          `No crypto knowledge needed: the page will walk you through it.`,
        )
      }
      console.log(`[flatline] will #${id}, notified ${bens.filter((b) => b.email).length} beneficiaries`)
    } else if (remaining < interval * WARN_FRACTION) {
      // approaching deadline: nudge the owner, once per heartbeat cycle
      if (warned.get(id) === lastActive) continue
      warned.set(id, lastActive)
      flatlined.delete(id) // they might have revived since a past flatline
      const hours = Math.max(1, Math.round(remaining / 3600))
      await send(
        OWNER_EMAIL,
        `Are you still there? Your Pulse will #${id} flatlines soon`,
        `Your will #${id} has been inactive and will unlock for your beneficiaries ` +
        `in about ${remaining < 3600 ? Math.round(remaining / 60) + ' minutes' : hours + ' hours'}.\n\n` +
        `Still here? One click resets it: ${APP_URL}/app\n\n` +
        `Pool: ${formatEther(w.balance)} MON. Nothing moves until the timer actually lapses.`,
      )
      console.log(`[warned] will #${id}, ${remaining}s left`)
    } else {
      // healthy again (owner checked in): allow future warnings for the new cycle
      if (flatlined.has(id)) flatlined.delete(id)
    }
  }
}

console.log(`pulse-watcher watching ${PULSE_ADDRESS} on ${RPC_URL} every ${POLL_SECONDS}s ${transporter ? '(smtp live)' : '(dry-run: emails logged to console)'}`)
tick()
setInterval(tick, POLL_SECONDS * 1000)
