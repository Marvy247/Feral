'use client'

import { useState, useEffect, useCallback } from 'react'
import { authedRequest } from '@/lib/api'

export interface ApprovedVendor {
  id?: string
  vendor_name: string
  vendor_address: string
}

export interface TeamMember {
  id: string
  name: string
  type: 'human' | 'agent'
  email?: string | null
  wallet_address: string
  access_key_id?: string
  weekly_limit_usdc: number
  /** On-chain spend this week (from FeralPolicyEngine); null = chain unreachable. */
  spent_this_week_usdc?: number | null
  is_active?: boolean
  approved_vendors?: ApprovedVendor[]
}

export function useTeam() {
  const [businessId, setBusinessId] = useState<string | null>(null)

  useEffect(() => {
    setBusinessId(localStorage.getItem('feral_business_id'))
  }, [])

  return { businessId, setBusinessId }
}

/** Live team list from the backend. */
export function useTeamMembers(businessId: string) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!businessId) return
    try {
      const rows = await authedRequest<any[]>(`/api/team/${businessId}`)
      setMembers(
        (rows || []).map((r) => ({
          ...r,
          weekly_limit_usdc: Number(r.weekly_limit_usdc),
          spent_this_week_usdc:
            r.spent_this_week_usdc == null ? null : Number(r.spent_this_week_usdc),
        }))
      )
      setError(null)
    } catch (err) {
      console.warn('[useTeamMembers]', err)
      setError(err instanceof Error ? err.message : 'Failed to load team')
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const addMember = useCallback(
    async (input: {
      name: string
      type: 'human' | 'agent'
      walletAddress: string
      weeklyLimitUsdc: number
      approvedVendors: { name: string; address: string }[]
      email?: string
    }) => {
      const result = await authedRequest<any>(`/api/team/${businessId}`, {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          type: input.type,
          email: input.email,
          walletAddress: input.walletAddress,
          weeklyLimitUsdc: input.weeklyLimitUsdc,
          approvedVendors: input.approvedVendors,
        }),
      })
      await refresh()
      return result
    },
    [businessId, refresh]
  )

  /** Kill switch: revoke the member on-chain (their next pay() reverts). */
  const removeMember = useCallback(
    async (memberId: string): Promise<{ success: boolean; engineTxHash?: string }> => {
      const result = await authedRequest<{ success: boolean; engineTxHash?: string }>(
        `/api/team/${businessId}/${memberId}`,
        { method: 'DELETE' }
      )
      await refresh()
      return result
    },
    [businessId, refresh]
  )

  return { members, isLoading, error, refresh, addMember, removeMember }
}
