import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { http } from 'wagmi'
import { createConfig as createWagmiConfig, WagmiProvider as PlainWagmiProvider } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { monadTestnet } from './chain'
import App from './App'
import './styles.css'

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined

const queryClient = new QueryClient()

// With a Privy app id: email + wallet login, embedded wallets for email users.
// Without one (misconfigured deploy), fall back to plain injected-wallet wagmi
// rather than rendering a blank page: the claim flow must always be reachable.
const root = PRIVY_APP_ID ? (
  <PrivyProvider
    appId={PRIVY_APP_ID}
    config={{
      appearance: { theme: 'dark', accentColor: '#ff5c5c', logo: '/brand/pulse-logo.png' },
      loginMethods: ['email', 'wallet'],
      // email users get a wallet created for them silently: no seed phrase ceremony
      embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      defaultChain: monadTestnet,
      supportedChains: [monadTestnet],
    }}
  >
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={createConfig({ chains: [monadTestnet], transports: { [monadTestnet.id]: http() } })}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </WagmiProvider>
    </QueryClientProvider>
  </PrivyProvider>
) : (
  <QueryClientProvider client={queryClient}>
    <PlainWagmiProvider
      config={createWagmiConfig({
        chains: [monadTestnet],
        connectors: [injected()],
        transports: { [monadTestnet.id]: http() },
      })}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PlainWagmiProvider>
  </QueryClientProvider>
)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{root}</React.StrictMode>,
)
