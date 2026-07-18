import { monadTestnet, PULSE_ADDRESS } from './chain'

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

export default function Footer() {
  return (
    <footer className="big-footer">
      <div className="footer-grid">
        <div className="footer-brand">
          <div className="brand"><span className="brand-dot" />Pulse</div>
          <p>
            A dead man's switch on Monad.<br />
            Your crypto shouldn't die with you.
          </p>
        </div>
        <div className="footer-col">
          <span className="footer-h">Protocol</span>
          <a href={`${monadTestnet.blockExplorers.default.url}/address/${PULSE_ADDRESS}`} target="_blank" rel="noreferrer">
            Contract · {short(PULSE_ADDRESS)}
          </a>
          <a href="https://testnet.monadexplorer.com" target="_blank" rel="noreferrer">Monad Explorer</a>
          <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Testnet Faucet</a>
        </div>
        <div className="footer-col">
          <span className="footer-h">Project</span>
          <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          <a href="https://buildanything.so" target="_blank" rel="noreferrer">Spark Hackathon</a>
          <a href="https://docs.monad.xyz" target="_blank" rel="noreferrer">Monad Docs</a>
        </div>
      </div>
      <div className="footer-mark" aria-hidden>PULSE</div>
      <div className="footer-legal">
        <span>Built live for Spark · July 2026 · Monad Testnet</span>
        <span className="footer-heart">every block is a heartbeat ♥</span>
      </div>
    </footer>
  )
}
