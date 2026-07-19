import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { pulseAbi, erc20Abi } from './abi'
import { PULSE_ADDRESS } from './chain'

export type Beneficiary = {
  wallet: `0x${string}`
  allocation: bigint
  claimed: bigint
  name: string
  email: string
}

export type Will = {
  id: bigint
  owner: `0x${string}`
  token: `0x${string}`
  balance: bigint
  interval: bigint
  lastActive: bigint
  beats: number
  closed: boolean
  note: string
  beneficiaries: Beneficiary[]
}

const contract = { address: PULSE_ADDRESS, abi: pulseAbi } as const
export const NATIVE = '0x0000000000000000000000000000000000000000' as const

function toBeneficiary(raw: any): Beneficiary {
  return {
    wallet: raw.wallet,
    allocation: BigInt(raw.allocation),
    claimed: BigInt(raw.claimed),
    name: raw.name,
    email: raw.email,
  }
}

function toWill(id: bigint, raw: any, beneficiaries: Beneficiary[]): Will {
  return {
    id,
    owner: raw.owner,
    token: raw.token,
    balance: BigInt(raw.balance),
    interval: BigInt(raw.interval),
    lastActive: BigInt(raw.lastActive),
    beats: Number(raw.beats),
    closed: raw.closed,
    note: raw.note,
    beneficiaries,
  }
}

/** Fetch a set of wills (by id) with their beneficiary lists in two multicall rounds. */
function useWillsByIds(ids: readonly bigint[], enabled: boolean, refetchInterval?: number) {
  const willReads = useReadContracts({
    contracts: ids.map((id) => ({ ...contract, functionName: 'getWill', args: [id] })),
    query: { enabled: enabled && ids.length > 0, refetchInterval },
  })
  const benReads = useReadContracts({
    contracts: ids.map((id) => ({ ...contract, functionName: 'beneficiariesOf', args: [id] })),
    query: { enabled: enabled && ids.length > 0, refetchInterval },
  })

  const wills: Will[] = ids
    .map((id, i) => {
      const wr = willReads.data?.[i]
      const br = benReads.data?.[i]
      if (wr?.status !== 'success') return null
      const bens = br?.status === 'success' ? (br.result as unknown as any[]).map(toBeneficiary) : []
      return toWill(id, wr.result, bens)
    })
    .filter((w): w is Will => w !== null)

  return {
    wills,
    isLoading: willReads.isLoading || benReads.isLoading,
    refetch: () => {
      willReads.refetch()
      benReads.refetch()
    },
  }
}

export function useMyWills() {
  const { address } = useAccount()
  const lower = address?.toLowerCase()

  const owned = useReadContract({
    ...contract,
    functionName: 'willsOf',
    args: [address ?? NATIVE],
    query: { enabled: !!address, refetchInterval: 8000 },
  })
  const inherited = useReadContract({
    ...contract,
    functionName: 'willsFor',
    args: [address ?? NATIVE],
    query: { enabled: !!address, refetchInterval: 8000 },
  })

  const ownedIds = (owned.data ?? []) as readonly bigint[]
  const inheritedIds = (inherited.data ?? []) as readonly bigint[]
  // de-dupe: you could be a beneficiary of your own will (not allowed) or listed twice
  const allIds = Array.from(new Set([...ownedIds, ...inheritedIds].map((x) => x.toString()))).map(BigInt)

  const { wills, isLoading, refetch } = useWillsByIds(allIds, !!address, 8000)

  return {
    mine: wills.filter((w) => w.owner.toLowerCase() === lower),
    forMe: wills
      .filter((w) => w.owner.toLowerCase() !== lower)
      .map((w) => ({
        will: w,
        // which beneficiary slots belong to me
        indexes: w.beneficiaries
          .map((b, i) => (b.wallet.toLowerCase() === lower ? i : -1))
          .filter((i) => i >= 0),
      }))
      .filter((x) => x.indexes.length > 0),
    refetch: () => {
      owned.refetch()
      inherited.refetch()
      refetch()
    },
    isLoading: owned.isLoading || isLoading,
  }
}

/** Look up wills left for ANY pasted address, no wallet needed. For the family. */
export function useWillLookup(addr: string) {
  const valid = /^0x[a-fA-F0-9]{40}$/.test(addr)
  const ids = useReadContract({
    ...contract,
    functionName: 'willsFor',
    args: [addr as `0x${string}`],
    query: { enabled: valid },
  })
  const idList = (ids.data ?? []) as readonly bigint[]
  const { wills, isLoading } = useWillsByIds(idList, valid)
  const lower = addr.toLowerCase()
  const matches = wills.map((w) => ({
    will: w,
    indexes: w.beneficiaries
      .map((b, i) => (b.wallet.toLowerCase() === lower ? i : -1))
      .filter((i) => i >= 0),
  }))
  return { matches, isLoading: ids.isLoading || isLoading, searched: valid && !ids.isLoading }
}

/**
 * Search every will onchain by beneficiary name + email.
 * For the family: they may not know which address was set for them,
 * only that someone created a will in their name.
 */
export function useWillSearchByContact(name: string, email: string, enabled: boolean) {
  const total = useReadContract({
    ...contract,
    functionName: 'nextWillId',
    query: { enabled },
  })
  const count = Number(total.data ?? 0n)
  const idList = Array.from({ length: count }, (_, i) => BigInt(i))
  const { wills, isLoading } = useWillsByIds(idList, enabled && count > 0)

  const nameQ = name.trim().toLowerCase()
  const emailQ = email.trim().toLowerCase()

  const matches = wills
    .map((w) => ({
      will: w,
      indexes: w.beneficiaries
        .map((b, i) => {
          const bName = b.name.trim().toLowerCase()
          const bEmail = b.email.trim().toLowerCase()
          if (emailQ && bEmail && bEmail === emailQ) return nameQ === '' || bName === nameQ ? i : -1
          if (nameQ && bName === nameQ && emailQ === '') return i
          return -1
        })
        .filter((i) => i >= 0),
    }))
    .filter((x) => x.indexes.length > 0)

  return {
    matches,
    isLoading: enabled && (total.isLoading || isLoading),
    searched: enabled && !total.isLoading && !isLoading,
  }
}

export type BeneficiaryInput = {
  wallet: `0x${string}`
  allocation: bigint
  name: string
  email: string
}

export function usePulseWrite(onConfirmed?: () => void) {
  const { writeContract, writeContractAsync, data: hash, isPending, error, reset } = useWriteContract()
  const receipt = useWaitForTransactionReceipt({ hash })
  const client = usePublicClient()
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    if (receipt.isSuccess) onConfirmed?.()
  }, [receipt.isSuccess])

  const createWill = async (params: {
    token: `0x${string}`
    amount: bigint
    interval: bigint
    note: string
    ownerEmail: string
    people: BeneficiaryInput[]
  }) => {
    const { token, amount, interval, note, ownerEmail, people } = params
    const args = [token, amount, interval, note, ownerEmail, people] as const
    if (token !== NATIVE) {
      setApproving(true)
      try {
        const approveHash = await writeContractAsync({
          address: token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [PULSE_ADDRESS, amount],
        })
        await client!.waitForTransactionReceipt({ hash: approveHash })
      } finally {
        setApproving(false)
      }
      writeContract({ ...contract, functionName: 'createWill', args })
    } else {
      writeContract({ ...contract, functionName: 'createWill', args, value: amount })
    }
  }

  return {
    createWill,
    beat: (id: bigint) => writeContract({ ...contract, functionName: 'beat', args: [id] }),
    beatAll: () => writeContract({ ...contract, functionName: 'beatAll' }),
    deposit: (id: bigint, amount: bigint, token: `0x${string}`) =>
      writeContract({
        ...contract,
        functionName: 'deposit',
        args: [id, amount],
        value: token === NATIVE ? amount : 0n,
      }),
    withdraw: (id: bigint, amount: bigint) =>
      writeContract({ ...contract, functionName: 'withdraw', args: [id, amount] }),
    close: (id: bigint) => writeContract({ ...contract, functionName: 'close', args: [id] }),
    claim: (id: bigint, index: bigint) =>
      writeContract({ ...contract, functionName: 'claim', args: [id, index] }),
    isPending: isPending || receipt.isLoading || approving,
    isSuccess: receipt.isSuccess,
    error,
    reset,
    hash,
  }
}

/** Live-ticking seconds until deadline, derived client-side from lastActive+interval. */
export function useCountdown(will: Will | undefined) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  if (!will) return { secondsLeft: 0, fraction: 0 }
  const deadline = Number(will.lastActive + will.interval)
  const secondsLeft = Math.max(0, deadline - now)
  const fraction = Number(will.interval) === 0 ? 0 : secondsLeft / Number(will.interval)
  return { secondsLeft, fraction }
}

export function fmtDuration(s: number): string {
  if (s <= 0) return 'FLATLINED'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m ${sec}s`
  return `${m}m ${sec}s`
}
