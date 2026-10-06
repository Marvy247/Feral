'use client'

import { useState, useEffect, useCallback } from 'react'
import { authedRequest } from '@/lib/api'

export interface PayrollSchedule {
  id: string
  label: string
  total_amount_usdc: number
  recipients: { name: string; address: string; amountUsdc: number }[]
  status: string
  execute_at: string
  signed_tx_hex?: string | null
  execution_tx_hash?: string | null
}

export interface PayrollRecipient {
  name: string
  address: string
  amountUsdc: number | string
}

function normalize(row: any): PayrollSchedule {
  const recipients =
    typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients || []
  return {
    ...row,
    total_amount_usdc: Number(row.total_amount_usdc),
    recipients: recipients.map((r: any) => ({ ...r, amountUsdc: Number(r.amountUsdc) })),
  }
}

export function usePayroll(businessId: string) {
  const [schedules, setSchedules] = useState<PayrollSchedule[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!businessId) return
    try {
      const rows = await authedRequest<any[]>(`/api/payroll/${businessId}`)
      setSchedules((rows || []).map(normalize))
    } catch (err) {
      console.warn('[usePayroll]', err)
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const preparePayroll = async (
    recipients: PayrollRecipient[],
    executeAt: string
  ): Promise<{ scheduleId: string }> => {
    const cleaned = recipients
      .filter((r) => r.address && r.amountUsdc)
      .map((r) => ({
        name: r.name || 'Employee',
        address: r.address,
        amountUsdc: Number(r.amountUsdc),
      }))

    const { schedule } = await authedRequest<{ schedule: any }>(
      `/api/payroll/${businessId}/prepare`,
      {
        method: 'POST',
        body: JSON.stringify({
          label: 'Payroll run',
          recipients: cleaned,
          executeAt: executeAt || new Date().toISOString(),
        }),
      }
    )
    await refresh()
    return { scheduleId: schedule.id }
  }

  const executePayroll = async (
    scheduleId: string
  ): Promise<{ txHash: string; explorerUrl: string }> => {
    const result = await authedRequest<{ txHash: string; explorerUrl: string }>(
      `/api/payroll/${businessId}/${scheduleId}/execute`,
      { method: 'POST' }
    )
    await refresh()
    return result
  }

  return { schedules, isLoading, preparePayroll, executePayroll, refresh }
}
