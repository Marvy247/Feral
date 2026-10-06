'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { authedRequest } from '@/lib/api'

export interface PolicyEvent {
  id: string
  businessId: string
  memberId: string | null
  memberName: string
  memberType: 'human' | 'agent'
  eventType: 'APPROVED' | 'BLOCKED' | 'INVOICE_PAID' | 'PAYROLL_EXECUTED'
  amountUsdc: number
  vendorName: string | null
  toAddress: string | null
  rejectionReason: string | null
  tempoTxHash: string | null
  tempoExplorerUrl: string | null
  createdAt: string
}

// Map a policy_events DB row to the UI event shape
function rowToEvent(r: any): PolicyEvent {
  return {
    id: r.id,
    businessId: r.business_id,
    memberId: r.team_member_id ?? null,
    memberName: r.member_name,
    memberType: r.member_type,
    eventType: r.event_type,
    amountUsdc: Number(r.amount_usdc),
    vendorName: r.vendor_name ?? null,
    toAddress: r.to_address ?? null,
    rejectionReason: r.rejection_reason ?? null,
    tempoTxHash: r.tempo_tx_hash ?? null,
    tempoExplorerUrl: r.tempo_explorer_url ?? null,
    createdAt: r.created_at,
  }
}

export function usePolicyRadar(businessId: string | null) {
  const [events, setEvents] = useState<PolicyEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const connect = useCallback(() => {
    if (!businessId) return

    // Guard: if backend URL is not configured, skip WebSocket silently
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
    if (!backendUrl) {
      console.warn('[PolicyRadar] NEXT_PUBLIC_BACKEND_URL is not set — WebSocket disabled')
      return
    }

    const WS_URL = backendUrl.replace(/^https?/, 'ws')
    const ws = new WebSocket(`${WS_URL}/ws/policy-radar`)

    ws.onopen = () => {
      setIsConnected(true)
      ws.send(JSON.stringify({ type: 'subscribe', businessId }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'policy_event') {
          const incoming = msg.data as PolicyEvent
          setEvents((prev) =>
            prev.some((e) => e.id === incoming.id)
              ? prev
              : [incoming, ...prev].slice(0, 100)
          )
        }

        if (msg.type === 'invoice_paid') {
          window.dispatchEvent(new CustomEvent('feral:invoice_paid', { detail: msg.data }))
          setEvents(prev => [{
            id: crypto.randomUUID(),
            businessId,
            memberId: null,
            memberName: 'Client Payment',
            memberType: 'human',
            eventType: 'INVOICE_PAID',
            amountUsdc: msg.data.invoice.amount_usdc,
            vendorName: msg.data.invoice.client_name,
            toAddress: null,
            rejectionReason: null,
            tempoTxHash: msg.data.txHash,
            tempoExplorerUrl: msg.data.txHash
              ? `${process.env.NEXT_PUBLIC_TEMPO_EXPLORER_URL}/tx/${msg.data.txHash}`
              : null,
            createdAt: new Date().toISOString(),
          } as PolicyEvent, ...prev].slice(0, 100))
        }
      } catch {}
    }

    ws.onclose = () => {
      setIsConnected(false)
      setTimeout(connect, 3000)
    }

    ws.onerror = () => ws.close()

    wsRef.current = ws
  }, [businessId])

  // Load existing history so the radar isn't empty on first open
  useEffect(() => {
    if (!businessId || businessId.startsWith('demo')) return
    authedRequest<any[]>(`/api/transactions/${businessId}`)
      .then((rows) => setEvents((rows || []).map(rowToEvent)))
      .catch((err) => console.warn('[PolicyRadar history]', err))
  }, [businessId])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])

  return { events, isConnected }
}
