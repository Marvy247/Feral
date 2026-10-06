'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTempoWallet } from '@/hooks/useTempoWallet'

interface TeamMemberFormValues {
  name: string
  type: 'human' | 'agent'
  walletAddress: string
  weeklyLimitUsdc: number
  approvedVendors: { name: string; address: string }[]
}

export function TeamMemberCard({ 
  initialValues,
  onSave,
  onClose,
  busy,
}: {
  initialValues?: TeamMemberFormValues
  onSave: (values: TeamMemberFormValues) => void | Promise<void>
  onClose: () => void
  busy?: boolean
}) {
  const [values, setValues] = useState<TeamMemberFormValues>(initialValues || {
    name: '',
    type: 'human',
    walletAddress: '',
    weeklyLimitUsdc: 100,
    approvedVendors: [],
  })
  const [vendorDraft, setVendorDraft] = useState({ name: '', address: '' })
  const { connect } = useTempoWallet()

  const addVendor = () => {
    const name = vendorDraft.name.trim()
    const address = vendorDraft.address.trim()
    if (!name || !address) return
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return
    setValues((prev) => ({
      ...prev,
      approvedVendors: [...prev.approvedVendors, { name, address }],
    }))
    setVendorDraft({ name: '', address: '' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Parent decides whether to close (so errors can keep the modal open)
    await onSave(values)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
          <Input
            value={values.name}
            onChange={(e) => setValues({ ...values, name: e.target.value })}
            placeholder="e.g. Alice, Claude Agent"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
          <Select value={values.type} onValueChange={(val) => setValues({ ...values, type: val as 'human' | 'agent' })}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="agent">AI Agent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Wallet Address</label>
        <Input
          value={values.walletAddress}
          onChange={(e) => setValues({ ...values, walletAddress: e.target.value })}
          placeholder="Tempo wallet address (0x…)"
        />
        {connect && (
          <Button
            type="button"
            onClick={async () => {
              const addr = await connect()
              if (addr) setValues((prev) => ({ ...prev, walletAddress: addr }))
            }}
            className="mt-2 text-sm text-sky-600"
          >
            Generate wallet
          </Button>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Weekly Limit (PathUSD)</label>          <Input
            type="number"
            value={values.weeklyLimitUsdc}
            onChange={(e) => setValues({ ...values, weeklyLimitUsdc: Number(e.target.value) })}
            min="1"
            step="1"
            placeholder="e.g. 100"
          />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Approved Vendors</label>
        {values.approvedVendors.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {values.approvedVendors.map((v, i) => (
              <span
                key={`${v.address}-${i}`}
                className="inline-flex items-center gap-1 text-xs bg-sky-50 border border-sky-200 text-sky-700 rounded-full px-2.5 py-1"
              >
                {v.name}
                <button
                  type="button"
                  onClick={() =>
                    setValues((prev) => ({
                      ...prev,
                      approvedVendors: prev.approvedVendors.filter((_, idx) => idx !== i),
                    }))
                  }
                  className="text-sky-400 hover:text-sky-700"
                  aria-label={`Remove ${v.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
          <Input
            value={vendorDraft.name}
            onChange={(e) => setVendorDraft((p) => ({ ...p, name: e.target.value }))}
            placeholder="Vendor name"
          />
          <Input
            value={vendorDraft.address}
            onChange={(e) => setVendorDraft((p) => ({ ...p, address: e.target.value }))}
            placeholder="0x vendor address"
          />
          <Button type="button" variant="outline" onClick={addVendor} className="h-9">
            Add
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="button" onClick={onClose} className="flex-1" disabled={busy}>Cancel</Button>
        <Button type="submit" className="flex-1 bg-sky-600 hover:bg-sky-700" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  )
}