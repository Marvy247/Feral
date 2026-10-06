# FERAL — a programmable financial OS on Tempo

**Money that can say no.** FERAL gives businesses programmable spend controls,
self-reconciling invoices, and batch payroll — where the spend rules are
*enforced by the chain*, not by an app's good intentions:

- **Policy Radar** — every spend decision (approved or blocked) streams to a
  live dashboard **as a chain verdict**: approved payments carry a real Tempo
  tx hash; blocked payments carry a **reverted transaction** you can open in
  the explorer.
- **Self-reconciling invoices (TIP-1022)** — each invoice gets a unique
  virtual address; when a client pays it, the protocol auto-forwards the funds
  to the treasury and the invoice marks itself paid, no reconciliation job.
- **Kill switch for humans *and* agents** — revoke a team member on-chain and
  their very next payment reverts with `MemberInactive()`.

Built for the **Tempo track** (Crypto World's Fair by Colosseum), Moderato testnet.

---

## The 4 demo beats (see [DEMO_VIDEO.md](DEMO_VIDEO.md))

| # | Beat | Proof |
|---|------|-------|
| 1 | Unapproved vendor pays → **the chain rejects it** | tx with `Status: Failed` on `FeralPolicyEngine.pay()` |
| 2 | Agent goes rogue → owner revokes **on-chain** → agent's next payment reverts `MemberInactive()` | two txs: revoke + reverted payment |
| 3 | Client pays an invoice's virtual address → protocol **auto-forwards to treasury** → invoice flips to *paid* by itself | explorer shows `Forwarded 1,250 PathUSD to 0x27A2…` |
| 4 | Approved payment settles with a real tx, streams into Policy Radar over WebSocket | tx hash + radar event |

## Screenshots

**Landing** — the thesis: *“Every dollar your business moves is a policy decision.”*

![FERAL landing hero](docs/screenshots/01-landing-hero.png)

**Team roster** — believable demo team, each card showing live weekly spend
straight from `FeralPolicyEngine.spentThisWeek()`:

![Team roster with on-chain weekly-spend bars](docs/screenshots/05-team-roster.png)

**Pre-flight, chain verdict before you send** — a read-only `check()` call
against the engine, so the user sees what the chain *will* say:

![Pre-flight simulation: will be approved](docs/screenshots/06-preflight-approved.png)

…and for an unapproved vendor, the chain’s answer *before* anything is broadcast:

![Pre-flight simulation: will be blocked](docs/screenshots/07-preflight-blocked.png)

**Policy Radar** — APPROVED events with real tx hashes, BLOCKED events with
reverted on-chain transactions (click through to the explorer):

![Policy Radar live verdicts](docs/screenshots/09-policy-radar.png)

**Invoices** — one pending (auto-reconciling, watched live) and two already
reconciled by the TIP-1022 virtual-address flow:

![Invoices: waiting for payment + reconciled](docs/screenshots/10-invoices.png)

More (kill-switch dialog, payroll, how-it-works): [`docs/screenshots/`](docs/screenshots/)
— regenerate any time with `cd dashboard && node scripts/screenshots.mjs`.

## Why Tempo (and how deeply we use it)

| Tempo primitive | How FERAL uses it |
|---|---|
| **TIP-20** stablecoin (PathUSD) | every payment, invoice, and payroll run on it |
| **TIP-1022** virtual addresses | invoice deposit addresses (`masterId \| magic \| userTag`), registered via 32-bit PoW `registerVirtualMaster()` — masterId `fd8f153c` |
| **TIP-403** policy registry | probed on-chain (`0x403c…0000`): PathUSD's transfer policy is **policy #1, BLACKLIST, admin = 0x000…0** — i.e. third parties cannot bind policies to shared tokens. FERAL therefore enforces **in the payment path** with `FeralPolicyEngine`, which mirrors TIP-403's whitelist/blacklist semantics and is ready to fold into a token-level policy when issuing a business token. |
| Sponsored fees | fee payer/token shown on every tx — demo users need no gas token |
| Sub-second finality | payments, revocations, and invoice reconciliation all settle in the same second they're shown |

## How enforcement works

```
Dashboard ──► Backend ──► FeralPolicyEngine.pay(business, member, vendor, amount)
                             │  member active?      ── else revert MemberInactive()
                             │  vendor approved?    ── else revert CallNotAllowed()
                             │  weekly limit OK?    ── else revert SpendingLimitExceeded()
                             └──► token.transferFrom(treasury → vendor)
```

- The treasury grants the **engine** an allowance; the backend never decides
  spend policy — it just submits the call and reports what the chain answered.
- A blocked payment is still **broadcast** (fixed gas), so the BLOCKED event
  carries a real tx hash whose explorer page shows `Status: Failed` — public,
  timestamped, auditable evidence of the denial.
- Weekly limits and vendor lists live on-chain (per business + member), kept
  in sync by the backend when the dashboard mutates team/vendor settings.

## Deployed on Moderato (chain id 42431)

| Contract / address | Value |
|---|---|
| FeralRegistry | `0xe377Cb5aAB782315eF5bDa4ABA1be953a7156925` |
| InvoiceVault | `0xc6dFd5ad02d877582A4c81840Ab4E944c608021a` |
| **FeralPolicyEngine** | `0xDF445D3B191D7d0D0D31053890bEb1E712d96eCc` |
| PathUSD (TIP-20, 6 decimals) | `0x20c0000000000000000000000000000000000000` |
| TIP-403 Policy Registry | `0x403c000000000000000000000000000000000000` |
| TIP-1022 registry precompile | `0xFDC0000000000000000000000000000000000000` |
| Treasury / deployer | `0x27A2dD1823D883935c9824fbaC0a018cE8e891E5` |
| Registered masterId | `fd8f153c` |
| Explorer | `https://explore.testnet.tempo.xyz` |

Example evidence txs:
- ✅ approved: [`0x1f9b288f…5c2ec`](https://explore.testnet.tempo.xyz/tx/0x1f9b288fee5fcf00afc04104e3a1249c242065a46ce22aec29f93d977735c2ec)
- ❌ blocked on-chain: [`0x7ac35004…91c52`](https://explore.testnet.tempo.xyz/tx/0x7ac35004ff33a958746932d7af553e010f166525007306500832d56814a91c52) — `Status: Failed`, `Call pay(…) on 0xDF445D3B…`
- 🧾 invoice auto-payment: [`0x5a1a9a19…4ef4a`](https://explore.testnet.tempo.xyz/tx/0x5a1a9a19290132c4da1e4cf859a7f2c32988087b75f9c71171d45ece9eb4ef4a) — `Forwarded 1,250 PathUSD to 0x27A2…`

## Verification (run these yourself)

```bash
cd contracts && forge test            # 18/18 — 10 for FeralPolicyEngine incl. all 3 reverts
cd dashboard && node scripts/e2e.mjs        # 12/12 — full UI flow incl. on-chain approve/block
cd dashboard && node scripts/e2e-revoke.mjs # 8/8 — type-to-confirm kill switch, on-chain revoke tx
```

- `forge test` — 18 passing (policy happy path, `CallNotAllowed`,
  `SpendingLimitExceeded`, `MemberInactive` kill switch, weekly window reset,
  owner gating).
- `e2e.mjs` (Puppeteer + Chrome) — dashboard opens with no login gate, team
  CRUD, approved payment settles with a real tx, unapproved payment blocked by
  the chain, Policy Radar receives both events live over WebSocket.
- Invoice loop: create → pay the virtual address → indexer reconciles
  `status=paid` + `INVOICE_PAID` radar event (verified twice on-chain).

## Run locally

```bash
# one-time: dashboard session config (public testnet demo account)
cd dashboard && cp .env.example .env.local

# backend (port 3001)         # dashboard (port 3000)
cd backend  && npx tsx watch src/index.ts
cd dashboard && npx next dev -p 3000
```

The dashboard opens straight onto the seeded workspace (no login gate): it
silently acquires a backend session using the credentials in `.env.local` —
they are read from env, not from source.

Backend needs `.env` (see `.env.example` for the key list: Supabase, Tempo RPC,
`DEPLOYER_PRIVATE_KEY`, `FERAL_POLICY_ENGINE_ADDRESS`). Useful scripts:

| Script | Purpose |
|---|---|
| `backend/scripts/seed_roster.ts` | reset the demo Team tab to a believable roster (deactivates test rows) and sync every member's policy on-chain — idempotent, safe to re-run after e2e runs |
| `backend/scripts/sync_engine.ts` | backfill **all** active DB members → FeralPolicyEngine (use after editing the DB while the backend was down) |

Contracts: `forge test`; redeploy engine with
`forge script script/DeployPolicyEngine.s.sol --broadcast --gas-estimate-multiplier 700`,
then `cast send $USDC "approve(address,uint256)" <engine> <max>` (this
foundry build cannot simulate PathUSD's TIP-20 `approve` locally — `cast`
talks to the real chain).

## Production path

What's demo-grade today, and what we'd ship next (honestly):

| Area | Now (testnet demo) | Production |
|---|---|---|
| Payment idempotency | done — client idempotency keys, 15-min server TTL, definitive verdicts replayed | durable store (Redis/Postgres) + request signing |
| Signing | single deployer EOA in `.env` | owner multisig; per-member keys via **AccountKeychain** (the scoping calldata is already built in `accessKeyService.ts`) |
| Secrets / config | `.env` files | KMS-managed secrets, per-env config, no shared demo account |
| Auth | single demo session, JWT bearer | real user accounts, refresh rotation, per-route rate limits |
| Source of truth | chain (engine + vault), DB as read model — same split as production | + DB migrations, audit-log retention, replayable indexer |
| Observability | Policy Radar (WebSocket) + explorer links on every verdict | alerting on revert-rate spikes, indexer lag/health checks, metrics |
| Token-level policy | engine enforces **in the payment path** (TIP-403's `BLACKLIST` policy #1 is admin-locked to 0x000…0 for PathUSD) | when issuing a business token, bind `FeralPolicyEngine` as its TIP-403 transfer policy |
| Payroll | pre-signed batch executed inside its validity window | passkey/AccountSession signing in-browser, automated execution + reconciliation job |

## Structure

```
contracts/   FeralRegistry, InvoiceVault, FeralPolicyEngine + forge tests (18)
backend/     Express API, TIP-1022 virtual addresses, RPC indexer, Policy Radar WS
dashboard/   Next.js app — Team, Pay, Invoices, Payroll, Policy Radar + e2e
```
