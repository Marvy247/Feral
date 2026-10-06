import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// Applies the freshly registered TIP-1022 masterId to the existing demo
// business and deletes invoices whose virtual addresses embed the old
// (placeholder) masterId — those can never receive a TIP-20 transfer.
// Run after VIRTUAL_MASTER_ID has been written to backend/.env.

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)

const mid = env.VIRTUAL_MASTER_ID
if (!mid || !/^[0-9a-f]{8}$/.test(mid)) {
  console.error(`VIRTUAL_MASTER_ID missing or invalid (want 8 lowercase hex): ${mid ?? '<unset>'}`)
  process.exit(1)
}

const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)

const { data: biz, error: be } = await db
  .from('businesses')
  .select('id, owner_email, name, master_id')
if (be) throw be
console.log('businesses:', biz)
if (!biz || biz.length === 0) {
  console.error('no businesses found — handle manually')
  process.exit(2)
}

// master_id is UNIQUE, so only the demo business can receive the registered
// masterId; leftover test businesses are removed (FKs cascade to their rows).
const demo = biz.filter((b) => b.owner_email === 'demo@feral.app')
const junk = biz.filter((b) => b.owner_email !== 'demo@feral.app')
if (demo.length !== 1) {
  console.error('expected exactly one demo@feral.app business — handle manually')
  process.exit(2)
}
for (const j of junk) {
  const { error: je } = await db.from('businesses').delete().eq('id', j.id)
  if (je) throw je
  console.log(`deleted leftover business ${j.owner_email} (${j.name})`)
}

const { error: ue } = await db.from('businesses').update({ master_id: mid }).eq('id', demo[0].id)
if (ue) throw ue

const { data: inv, error: ie } = await db
  .from('invoices')
  .select('id, invoice_number, virtual_address, status')
  .eq('business_id', demo[0].id)
if (ie) throw ie

const { error: de } = await db.from('invoices').delete().eq('business_id', demo[0].id)
if (de) throw de

console.log(`master_id: ${demo[0].master_id} -> ${mid}`)
console.log(`deleted ${inv?.length ?? 0} invoice(s) with stale virtual addresses:`)
for (const i of inv ?? []) console.log(`  ${i.invoice_number} ${i.virtual_address} (${i.status})`)
console.log('OK — restart backend so new registrations/invoices pick up the masterId')
