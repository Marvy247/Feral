'use client'

import { useState, useEffect } from 'react'
import { useInvoices, Invoice } from '@/hooks/useInvoices'
import { CreateInvoiceModal } from './CreateInvoiceModal'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const EXPLORER = 'https://explore.testnet.tempo.xyz/tx'

export function InvoiceList({ businessId }: { businessId: string }) {
  const { data: invoices, isLoading, error, refresh } = useInvoices(businessId)
  const [creating, setCreating] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const pendingCount = (invoices || []).filter((i) => i.status === 'pending').length

  // Live reconciliation: while invoices await payment, poll so the indexer's
  // "paid" flip shows up without a manual refresh.
  useEffect(() => {
    if (!pendingCount) return
    const t = setInterval(() => {
      void refresh()
    }, 10_000)
    return () => clearInterval(t)
  }, [pendingCount, refresh])

  const copyAddress = async (invoice: Invoice) => {
    const text = invoice.virtual_address
    let copied = false
    try {
      await navigator.clipboard.writeText(text)
      copied = true
    } catch {
      // Non-secure origins: fall back to the legacy copy path
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        copied = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        copied = false
      }
    }
    if (copied) {
      setCopiedId(invoice.id)
      setTimeout(() => setCopiedId((c) => (c === invoice.id ? null : c)), 2000)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium">Invoices</h3>
        <Button onClick={() => setCreating(true)} className="text-sm">
          Create Invoice
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading invoices…</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800 font-medium">Couldn&apos;t load invoices</p>
            <p className="text-xs text-amber-700 mt-0.5">{error}</p>
            <button
              onClick={() => void refresh()}
              className="mt-2 text-xs font-medium text-amber-800 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center">
            <p className="text-sm text-slate-500">No invoices yet.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Create your first invoice — each one gets a unique Tempo virtual
              address, and an incoming payment reconciles it automatically.
            </p>
            <Button
              onClick={() => setCreating(true)}
              variant="outline"
              className="mt-3 text-sm"
            >
              Create your first invoice
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                className="rounded-lg border p-4 transition-colors hover:border-sky-200"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{invoice.invoice_number}</p>
                    <p className="text-xs text-slate-400">{invoice.client_name}</p>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold ${
                      invoice.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : invoice.status === 'pending'
                          ? 'bg-sky-100 text-sky-800'
                          : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {invoice.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  ${invoice.amount_usdc.toFixed(2)} • Due: {invoice.due_date}
                </p>

                {invoice.status === 'pending' && (
                  <p className="mt-2 text-xs text-sky-600 animate-pulse">
                    ⏳ Waiting for payment — watching the chain…
                  </p>
                )}
                {invoice.status === 'paid' && invoice.payment_tx_hash && (
                  <a
                    href={`${EXPLORER}/${invoice.payment_tx_hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-green-700 underline underline-offset-2"
                  >
                    Paid ✓ · view settlement tx
                  </a>
                )}

                {invoice.virtual_address && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-sky-500 font-mono capitalize">
                      {invoice.virtual_address.slice(0, 10)}...
                      {invoice.virtual_address.slice(-6)}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyAddress(invoice)}
                      className="ml-auto underline underline-offset-1 text-sky-500 hover:text-sky-700 cursor-pointer text-xs"
                    >
                      {copiedId === invoice.id ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {creating && (
          <CreateInvoiceModal
            businessId={businessId}
            onClose={() => setCreating(false)}
            onCreated={() => void refresh()}
          />
        )}
      </CardContent>
    </Card>
  )
}
