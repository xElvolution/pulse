import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { http } from 'wagmi'
import { PrivyProvider } from '@privy-io/react-auth'
import { WagmiProvider, createConfig } from '@privy-io/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { monadTestnet } from './chain'
import App from './App'
import './styles.css'

// Privy app ids are public client-side identifiers (they ship in the bundle by
// design), so this is hardcoded rather than depending on deploy-time env vars.
const PRIVY_APP_ID = 'cmrsbcgap004k0djv0t1p83px'

const config = createConfig({
  chains: [monadTestnet],
  transports: { [monadTestnet.id]: http() },
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
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
        <WagmiProvider config={config}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  </React.StrictMode>,
)
