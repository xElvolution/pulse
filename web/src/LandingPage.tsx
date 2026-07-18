import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Orb from './Orb'
import Ekg from './Ekg'
import HowItWorks from './HowItWorks'

gsap.registerPlugin(ScrollTrigger)

export default function LandingPage({ vitality }: { vitality: number }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero h1', { y: 60, opacity: 0, duration: 1.2, ease: 'power3.out', delay: 0.2 })
      gsap.from('.hero .sub', { y: 30, opacity: 0, duration: 1, ease: 'power3.out', delay: 0.5 })
      gsap.from('.hero .cta-row', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out', delay: 0.8 })
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.from(el, {
          y: 50, opacity: 0, duration: 0.9, ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 82%' },
        })
      })
    }, rootRef)
    return () => ctx.revert()
  }, [])

  return (
    <div ref={rootRef}>
      <header className="hero">
        <div className="orb-wrap"><Orb vitality={vitality} /></div>
        <div className="copy">
          <h1>Your crypto shouldn't<br /><em>die with you.</em></h1>
          <p className="sub">
            Pulse is a dead man's switch on Monad. Lock funds behind a heartbeat.
            Check in to stay alive. If you ever stop, it passes to the person you chose.
            No lawyers. No shared seed phrases. Just a pulse.
          </p>
          <div className="cta-row">
            <button className="btn primary cta" onClick={() => navigate('/app')}>
              Start your heartbeat
            </button>
            <button className="btn cta" onClick={() => navigate('/claim')}>
              Something was left for me
            </button>
          </div>
        </div>
        <div className="scroll-hint">scroll to stay alive</div>
      </header>

      <div className="ekg-strip"><Ekg vitality={vitality} /></div>

      <HowItWorks />

      <section className="section cta-section">
        <h2 className="reveal">Ready when you are.</h2>
        <p className="lede reveal">One transaction to create a vault. One click a week to keep it yours.</p>
        <div className="cta-row reveal">
          <button className="btn primary" onClick={() => navigate('/app')}>Open the app →</button>
          <button className="btn" onClick={() => navigate('/claim')}>Check for an inheritance</button>
        </div>
      </section>
    </div>
  )
}
