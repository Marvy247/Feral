import 'dotenv/config'
import { db } from '../src/db/client'
import { syncMemberPolicy } from '../src/services/policyEngineService'

/**
 * Clean demo seed for the FERAL dashboard.
 *
 * 1. Deactivates leftover test rows (duplicate "E2E Tester" runs, test agents)
 *    so the Team tab shows a believable roster.
 * 2. Inserts the roster (humans + one AI agent) with approved vendors, in a
 *    deterministic order — roster #1 is the first card the demo/e2e pays from,
 *    so it must carry the e2e-critical vendor Notion (0x3333…).
 * 3. Pushes every roster member's policy to the FeralPolicyEngine contract
 *    (limit, active flag, vendor whitelist) — the chain is the authority.
 *
 * Idempotent: safe to re-run after e2e runs have appended their own rows.
 *
 *   npx tsx scripts/seed_roster.ts [businessId]
 */

const DEFAULT_BUSINESS = 'a6fc3139-e0ae-40d1-8355-2a074fd282a4'

// Vendor addresses — 0x3333… is asserted by dashboard/scripts/e2e.mjs.
const VENDORS = {
  notion: '0x3333333333333333333333333333333333333333',
  aws: '0x4444444444444444444444444444444444444444',
  figma: '0x5555555555555555555555555555555555555555',
  openai: '0x6666666666666666666666666666666666666666',
} as const

interface RosterMember {
  name: string
  type: 'human' | 'agent'
  local: string // email local-part; domain comes from the business name
  wallet: string
  weeklyLimitUsdc: number
  vendors: { name: string; address: string }[]
}

// Order matters: the first entry is the first Team card, which the e2e and
// the demo pay from — Notion (0x3333…) must be one of its approved vendors.
const ROSTER: RosterMember[] = [
  {
    name: 'Maya Ortiz',
    type: 'human',
    local: 'maya.ortiz',
    wallet: '0x7f3a9c2e5b8d41f6a0c7e2d9b53f81a4c6e0d27b',
    weeklyLimitUsdc: 2500,
    vendors: [{ name: 'Notion', address: VENDORS.notion }],
  },
  {
    name: 'Jonah Adeyemi',
    type: 'human',
    local: 'jonah.adeyemi',
    wallet: '0x1d8b4f2a7c9e03b6d5a1f8c2e7b04d9a3c6e51f8',
    weeklyLimitUsdc: 1500,
    vendors: [
      { name: 'AWS', address: VENDORS.aws },
      { name: 'Figma', address: VENDORS.figma },
    ],
  },
  {
    name: 'Priya Nair',
    type: 'human',
    local: 'priya.nair',
    wallet: '0x9a5e2c7f1b4d08e3a6c9f25b7d1e04a8c3f6b5e9',
    weeklyLimitUsdc: 800,
    vendors: [{ name: 'Figma', address: VENDORS.figma }],
  },
  {
    name: 'Ada',
    type: 'agent',
    local: 'ada.agent',
    wallet: '0x3c7f0a9d5e2b84f1a6d3c0e9b7f25a4d8c1e6b30',
    weeklyLimitUsdc: 400,
    vendors: [{ name: 'OpenAI API', address: VENDORS.openai }],
  },
]

const ADDR_RE = /^0x[0-9a-fA-F]{40}$/

async function main() {
  const businessId = process.argv[2] || DEFAULT_BUSINESS

  const { data: business, error: bizErr } = await db
    .from('businesses')
    .select('id, name')
    .eq('id', businessId)
    .single()
  if (bizErr || !business) throw new Error(`Business ${businessId} not found`)
  const emailDomain =
    String(business.name).toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com'

  for (const m of ROSTER) {
    if (!ADDR_RE.test(m.wallet)) throw new Error(`bad wallet: ${m.wallet}`)
    for (const v of m.vendors) {
      if (!ADDR_RE.test(v.address)) throw new Error(`bad vendor addr: ${v.address}`)
    }
  }

  const { data: existing, error: exErr } = await db
    .from('team_members')
    .select('id, name, wallet_address, is_active')
    .eq('business_id', businessId)
    .order('created_at', { ascending: true })
  if (exErr) throw exErr

  // 1. Deactivate everything that is not part of the roster (DB read model;
  //    those rows all share test wallet 0x9999… whose on-chain policy is
  //    re-synced by the next e2e run anyway).
  const rosterWallets = new Set(ROSTER.map((m) => m.wallet.toLowerCase()))
  const junk = (existing ?? []).filter(
    (m) => m.is_active && !rosterWallets.has(m.wallet_address.toLowerCase())
  )
  for (const m of junk) {
    const { error } = await db
      .from('team_members')
      .update({ is_active: false })
      .eq('id', m.id)
    if (error) throw error
  }
  console.log(`deactivated ${junk.length} test/duplicate row(s)`)

  // 2. Insert roster members (in order) + their approved vendors.
  for (const m of ROSTER) {
    const found = (existing ?? []).find(
      (e) => e.wallet_address.toLowerCase() === m.wallet.toLowerCase()
    )
    let memberId = found?.id
    if (!found) {
      const { data: inserted, error } = await db
        .from('team_members')
        .insert({
          business_id: businessId,
          name: m.name,
          type: m.type,
          email: m.type === 'human' ? `${m.local}@${emailDomain}` : null,
          wallet_address: m.wallet.toLowerCase(),
          access_key_id: m.wallet.toLowerCase(), // same as POST /api/team
          weekly_limit_usdc: m.weeklyLimitUsdc,
          is_active: true,
        })
        .select('id')
        .single()
      if (error) throw error
      memberId = inserted.id
      console.log(`inserted ${m.name} (${m.type})`)
    } else if (!found.is_active) {
      const { error } = await db
        .from('team_members')
        .update({ is_active: true, weekly_limit_usdc: m.weeklyLimitUsdc })
        .eq('id', found.id)
      if (error) throw error
      console.log(`re-activated ${m.name}`)
    }

    for (const v of m.vendors) {
      const { error } = await db.from('approved_vendors').upsert(
        {
          team_member_id: memberId,
          business_id: businessId,
          vendor_name: v.name,
          vendor_address: v.address.toLowerCase(),
          is_active: true,
        },
        { onConflict: 'team_member_id,vendor_address', ignoreDuplicates: true }
      )
      if (error) throw error
    }

    // 3. Chain is the authority: push the policy to FeralPolicyEngine.
    const res = await syncMemberPolicy({
      businessId,
      memberAddress: m.wallet,
      weeklyLimitUsdc: m.weeklyLimitUsdc,
      active: true,
      approvedVendors: m.vendors.map((v) => v.address),
    })
    console.log(`synced ${m.name} on-chain → ${res.explorerUrl}`)
  }

  console.log('SEED_COMPLETE')
}

main().catch((err) => {
  console.error('SEED_FAILED:', err.message || err)
  process.exit(1)
})
