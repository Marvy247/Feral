"use client"

const stats = [
  {
    value: "$500B+",
    label: "Enterprise spend management market",
    sub: "Brex, Ramp, corporate cards combined",
  },
  {
    value: "0.4s",
    label: "Settlement time on Tempo",
    sub: "vs. 2–5 business days on ACH",
  },
  {
    value: "$0.001",
    label: "Cost per transaction",
    sub: "vs. $0.25–$2.00 per ACH transfer",
  },
  {
    value: "100%",
    label: "Policy enforcement rate",
    sub: "Protocol-level — not application code",
  },
]

const steps = [
  {
    step: "01",
    title: "Employee attempts an unauthorized payment",
    detail:
      "An employee submits a payment to a vendor outside their approved list. FERAL's FeralPolicyEngine — the contract every payment executes through — reverts the call on-chain with CallNotAllowed. The failed transaction is included on-chain as evidence. No human review. No delay.",
    outcome: "BLOCKED",
    outcomeStyle: "text-red-400 bg-red-500/10 border-red-500/20",
    outcomeDetail: "CallNotAllowed — Vendor not in approved call scope",
  },
  {
    step: "02",
    title: "Employee pays an approved vendor",
    detail:
      "The same employee pays Notion — which is in their call scope. Signed with their device key, sponsored by FERAL so no gas is visible, settled in under a second. The CFO sees it in real time.",
    outcome: "APPROVED",
    outcomeStyle: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    outcomeDetail: "Settled on Tempo testnet · under a second · On-chain proof",
  },
  {
    step: "03",
    title: "Client pays an invoice",
    detail:
      "A client sends payment to the unique virtual address generated for Invoice #0042. Tempo routes funds directly to the treasury. The invoice auto-marks paid. Reconciliation: zero manual steps, zero delay.",
    outcome: "RECONCILED",
    outcomeStyle: "text-sky-400 bg-sky-500/10 border-sky-500/20",
    outcomeDetail: "Virtual address resolved · Memo matched · Immutable on-chain record",
  },
]

export function DemoSection() {
  return (
    <section id="demo" className="bg-slate-950 py-24 md:py-36 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-6 sm:px-10">

        {/* Market numbers */}
        <div className="mb-20">
          <p className="text-xs font-mono text-sky-400/60 tracking-[0.25em] uppercase mb-5">
            The market
          </p>
          <h2 className="text-4xl md:text-5xl font-light text-white tracking-tight max-w-2xl mb-6">
            The numbers that make
            <br />
            <span className="text-slate-500">this inevitable.</span>
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-xl">
            Programmable business finance has not existed until now.
            Tempo&apos;s protocol primitives make it possible for the first time —
            at a cost and speed that traditional infrastructure cannot match.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/5 rounded-2xl overflow-hidden mb-24">
          {stats.map((stat) => (
            <div key={stat.value} className="bg-slate-950 p-7">
              <p className="text-3xl md:text-4xl font-black text-white mb-2">{stat.value}</p>
              <p className="text-sm text-slate-300 font-medium mb-1">{stat.label}</p>
              <p className="text-xs text-slate-600">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Demo walkthrough */}
        <div className="mb-12">
          <p className="text-xs font-mono text-sky-400/60 tracking-[0.25em] uppercase mb-5">
            Live demo
          </p>
          <h2 className="text-4xl md:text-5xl font-light text-white tracking-tight mb-4">
            Three transactions.
            <br />
            <span className="text-slate-500">Three proofs.</span>
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xl mb-14">
            Every claim FERAL makes is verifiable on-chain. Open Tempo Explorer on any
            approved transaction and see the proof.
          </p>
        </div>

        <div className="space-y-3">
          {steps.map((s) => (
            <div
              key={s.step}
              className="rounded-2xl border border-white/5 bg-white/[0.02] p-7 hover:border-white/10 transition-colors duration-300"
            >
              <div className="flex items-start gap-6">
                <span className="text-xs font-mono text-sky-500/40 mt-1 shrink-0 w-6 select-none">
                  {s.step}
                </span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <h3 className="text-base font-semibold text-white">{s.title}</h3>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${s.outcomeStyle}`}>
                      {s.outcome}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed mb-3">{s.detail}</p>
                  <p className="text-xs font-mono text-slate-600">{s.outcomeDetail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  )
}
