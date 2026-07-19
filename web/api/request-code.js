import { endpoint, heirAt, publicClient, abi, PULSE_ADDRESS, makeTicket, newCode, sendOtpEmail } from './_lib/verifier.js'

const ZERO = '0x0000000000000000000000000000000000000000'

export default endpoint(async ({ willId, index }) => {
  const b = await heirAt(willId, index)
  if (b.wallet !== ZERO) throw new Error('this heir claims with their wallet')
  if (!b.email) throw new Error('no email on record for this heir')

  const claimable = await publicClient.readContract({
    address: PULSE_ADDRESS, abi, functionName: 'isClaimable', args: [BigInt(willId)],
  })
  if (!claimable) throw new Error('the will has not flatlined yet')

  const code = newCode()
  await sendOtpEmail(b.email, b.name, code)
  return { ok: true, ticket: makeTicket(willId, index, code) }
})
