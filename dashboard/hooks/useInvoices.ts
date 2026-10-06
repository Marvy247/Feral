'use client'

import { useState, useEffect, useCallback } from 'react'
import { authedRequest, ensureAuth } from '@/lib/api'

export interface Invoice {
  id: string
  invoice_number: string
  client_name: string
  amount_usdc: number
  virtual_address: string
  user_tag?: string
  status: 'pending' | 'paid' | 'overdue' | 'cancelled'
  due_date: string
  description: string | null
  payment_tx_hash?: string | null
  paid_at?: string | null
}

export interface UseInvoicesResult {
  data: Invoice[]
  isLoading: boolean
  error: string | null
  createInvoice: (clientName: string, amountUsdc: number, dueDate: string, description: string) => Promise<Invoice>
  refresh: () => Promise<void>
}

// PostgREST may return NUMERIC as string — normalize to number.
function normalize(row: any): Invoice {
  return { ...row, amount_usdc: Number(row.amount_usdc) }
}

export function useInvoices(businessId: string): UseInvoicesResult {
  const [data, setData] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!businessId) return
    try {
      const rows = await authedRequest<any[]>(`/api/invoices/${businessId}`)
      setData((rows || []).map(normalize))
      setError(null)
    } catch (err) {
      console.warn('[useInvoices]', err)
      setError(err instanceof Error ? err.message : 'Could not reach the FERAL backend')
    } finally {
      setIsLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createInvoice = async (
    clientName: string,
    amountUsdc: number,
    dueDate: string,
    description: string
  ): Promise<Invoice> => {
    const invoice = await authedRequest<any>(`/api/invoices/${businessId}`, {
      method: 'POST',
      body: JSON.stringify({ clientName, amountUsdc, dueDate, description }),
    })
    const normalized = normalize(invoice)
    setData((prev) => [normalized, ...prev])
    return normalized
  }

  return { data, isLoading, error, createInvoice, refresh }
}
