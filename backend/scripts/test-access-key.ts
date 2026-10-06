import 'dotenv/config'
import { createWalletClient, createPublicClient, http, parseUnits, keccak256 } from 'viem'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

const TEMPO_RPC = process.env.TEMPO_RPC_URL || 'https://rpc.moderato.tempo.xyz'
const USDC_ADDRESS = process.env.USDC_ADDRESS as `0x${string}`
const ACCOUNT_KEYCHAIN = '0xAAAAAAAA00000000000000000000000000000000' as `0x${string}`

// KNOWN APPROVED + UNAPPROVED addresses for testing
// Use addresses from the Tempo testnet that have some USDC
const APPROVED_VENDOR = '0x1111111111111111111111111111111111111111' as `0x${string}`
const UNAPPROVED_ADDRESS = '0x2222222222222222222222222222222222222222' as `0x${string}`

async function main() {
  console.log('=== FERAL Access Key Test ===')
  console.log('RPC:', TEMPO_RPC)
  console.log('USDC:', USDC_ADDRESS)
  console.log('')

  // 1. Generate test keys
  const ownerKey = generatePrivateKey()
  const employeeKey = generatePrivateKey()
  const ownerAccount = privateKeyToAccount(ownerKey)
  const employeeAccount = privateKeyToAccount(employeeKey)

  console.log('Owner address:   ', ownerAccount.address)
  console.log('Employee address:', employeeAccount.address)
  console.log('')
  console.log('IMPORTANT: Fund both addresses from the Tempo faucet before continuing.')
  console.log('Faucet: https://faucet.moderato.tempo.xyz')
  console.log('')
  console.log('Press Ctrl+C to exit, fund addresses, then re-run.')
  
  // In a real test, you'd wait for funding confirmation
  // For hackathon: manually fund and re-run
  
  // 2. Check balances
  const publicClient = createPublicClient({ transport: http(TEMPO_RPC) })
  
  // 3. Construct KeyAuthorization for the employee
  // This authorizes employeeAccount to sign transactions on behalf of ownerAccount
  // with a $100 USDC weekly limit, only allowed to call USDC.transfer() to APPROVED_VENDOR
  
  console.log('Constructing KeyAuthorization...')
  
  const weeklyLimitAmount = parseUnits('100', 6) // $100 USDC
  const TRANSFER_SELECTOR = '0xa9059cbb' // transfer(address,uint256)
  
  const keyAuthorization = {
    chain_id: 268n, // Tempo Moderato
    key_type: 0, // Secp256k1
    key_id: employeeAccount.address,
    expiry: BigInt(Math.floor(Date.now() / 1000) + 86400 * 7), // 7 days
    limits: [
      {
        token: USDC_ADDRESS,
        limit: weeklyLimitAmount,
        period: 604800n, // 1 week in seconds
      }
    ],
    allowed_calls: [
      {
        target: USDC_ADDRESS,
        selector_rules: [
          {
            selector: TRANSFER_SELECTOR,
            recipients: [APPROVED_VENDOR], // ONLY this vendor allowed
          }
        ]
      }
    ]
  }
  
  const keyAuthLog = JSON.parse(JSON.stringify(keyAuthorization, (key, value) => {
  if (typeof value === 'bigint') return value.toString()
  return value
}))
console.log('KeyAuthorization:', keyAuthLog)
  console.log('')
  console.log('NOTE: For the full Tempo Transaction construction with this KeyAuthorization,')
  console.log('use the @tempo/tempo-ts SDK. See 04_TEMPO_INTEGRATION.md for full implementation.')
  console.log('')
  console.log('Expected outcomes:')
  console.log('  Transfer to APPROVED_VENDOR  → SUCCESS (tx hash returned)')
  console.log('  Transfer to UNAPPROVED_ADDRESS → ERROR: CallNotAllowed')
  console.log('')
  console.log('Test script complete. See 04_TEMPO_INTEGRATION.md for SDK implementation.')
}

main().catch(console.error)