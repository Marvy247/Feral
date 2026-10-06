'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { authedRequest } from '@/lib/api'
import { useToast } from '@/hooks/use-toast'
import type { TeamMember } from '@/hooks/useTeam'

/**
 * Attempts a real payment from the member's policy scope.
 *
 * Before submitting, a read-only `pay/check` call simulates the
 * FeralPolicyEngine so the user sees the CHAIN's verdict (approved / blocked
 * and why) before anything is broadcast. Submitting anyway is intentional:
 * a blocked attempt still goes on-chain and records the revert as evidence.
 */

interface Preflight {
  phase: 'idle' | 'loading' | 'ok' | 'blocked' | 'error'
  reason?: string
  spentUsdc?: number
  limitUsdc?: number
}

export function PayVendorButton({
  businessId,
  member,
}: {
  businessId: string
  member: TeamMember
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('25')
  const [vendorChoice, setVendorChoice] = useState('0')
  const [busy, setBusy] = useState(false)
  const [check, setCheck] = useState<Preflight>({ phase: 'idle' })
  const [idemKey, setIdemKey] = useState('')
  const { toast } = useToast()

  const vendors = member.approved_vendors || []
  const UNAPPROVED = '0x000000000000000000000000000000000000dEaD'

  const targetAddress =
    vendorChoice === 'unapproved' ? UNAPPROVED : vendors[Number(vendorChoice)]?.vendor_address

  // Fresh idempotency key per panel session: double-clicks replay the first
  // attempt server-side instead of firing a second on-chain transfer.
  useEffect(() => {
    if (open) {
      setIdemKey(
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      )
    }
  }, [open])

  // Pre-flight: what would the chain do? Debounced, read-only eth_call.
  useEffect(() => {
    if (!open || !targetAddress || !Number(amount)) {
      setCheck({ phase: 'idle' })
      return
    }
    let cancelled = false
    setCheck((c) => ({ ...c, phase: 'loading' }))
    const t = setTimeout(async () => {
      try {
        const res = await authedRequest<{
          allowed: boolean
          reason: string
          spentUsdc: number
          limitUsdc: number
        }>(`/api/transactions/${businessId}/pay/check`, {
          method: 'POST',
          body: JSON.stringify({
            memberId: member.id,
            vendorAddress: targetAddress,
            amountUsdc: Number(amount),
          }),
        })
        if (cancelled) return
        setCheck({
          phase: res.allowed ? 'ok' : 'blocked',
          reason: res.reason,
          spentUsdc: res.spentUsdc,
          limitUsdc: res.limitUsdc,
        })
      } catch {
        if (!cancelled) setCheck({ phase: 'error' })
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, targetAddress, amount, businessId, member.id])

  const submit = async () => {
    setBusy(true)
    try {
      const useUnapproved = vendorChoice === 'unapproved'
      const vendor = useUnapproved ? null : vendors[Number(vendorChoice)]
      const target = vendor
        ? { address: vendor.vendor_address, name: vendor.vendor_name }
        : { address: UNAPPROVED, name: 'Unknown Vendor' }

      const res = await authedRequest<{
        status: string
        txHash: string | null
        explorerUrl: string | null
        rejectionReason: string | null
      }>(`/api/transactions/${businessId}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          memberId: member.id,
          vendorAddress: target.address,
          amountUsdc: Number(amount),
          vendorName: target.name,
          idempotencyKey: idemKey,
        }),
      })

      if (res.status === 'approved') {
        toast({
          title: 'APPROVED — settled on Tempo',
          description: `$${Number(amount).toFixed(2)} PathUSD to ${target.name}${
            res.txHash ? ` · tx ${res.txHash.slice(0, 14)}…` : ''
          }`,
        })
      } else {
        toast({
          title: 'BLOCKED by policy',
          description: res.rejectionReason || 'Rejected on-chain by FeralPolicyEngine',
          variant: 'destructive',
        })
      }
      setOpen(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed'
      toast({
        title: 'Error',
        description: msg.startsWith('ChainError')
          ? 'The chain did not respond — nothing was charged. Please try again.'
          : msg,
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-1.5 rounded-lg border border-sky-200 text-sky-700 text-xs font-medium hover:bg-sky-50 transition-colors shrink-0"
      >
        Pay vendor
      </button>
    )
  }

  return (
    <div className="w-full p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Vendor</label>
          <select
            value={vendorChoice}
            onChange={(e) => setVendorChoice(e.target.value)}
            className="w-full h-9 px-2 text-sm rounded-lg border border-slate-200 bg-white"
          >
            {vendors.map((v, i) => (
              <option key={v.vendor_address} value={String(i)}>
                {v.vendor_name} (approved)
              </option>
            ))}
            <option value="unapproved">⚠ Unapproved vendor</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Amount (PathUSD)</label>
          <Input
            type="number"
            min="1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {/* On-chain pre-flight verdict (read-only eth_call against the engine) */}
      {check.phase === 'loading' && (
        <p className="text-xs text-slate-500 animate-pulse">Simulating on-chain…</p>
      )}
      {check.phase === 'ok' && (
        <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          ✅ <span className="font-semibold">Chain simulation: will be approved.</span>{' '}
          ${Number(check.spentUsdc ?? 0).toFixed(2)} of $
          {Number(check.limitUsdc ?? 0).toFixed(2)} weekly limit used.
        </div>
      )}
      {check.phase === 'blocked' && (
        <div className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          ❌ <span className="font-semibold">Chain simulation: will be blocked</span> —{' '}
          {check.reason}. Submitting still records the revert on-chain as evidence.
        </div>
      )}
      {check.phase === 'error' && (
        <p className="text-xs text-slate-400">
          Simulation unavailable (chain unreachable) — you can still submit.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" className="bg-sky-600 hover:bg-sky-700" onClick={submit} disabled={busy}>
          {busy ? 'Submitting…' : 'Submit payment'}
        </Button>
      </div>
    </div>
  )
}
