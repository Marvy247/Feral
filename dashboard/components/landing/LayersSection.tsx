"use client"

import { useEffect, useRef } from "react"

const layers = [
  {
    num: "01",
    title: "Spend Controls",
    subtitle: "Protocol enforcement — not application logic",
    tag: "Live",
    tagStyle: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    live: true,
    dim: false,
    desc: "Each team member and AI agent holds an on-chain spending policy — approved vendors, weekly limits, and an active flag — registered in FERAL's FeralPolicyEngine contract on Tempo. Payments execute through the engine, which sits in the payment path: a violating call reverts on-chain with a custom error (CallNotAllowed, SpendingLimitExceeded, MemberInactive), and the reverted transaction itself becomes the audit record. The app cannot bypass the chain — the chain is the policy engine.",
  },
  {
    num: "02",
    title: "Financial Reconciliation",
    subtitle: "Self-reconciling accounts receivable via TIP-20 virtual addresses",
    tag: "Live",
    tagStyle: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    live: true,
    dim: false,
    desc: "Every invoice generates a unique Tempo virtual address. When a client pays, funds route directly to the master treasury wallet — no sweep transaction, no manual matching. Tempo's protocol resolves the address in the same operation as the transfer. Reconciliation is instant, automatic, and produces an immutable on-chain record.",
  },
  {
    num: "03",
    title: "Automated Payroll",
    subtitle: "Batched Tempo transactions — one signature, all-or-nothing",
    tag: "Live",
    tagStyle: "bg-sky-500/15 text-sky-400 border-sky-500/25",
    live: true,
    dim: false,
    desc: "A single signature schedules payroll for an entire team. FERAL constructs a batched Tempo Transaction with validAfter and validBefore timestamps — every transfer settles atomically inside one transaction during its validity window. The whole team paid at once; the batch either lands together or not at all. Zero operational overhead.",
  },
]

export function LayersSection() {
  const sectionRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view")
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1 }
    )
    const items = sectionRef.current?.querySelectorAll(".reveal-item")
    items?.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section id="how-it-works" className="bg-slate-950 py-24 md:py-36 border-t border-white/5">
      <style>{`
        .reveal-item {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.55s ease-out, transform 0.55s ease-out;
        }
        .reveal-item.in-view { opacity: 1; transform: translateY(0); }
        .reveal-item:nth-child(2) { transition-delay: 0.07s; }
        .reveal-item:nth-child(3) { transition-delay: 0.14s; }
        .reveal-item:nth-child(4) { transition-delay: 0.21s; }
      `}</style>

      <div ref={sectionRef} className="container mx-auto px-6 sm:px-10 max-w-5xl">
        {/* Header */}
        <div className="reveal-item mb-20">
          <p className="text-xs font-mono text-sky-400/60 tracking-[0.25em] uppercase mb-5">
            How it works
          </p>
          <h2 className="text-4xl md:text-5xl font-light text-white tracking-tight max-w-2xl">
            Three primitives.
            <br />
            <span className="text-slate-500">One operating system.</span>
          </h2>
        </div>

        {/* Layers */}
        <div className="divide-y divide-white/5">
          {layers.map((layer) => (
            <div
              key={layer.num}
              className="reveal-item group py-12 flex items-start gap-8 md:gap-12"
            >
              {/* Number */}
              <span className="text-xs font-mono text-sky-500/50 mt-1.5 w-8 shrink-0 select-none">
                {layer.num}
              </span>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <h3 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
                    {layer.title}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${layer.tagStyle}`}
                  >
                    {layer.live && (
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                    )}
                    {layer.tag}
                  </span>
                </div>
                <p className="text-sky-400/70 text-xs font-medium tracking-wide uppercase mb-4">
                  {layer.subtitle}
                </p>
                <p className="text-slate-400 text-sm leading-[1.85] max-w-2xl">
                  {layer.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
