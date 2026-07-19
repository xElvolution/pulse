# Pulse

**A dead man's switch for your crypto, on Monad. Keep a heartbeat alive - or everything you set aside passes safely to the people you chose.**

Built for [Spark](https://buildanything.so), the first BuildAnything hackathon · July 2026 · Monad Testnet

---

## The problem

If I got hit by a bus tomorrow, my family would never see a single token I own.

Self-custody has a fatal flaw, literally: **it has no plan for death.** My seed phrase is the only key, and there are exactly two bad options:

- **Share the seed phrase while I'm alive** - now it's only as safe as the least careful person who has it, and they can spend my funds today.
- **Tell no one** - and the day something happens to me, everything is gone forever. An estimated millions of ETH and BTC are already permanently stranded this way.

Lawyers can't execute a will against a hardware wallet. Exchanges have inheritance processes, but the whole point of self-custody is not trusting an exchange. This is a real problem I have, my friends have, and every self-custodying person on Earth has - most of us just avoid thinking about it.

## The solution

Pulse is an **onchain will with a heartbeat**.

1. **Write your will.** Pool funds into a contract you fully control. Name your heirs - Maxwell, Anna, anyone - with their name and email. A wallet address per heir is optional. Decide how the pool divides: *first to claim takes it all*, or *ration it* into fixed shares. Optionally leave last words only they will ever read. A final review screen makes you confirm every detail before anything is created - this is the important step, and the UI treats it that way.

2. **Just keep living.** Every interaction with your will - depositing, withdrawing, one-click check-ins - resets your inactivity clock. The funds remain **yours**: top up, pull any amount back out, or close the whole thing and refund yourself, any time, with no one's permission. While you're active, your heirs can't touch a thing.

3. **If your pulse stops.** Miss your chosen interval (a week, a month, up to a year) and the will unlocks. Each heir can claim their allocation - and only theirs. Heirs with a wallet claim directly, trustlessly. Heirs without a wallet simply **verify their email with a one-time code and paste the address they want the funds sent to.** No seed phrases shared. No lawyers. No crypto knowledge required from a grieving family.

An off-chain watcher emails *you* before the deadline ("Are you still there? One click resets it") and emails your heirs the moment something is left for them. Email is a courtesy layer only - if every server we run disappears, the contract keeps working and wallet-heirs lose nothing.

## Why onchain - and why Monad

A dead man's switch needs a party that **cannot forget, cannot be pressured, and cannot run off with the money**. That is a smart contract and nothing else:

- A lawyer can lose the letter, be contested, or take years.
- A SaaS "digital inheritance" product can shut down, be hacked, or simply decide not to pay.
- A note in a drawer requires the family to become crypto-literate overnight.

The claim rules here are enforced by code that no one - not us, not the courts, not the verifier service - can override. We deliberately made the contract **non-upgradeable**: your heirs shouldn't have to trust our admin key, so there isn't one.

Monad's speed and near-zero fees matter for this use case specifically: a heartbeat you pay for weekly has to cost effectively nothing, forever.

## How it works

```
        you (owner)                          the contract                        your heirs
  ───────────────────────          ─────────────────────────────         ─────────────────────────
  createWill(...)          ──────▶  pool locked, clock starts
  beat() / deposit() /     ──────▶  lastActive = now  (every owner
  withdraw()                        action IS a heartbeat)
                                    ...
                                    now > lastActive + interval?
                                    the will has flatlined        ◀────  claim(id, heirIndex)     [wallet heirs]
                                                                  ◀────  claimTo(id, idx, addr)   [email heirs,
                                                                          via OTP-gated verifier]
```

**The allocation mechanism** unifies both distribution modes: every heir has an allocation cap drawn from one shared pool. Set every cap to the full balance → first-come-first-served. Split the balance across caps → rationed shares. Same code path, both behaviors, fully tested.

**Email-heir security model, stated honestly:** wallet-heirs are 100% trustless. Email-only heirs trust the verifier service to check their OTP honestly - that is the irreducible price of "no wallet needed." The contract minimizes that trust: `claimTo` only works after flatline, only for wallet-less heirs, only up to their cap, and pays only the recipient the heir chose. The verifier reads heir emails **from the chain**, never from the request, so claims can't be redirected. A compromised verifier still cannot touch a live will or any wallet-heir's share.

## Repository layout

```
contracts/   Solidity (Foundry). PulseWill.sol + 18-test suite incl. fuzzing.
web/         React + Vite + TypeScript frontend. wagmi/viem, three.js, GSAP, canvas.
watcher/     Node services: watcher.js (email reminders) and verifier.js (OTP claims).
```

## The experience

The UI is built around one metaphor, everywhere: **a heartbeat.**

- A GLSL-shader heart that beats at your will's health - it slows, cools from coral to cyan, and flatlines as your deadline approaches. It reads live contract state; it *is* the dashboard.
- A canvas EKG strip with a real PQRST waveform sweeping like a hospital monitor.
- An interactive "How it works" you *play*: tilt cards with live canvas vignettes, and a 10-second two-wallet simulation where you keep a vault alive by hand, let it die, then claim it as the heir.
- A sonar scanner on the claim page that sweeps the chain and pings when wills naming you are found.
- Live will preview while you type: your heirs orbit the pool as satellites, fed by pulse dots.

## Running it

```bash
# contracts - requires Foundry
cd contracts
forge test -vv

# frontend
cd web
npm install
echo "VITE_PULSE_ADDRESS=0x<deployed>"  > .env
echo "VITE_VERIFIER_API=http://localhost:8787" >> .env
npm run dev

# reminder watcher (dry-run without SMTP creds: emails print to console)
cd watcher
npm install
PULSE_ADDRESS=0x<deployed> OWNER_EMAIL=you@mail.com node watcher.js

# OTP claim verifier
PULSE_ADDRESS=0x<deployed> VERIFIER_PK=0x<verifier-key> node verifier.js
```

### Deploying

```bash
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $PK --broadcast
# VERIFIER_ADDRESS env var overrides the verifier (defaults to deployer)
```

## Contract

| | |
|---|---|
| Network | Monad Testnet (chain id 10143) |
| Address | [`0x25419c9fe55d69924fb2d19692c9913a6768ecc4`](https://testnet.monadexplorer.com/address/0x25419c9fe55d69924fb2d19692c9913a6768ecc4) |
| Verifier | `0x4d33578Edb7193Cf9c6F2262f06d8d94196E9845` |

Key surface: `createWill` · `beat` / `beatAll` · `deposit` · `withdraw` · `close` · `claim` · `claimTo` · views for owners, heirs, and countdowns.

## Honest limitations & roadmap

- **Wallet-activity oracle.** The contract can't observe your main wallet's activity (the EVM can't read other accounts' history), so activity = interactions with the will. A keeper that watches your EOA and beats on your behalf is the natural next step.
- **Email heirs trust the verifier** (see security model above). Decentralizing this - DKIM proofs, zkEmail - is the serious long-term answer.
- **Token amounts assume 18 decimals** in the UI for ERC20s.
- **The watcher is a single process.** Fine for a hackathon; production wants redundancy, since missed reminder emails (not missed claims - those never expire) are the failure mode.

## License

[MIT](LICENSE) - see [CONTRIBUTING.md](CONTRIBUTING.md) to get involved.

---

*Every block is a heartbeat.* ♥
