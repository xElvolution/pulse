import { endpoint, heirAt, publicClient, walletClient, abi, PULSE_ADDRESS, verifyTicket } from './_lib/verifier.js'

const ZERO = '0x0000000000000000000000000000000000000000'

export default endpoint(async ({ willId, index, code, recipient, ticket }) => {
  if (!/^0x[a-fA-F0-9]{40}$/.test(recipient ?? '')) throw new Error('invalid recipient address')
  verifyTicket(ticket, willId, index, code)

  const b = await heirAt(willId, index)
  if (b.wallet !== ZERO) throw new Error('this heir claims with their wallet')

  const txHash = await walletClient().writeContract({
    address: PULSE_ADDRESS, abi, functionName: 'claimTo',
    args: [BigInt(willId), BigInt(index), recipient],
  })
  await publicClient.waitForTransactionReceipt({ hash: txHash })
  return { ok: true, txHash }
})
