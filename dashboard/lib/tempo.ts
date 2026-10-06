import { createPublicClient, http, encodeFunctionData, parseUnits } from 'viem'

const TEMPO_RPC = process.env.NEXT_PUBLIC_TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz'
const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`
const EXPLORER_URL = process.env.NEXT_PUBLIC_TEMPO_EXPLORER_URL || 'https://explore.testnet.tempo.xyz'

export const tempoPublicClient = createPublicClient({
  transport: http(TEMPO_RPC),
})

const TIP20_ABI = [
  { name: 'transfer', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'transferWithMemo', type: 'function', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'memo', type: 'bytes32' }], outputs: [{ type: 'bool' }] },
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const

export function buildTransferCalldata(to: `0x${string}`, amountUsdc: number, memo?: string): string {
  const amount = parseUnits(amountUsdc.toString(), 6)
  if (memo) {
    const memoHex = `0x${Buffer.from(memo!.padEnd(32, '\0').slice(0, 32)).toString('hex')}`
    return encodeFunctionData({ abi: TIP20_ABI, functionName: 'transferWithMemo', args: [to, amount, memoHex] })
  }
  return encodeFunctionData({ abi: TIP20_ABI, functionName: 'transfer', args: [to, amount] })
}

export async function getUsdcBalance(address: `0x${string}`): Promise<number> {
  try {
    const raw = await tempoPublicClient.readContract({ address: USDC_ADDRESS, abi: TIP20_ABI, functionName: 'balanceOf', args: [address] })
    return Number(raw) / 1_000_000
  } catch { return 0 }
}

export function tempoExplorerTxUrl(txHash: string): string { return `${EXPLORER_URL}/tx/${txHash}` }
export function tempoExplorerAddressUrl(address: string): string { return `${EXPLORER_URL}/address/${address}` }
