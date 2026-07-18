import { useEffect, useMemo } from 'react'
import { Routes, Route, NavLink, useLocation, useNavigate } from 'react-router-dom'
import LandingPage from './LandingPage'
import AppLayout from './AppLayout'
import { VaultsPage, NewVaultPage } from './AppPages'
import ClaimPage from './ClaimPage'
import Footer from './Footer'
import { useMyWills } from './hooks'

export default function App() {
  const { mine } = useMyWills()
  const location = useLocation()
  const navigate = useNavigate()
  const inApp = location.pathname.startsWith('/app')

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  // Healthiest active will drives every heartbeat visual on the site
  const vitality = useMemo(() => {
    const active = mine.filter((w) => !w.closed)
    if (active.length === 0) return 1
    const now = Math.floor(Date.now() / 1000)
    return Math.max(
      0,
      ...active.map((w) => {
        const deadline = Number(w.lastActive + w.interval)
        return Math.max(0, (deadline - now) / Number(w.interval))
      }),
    )
  }, [mine])

  return (
    <div className="app">
      <nav className="nav">
        <NavLink to="/" className="brand"><span className="brand-dot" />Pulse</NavLink>
        <div className="nav-links">
          {!inApp && (
            <button className="btn primary" onClick={() => navigate('/app')}>
              Open app
            </button>
          )}
        </div>
      </nav>

      <Routes>
        <Route path="/" element={<LandingPage vitality={vitality} />} />
        <Route path="/claim" element={<ClaimPage standalone />} />
        <Route path="/app" element={<AppLayout vitality={vitality} />}>
          <Route index element={<VaultsPage />} />
          <Route path="new" element={<NewVaultPage />} />
          <Route path="claim" element={<ClaimPage />} />
        </Route>
      </Routes>

      <Footer />
    </div>
  )
}
