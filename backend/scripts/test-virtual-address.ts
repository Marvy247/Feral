import 'dotenv/config'
import { generateVirtualAddress, isVirtualAddress } from '../src/services/virtualAddressService'

async function main() {
  console.log('=== Virtual Address Test ===\n')

  // Simulate a masterId (4 bytes)
  const masterId = Buffer.from('26127abc', 'hex')
  const invoiceId = '550e8400-e29b-41d4-a716-446655440000'

  const { virtualAddress, userTag } = generateVirtualAddress(masterId, invoiceId)

  console.log('masterId:       ', masterId.toString('hex'))
  console.log('invoiceId:      ', invoiceId)
  console.log('virtualAddress: ', virtualAddress)
  console.log('userTag:        ', userTag.toString('hex'))
  console.log('isVirtual:      ', isVirtualAddress(virtualAddress))
  console.log('')

  // Test round-trip: same invoiceId should always produce same virtualAddress
  const { virtualAddress: va2 } = generateVirtualAddress(masterId, invoiceId)
  console.log('Deterministic:  ', virtualAddress === va2 ? 'PASS ✓' : 'FAIL ✗')

  // Test different invoiceId produces different address
  const { virtualAddress: va3 } = generateVirtualAddress(masterId, 'different-invoice-id')
  console.log('Unique per inv: ', virtualAddress !== va3 ? 'PASS ✓' : 'FAIL ✗')

  console.log('\nVirtual address format verified.')
}

main().catch(console.error)