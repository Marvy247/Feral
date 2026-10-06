import 'dotenv/config'
import { db } from '../src/db/client'
import { syncMemberPolicy } from '../src/services/policyEngineService'

/**
 * Backfill: push every ACTIVE team member (limit, active flag, approved
 * vendors) from the dashboard DB onto the FeralPolicyEngine contract.
 *
 * Run after deploying the engine, or whenever the DB was mutated while the
 * backend was down:
 *   npx tsx scripts/sync_engine.ts
 */

async function main() {
  const { data: businesses, error: be } = await db
    .from('businesses')
    .select('id, owner_email, name')
  if (be) throw be

  for (const biz of businesses ?? []) {
    const { data: members, error: me } = await db
      .from('team_members')
      .select('id, name, wallet_address, weekly_limit_usdc, is_active')
      .eq('business_id', biz.id)
    if (me) throw me

    for (const m of members ?? []) {
      const { data: vendors, error: ve } = await db
        .from('approved_vendors')
        .select('vendor_address')
        .eq('team_member_id', m.id)
        .eq('is_active', true)
      if (ve) throw ve

      const res = await syncMemberPolicy({
        businessId: biz.id,
        memberAddress: m.wallet_address,
        weeklyLimitUsdc: Number(m.weekly_limit_usdc),
        active: m.is_active,
        approvedVendors: (vendors ?? []).map((v) => v.vendor_address),
      })
      console.log(
        `synced ${biz.owner_email} / ${m.name} (${m.wallet_address.slice(0, 10)}…) ` +
          `limit=$${m.weekly_limit_usdc} vendors=${(vendors ?? []).length} → ${res.txHash}`
      )
    }
  }
  console.log('SYNC_COMPLETE')
}

main().catch((err) => {
  console.error('SYNC_FAILED:', err.message || err)
  process.exit(1)
})
