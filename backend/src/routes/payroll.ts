import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../db/client'
import { buildBatchPayrollTransaction } from '../services/payrollService'
import { sendTokenTransfer } from '../services/tempoService'
import { broadcastPolicyEvent } from '../websocket/policyRadar'

const router = Router()

// GET /api/payroll/:businessId
router.get('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const { data } = await db
      .from('payroll_schedules')
      .select('*')
      .eq('business_id', req.params.businessId)
      .order('created_at', { ascending: false })
    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/payroll/:businessId/prepare — build and return unsigned payroll tx
router.post('/:businessId/prepare', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { label, recipients, executeAt } = req.body
    // recipients: [{ address, amountUsdc, name }]

    const { data: business } = await db
      .from('businesses')
      .select('master_wallet_address')
      .eq('id', req.params.businessId)
      .single()

    if (!business) return res.status(404).json({ error: 'Business not found' })

    const totalAmount = recipients.reduce(
      (sum: number, r: { amountUsdc: number }) => sum + r.amountUsdc, 0
    )

    // Build the unsigned batch transaction
    const unsignedTx = await buildBatchPayrollTransaction({
      masterWalletAddress: business.master_wallet_address,
      recipients,
      executeAt: new Date(executeAt),
    })

    // Store as pending (no signed_tx_hex yet — owner must sign)
    const executeAtDate = new Date(executeAt)
    const validBefore = new Date(executeAtDate.getTime() + 3600 * 1000)

    const { data: schedule } = await db
      .from('payroll_schedules')
      .insert({
        business_id: req.params.businessId,
        label,
        total_amount_usdc: totalAmount,
        recipients, // JSONB column — supabase-js serializes the array directly
        execute_at: executeAtDate.toISOString(),
        valid_before: validBefore.toISOString(),
        status: 'pending',
      })
      .select()
      .single()

    res.json({ schedule, unsignedTx })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/payroll/:businessId/:scheduleId/sign — store signed transaction
router.post('/:businessId/:scheduleId/sign', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const { signedTxHex } = req.body
    await db
      .from('payroll_schedules')
      .update({ signed_tx_hex: signedTxHex })
      .eq('id', req.params.scheduleId)
      .eq('business_id', req.params.businessId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/payroll/:businessId/:scheduleId/execute — run a prepared payroll.
// Pays every recipient from the treasury and marks the schedule executed.
router.post('/:businessId/:scheduleId/execute', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { data: schedule } = await db
      .from('payroll_schedules')
      .select('*')
      .eq('id', req.params.scheduleId)
      .eq('business_id', req.params.businessId)
      .single()

    if (!schedule) return res.status(404).json({ error: 'Schedule not found' })
    if (schedule.status !== 'pending') {
      return res.status(400).json({ error: `Schedule already ${schedule.status}` })
    }

    const recipients =
      typeof schedule.recipients === 'string'
        ? JSON.parse(schedule.recipients)
        : schedule.recipients
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients' })
    }

    const results: { txHash: string; explorerUrl: string }[] = []
    for (const recipient of recipients) {
      results.push(
        await sendTokenTransfer(recipient.address as `0x${string}`, Number(recipient.amountUsdc))
      )
    }
    const last = results[results.length - 1]

    await db
      .from('payroll_schedules')
      .update({
        status: 'executed',
        execution_tx_hash: last.txHash,
        executed_at: new Date().toISOString(),
      })
      .eq('id', req.params.scheduleId)

    const { data: policyEvent } = await db
      .from('policy_events')
      .insert({
        business_id: req.params.businessId,
        member_name: 'Payroll',
        member_type: 'human',
        event_type: 'PAYROLL_EXECUTED',
        amount_usdc: schedule.total_amount_usdc,
        vendor_name: `${recipients.length} employees — ${schedule.label}`,
        tempo_tx_hash: last.txHash,
        tempo_explorer_url: last.explorerUrl,
      })
      .select()
      .single()
    if (policyEvent) broadcastPolicyEvent(req.params.businessId, policyEvent)

    res.json({
      status: 'executed',
      txHash: last.txHash,
      explorerUrl: last.explorerUrl,
      paidRecipients: results.length,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router