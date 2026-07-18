import { defineChain } from 'viem'

export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet.monadexplorer.com' },
  },
  testnet: true,
})

// Set after deployment (task: deploy to Monad testnet)
export const PULSE_ADDRESS = (import.meta.env.VITE_PULSE_ADDRESS ??
  '0x0000000000000000000000000000000000000000') as `0x${string}`
