import { useEffect, useRef } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAccount, useDisconnect } from 'wagmi'
import { usePrivy } from '@privy-io/react-auth'
import gsap from 'gsap'
import Orb from './Orb'
import { short } from './components'

/** Shell for everything under /app: left menu + routed content.
 *  The menu is ALWAYS visible. Only wallet-required pages show the connect gate. */
export default function AppLayout({ vitality }: { vitality: number }) {
  const { address, isConnected } = useAccount()
  const { login, logout } = usePrivy()
  const { disconnect } = useDisconnect()
  const location = useLocation()
  const mainRef = useRef<HTMLDivElement>(null)

  // /app/claim works without a wallet (it's for the family)
  const needsWallet = !location.pathname.startsWith('/app/claim')

  useEffect(() => {
    gsap.fromTo(mainRef.current, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' })
  }, [location.pathname, isConnected])

  return (
    <div className="app-shell">
      <aside className="app-menu">
        <div className="app-menu-orb"><Orb vitality={isConnected ? vitality : 1} /></div>
        <div className="app-menu-links">
          <NavLink end to="/app" className={({ isActive }) => `app-menu-link ${isActive ? 'active' : ''}`}>
            <span className="app-menu-ico">♥</span> My vaults
          </NavLink>
          <NavLink to="/app/new" className={({ isActive }) => `app-menu-link ${isActive ? 'active' : ''}`}>
            <span className="app-menu-ico">+</span> New vault
          </NavLink>
          <NavLink to="/app/claim" className={({ isActive }) => `app-menu-link ${isActive ? 'active' : ''}`}>
            <span className="app-menu-ico">↓</span> Claim
          </NavLink>
        </div>
        <div className="app-menu-foot">
          {isConnected ? (
            <>
              <span className="addr">{short(address!)}</span>
              <button className="link-btn" onClick={() => { logout(); disconnect() }}>disconnect</button>
            </>
          ) : (
            <button className="btn primary" onClick={login}>
              Sign in
            </button>
          )}
        </div>
      </aside>

      <main className="app-main" ref={mainRef}>
        {needsWallet && !isConnected ? (
          <div className="connect-gate">
            <div className="gate-orb"><Orb vitality={1} /></div>
            <h2>No pulse detected</h2>
            <p className="lede">Sign in with email or wallet to create a vault and start your heartbeat.</p>
            <button className="btn primary" onClick={login}>
              Sign in
            </button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}
