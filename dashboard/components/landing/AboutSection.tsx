"use client"

const pillars = [
  {
    label: "The problem",
    title: "Business finance is built for banks, not builders.",
    body: "Internet-native businesses earn in stablecoins, pay contractors globally, and run AI agents that spend money autonomously. Traditional banking infrastructure was never designed for any of this. Every transaction requires a human, a bank, and days of settlement. The cost is friction — financial and operational.",
  },
  {
    label: "The insight",
    title: "The blockchain can enforce the policy. Not the bank.",
    body: "Tempo's AccountKeychain precompile allows a spending key to be scoped to specific vendors, specific token amounts, and specific weekly limits — at the protocol level. When an employee or AI agent attempts a payment outside those boundaries, the network rejects it before it ever submits. This is not a UI restriction. It is a cryptographic guarantee.",
  },
  {
    label: "The opportunity",
    title: "First-mover on a $500B market with no programmable incumbent.",
    body: "Brex, Ramp, and corporate cards control $500B in enterprise spend management GMV. None of them are programmable at the protocol level. None support AI agents. None settle in 0.4 seconds for $0.001. FERAL is positioned to own the financial OS layer for the next generation of internet-native businesses — before the incumbents can respond.",
  },
]

export function AboutSection() {
  return (
    <section id="about" className="bg-slate-950 py-24 md:py-36 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-6 sm:px-10">

        {/* Header */}
        <div className="mb-20">
          <p className="text-xs font-mono text-sky-400/60 tracking-[0.25em] uppercase mb-5">
            Why FERAL
          </p>
          <h2 className="text-4xl md:text-5xl font-light text-white tracking-tight max-w-2xl">
            Built for a world where
            <br />
            <span className="text-slate-500">software spends money.</span>
          </h2>
        </div>

        {/* Pillars */}
        <div className="space-y-0 divide-y divide-white/5">
          {pillars.map((p, i) => (
            <div key={i} className="py-12 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-8 md:gap-16">
              <div>
                <p className="text-xs font-mono text-sky-400/60 tracking-[0.2em] uppercase mb-3">
                  {p.label}
                </p>
                <h3 className="text-lg font-semibold text-white leading-snug">
                  {p.title}
                </h3>
              </div>
              <p className="text-slate-400 text-sm leading-[1.9]">
                {p.body}
              </p>
            </div>
          ))}
        </div>

        {/* Backed by */}
        <div className="mt-20 pt-12 border-t border-white/5">
          <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-6">
            Built on
          </p>
          <div className="flex flex-wrap items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <span className="text-xs font-black text-white">T</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Tempo</p>
                <p className="text-xs text-slate-600">Incubated by Stripe &amp; Paradigm</p>
              </div>
            </div>
            <div className="h-6 w-px bg-white/5" />
            <p className="text-sm text-slate-500 max-w-md">
              Tempo is a payments-first Layer 1 blockchain with sub-second finality, stablecoin-native
              fees, and dedicated payment lanes — the only chain with native protocol primitives
              for programmable business finance.
            </p>
          </div>
        </div>

      </div>
    </section>
  )
}
