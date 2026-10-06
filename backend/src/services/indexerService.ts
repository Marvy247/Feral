import { db } from '../db/client'
import { broadcastInvoicePaid } from '../websocket/policyRadar'

/**
 * Invoice auto-reconciliation.
 *
 * The spec called for a TIDX WebSocket subscription, but tidx.tempo.xyz
 * currently rejects unauthenticated connections (HTTP 401), so we watch
 * TIP-20 Transfer logs over the RPC instead and reconcile invoices the same
 * way: payment to a registered virtual address -> invoice marked PAID ->
 * Policy Radar broadcast.
 */

const RPC_URL = process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz'
const TOKEN_ADDRESS = (process.env.USDC_ADDRESS || '0x20c0000000000000000000000000000000000000').toLowerCase()
// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const POLL_INTERVAL_MS = 3000
const CONFIRMATIONS = 0 // testnet: process immediately
// On first poll (or after downtime) scan this many blocks back. PathUSD has
// huge transfer volume, so we filter by recipient (see poll() below) rather
// than by time window size.
const LOOKBACK_BLOCKS = Number(process.env.INDEXER_LOOKBACK_BLOCKS || 5000)

let lastProcessedBlock: number | null = null
let running = false

interface RpcLog {
  address: string
  topics: string[]
  data: string
  blockNumber: string
  transactionHash: string
  logIndex: string
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const body = (await res.json()) as { result?: T; error?: { message: string } }
  if (body.error) throw new Error(body.error.message)
  return body.result as T
}

async function handleTransfer(log: RpcLog) {
  const toTopic = log.topics[2]
  if (!toTopic) return
  const toAddress = `0x${toTopic.slice(-40)}`.toLowerCase()
  const fromAddress = `0x${log.topics[1].slice(-40)}`.toLowerCase()
  const txHash = log.transactionHash

  try {
    // Check if toAddress is a registered virtual address
    const { data: invoice } = await db
      .from('invoices')
      .select('*, businesses(name, master_wallet_address)')
      .eq('virtual_address', toAddress)
      .eq('status', 'pending')
      .single()

    if (!invoice) return

    // Mark invoice as paid
    const { data: updated } = await db
      .from('invoices')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by_address: fromAddress,
        payment_tx_hash: txHash,
      })
      .eq('id', invoice.id)
      .select()
      .single()

    // Write policy event
    const { data: policyEvent } = await db
      .from('policy_events')
      .insert({
        business_id: invoice.business_id,
        member_name: 'Client Payment',
        member_type: 'human',
        event_type: 'INVOICE_PAID',
        amount_usdc: invoice.amount_usdc,
        vendor_name: invoice.client_name,
        to_address:
          (invoice.businesses as { master_wallet_address?: string } | null)?.master_wallet_address ??
          null,
        tempo_tx_hash: txHash,
        tempo_explorer_url: `${process.env.TEMPO_EXPLORER_URL || 'https://explore.testnet.tempo.xyz'}/tx/${txHash}`,
      })
      .select()
      .single()
    void policyEvent // persisted for GET /api/transactions history

    // Broadcast to frontend
    broadcastInvoicePaid(invoice.business_id, {
      invoice: updated,
      txHash,
      paidBy: fromAddress,
    })

    console.log(`Invoice ${invoice.invoice_number} paid: ${txHash}`)
  } catch (err) {
    console.error('Invoice reconciliation error:', err)
  }
}

async function poll() {
  if (running) return
  running = true
  try {
    const latestHex = await rpc<string>('eth_blockNumber', [])
    const latest = parseInt(latestHex, 16)
    const from = lastProcessedBlock === null
      ? Math.max(0, latest - LOOKBACK_BLOCKS)
      : lastProcessedBlock + 1
    if (from > latest) return

    // Recipient-filtered scan: only Transfers whose `to` is one of our
    // pending invoices' virtual addresses. Filtering by token+topic alone
    // returns >20k logs per window on this chain and trips the RPC's
    // getLogs result cap ("query exceeds max results 20000").
    const { data: pending } = await db
      .from('invoices')
      .select('virtual_address')
      .eq('status', 'pending')
    const targets = (pending ?? [])
      .map((p) => p.virtual_address.toLowerCase())
      .filter((a) => /^0x[0-9a-f]{40}$/.test(a))
      .map((a) => `0x000000000000000000000000${a.slice(2)}`)

    if (targets.length === 0) {
      lastProcessedBlock = latest - CONFIRMATIONS
      return
    }

    const logs = await rpc<RpcLog[]>('eth_getLogs', [
      {
        address: TOKEN_ADDRESS,
        topics: [TRANSFER_TOPIC, null, targets],
        fromBlock: `0x${from.toString(16)}`,
        toBlock: `0x${Math.max(0, latest - CONFIRMATIONS).toString(16)}`,
      },
    ])

    if (logs && logs.length > 0) {
      console.log(`Indexer: ${logs.length} transfer(s) to pending invoices in blocks ${from}-${latest}`)
    }
    for (const log of logs || []) {
      await handleTransfer(log)
    }

    lastProcessedBlock = latest - CONFIRMATIONS
  } catch (err) {
    console.error('Indexer poll error:', (err as Error).message)
  } finally {
    running = false
  }
}

export function startIndexerService() {
  console.log('Starting invoice indexer (RPC eth_getLogs, 3s interval)...')
  console.log(`Watching TIP-20 Transfers on ${TOKEN_ADDRESS} (recipient-filtered, ${LOOKBACK_BLOCKS}-block lookback)`)
  poll()
  setInterval(poll, POLL_INTERVAL_MS)
}
