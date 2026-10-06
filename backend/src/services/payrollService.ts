import { encodeFunctionData } from 'viem'

const USDC_ADDRESS = process.env.USDC_ADDRESS as `0x${string}`

// TIP-20 transfer ABI (same as ERC-20)
const TIP20_ABI = [
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

interface PayrollRecipient {
  address: string
  amountUsdc: number
  name: string
}

interface BatchPayrollParams {
  masterWalletAddress: string
  recipients: PayrollRecipient[]
  executeAt: Date
}

/**
 * Build a Tempo Transaction with batched payroll transfers.
 * The actual signing happens on the frontend with the owner's passkey.
 * This function returns the unsigned transaction structure.
 */
export async function buildBatchPayrollTransaction(params: BatchPayrollParams) {
  const { recipients, executeAt } = params

  // Convert each recipient to a TIP-20 transfer call
  const calls = recipients.map((recipient) => {
    const amount = BigInt(Math.round(recipient.amountUsdc * 1_000_000)) // USDC = 6 decimals
    const calldata = encodeFunctionData({
      abi: TIP20_ABI,
      functionName: 'transfer',
      args: [recipient.address as `0x${string}`, amount],
    })
    return {
      to: USDC_ADDRESS,
      // string (not BigInt) so Express can JSON-serialize the payload
      value: '0',
      input: calldata,
    }
  })

  const validAfter = BigInt(Math.floor(executeAt.getTime() / 1000))
  const validBefore = validAfter + BigInt(3600) // 1-hour window

  // Return the unsigned transaction parameters
  // The frontend will use Tempo Accounts SDK to sign this with the owner's passkey
  return {
    calls,
    validAfter: validAfter.toString(),
    validBefore: validBefore.toString(),
    feeToken: USDC_ADDRESS,
    // fee_payer_signature will be added by the fee payer relay
  }
}