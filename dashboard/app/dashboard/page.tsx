'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileText,
  DollarSign,
  Shield,
  Bot,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { FeralLogo } from '@/components/FeralLogo'
import { TreasuryOverview } from '@/components/feral/TreasuryOverview'
import { PolicyRadar } from '@/components/feral/PolicyRadar'
import { InvoiceList } from '@/components/feral/InvoiceList'
import { PayrollScheduler } from '@/components/feral/PayrollScheduler'
import { AddMemberModal } from '@/components/feral/AddMemberModal'
import { AddAgentModal } from '@/components/feral/AddAgentModal'
import { PayVendorButton } from '@/components/feral/PayVendorButton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Toaster } from '@/components/ui/toaster'
import { useTeamMembers, TeamMember } from '@/hooks/useTeam'
import { useToast } from '@/hooks/use-toast'
import { ensureAuth } from '@/lib/api'

const FERAL_NAV = [
  { id: 'overview',  name: 'Treasury',     icon: LayoutDashboard },
  { id: 'radar',     name: 'Policy Radar', icon: Shield, badge: 'Live' },
  { id: 'team',      name: 'Team',         icon: Users },
  { id: 'invoices',  name: 'Invoices',     icon: FileText },
  { id: 'payroll',   name: 'Payroll',      icon: DollarSign },
]

export default function DashboardPage() {
  const router = useRouter()
  // null until the silent session resolves — hooks must not fire with the
  // placeholder id (it 403s and flashes a scary error on first paint).
  const [bizId, setBizId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState('My Business')

  useEffect(() => {
    // Seed demo config so the UI is not empty.
    // Wallet = the real demo treasury (PathUSD holdings + invoice forwarding
    // target) — the Treasury Overview reads its on-chain balance.
    if (!localStorage.getItem('feral_business_id')) {
      localStorage.setItem('feral_business_id', 'demo-business-1')
      localStorage.setItem('feral_business_name', 'Acme Agency')
    }
    localStorage.setItem('feral_wallet_address', '0x27A2dD1823D883935c9824fbaC0a018cE8e891E5')
    setBusinessName(localStorage.getItem('feral_business_name') || 'My Business')

    // Silently acquire a backend session so every screen hits the real API
    ensureAuth()
      .then(({ businessId }) => {
        setBizId(businessId)
        setBusinessName(localStorage.getItem('feral_business_name') || 'My Business')
      })
      .catch((err) => {
        console.error('[ensureAuth]', err)
        // Backend unreachable — render anyway so hooks show their own
        // friendly error states instead of an endless spinner.
        setBizId(localStorage.getItem('feral_business_id') || 'offline')
      })
  }, [])

  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-dashboard">
        <div className="animate-pulse text-slate-400 text-sm">Loading FERAL…</div>
      </div>
    }>
      <DashboardLayout
        brandName="FERAL"
        logo={<FeralLogo size={36} />}
        userName={businessName}
        userEmail="owner"
        sidebarItems={FERAL_NAV}
        onLogout={() => {
          localStorage.clear()
          router.replace('/')
        }}
      >
        {/* Session gate: hooks need the real business id (the placeholder
            403s and flashes an error on first paint). */}
        {bizId ? (
          <FeralDashboardContent bizId={bizId} />
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center">
            <p className="animate-pulse text-slate-400 text-sm">Connecting to FERAL…</p>
          </div>
        )}
      </DashboardLayout>
    </Suspense>
  )
}

function FeralDashboardContent({ bizId }: { bizId: string }) {
  const [tab, setTab] = useState('overview')
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAddAgent, setShowAddAgent] = useState(false)
  const searchParams = useSearchParams()

  // Sync tab from URL — reactive, so sidebar navigation actually switches tabs
  useEffect(() => {
    const t = searchParams.get('tab')
    const valid = ['overview', 'radar', 'team', 'invoices', 'payroll']
    setTab(t && valid.includes(t) ? t : 'overview')
  }, [searchParams])

  return (
    <div className="space-y-6">
      {tab === 'overview' && <TreasuryOverview businessId={bizId} />}
      {tab === 'radar'    && <PolicyRadar businessId={bizId} />}
      {tab === 'team'     && (
        <TeamTab
          bizId={bizId}
          onAddMember={() => setShowAddMember(true)}
          onAddAgent={() => setShowAddAgent(true)}
        />
      )}
      {tab === 'invoices' && <InvoiceList businessId={bizId} />}
      {tab === 'payroll'  && <PayrollScheduler businessId={bizId} />}

      {showAddMember && (
        <AddMemberModal businessId={bizId} onClose={() => setShowAddMember(false)} />
      )}
      {showAddAgent && (
        <AddAgentModal businessId={bizId} onClose={() => setShowAddAgent(false)} />
      )}

      {/* Radix toast viewport — without this, useToast() toasts never render */}
      <Toaster />
    </div>
  )
}

function TeamTab({
  bizId,
  onAddMember,
  onAddAgent,
}: {
  bizId: string
  onAddMember: () => void
  onAddAgent: () => void
}) {
  const { members, isLoading, error, removeMember } = useTeamMembers(bizId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Team</h1>
          <p className="text-sm text-slate-500 mt-1">
            Humans and AI agents under one policy engine
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onAddAgent}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-sky-200 text-sky-700 text-sm font-medium hover:bg-sky-50 transition-colors"
          >
            <Bot className="w-4 h-4" />
            Add Agent
          </button>
          <button
            onClick={onAddMember}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-500 transition-colors shadow-sm"
          >
            <Users className="w-4 h-4" />
            Add Member
          </button>
        </div>
      </div>

      {/* Team members */}
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading team…</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800 font-medium">Couldn&apos;t load the team</p>
            <p className="text-xs text-amber-700 mt-0.5">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-xs font-medium text-amber-800 underline underline-offset-2"
            >
              Reload to retry
            </button>
          </div>
        ) : members.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">No team members yet.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Add a member or agent to provision a scoped spending key — you set
              their weekly limit and approved vendors, and the policy is enforced
              on-chain by the FeralPolicyEngine.
            </p>
            <button
              onClick={onAddMember}
              className="mt-3 text-xs font-medium text-sky-700 underline underline-offset-2"
            >
              Add your first member
            </button>
          </div>
        ) : (
          members.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              businessId={bizId}
              onRevoke={() => removeMember(member.id)}
            />
          ))
        )}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-sky-100 bg-sky-50">
        <Shield className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-sky-900">Protocol-enforced policies</p>
          <p className="text-xs text-sky-700 mt-0.5">
            Spend limits and vendor restrictions are enforced on-chain by the FeralPolicyEngine
            contract — it sits in the payment path, so a violation reverts the transaction itself
            (CallNotAllowed / SpendingLimitExceeded / MemberInactive). Policies cannot be bypassed.
          </p>
        </div>
      </div>
    </div>
  )
}

function MemberRow({
  member,
  businessId,
  onRevoke,
}: {
  member: TeamMember
  businessId: string
  onRevoke: () => Promise<{ success: boolean; engineTxHash?: string }>
}) {
  const isAgent = member.type === 'agent'
  const vendorNames = (member.approved_vendors || []).map((v) => v.vendor_name)
  const { toast } = useToast()
  const [revoking, setRevoking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [revokeText, setRevokeText] = useState('')

  // On-chain weekly spend vs limit (from FeralPolicyEngine). null = chain unreachable → bar hidden.
  const limit = Number(member.weekly_limit_usdc) || 0
  const spent = member.spent_this_week_usdc
  const pct = spent != null && limit > 0 ? Math.min(100, (Number(spent) / limit) * 100) : null

  const closeConfirm = () => {
    setConfirmOpen(false)
    setRevokeText('')
  }

  // Kill switch: DELETE flips the on-chain policy first (chain = truth),
  // then the read model. Gated behind the type-to-confirm dialog.
  const doRevoke = async () => {
    setRevoking(true)
    try {
      const r = await onRevoke()
      toast({
        title: 'Revoked on-chain',
        description: r.engineTxHash
          ? `Policy tx ${r.engineTxHash.slice(0, 18)}… — next payment will revert.`
          : 'Member deactivated.',
      })
      closeConfirm()
    } catch (err) {
      toast({
        title: 'Revoke failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setRevoking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl border border-slate-200 bg-white hover:border-sky-200 transition-colors">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isAgent ? 'bg-sky-100 border border-sky-200' : 'bg-slate-100'
          }`}
        >
          {isAgent ? (
            <Bot className="w-5 h-5 text-sky-600" />
          ) : (
            <Users className="w-5 h-5 text-slate-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-900 text-sm">{member.name}</p>
            {isAgent && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                AI AGENT
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <span className="text-xs text-slate-500">${member.weekly_limit_usdc}/week</span>
            <span className="text-slate-300">·</span>
            <span className="text-xs text-slate-500">
              {vendorNames.length > 0 ? vendorNames.join(', ') : 'No approved vendors'}
            </span>
          </div>
          {pct !== null && (
            <div className="mt-2 max-w-md">
              <div className="flex items-center justify-between text-[11px] text-slate-500 mb-1">
                <span>
                  ${Number(spent).toFixed(2)} of ${limit} used this week · on-chain
                </span>
                <span className="font-medium">{pct.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">Policy active</span>
          </div>
          <button
            type="button"
            disabled={revoking}
            onClick={() => setConfirmOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs font-medium hover:bg-red-50 transition-colors"
          >
            {revoking ? 'Revoking…' : 'Revoke'}
          </button>
          <PayVendorButton businessId={businessId} member={member} />
        </div>
      </div>

      {/* Type-to-confirm revoke dialog — a mis-click must not kill a policy */}
      <Dialog open={confirmOpen} onOpenChange={(o) => !o && closeConfirm()}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Revoke {member.name} on-chain?</DialogTitle>
            <DialogDescription>
              This writes <span className="font-semibold text-slate-700">syncMember(active=false)</span> to
              the FeralPolicyEngine contract. From that tx onward every payment from this
              member reverts with <span className="font-semibold text-slate-700">MemberInactive</span> —
              the chain enforces it, not the app. Type <span className="font-semibold text-slate-700">REVOKE</span> to
              confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={revokeText}
            onChange={(e) => setRevokeText(e.target.value)}
            placeholder="REVOKE"
            aria-label="Type REVOKE to confirm"
            className="tracking-widest"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={closeConfirm} disabled={revoking}>
              Cancel
            </Button>
            <Button
              onClick={doRevoke}
              disabled={revokeText.trim().toUpperCase() !== 'REVOKE' || revoking}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {revoking ? 'Revoking…' : 'Revoke on-chain'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
