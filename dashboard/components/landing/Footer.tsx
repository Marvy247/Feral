import { FeralLogo } from "@/components/FeralLogo"
import Link from "next/link"

const links = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Features", href: "#features" },
  { label: "About", href: "#about" },
]

export function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-white/5">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 py-16">

        <div className="flex flex-col md:flex-row justify-between gap-12 mb-14">
          {/* Brand */}
          <div className="max-w-xs">
            <div className="flex items-center gap-3 mb-5">
              <FeralLogo size={36} />
              <span className="font-black text-xl text-white tracking-tight">FERAL</span>
            </div>
            <p className="text-slate-500 text-sm leading-relaxed">
              The programmable financial OS for internet-native businesses.
              Spend controls, invoicing, and payroll enforced by Tempo&apos;s protocol.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-4">
              Navigation
            </p>
            <ul className="space-y-3">
              {links.map((l) => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="text-sm text-slate-400 hover:text-white transition-colors duration-200"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Built on */}
          <div>
            <p className="text-xs font-mono text-slate-600 tracking-[0.2em] uppercase mb-4">
              Infrastructure
            </p>
            <div className="space-y-3 text-sm text-slate-400">
              <p>Built on <span className="text-white font-medium">Tempo</span></p>
              <p>Incubated by <span className="text-white font-medium">Stripe</span> &amp; <span className="text-white font-medium">Paradigm</span></p>
              <p>Chain ID <span className="font-mono text-sky-400">268</span></p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-xs text-slate-700">
            &copy; 2026 FERAL. Built for the Crypto World&apos;s Fair Hackathon — Tempo Track.
          </p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-slate-600">Tempo testnet live</span>
          </div>
        </div>

      </div>
    </footer>
  )
}
