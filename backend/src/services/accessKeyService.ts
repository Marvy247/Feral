import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  parseUnits,
  keccak256,
  encodeAbiParameters,
  toBytes,
  toHex,
} from 'viem'
import { tempoModerate, TEMPO_ADDRESSES } from '../lib/tempoChain'

// AccountKeychain precompile ABI (key functions only)
const KEYCHAIN_ABI = [
  {
    name: 'authorizeKey',
    type: 'function',
    inputs: [
      { name: 'keyType', type: 'uint8' },        // 0=secp256k1, 1=P256, 2=WebAuthn
      { name: 'keyId', type: 'address' },         // derived address of the key
      { name: 'expiry', type: 'uint64' },         // unix timestamp, 0=never
      { name: 'limits', type: 'tuple[]', components: [
        { name: 'token', type: 'address' },
        { name: 'limit', type: 'uint256' },
        { name: 'period', type: 'uint64' },       // 0=one-time, 604800=weekly
      ]},
      { name: 'allowedCalls', type: 'tuple[]', components: [
        { name: 'target', type: 'address' },
        { name: 'selectorRules', type: 'tuple[]', components: [
          { name: 'selector', type: 'bytes4' },
          { name: 'recipients', type: 'address[]' },
        ]},
      ]},
    ],
    outputs: [],
  },
  {
    name: 'revokeKey',
    type: 'function',
    inputs: [{ name: 'keyId', type: 'address' }],
    outputs: [],
  },
  {
    name: 'getKey',
    type: 'function',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'keyId', type: 'address' },
    ],
    outputs: [
      { name: 'signatureType', type: 'uint8' },
      { name: 'keyId', type: 'address' },
      { name: 'expiry', type: 'uint64' },
      { name: 'enforceLimits', type: 'bool' },
      { name: 'isRevoked', type: 'bool' },
    ],
  },
] as const

// TIP-20 transfer selector: transfer(address,uint256)
const TRANSFER_SELECTOR = '0xa9059cbb' as `0x${string}`

export interface AccessKeyParams {
  businessId: string
  masterWalletAddress: `0x${string}`
  memberWalletAddress: `0x${string}`       // address derived from member's key
  weeklyLimitUsdc: number                  // in dollars, e.g. 500
  approvedVendorAddresses: `0x${string}`[] // list of approved vendor Tempo addresses
  isAgent?: boolean                        // true = secp256k1, false = P256/WebAuthn
  expiryDays?: number                      // default 90 days
}

export interface AccessKeyResult {
  accessKeyId: string   // hex address derived from key's public key
  txHash: string        // Tempo tx hash of the authorization transaction
  keyAuthCalldata: string // encoded calldata for authorizeKey()
}

/**
 * Build the calldata for authorizing an access key on the AccountKeychain precompile.
 * 
 * This calldata is included in a Tempo Transaction that the OWNER signs.
 * The employee's address (accessKeyId) is authorized to sign future transactions
 * with the defined spending limits and call scopes.
 * 
 * IMPORTANT: The actual Tempo Transaction construction and signing with passkey
 * happens on the FRONTEND using the Tempo Accounts SDK. This function builds
 * the calldata payload that goes inside the transaction's `calls` array.
 */
export function buildAuthorizeKeyCalldata(params: AccessKeyParams): string {
  const {
    memberWalletAddress,
    weeklyLimitUsdc,
    approvedVendorAddresses,
    isAgent = false,
    expiryDays = 90,
  } = params

  const weeklyLimitRaw = parseUnits(weeklyLimitUsdc.toString(), 6) // USDC 6 decimals
  const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + expiryDays * 86400)

  const calldata = encodeFunctionData({
    abi: KEYCHAIN_ABI,
    functionName: 'authorizeKey',
    args: [
      isAgent ? 0 : 1,           // 0=secp256k1 for agents, 1=P256 for humans
      memberWalletAddress,
      expiryTimestamp,
      // Spending limits: USDC, weekly reset
      [
        {
          token: TEMPO_ADDRESSES.USDC,
          limit: weeklyLimitRaw,
          period: BigInt(604800), // 1 week in seconds
        }
      ],
      // Call scopes: can only call USDC.transfer() to approved vendors
      approvedVendorAddresses.length > 0
        ? [
            {
              target: TEMPO_ADDRESSES.USDC,
              selectorRules: [
                {
                  selector: TRANSFER_SELECTOR,
                  recipients: approvedVendorAddresses,
                }
              ],
            }
          ]
        : [],
    ],
  })

  return calldata
}

/**
 * Build the Tempo Transaction payload for key authorization.
 * This is the UNSIGNED transaction that the frontend owner signs with their passkey.
 * 
 * Structure follows the Tempo Transaction spec (type 0x76):
 */
export function buildKeyAuthorizationTxPayload(params: AccessKeyParams) {
  const calldata = buildAuthorizeKeyCalldata(params)

  return {
    // The calls array: one call to the AccountKeychain precompile
    calls: [
      {
        to: TEMPO_ADDRESSES.ACCOUNT_KEYCHAIN,
        value: '0x0',
        input: calldata,
      }
    ],
    // Pay gas in USDC
    feeToken: TEMPO_ADDRESSES.USDC,
    // Request fee sponsorship for smoother UX
    requestFeePayer: true,
    // Chain
    chainId: 268,
  }
}

/**
 * Verify that an access key is active on-chain.
 * Call this after provisioning to confirm it worked.
 */
export async function verifyAccessKey(
  masterWallet: `0x${string}`,
  accessKeyId: `0x${string}`
): Promise<boolean> {
  const client = createPublicClient({ transport: http(process.env.TEMPO_RPC_URL!) })

  try {
    const result = await client.readContract({
      address: TEMPO_ADDRESSES.ACCOUNT_KEYCHAIN,
      abi: KEYCHAIN_ABI,
      functionName: 'getKey',
      args: [masterWallet, accessKeyId],
    }) as [number, string, bigint, boolean, boolean]
    // result[4] = isRevoked
    return !result[4]
  } catch {
    return false
  }
}

/**
 * Build calldata for revoking an access key.
 * Returned calldata is sent as a call from the owner's passkey.
 */
export function buildRevokeKeyCalldata(accessKeyId: `0x${string}`): string {
  return encodeFunctionData({
    abi: KEYCHAIN_ABI,
    functionName: 'revokeKey',
    args: [accessKeyId],
  })
}

export async function provisionAccessKey(params: AccessKeyParams) {
  const { businessId, masterWalletAddress, memberWalletAddress, weeklyLimitUsdc, approvedVendorAddresses, isAgent, expiryDays } = params

  const keyAuthCalldata = buildAuthorizeKeyCalldata({
    ...params,
  })

  // Build the key authorization transaction payload
  const txPayload = buildKeyAuthorizationTxPayload({
    businessId,
    masterWalletAddress,
    memberWalletAddress,
    weeklyLimitUsdc,
    approvedVendorAddresses,
    isAgent,
    expiryDays,
  })

  return {
    accessKeyId: memberWalletAddress,
    txHash: '', // Will be populated after signing and submission
    keyAuthCalldata,
  }
}
