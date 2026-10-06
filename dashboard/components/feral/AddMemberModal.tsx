'use client'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { TeamMemberCard } from './TeamMemberCard'
import { useTeamMembers } from '@/hooks/useTeam'
import { useToast } from '@/hooks/use-toast'

export function AddMemberModal({
  businessId,
  onClose,
}: {
  businessId: string
  onClose?: () => void
}) {
  const { addMember } = useTeamMembers(businessId)
  const [busy, setBusy] = useState(false)
  const { toast } = useToast()

  const handleSave = async (values: any) => {
    setBusy(true)
    try {
      if (!values.walletAddress) {
        throw new Error('Wallet address is required')
      }
      await addMember({
        name: values.name,
        type: values.type || 'human',
        walletAddress: values.walletAddress,
        weeklyLimitUsdc: values.weeklyLimitUsdc,
        approvedVendors: values.approvedVendors || [],
      })
      toast({
        title: 'Team member added',
        description: `${values.name} — $${values.weeklyLimitUsdc}/week policy active`,
      })
      onClose?.()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to add member',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-medium mb-4">Add Team Member</h3>

        <TeamMemberCard onSave={handleSave} onClose={() => onClose?.()} busy={busy} />

        <button
          onClick={() => onClose?.()}
          className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
