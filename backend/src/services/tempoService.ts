import { createPublicClient, createWalletClient, defineChain, http, encodeFunctionData, parseUnits, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const TEMPO_RPC_URL = process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz'
const TOKEN_ADDRESS = (process.env.USDC_ADDRESS || '0x20c0000000000000000000000000000000000000') as `0x${string}`

export const tempoModerate = defineChain({
  id: 42431, // Moderato reports chain id 42431
  name: 'Tempo Moderato',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Tempo Explorer',
      url: 'https://explore.testnet.tempo.xyz',
    },
  },
  testnet: true,
})

export const tempoClient: PublicClient = createPublicClient({
  transport: http(TEMPO_RPC_URL),
  chain: tempoModerate,
})

/**
 * Submit a pre-signed Tempo Transaction to the network.
 * Returns the transaction hash on success.
 * Throws on rejection (blocked transactions).
 */
export async function submitTransaction(signedTxHex: string): Promise<string> {
  const response = await fetch(TEMPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_sendRawTransaction',
      params: [signedTxHex],
      id: 1,
    }),
  })

  const result = (await response.json()) as { result: string; error: { message: string } | null }

  if (result.error) {
    throw new Error(result.error.message || 'Transaction rejected')
  }

  return result.result
}

/**
 * Get transaction receipt
 */
export async function getTransactionReceipt(txHash: string) {
  const response = await fetch(TEMPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_getTransactionReceipt',
      params: [txHash],
      id: 1,
    }),
  })
  const result = (await response.json()) as { result: any }
  return result.result
}

const TIP20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const

/**
 * Execute a real TIP-20 stablecoin transfer, sponsored by the treasury key.
 * Used by payroll execution and owner-submitted calls; the Pay Vendor flow
 * goes through FeralPolicyEngine.pay() instead (policy-checked on-chain).
 */
export async function sendTokenTransfer(
  to: `0x${string}`,
  amountUsdc: number
): Promise<{ txHash: string; explorerUrl: string }> {
  const data = encodeFunctionData({
    abi: TIP20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [to, parseUnits(amountUsdc.toFixed(6), 6)],
  })
  return sendContractCall({ to: TOKEN_ADDRESS, data })
}

/**
 * Sign and broadcast a single contract call from the treasury key.
 * Used for owner-submitted payloads (single or batched calls) and transfers.
 */
export async function sendContractCall(params: {
  to: `0x${string}`
  data: `0x${string}`
  value?: bigint
}): Promise<{ txHash: string; explorerUrl: string }> {
  const pk = process.env.DEPLOYER_PRIVATE_KEY
  if (!pk || pk.replace(/^0x/, '').length !== 64) {
    throw new Error('DEPLOYER_PRIVATE_KEY not configured')
  }

  const account = privateKeyToAccount(pk as `0x${string}`)
  const wallet = createWalletClient({ account, chain: tempoModerate, transport: http(TEMPO_RPC_URL) })

  const hash = await wallet.sendTransaction({
    to: params.to,
    data: params.data,
    value: params.value ?? 0n,
  })
  const receipt = await tempoClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    throw new Error('Transaction reverted on-chain')
  }

  return {
    txHash: hash,
    explorerUrl: `${process.env.TEMPO_EXPLORER_URL || 'https://explore.testnet.tempo.xyz'}/tx/${hash}`,
  }
}