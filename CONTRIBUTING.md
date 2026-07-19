# Contributing to Pulse

Thanks for your interest. Pulse handles something unusually sensitive - money that people are
leaving to their families - so contributions are held to a simple standard: **correctness over
cleverness, honesty over hype.**

## Getting set up

Prerequisites: [Foundry](https://book.getfoundry.sh/getting-started/installation), Node 20+.

```bash
git clone <repo-url> && cd pulse

# contracts
cd contracts && forge install && forge test

# frontend
cd ../web && npm install && npm run dev

# services (both run in dry-run mode without SMTP credentials)
cd ../watcher && npm install
```

Point the frontend at a contract with `web/.env`:

```
VITE_PULSE_ADDRESS=0x...
VITE_VERIFIER_API=http://localhost:8787
```

For a fully local loop, run anvil and deploy there:

```bash
anvil
cd contracts && forge script script/Deploy.s.sol --rpc-url http://localhost:8545 \
  --private-key <anvil key> --broadcast
```

Tip: create a will on the **5 minutes (demo)** interval so you can watch the whole
lifecycle - alive → critical → flatline → claim - in one sitting.

## Ground rules

### Contracts (`contracts/`)

- **Every behavioral change ships with tests.** `forge test` must pass; new claim paths need
  negative tests (who *can't* call this, and when) more than positive ones.
- **No upgradeability.** This is a design decision, not an omission. Heirs must not have to
  trust an admin key. Propose new features as new contracts users can migrate to voluntarily.
- **Never widen the verifier's power.** `claimTo` is deliberately caged: post-flatline only,
  email-heirs only, allocation-capped, recipient chosen by the heir. PRs that loosen any of
  those constraints will be declined regardless of what they enable.
- Follow the existing style: custom errors over require-strings, checks-effects-interactions,
  explicit storage pointers.

### Frontend (`web/`)

- `npx tsc --noEmit` must be clean.
- Match the existing visual language (the CSS variables in `styles.css`, the serif/mono/sans
  trio, the heartbeat metaphor). New UI that fights the design system will be asked to adapt.
- Anything that touches claiming must degrade gracefully for a non-crypto user - that persona
  (a grieving relative who has never used a wallet) is the bar for every claim-flow change.

### Services (`watcher/`)

- The watcher and verifier must stay **optional**: if they're down, the contract must remain
  fully usable for owners and wallet-heirs. Never move a hard requirement off-chain.
- The verifier must never accept an email address from a request. Heir emails come from the
  chain, period.

## Pull requests

1. Fork, branch from `main` (`feat/...`, `fix/...`), keep PRs focused on one thing.
2. Explain *why*, not just what. If it changes trust assumptions, say so prominently.
3. Make sure `forge test` and `npx tsc --noEmit` pass before requesting review.
4. Security-sensitive findings: please **do not open a public issue** - see below.

## Reporting security issues

If you find a vulnerability that could let someone claim funds early, claim another heir's
share, or block a legitimate claim, email the maintainers privately (address in the repo
profile) instead of filing an issue. We'll acknowledge within 48 hours. Give us a reasonable
window to deploy mitigations before public disclosure - people may have real funds behind this.

## Ideas we'd love help with

- **zkEmail / DKIM-proof claims** - remove the trusted verifier for email heirs entirely.
- **EOA activity keeper** - watch the owner's main wallet and beat on their behalf.
- **Token decimals handling** - proper `decimals()` support in the UI for non-18 tokens.
- **Localization** - the claim flow especially; families are global.
- **Watcher redundancy** - at-least-once reminder delivery without duplicate spam.

*Every block is a heartbeat.* ♥
