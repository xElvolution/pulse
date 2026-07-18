/**
 * Pulse verifier — email-OTP claims for wallet-less heirs.
 *
 * Flow: heir clicks "email me a code" → we read their email FROM THE CONTRACT
 * (never from the request), send a 6-digit OTP, they return code + recipient
 * address → we call claimTo(id, index, recipient) with the verifier key.
 *
 * The contract enforces the hard rules: claimTo only works after flatline,
 * only for wallet-less heirs, only up to their allocation. This service can't
 * touch live wills or wallet-heirs even if fully compromised.
 *
 * Env:
 *   RPC_URL          Monad RPC (default: testnet)
 *   PULSE_ADDRESS    deployed PulseWill address (required)
 *   VERIFIER_PK      private key of the verifier account (required)
 *   PORT             HTTP port (default 8787)
 *   SMTP_HOST/PORT/USER/PASS   mail credentials; unset = dry-run (OTP logged)
 */
import http from 'node:http'
import crypto from 'node:crypto'
import { createPublicClient, createWalletClient, http as viemHttp, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import nodemailer from 'nodemailer'

const RPC_URL = process.env.RPC_URL ?? 'https://testnet-rpc.monad.xyz'
const PULSE_ADDRESS = process.env.PULSE_ADDRESS
const VERIFIER_PK = process.env.VERIFIER_PK
const PORT = Number(process.env.PORT ?? 8787)

if (!PULSE_ADDRESS || !VERIFIER_PK) {
  console.error('PULSE_ADDRESS and VERIFIER_PK are required')
  process.exit(1)
}

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
})

const abi = [
  {
    type: 'function', name: 'beneficiariesOf', stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'wallet', type: 'address' },
        { name: 'allocation', type: 'uint256' },
        { name: 'claimed', type: 'uint256' },
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string' },
      ],
    }],
  },
  { type: 'function', name: 'isClaimable', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  {
    type: 'function', name: 'claimTo', stateMutability: 'nonpayable',
    inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }],
    outputs: [],
  },
]

const publicClient = createPublicClient({ chain: monadTestnet, transport: viemHttp(RPC_URL) })
const account = privateKeyToAccount(VERIFIER_PK)
const walletClient = createWalletClient({ account, chain: monadTestnet, transport: viemHttp(RPC_URL) })

const hasSmtp = process.env.SMTP_HOST && process.env.SMTP_USER
const transporter = hasSmtp
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null

// OTPs: key `${willId}:${index}` -> { hash, expires, attempts }
const otps = new Map()
const OTP_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')

async function heirAt(willId, index) {
  const bens = await publicClient.readContract({
    address: PULSE_ADDRESS, abi, functionName: 'beneficiariesOf', args: [BigInt(willId)],
  })
  const b = bens[index]
  if (!b) throw new Error('no such heir')
  return b
}

async function requestCode({ willId, index }) {
  const b = await heirAt(willId, index)
  if (b.wallet !== '0x0000000000000000000000000000000000000000') throw new Error('this heir claims with their wallet')
  if (!b.email) throw new Error('no email on record for this heir')

  const claimable = await publicClient.readContract({
    address: PULSE_ADDRESS, abi, functionName: 'isClaimable', args: [BigInt(willId)],
  })
  if (!claimable) throw new Error('the will has not flatlined yet')

  const code = crypto.randomInt(100000, 999999).toString()
  otps.set(`${willId}:${index}`, { hash: sha(code), expires: Date.now() + OTP_TTL_MS, attempts: 0 })

  const text =
    `Your Pulse verification code is: ${code}\n\n` +
    `Someone (hopefully you) is claiming the share left for ${b.name || 'you'}.\n` +
    `The code expires in 10 minutes. If this wasn't you, ignore this email.`
  if (transporter) {
    await transporter.sendMail({ from: process.env.SMTP_USER, to: b.email, subject: 'Your Pulse claim code', text })
  } else {
    console.log(`[dry-run OTP] to=${b.email} code=${code}`)
  }
  return { ok: true }
}

async function claim({ willId, index, code, recipient }) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient ?? '')) throw new Error('invalid recipient address')
  const key = `${willId}:${index}`
  const entry = otps.get(key)
  if (!entry) throw new Error('request a code first')
  if (Date.now() > entry.expires) { otps.delete(key); throw new Error('code expired, request a new one') }
  if (entry.attempts >= MAX_ATTEMPTS) { otps.delete(key); throw new Error('too many attempts, request a new code') }
  entry.attempts++
  if (sha(String(code)) !== entry.hash) throw new Error('wrong code')
  otps.delete(key)

  const txHash = await walletClient.writeContract({
    address: PULSE_ADDRESS, abi, functionName: 'claimTo',
    args: [BigInt(willId), BigInt(index), recipient],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  console.log(`[claimed] will #${willId} heir ${index} -> ${recipient} (${txHash})`)
  return { ok: true, txHash }
}

const routes = { '/request-code': requestCode, '/claim': claim }

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.writeHead(204).end()
  const handler = routes[req.url]
  if (req.method !== 'POST' || !handler) return res.writeHead(404).end('{"error":"not found"}')

  let body = ''
  req.on('data', (c) => { body += c })
  req.on('end', async () => {
    try {
      const result = await handler(JSON.parse(body || '{}'))
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result))
    } catch (e) {
      const msg = (e.shortMessage ?? e.message ?? 'error').split('\n')[0]
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: msg }))
    }
  })
}).listen(PORT, () => {
  console.log(`pulse-verifier on :${PORT} as ${account.address} ${transporter ? '(smtp live)' : '(dry-run: OTPs logged)'}`)
})
