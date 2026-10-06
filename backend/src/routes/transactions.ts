import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../db/client'
import { submitTransaction, sendContractCall } from '../services/tempoService'
import { enginePay, engineSpent, engineCheck } from '../services/policyEngineService'
import { broadcastPolicyEvent } from '../websocket/policyRadar'

const router = Router()

// Idempotency for the pay flow: a double-click or network retry with the same
// client-generated key must not fire a second on-chain transfer. Definitive
// verdicts (approved/blocked) are replayed; infrastructure errors are NOT
// stored so the user can retry with a fresh key.
const payIdempotency = new Map<string, { expires: number; body: Record<string, unknown> }>()
const IDEMPOTENCY_TTL_MS = 15 * 60 * 1000

function rememberPay(key: string, body: Record<string, unknown>) {
  if (payIdempotency.size > 500) {
    const now = Date.now()
    for (const [k, v] of payIdempotency) if (v.expires <= now) payIdempotency.delete(k)
  }
  payIdempotency.set(key, { expires: Date.now() + IDEMPOTENCY_TTL_MS, body })
}

/**
 * Turn an on-chain FeralPolicyEngine revert into the human-readable reason
 * shown in Policy Radar. The reason string still leads with the custom error
 * name so existing UI parsing keeps working — the detail underneath is
 * annotated with chain-true numbers.
 */
async function annotateChainRevert(
  reason: string | null,
  ctx: { businessId: string; memberAddress: string; limitUsdc: number; amountUsdc: number }
): Promise<string> {
  if (reason === 'CallNotAllowed') {
    return 'CallNotAllowed — Vendor not in approved list (rejected on-chain by FeralPolicyEngine)'
  }
  if (reason === 'MemberInactive') {
    return 'MemberInactive — Member access revoked on-chain'
  }
  if (reason === 'SpendingLimitExceeded') {
    try {
      const spent = Number(await engineSpent(ctx.businessId, ctx.memberAddress)) / 1e6
      const over = spent + ctx.amountUsdc - ctx.limitUsdc
      return `SpendingLimitExceeded — Weekly limit $${ctx.limitUsdc.toFixed(2)} exceeded by $${over.toFixed(2)} (rejected on-chain by FeralPolicyEngine)`
    } catch {
      return 'SpendingLimitExceeded — Weekly limit reached (rejected on-chain by FeralPolicyEngine)'
    }
  }
  if (reason && reason !== 'Reverted') {
    return `${reason} — rejected on-chain by FeralPolicyEngine`
  }
  return 'Rejected on-chain by FeralPolicyEngine'
}

// GET /api/transactions/:businessId — recent transactions + policy events
router.get('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { data } = await db
      .from('policy_events')
      .select('*')
      .eq('business_id', req.params.businessId)
      .order('created_at', { ascending: false })
      .limit(50)

    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/transactions/:businessId/submit — submit a transaction from an employee
router.post('/:businessId/submit', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { signedTxHex, memberId, vendorAddress, amountUsdc, vendorName } = req.body

    // Attempt to submit to Tempo
    let txHash: string | null = null
    let status: 'approved' | 'blocked' = 'approved'
    let rejectionReason: string | null = null

    try {
      txHash = await submitTransaction(signedTxHex)
    } catch (err) {
      status = 'blocked'
      // Parse Tempo SDK error for reason
      const errMsg = (err as Error).message
      if (errMsg.includes('CallNotAllowed')) {
        rejectionReason = 'CallNotAllowed — Vendor not in approved list'
      } else if (errMsg.includes('SpendingLimitExceeded')) {
        rejectionReason = 'SpendingLimitExceeded — Weekly limit reached'
      } else {
        rejectionReason = errMsg.slice(0, 100)
      }
    }

    // Get member name
    const { data: member } = await db
      .from('team_members')
      .select('name, type')
      .eq('id', memberId)
      .single()

    const explorerUrl = txHash
      ? `${process.env.TEMPO_EXPLORER_URL}/tx/${txHash}`
      : null

    // Write transaction record
    await db.from('transactions').insert({
      business_id: req.params.businessId,
      team_member_id: memberId,
      direction: 'outbound',
      status,
      amount_usdc: amountUsdc,
      token_address: process.env.USDC_ADDRESS!,
      from_address: req.walletAddress!,
      to_address: vendorAddress,
      vendor_name: vendorName,
      tempo_tx_hash: txHash,
      rejection_reason: rejectionReason,
    })

    // Write policy event
    const { data: policyEvent } = await db
      .from('policy_events')
      .insert({
        business_id: req.params.businessId,
        team_member_id: memberId,
        member_name: member?.name || 'Unknown',
        member_type: member?.type || 'human',
        event_type: status === 'approved' ? 'APPROVED' : 'BLOCKED',
        amount_usdc: amountUsdc,
        vendor_name: vendorName,
        to_address: vendorAddress,
        rejection_reason: rejectionReason,
        tempo_tx_hash: txHash,
        tempo_explorer_url: explorerUrl,
      })
      .select()
      .single()

    // Broadcast to all connected Policy Radar WebSocket clients for this business
    if (policyEvent) {
      broadcastPolicyEvent(req.params.businessId, policyEvent)
    }

    res.json({ status, txHash, rejectionReason })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/transactions/:businessId/pay/check — pre-flight verdict.
// Read-only eth_call against FeralPolicyEngine: tells the UI what the chain
// WOULD do before anything is broadcast (the pay attempt itself still goes
// on-chain so the revert is recorded as evidence).
router.post('/:businessId/pay/check', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    const { memberId, vendorAddress, amountUsdc } = req.body
    if (!memberId || !vendorAddress || !amountUsdc) {
      return res.status(400).json({ error: 'memberId, vendorAddress and amountUsdc are required' })
    }

    const { data: member } = await db
      .from('team_members')
      .select('wallet_address, weekly_limit_usdc')
      .eq('id', memberId)
      .eq('business_id', req.params.businessId)
      .single()
    if (!member) return res.status(404).json({ error: 'Member not found' })

    const verdict = await engineCheck({
      businessId: req.params.businessId,
      memberAddress: String(member.wallet_address),
      vendorAddress: String(vendorAddress).toLowerCase(),
      amountUsdc: Number(amountUsdc),
    })

    res.json({
      allowed: verdict.allowed,
      reason: verdict.reason, // 'OK' | 'CallNotAllowed' | 'SpendingLimitExceeded' | 'MemberInactive'
      spentUsdc: Number(verdict.spentBase) / 1e6,
      limitUsdc: Number(member.weekly_limit_usdc),
    })
  } catch (err) {
    res.status(502).json({ error: (err as Error).message })
  }
})

// POST /api/transactions/:businessId/pay — "Pay Vendor" demo flow.
// Executes a policy-checked payment through the FeralPolicyEngine contract:
// allowed → real sponsored transfer (APPROVED with a genuine Tempo tx hash),
// violated → the transaction itself reverts on-chain and the BLOCKED event
// carries the revert reason + the reverted tx hash.
router.post('/:businessId/pay', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { memberId, vendorAddress, amountUsdc, vendorName } = req.body
    if (!memberId || !vendorAddress || !amountUsdc) {
      return res.status(400).json({ error: 'memberId, vendorAddress and amountUsdc are required' })
    }

    // Replay a completed attempt instead of firing a second on-chain transfer.
    const idemKey =
      typeof req.body.idempotencyKey === 'string' && req.body.idempotencyKey.length > 0 &&
      req.body.idempotencyKey.length <= 64
        ? `${req.params.businessId}:${req.body.idempotencyKey}`
        : null
    if (idemKey) {
      const hit = payIdempotency.get(idemKey)
      if (hit && hit.expires > Date.now()) return res.json(hit.body)
      if (hit) payIdempotency.delete(idemKey)
    }

    const { data: member } = await db
      .from('team_members')
      .select('*')
      .eq('id', memberId)
      .eq('business_id', req.params.businessId)
      .single()
    if (!member) return res.status(404).json({ error: 'Member not found' })

    const target = String(vendorAddress).toLowerCase()

    // ── Protocol-enforced policy ──────────────────────────────────────────
    // FeralPolicyEngine sits in the payment path: allowed → funds move
    // treasury → vendor; violated → THIS transaction reverts on-chain with
    // CallNotAllowed / SpendingLimitExceeded / MemberInactive. We record the
    // revert + tx hash, so a BLOCKED event is the chain's verdict — not the
    // backend refusing to sign.
    let txHash: string | null = null
    let explorerUrl: string | null = null
    let rejectionReason: string | null = null
    let chainVerdict: 'approved' | 'blocked' = 'approved'

    try {
      const result = await enginePay({
        businessId: req.params.businessId,
        memberAddress: String(member.wallet_address),
        vendorAddress: target,
        amountUsdc: Number(amountUsdc),
      })
      txHash = result.txHash
      explorerUrl = result.explorerUrl

      if (result.status === 'reverted') {
        chainVerdict = 'blocked'
        rejectionReason = await annotateChainRevert(result.revertReason, {
          businessId: req.params.businessId,
          memberAddress: String(member.wallet_address),
          limitUsdc: Number(member.weekly_limit_usdc),
          amountUsdc: Number(amountUsdc),
        })
      }
    } catch (err) {
      chainVerdict = 'blocked'
      rejectionReason = `ChainError — ${(err as Error).message.slice(0, 90)}`
    }

    const status = chainVerdict

    await db.from('transactions').insert({
      business_id: req.params.businessId,
      team_member_id: memberId,
      direction: 'outbound',
      status,
      amount_usdc: amountUsdc,
      token_address: process.env.USDC_ADDRESS!,
      from_address: member.wallet_address,
      to_address: target,
      vendor_name: vendorName || null,
      tempo_tx_hash: txHash,
      rejection_reason: rejectionReason,
    })

    const { data: policyEvent } = await db
      .from('policy_events')
      .insert({
        business_id: req.params.businessId,
        team_member_id: memberId,
        member_name: member.name,
        member_type: member.type,
        event_type: status === 'approved' ? 'APPROVED' : 'BLOCKED',
        amount_usdc: amountUsdc,
        vendor_name: vendorName || null,
        to_address: target,
        rejection_reason: rejectionReason,
        tempo_tx_hash: txHash,
        tempo_explorer_url: explorerUrl,
      })
      .select()
      .single()

    if (policyEvent) {
      broadcastPolicyEvent(req.params.businessId, policyEvent)
    }

    const responseBody = { status, txHash, explorerUrl, rejectionReason }
    if (idemKey && !String(rejectionReason || '').startsWith('ChainError')) {
      rememberPay(idemKey, responseBody)
    }
    res.json(responseBody)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/transactions/:businessId/submit-owner — owner-submitted payload.
// The frontend sends { txPayload: { calls: [{ to, value, input }] } }; the
// treasury key signs and broadcasts it, returning real tx hash(es).
router.post('/:businessId/submit-owner', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const calls = req.body?.txPayload?.calls
    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({ error: 'txPayload.calls is required' })
    }

    const results: { txHash: string; explorerUrl: string }[] = []
    try {
      for (const call of calls) {
        results.push(
          await sendContractCall({
            to: call.to as `0x${string}`,
            data: (call.input || '0x') as `0x${string}`,
            value: BigInt(call.value || 0),
          })
        )
      }
    } catch (err) {
      const { data: policyEvent } = await db
        .from('policy_events')
        .insert({
          business_id: req.params.businessId,
          member_name: 'Owner',
          member_type: 'human',
          event_type: 'BLOCKED',
          amount_usdc: 0,
          vendor_name: 'Contract call',
          rejection_reason: `ChainError — ${(err as Error).message.slice(0, 90)}`,
        })
        .select()
        .single()
      if (policyEvent) broadcastPolicyEvent(req.params.businessId, policyEvent)
      return res.status(502).json({ error: (err as Error).message })
    }

    const last = results[results.length - 1]
    const { data: policyEvent } = await db
      .from('policy_events')
      .insert({
        business_id: req.params.businessId,
        member_name: 'Owner',
        member_type: 'human',
        event_type: 'APPROVED',
        amount_usdc: Number(req.body.amountUsdc || 0),
        vendor_name: req.body.vendorName || 'Contract call',
        tempo_tx_hash: last.txHash,
        tempo_explorer_url: last.explorerUrl,
      })
      .select()
      .single()
    if (policyEvent) broadcastPolicyEvent(req.params.businessId, policyEvent)

    res.json({ txHash: last.txHash, explorerUrl: last.explorerUrl, txHashes: results.map((r) => r.txHash) })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router