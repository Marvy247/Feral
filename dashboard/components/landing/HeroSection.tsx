"use client"

import Link from "next/link"

export function HeroSection() {
  return (
    <section
      id="home"
      className="relative z-10 min-h-screen flex flex-col justify-center overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
    >
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(28px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .hero-fade-1 { animation: fadeUp 0.75s ease-out 0.10s both; }
        .hero-fade-2 { animation: fadeUp 0.75s ease-out 0.25s both; }
        .hero-fade-3 { animation: fadeUp 0.75s ease-out 0.42s both; }
        .hero-fade-4 { animation: fadeUp 0.75s ease-out 0.58s both; }
        .hero-fade-5 { animation: fadeUp 0.75s ease-out 1.40s both; }
        @keyframes bounceDot {
          0%, 100% { transform: translateY(0); }
          50%       { transform: translateY(8px); }
        }
        .bounce-dot { animation: bounceDot 1.5s ease-in-out infinite; }
      `}</style>

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(14,165,233,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.04) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage:
            "radial-gradient(ellipse 95% 80% at 50% 38%, black 30%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 95% 80% at 50% 38%, black 30%, transparent 100%)",
        }}
      />

      <div className="relative z-10 container mx-auto px-5 sm:px-8 pt-28 pb-24 max-w-5xl">
        {/* Badge */}
        <div className="hero-fade-1 inline-flex items-center gap-2 bg-sky-500/10 border border-sky-500/20 rounded-full px-4 py-1.5 text-xs sm:text-sm text-sky-400 mb-10">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
          Powered by Tempo · Live on testnet
        </div>

        {/* Headline */}
        <h1
          className="hero-fade-2 font-black text-white leading-[1.0] tracking-tight mb-6 max-w-3xl"
          style={{ fontSize: "clamp(3rem, 9vw, 7rem)" }}
        >
          Every dollar your
          <br />
          business moves
          <br />
          <span className="text-sky-400">is a policy decision.</span>
        </h1>

        {/* Subtext */}
        <p className="hero-fade-3 text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl mb-10">
          FERAL enforces it at the protocol level: spend controls,
          invoicing, and payroll governed by Tempo&apos;s blockchain,
          not a policy handbook.
        </p>

        {/* CTAs */}
        <div className="hero-fade-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 max-w-xs sm:max-w-none">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 bg-sky-600 text-white font-semibold text-sm px-8 py-3.5 rounded-full hover:bg-sky-500 transition-all duration-200 shadow-lg shadow-sky-600/20"
          >
            Open Dashboard
          </Link>
          <a
            href="#features"
            className="inline-flex items-center justify-center gap-2 border border-slate-700 text-slate-300 font-medium text-sm px-8 py-3.5 rounded-full hover:bg-slate-800 hover:border-slate-600 transition-all duration-200"
          >
            How it works
          </a>
        </div>

        {/* Tempo badge */}
        <div className="hero-fade-4 mt-12 flex items-center gap-2 text-xs text-slate-600">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Built on Tempo · Incubated by Stripe &amp; Paradigm · Sub-second settlement
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="hero-fade-5 absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
        <span className="text-xs text-slate-600 tracking-widest uppercase font-medium">
          Scroll to explore
        </span>
        <div className="bounce-dot w-1.5 h-1.5 rounded-full bg-sky-400/40" />
      </div>
    </section>
  )
}
