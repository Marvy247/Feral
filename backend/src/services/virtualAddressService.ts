import { keccak256, toBytes } from 'viem'

// Tempo virtual address magic bytes (10 bytes)
// From Tempo docs: the VIRTUAL_MAGIC constant that marks an address as virtual
const VIRTUAL_MAGIC = 'fdfdfdfdfdfdfdfdfdfd'

/**
 * Generate a Tempo virtual address for an invoice.
 * Format: 0x{masterId(4)}{VIRTUAL_MAGIC(10)}{userTag(6)}
 * 
 * @param masterId - 4-byte Buffer identifying the registered master wallet
 * @param invoiceId - UUID string of the invoice
 * @returns virtualAddress (0x-prefixed hex) and userTag (6-byte Buffer)
 */
export function generateVirtualAddress(
  masterId: Buffer,
  invoiceId: string
): { virtualAddress: string; userTag: Buffer } {
  // Derive userTag: lower 6 bytes of keccak256(invoiceId)
  const hash = keccak256(toBytes(invoiceId))
  const userTag = Buffer.from(hash.slice(2, 14), 'hex') // first 6 bytes

  const masterIdHex = masterId.toString('hex').padStart(8, '0') // 4 bytes = 8 hex chars
  const userTagHex = userTag.toString('hex').padStart(12, '0')  // 6 bytes = 12 hex chars

  const virtualAddress = `0x${masterIdHex}${VIRTUAL_MAGIC}${userTagHex}`

  return { virtualAddress, userTag }
}

/**
 * Extract userTag from a virtual address for invoice lookup
 */
export function extractUserTag(virtualAddress: string): string {
  // Last 12 hex chars = last 6 bytes = userTag
  return virtualAddress.slice(-12)
}

/**
 * Check if an address is a virtual address
 */
export function isVirtualAddress(address: string): boolean {
  // Virtual addresses contain the VIRTUAL_MAGIC bytes in position 10-29 (chars 10-29)
  const normalized = address.toLowerCase().replace('0x', '')
  if (normalized.length !== 40) return false
  return normalized.slice(8, 28) === VIRTUAL_MAGIC
}