import {
  encodeFunctionData,
  keccak256,
  stringToHex,
  parseAbi,
  decodeErrorResult,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { tempoClient, tempoModerate } from './tempoService'
import { createWalletClient, http } from 'viem'

/**
 * FeralPolicyEngine client — protocol-enforced spend policy.
 *
 * The engine contract (deployed on Moderato) is the authority for member
 * spend decisions. Every payment executes `engine.pay()` on-chain:
 *   - allowed   → funds move treasury → vendor, tx succeeds
 *   - violated  → tx REVERTS with CallNotAllowed / SpendingLimitExceeded /
 *                 MemberInactive and we record the revert + tx hash, so a
 *                 BLOCKED event is the chain's verdict, not the app's.
 */

const ENGINE_ADDRESS = (process.env.FERAL_POLICY_ENGINE_ADDRESS ||
  '0xDF445D3B191D7d0D0D31053890bEb1E712d96eCc') as `0x${string}`

export const ENGINE_ABI = parseAbi([
  'function syncMember(bytes32 businessId, address member, uint256 weeklyLimit, bool active, address[] approvedVendors)',
  'function setVendorApproved(bytes32 businessId, address member, address vendor, bool approved)',
  'function pay(bytes32 businessId, address member, address vendor, uint256 amount)',
  'function check(bytes32 businessId, address member, address vendor, uint256 amount) view returns (bool allowed, bytes32 reason)',
  'function memberPolicy(bytes32 businessId, address member) view returns (uint256 weeklyLimit, bool active)',
  'function spentThisWeek(bytes32 businessId, address member) view returns (uint256)',
  'function owner() view returns (address)',
  'error CallNotAllowed()',
  'error SpendingLimitExceeded()',
  'error MemberInactive()',
  'error NotOwner()',
  'error InvalidAddress()',
])

const EXPLORER = process.env.TEMPO_EXPLORER_URL || 'https://explore.testnet.tempo.xyz'

/** Stable bytes32 namespace for a business UUID. */
export function businessKey(businessId: string): `0x${string}` {
  return keccak256(stringToHex(businessId))
}

/** Dollars → TIP-20 base units (6 decimals). */
export function toBase(usdc: number): bigint {
  return BigInt(Math.round(Number(usdc) * 1_000_000))
}

function account() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk || pk.replace(/^0x/, '').length !== 64) {
    throw new Error('DEPLOYER_PRIVATE_KEY not configured')
  }
  return privateKeyToAccount(pk as `0x${string}`)
}

function wallet() {
  return createWalletClient({ account: account(), chain: tempoModerate, transport: http(process.env.TEMPO_RPC_URL) })
}

/** Pull the custom-error name out of a failed viem simulation, if present. */
function decodeRevert(err: unknown): string | null {
  const e = err as { data?: Hex; shortMessage?: string; message?: string }
  const data = e?.data
  if (data && data !== '0x') {
    try {
      const decoded = decodeErrorResult({ abi: ENGINE_ABI, data })
      return decoded.errorName
    } catch {
      /* not one of our errors — fall through */
    }
  }
  const msg = `${e?.shortMessage || ''} ${e?.message || ''}`
  for (const name of ['CallNotAllowed', 'SpendingLimitExceeded', 'MemberInactive', 'NotOwner', 'InvalidAddress']) {
    if (msg.includes(name)) return name
  }
  return null
}

export interface EngineTxResult {
  txHash: string
  explorerUrl: string
  status: 'success' | 'reverted'
  revertReason: string | null
}

/**
 * Broadcast an engine call with an explicit gas limit so that transactions
 * expected to revert are still INCLUDED on-chain (their receipt + explorer
 * page become the evidence for the BLOCKED event).
 */
async function sendEngineCall(fnName: 'syncMember' | 'setVendorApproved' | 'pay', args: unknown[]): Promise<EngineTxResult> {
  const data = encodeFunctionData({ abi: ENGINE_ABI, functionName: fnName, args: args as never })

  // Pre-simulate to capture the custom-error name (the broadcast below may
  // revert; receipts don't carry revert data).
  let revertReason: string | null = null
  try {
    await tempoClient.simulateContract({
      address: ENGINE_ADDRESS,
      abi: ENGINE_ABI,
      functionName: fnName,
      args: args as never,
      account: account(),
    })
  } catch (err) {
    revertReason = decodeRevert(err)
  }

  const hash = await wallet().sendTransaction({
    to: ENGINE_ADDRESS,
    data,
    gas: 1_500_000n, // explicit: eth_estimateGas would fail on a reverting policy call
  })
  const receipt = await tempoClient.waitForTransactionReceipt({ hash })
  const explorerUrl = `${EXPLORER}/tx/${hash}`

  if (receipt.status === 'success') {
    return { txHash: hash, explorerUrl, status: 'success', revertReason: null }
  }
  return { txHash: hash, explorerUrl, status: 'reverted', revertReason: revertReason || 'Reverted' }
}

/** Push a member's full policy on-chain (create/update). */
export async function syncMemberPolicy(params: {
  businessId: string
  memberAddress: string
  weeklyLimitUsdc: number
  active: boolean
  approvedVendors: string[]
}): Promise<{ txHash: string; explorerUrl: string }> {
  const res = await sendEngineCall('syncMember', [
    businessKey(params.businessId),
    params.memberAddress as `0x${string}`,
    toBase(params.weeklyLimitUsdc),
    params.active,
    params.approvedVendors as `0x${string}`[],
  ])
  if (res.status !== 'success') {
    throw new Error(`engine.syncMember reverted: ${res.revertReason} (tx ${res.txHash})`)
  }
  return { txHash: res.txHash, explorerUrl: res.explorerUrl }
}

/** Kill switch: deactivate a member on-chain (next pay() reverts). */
export async function deactivateMember(params: {
  businessId: string
  memberAddress: string
  weeklyLimitUsdc: number
}): Promise<{ txHash: string; explorerUrl: string }> {
  const res = await sendEngineCall('syncMember', [
    businessKey(params.businessId),
    params.memberAddress as `0x${string}`,
    toBase(params.weeklyLimitUsdc),
    false,
    [],
  ])
  if (res.status !== 'success') {
    throw new Error(`engine.syncMember(active=false) reverted: ${res.revertReason} (tx ${res.txHash})`)
  }
  return { txHash: res.txHash, explorerUrl: res.explorerUrl }
}

/** Toggle one vendor for a member on-chain. */
export async function setVendorApproved(params: {
  businessId: string
  memberAddress: string
  vendorAddress: string
  approved: boolean
}): Promise<{ txHash: string; explorerUrl: string }> {
  const res = await sendEngineCall('setVendorApproved', [
    businessKey(params.businessId),
    params.memberAddress as `0x${string}`,
    params.vendorAddress as `0x${string}`,
    params.approved,
  ])
  if (res.status !== 'success') {
    throw new Error(`engine.setVendorApproved reverted: ${res.revertReason} (tx ${res.txHash})`)
  }
  return { txHash: res.txHash, explorerUrl: res.explorerUrl }
}

/**
 * Policy-checked payment. The CHAIN decides:
 *  - status 'success'  → funds moved, APPROVED
 *  - status 'reverted' → policy violation, tx included on-chain as evidence
 */
export async function enginePay(params: {
  businessId: string
  memberAddress: string
  vendorAddress: string
  amountUsdc: number
}): Promise<EngineTxResult> {
  return sendEngineCall('pay', [
    businessKey(params.businessId),
    params.memberAddress as `0x${string}`,
    params.vendorAddress as `0x${string}`,
    toBase(params.amountUsdc),
  ])
}

/** Base units spent by a member in the current on-chain week. */
export async function engineSpent(businessId: string, memberAddress: string): Promise<bigint> {
  return (await tempoClient.readContract({
    address: ENGINE_ADDRESS,
    abi: ENGINE_ABI,
    functionName: 'spentThisWeek',
    args: [businessKey(businessId), memberAddress as `0x${string}`],
  })) as bigint
}

/** bytes32 (hex) → ASCII, stopping at the first zero byte. */
function b32ToAscii(hex: string): string {
  const h = String(hex).replace(/^0x/, '')
  let out = ''
  for (let i = 0; i + 1 < h.length; i += 2) {
    const code = parseInt(h.slice(i, i + 2), 16)
    if (!code) break
    out += String.fromCharCode(code)
  }
  return out || 'Unknown'
}

/** Read-only policy verdict + on-chain weekly spend (for annotations). */
export async function engineCheck(params: {
  businessId: string
  memberAddress: string
  vendorAddress: string
  amountUsdc: number
}): Promise<{ allowed: boolean; reason: string; spentBase: bigint }> {
  const key = businessKey(params.businessId)
  const [verdict, spent] = await Promise.all([
    tempoClient.readContract({
      address: ENGINE_ADDRESS,
      abi: ENGINE_ABI,
      functionName: 'check',
      args: [key, params.memberAddress as `0x${string}`, params.vendorAddress as `0x${string}`, toBase(params.amountUsdc)],
    }) as Promise<[boolean, string]>,
    tempoClient.readContract({
      address: ENGINE_ADDRESS,
      abi: ENGINE_ABI,
      functionName: 'spentThisWeek',
      args: [key, params.memberAddress as `0x${string}`],
    }) as Promise<bigint>,
  ])
  const [allowed, reason] = verdict
  return { allowed, reason: b32ToAscii(reason), spentBase: spent }
}
