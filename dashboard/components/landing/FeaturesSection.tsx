"use client"

import { useRef } from "react"
import { motion, useScroll, useTransform } from "framer-motion"
import { Users, Settings, Shield, Zap } from "lucide-react"

const features = [
  {
    num: "01",
    icon: Users,
    title: "Team Spend Controls",
    desc: "Employees get access keys that can only pay approved vendors up to a weekly limit, enforced at the Tempo protocol level."
  },
  {
    num: "02",
    icon: Shield,
    title: "AI Agent Policies",
    desc: "AI agents inside the company get the same policy treatment as humans: scoped keys, spend caps, approved endpoint lists."
  },
  {
    num: "03",
    icon: Zap,
    title: "Self-reconciling Invoices",
    desc: "Every invoice generates a unique Tempo virtual address; payment auto-routes to the master wallet and auto-matches to the invoice."
  },
  {
    num: "04",
    icon: Settings,
    title: "Automated Payroll",
    desc: "Batch transactions scheduled via validAfter/validBefore execute automatically with zero gas friction for employees."
  },
]

export function FeaturesSection() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  })

  const headerY = useTransform(scrollYProgress, [0, 0.1], [30, 0])
  const headerOp = useTransform(scrollYProgress, [0, 0.1], [0, 1])

  const y0 = useTransform(scrollYProgress, [0.04, 0.18], [45, 0])
  const op0 = useTransform(scrollYProgress, [0.04, 0.18], [0, 1])

  const y1 = useTransform(scrollYProgress, [0.22, 0.36], [45, 0])
  const op1 = useTransform(scrollYProgress, [0.22, 0.36], [0, 1])

  const y2 = useTransform(scrollYProgress, [0.42, 0.56], [45, 0])
  const op2 = useTransform(scrollYProgress, [0.42, 0.56], [0, 1])

  const y3 = useTransform(scrollYProgress, [0.62, 0.76], [45, 0])
  const op3 = useTransform(scrollYProgress, [0.62, 0.76], [0, 1])

  const itemStyles = [
    { y: y0, opacity: op0 },
    { y: y1, opacity: op1 },
    { y: y2, opacity: op2 },
    { y: y3, opacity: op3 },
  ]

  return (
    <div ref={containerRef} id="features" className="relative h-[450vh] bg-slate-950">
      <div className="sticky top-0 h-screen flex flex-col justify-center px-8 md:px-16 lg:px-24 overflow-hidden">
        <div className="max-w-5xl w-full mx-auto">
          <motion.div style={{ y: headerY, opacity: headerOp }} className="mb-12">
            <p className="text-xs font-mono text-sky-300/70 tracking-[0.2em] uppercase mb-5">
              / Platform Capabilities
            </p>
            <h2 className="text-5xl md:text-6xl font-light text-slate-100 tracking-tight">
              Core Features
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {features.map((feature, i) => (
              <motion.div
                key={feature.num}
                style={itemStyles[i]}
                className="group relative"
              >
                <div className="flex items-start gap-6 p-8 rounded-2xl border border-sky-500/20 bg-slate-900 hover:border-sky-500/30 bg-slate-900/50 transition-all duration-500">
                  <div className="shrink-0">
                    <span className="text-xs font-mono text-sky-300/70 block mb-4">{feature.num}</span>
                    <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center group-hover:bg-sky-500/20 transition-colors duration-300">
                      <feature.icon className="w-5 h-5 text-sky-300" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-xl font-light text-slate-100 mb-3">{feature.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
