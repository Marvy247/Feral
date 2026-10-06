'use client'

import { useState } from 'react'
import { useInvoices } from '@/hooks/useInvoices'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

/**
 * Create a self-reconciling invoice: the backend mints a unique Tempo
 * virtual address (TIP-20) for it, so an incoming payment marks the
 * invoice paid with no manual matching.
 */
export function CreateInvoiceModal({
  businessId,
  onClose,
  onCreated,
}: {
  businessId: string
  onClose: () => void
  onCreated?: () => void
}) {
  const [form, setForm] = useState({
    clientName: '',
    amountUsdc: '',
    dueDate: '',
    description: '',
  })
  const [busy, setBusy] = useState(false)
  const { createInvoice } = useInvoices(businessId)
  const { toast } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.clientName.trim() || !Number(form.amountUsdc) || !form.dueDate) {
      toast({
        title: 'Missing details',
        description: 'Client, amount and due date are required.',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      const result = await createInvoice(
        form.clientName.trim(),
        Number(form.amountUsdc),
        form.dueDate,
        form.description.trim() || ''
      )
      toast({
        title: 'Invoice created',
        description: `${result.invoice_number} · virtual address minted — reconciliation is automatic when it's paid.`,
      })
      onCreated?.()
      onClose()
    } catch (err) {
      toast({
        title: 'Could not create invoice',
        description: err instanceof Error ? err.message : 'Failed to create invoice',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-white/90 backdrop-blur-xl rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-medium mb-1">Create Invoice</h3>
        <p className="text-xs text-slate-500 mb-4">
          A unique Tempo virtual address is minted for this invoice — when the
          client pays it, the invoice marks itself paid.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Client name
            </label>
            <Input
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              placeholder="Acme Corp"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount (PathUSD)
              </label>
              <Input
                type="number"
                min="1"
                step="1"
                value={form.amountUsdc}
                onChange={(e) => setForm({ ...form, amountUsdc: e.target.value })}
                placeholder="1250"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Due date
              </label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Q4 retainer"
            />
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-sky-600 hover:bg-sky-700"
          >
            {busy ? 'Creating…' : 'Create invoice'}
          </Button>
        </form>

        <button
          onClick={onClose}
          className="mt-4 w-full text-sm text-slate-500 hover:text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
