"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { X, Menu } from "lucide-react"
import { FeralLogo } from "@/components/FeralLogo"

const navLinks = ["How it works", "Features", "About", "Demo"]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-5 sm:px-8 py-4 transition-all duration-500 ${
          scrolled
            ? "bg-slate-950/90 backdrop-blur-md border-b border-white/5 shadow-lg shadow-black/20"
            : "bg-transparent"
        }`}
      >
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={closeMenu}>
          <FeralLogo size={32} />
          <span className="font-black text-white text-lg leading-none tracking-tight">
            FERAL
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7 text-sm">
          {navLinks.map((item) => (
            <a
              key={item}
              href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
              className="text-slate-400 hover:text-white transition-colors duration-200"
            >
              {item}
            </a>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden md:flex items-center gap-3 shrink-0">
          <Link
            href="/dashboard"
            className="inline-flex items-center bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold px-5 py-2 rounded-full transition-all duration-200 shadow-lg shadow-sky-600/20"
          >
            Open Dashboard
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 flex flex-col pt-[64px] bg-slate-950/98 backdrop-blur-xl md:hidden">
          <nav className="flex flex-col px-6 py-8 gap-0">
            {navLinks.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={closeMenu}
                className="py-4 text-xl font-light text-slate-300 hover:text-white border-b border-white/5 last:border-0 transition-colors"
              >
                {item}
              </a>
            ))}
          </nav>
          <div className="px-6 mt-4 flex flex-col gap-3">
            <Link
              href="/dashboard"
              onClick={closeMenu}
              className="w-full text-center py-3.5 rounded-full bg-sky-600 text-white font-semibold text-sm"
            >
              Open Dashboard
            </Link>
          </div>
        </div>
      )}
    </>
  )
}
