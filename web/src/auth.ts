import { usePrivy } from '@privy-io/react-auth'
import { useConnect } from 'wagmi'

export const HAS_PRIVY = Boolean(import.meta.env.VITE_PRIVY_APP_ID)

/** Login/logout that works in both modes: Privy modal when configured,
 *  plain injected-wallet connect otherwise. HAS_PRIVY is a build-time
 *  constant, so the hook order below never changes between renders. */
export function useAuth(): { login: () => void; logout: () => void } {
  if (HAS_PRIVY) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { login, logout } = usePrivy()
    return { login, logout }
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { connect, connectors } = useConnect()
  return { login: () => connect({ connector: connectors[0] }), logout: () => {} }
}
