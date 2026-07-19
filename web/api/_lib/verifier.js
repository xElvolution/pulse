/**
 * Shared logic for the Pulse verifier, running as Vercel serverless functions.
 *
 * Serverless functions have no durable memory, so OTPs are stateless: we mail
 * the heir a 6-digit code and give the client an opaque HMAC-signed ticket
 * binding {willId, index, codeHash, expiry}. At claim time the code must hash
 * to the ticket's codeHash and the ticket signature must verify. The signing
 * secret (OTP_SECRET) never leaves the server, so tickets cannot be forged
 * and the code cannot be recovered from the ticket.
 *
 * Env (Vercel project settings):
 *   PULSE_ADDRESS   deployed PulseWill address
 *   RPC_URL         optional, defaults to Monad testnet
 *   VERIFIER_PK     private key of the contract's verifier account
 *   RESEND_API_KEY  Resend API key for OTP emails
 *   MAIL_FROM       e.g. "Pulse <support@pulseonchain.xyz>"
 *   OTP_SECRET      long random string for ticket signing
 */
import crypto from 'node:crypto'
import { createPublicClient, createWalletClient, http, defineChain } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { renderEmail } from './email-template.js'

const RPC_URL = process.env.RPC_URL ?? 'https://testnet-rpc.monad.xyz'
const PULSE_ADDRESS = process.env.PULSE_ADDRESS
const OTP_TTL_MS = 10 * 60 * 1000

const chain = defineChain({
  id: Number(process.env.CHAIN_ID ?? 10143),
  name: 'Monad',
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
  { type: 'function', name: 'claimTo', stateMutability: 'nonpayable', inputs: [{ type: 'uint256' }, { type: 'uint256' }, { type: 'address' }], outputs: [] },
]

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL) })

export function walletClient() {
  const account = privateKeyToAccount(process.env.VERIFIER_PK)
  return createWalletClient({ account, chain, transport: http(RPC_URL) })
}

export { abi, PULSE_ADDRESS }

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const sign = (payload) =>
  crypto.createHmac('sha256', process.env.OTP_SECRET).update(payload).digest('hex')

export function makeTicket(willId, index, code) {
  const payload = JSON.stringify({ w: String(willId), i: Number(index), h: sha(code), e: Date.now() + OTP_TTL_MS })
  const b64 = Buffer.from(payload).toString('base64url')
  return `${b64}.${sign(b64)}`
}

export function verifyTicket(ticket, willId, index, code) {
  const [b64, sig] = String(ticket ?? '').split('.')
  if (!b64 || !sig) throw new Error('request a code first')
  const expect = sign(b64)
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    throw new Error('invalid ticket, request a new code')
  }
  const p = JSON.parse(Buffer.from(b64, 'base64url').toString())
  if (p.w !== String(willId) || p.i !== Number(index)) throw new Error('ticket does not match this claim')
  if (Date.now() > p.e) throw new Error('code expired, request a new one')
  if (sha(String(code)) !== p.h) throw new Error('wrong code')
}

export async function heirAt(willId, index) {
  const bens = await publicClient.readContract({
    address: PULSE_ADDRESS, abi, functionName: 'beneficiariesOf', args: [BigInt(willId)],
  })
  const b = bens[Number(index)]
  if (!b) throw new Error('no such heir')
  return b
}

export async function sendOtpEmail(to, name, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.MAIL_FROM ?? 'Pulse <support@pulseonchain.xyz>',
      to,
      subject: 'Your Pulse claim code',
      text:
        `Your Pulse verification code is: ${code}\n\n` +
        `Someone (hopefully you) is claiming the share left for ${name || 'you'}.\n` +
        `The code expires in 10 minutes. If this wasn't you, ignore this email.`,
      html: renderEmail({
        title: 'Your claim code',
        intro: `Someone (hopefully you) is claiming the share left for ${name || 'you'}. Enter this code on the claim page to prove it is you:`,
        stat: code,
        statLabel: 'verification code · expires in 10 minutes',
        footer: "If this wasn't you, you can safely ignore this email. The funds cannot move without this code.",
      }),
    }),
  })
  if (!res.ok) throw new Error(`email failed: ${(await res.text()).slice(0, 120)}`)
}

export function newCode() {
  return crypto.randomInt(100000, 999999).toString()
}

/** Wrap a handler with CORS + JSON plumbing shared by both endpoints. */
export function endpoint(fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
    try {
      res.status(200).json(await fn(req.body ?? {}))
    } catch (e) {
      res.status(400).json({ error: e.message })
    }
  }
}
