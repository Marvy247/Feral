import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../db/client'
import { provisionAccessKey } from '../services/accessKeyService'
import { syncMemberPolicy, deactivateMember, engineSpent } from '../services/policyEngineService'
import { broadcastPolicyEvent } from '../websocket/policyRadar'

const router = Router()

// GET /api/team/:businessId — list all team members
router.get('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    
    const { data: members } = await db
      .from('team_members')
      .select(`
        *,
        approved_vendors (*)
      `)
      .eq('business_id', req.params.businessId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })

    // On-chain weekly spend per member, for the limit progress bars.
    // Best-effort: bounded by a timeout so the list never waits on RPC —
    // a failed call degrades to `spent_this_week_usdc: null` (bar hidden).
    const businessId = String(req.params.businessId)
    const withSpend = await Promise.all(
      (members || []).map(async (m) => {
        try {
          const spent = await Promise.race([
            engineSpent(businessId, String(m.wallet_address)),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('engine view timeout')), 2500)
            ),
          ])
          return { ...m, spent_this_week_usdc: Number(spent) / 1e6 }
        } catch {
          return { ...m, spent_this_week_usdc: null }
        }
      })
    )

    res.json(withSpend)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/team/:businessId — add a team member or agent
router.post('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { name, type, email, weeklyLimitUsdc, approvedVendors, walletAddress } = req.body
    // walletAddress: for humans, this is their Tempo wallet address
    //                for agents, this is derived from their secp256k1 public key
    // approvedVendors: [{ name, address }]
    
    if (!name || !type || !walletAddress) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Get business master wallet
    const { data: business } = await db
      .from('businesses')
      .select('master_wallet_address')
      .eq('id', req.params.businessId)
      .single()
    
    if (!business) return res.status(404).json({ error: 'Business not found' })

    // Provision access key on Tempo
    const { accessKeyId, txHash } = await provisionAccessKey({
      businessId: req.params.businessId,
      masterWalletAddress: business.master_wallet_address,
      memberWalletAddress: walletAddress,
      weeklyLimitUsdc: weeklyLimitUsdc || 500,
      approvedVendorAddresses: (approvedVendors || []).map((v: {address: string}) => v.address),
    })

    // Save to DB
    const { data: member, error: memberErr } = await db
      .from('team_members')
      .insert({
        business_id: req.params.businessId,
        name,
        type,
        email: email || null,
        wallet_address: walletAddress.toLowerCase(),
        access_key_id: accessKeyId,
        weekly_limit_usdc: weeklyLimitUsdc || 500,
        provision_tx_hash: txHash,
      })
      .select()
      .single()
    if (memberErr) throw new Error(`Failed to save member: ${memberErr.message}`)

    // Save approved vendors
    if (approvedVendors?.length && member) {
      await db.from('approved_vendors').insert(
        approvedVendors.map((v: {name: string; address: string}) => ({
          team_member_id: member.id,
          business_id: req.params.businessId,
          vendor_name: v.name,
          vendor_address: v.address.toLowerCase(),
        }))
      )
    }

    // Protocol enforcement: push the member's policy (weekly limit, active
    // flag, approved vendors) to the on-chain FeralPolicyEngine. The chain is
    // the authority checked inside engine.pay() at payment time.
    const engine = await syncMemberPolicy({
      businessId: req.params.businessId,
      memberAddress: walletAddress,
      weeklyLimitUsdc: Number(weeklyLimitUsdc || 500),
      active: true,
      approvedVendors: (approvedVendors || []).map((v: { address: string }) => v.address),
    })

    res.json({ member, txHash, engineTxHash: engine.txHash, engineExplorerUrl: engine.explorerUrl })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// DELETE /api/team/:businessId/:memberId — revoke access key
router.delete('/:businessId/:memberId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { data: member } = await db
      .from('team_members')
      .select('*')
      .eq('id', req.params.memberId)
      .eq('business_id', req.params.businessId)
      .single()

    if (!member) return res.status(404).json({ error: 'Member not found' })

    // Kill switch: flip the member's policy on-chain FIRST — from this point
    // on, every engine.pay() for this member reverts with MemberInactive().
    // If the chain rejects the revoke, we do NOT touch the DB (chain = truth).
    let engineTxHash: string | null = null
    try {
      const engine = await deactivateMember({
        businessId: req.params.businessId,
        memberAddress: String(member.wallet_address),
        weeklyLimitUsdc: Number(member.weekly_limit_usdc),
      })
      engineTxHash = engine.txHash
    } catch (err) {
      return res.status(502).json({ error: `On-chain revoke failed: ${(err as Error).message}` })
    }

    // Mark as inactive in DB (read model) after the chain confirms
    await db
      .from('team_members')
      .update({ is_active: false })
      .eq('id', req.params.memberId)

    res.json({ success: true, engineTxHash })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router