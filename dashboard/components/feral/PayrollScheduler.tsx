'use client'

import { useState } from 'react'
import { usePayroll } from '@/hooks/usePayroll'
import { useTempoWallet } from '@/hooks/useTempoWallet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { useToast } from '@/hooks/use-toast'

export function PayrollScheduler({ businessId }: { businessId: string }) {
  const [form, setForm] = useState({
    label: '',
    recipients: [
      { name: '', address: '', amountUsdc: '' },
    ],
    executeAt: '',
  })
  const [preparedId, setPreparedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { schedules, preparePayroll, executePayroll } = usePayroll(businessId)
  const { toast } = useToast()

  const handlePrepare = async () => {
    const valid = form.recipients.filter((r) => r.address && r.amountUsdc)
    if (valid.length === 0) {
      toast({
        title: 'Nothing to pay',
        description: 'Add at least one employee with an address and amount',
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      const { scheduleId } = await preparePayroll(valid, form.executeAt)
      setPreparedId(scheduleId)
      toast({
        title: 'Payroll Prepared',
        description: `Batch transaction ready for ${valid.length} employee${valid.length > 1 ? 's' : ''}`,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to prepare payroll',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleExecute = async () => {
    if (!preparedId) return
    setBusy(true)
    try {
      const result = await executePayroll(preparedId)
      setPreparedId(null)
      toast({
        title: 'Payroll Executed',
        description: `All employees paid — ${result.explorerUrl}`,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Payroll execution failed',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium">Payroll Scheduler</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        <form>
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="Payroll label"
            />
            <Input
              type="date"
              value={form.executeAt}
              onChange={(e) => setForm({ ...form, executeAt: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Employees</label>
            {form.recipients.map((rec, i) => (
              <div key={i} className="grid grid-cols-3 gap-3">
                <Input
                  value={rec.name}
                  onChange={(e) => {
                    const newRecipients = [...form.recipients]
                    newRecipients[i] = { ...rec, name: e.target.value }
                    setForm({ ...form, recipients: newRecipients })
                  }}
                  placeholder="Name"
                />
                <Input
                  value={rec.address}
                  onChange={(e) => {
                    const newRecipients = [...form.recipients]
                    newRecipients[i] = { ...rec, address: e.target.value }
                    setForm({ ...form, recipients: newRecipients })
                  }}
                  placeholder="Address"
                />                  <Input
                    type="number"
                    value={rec.amountUsdc}
                    onChange={(e) => {
                      const newRecipients = [...form.recipients]
                      newRecipients[i] = { ...rec, amountUsdc: e.target.value }
                      setForm({ ...form, recipients: newRecipients })
                    }}
                    min="1"
                    step="1"
                    placeholder="Amount (PathUSD)"
                  />
              </div>
            ))}
          </div>

          <Button
            type="button"
            onClick={handlePrepare}
            disabled={busy}
            className="w-full bg-sky-600 hover:bg-sky-700"
          >
            {busy ? 'Working…' : 'Prepare Batch Transaction'}
          </Button>
        </form>

        {preparedId && (
          <div>
            <p className="text-sm text-slate-500">
              Batch ready. Executing will pay every recipient from the treasury.
            </p>
            <Button
              type="button"
              onClick={handleExecute}
              disabled={busy}
              className="mt-2 w-full bg-green-600 hover:bg-green-700"
            >
              {busy ? 'Executing…' : 'Execute Payroll'}
            </Button>
          </div>
        )}

        {schedules.length > 0 ? (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">History</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {schedules.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-slate-50"
                >
                  <span className="text-slate-600 truncate">
                    {s.label} · ${Number(s.total_amount_usdc).toFixed(2)}
                  </span>
                  <span
                    className={
                      s.status === 'executed'
                        ? 'text-emerald-600 font-medium shrink-0 ml-2'
                        : 'text-sky-600 font-medium shrink-0 ml-2'
                    }
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="pt-2 border-t border-slate-100 text-xs text-slate-400">
            No payroll runs yet — prepare a batch above and it will show up here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
