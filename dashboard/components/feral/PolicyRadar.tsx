'use client'

import { usePolicyRadar } from '@/hooks/usePolicyRadar'
import { useState, useEffect } from 'react'
import { PolicyEvent } from '@/hooks/usePolicyRadar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Toaster } from '@/components/ui/toaster'
import { tempoExplorerTxUrl } from '@/lib/tempo'

export function PolicyRadar({ businessId }: { businessId: string }) {
  const { events, isConnected } = usePolicyRadar(businessId)
  const [newEvent, setNewEvent] = useState<PolicyEvent | null>(null)

  // Handle new policy event from invoice paid
  useEffect(() => {
    const handleInvoicePaid = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail.eventType === 'INVOICE_PAID') {
        setNewEvent({
          id: crypto.randomUUID(),
          businessId,
          memberId: null,
          memberName: 'Client Payment',
          memberType: 'human',
          eventType: 'INVOICE_PAID',
          amountUsdc: detail.invoice.amount_usdc,
          vendorName: detail.invoice.client_name,
          toAddress: null,
          rejectionReason: null,
          tempoTxHash: detail.txHash,
          tempoExplorerUrl: detail.txHash
            ? tempoExplorerTxUrl(detail.txHash)
            : null,
          createdAt: new Date().toISOString(),
        })
      }
    }
    window.addEventListener('feral:invoice_paid', handleInvoicePaid)
    return () => window.removeEventListener('feral:invoice_paid', handleInvoicePaid)
  }, [businessId])

  return (
    <Card className="w-full">
      <CardHeader>
        <h3 className="font-medium">Policy Radar</h3>
        <p className="text-sm text-slate-500">Real-time transaction monitoring</p>
      </CardHeader>
      <CardContent className="h-64 overflow-y-auto space-y-2">
        {isConnected ? (
          <>
            {events.slice(0, 20).map((event) => (
              <TransactionItem key={event.id} {...event} />
            ))}
            {newEvent && <TransactionItem key={`new-${newEvent.id}`} {...newEvent} />}
            {events.length === 0 && !isConnected ? (
              <p className="text-sm text-slate-400">No events yet. Start a transaction to see activity.</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-400">Waiting for WebSocket connection...</p>
        )}
      </CardContent>
    </Card>
  )
}

function TransactionItem({
  id, eventType, memberName, memberType, amountUsdc, vendorName, toAddress, rejectionReason, tempoTxHash, tempoExplorerUrl }: PolicyEvent) {
  const isApproved = eventType === 'APPROVED'
  const isBlocked = eventType === 'BLOCKED'
  const isInvoicePaid = eventType === 'INVOICE_PAID'
  const isPayrollExecuted = eventType === 'PAYROLL_EXECUTED'

  const statusColor = isApproved
    ? 'bg-sky-100 text-sky-800'
    : isBlocked
      ? 'bg-red-100 text-red-800'
      : isInvoicePaid
        ? 'bg-green-100 text-green-800'
        : isPayrollExecuted
          ? 'bg-purple-100 text-purple-800'
          : 'bg-slate-100 text-slate-800'

  const statusText = isApproved
    ? 'APPROVED'
    : isBlocked
      ? 'BLOCKED'
      : isInvoicePaid
        ? 'INVOICE PAID'
        : isPayrollExecuted
          ? 'PAYROLL EXECUTED'
          : 'PENDING'

  const reason = rejectionReason || '-'

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md transition-colors hover:bg-slate-50">
      <div className="w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 {statusColor}">
        {statusText.slice(0, 3)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{memberName}</p>
        <p className="text-xs text-slate-400">{eventType}</p>
      </div>
      <div className="w-24 text-right text-xs text-slate-400">
        {amountUsdc ? `$${amountUsdc.toFixed(2)}` : '-'}
      </div>
      {isBlocked && (
        <span className="ml-2 text-xs text-red-500">{reason}</span>
      )}
      {isApproved && tempoTxHash && (
        <a
          href={tempoExplorerUrl ?? "/"}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 text-xs text-sky-600 underline underline-offset-2"
        >
          Explorer
        </a>
      )}
    </div>
  )
}
