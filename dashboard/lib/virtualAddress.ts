import { keccak256, toBytes } from 'viem'

const VIRTUAL_MAGIC = 'fdfdfdfdfdfdfdfdfdfd'

export function generateVirtualAddress(masterIdHex: string, invoiceId: string) {
  const hash = keccak256(toBytes(invoiceId))
  const userTagHex = hash.slice(2, 14)
  const masterPadded = masterIdHex.padStart(8, '0').slice(0, 8)
  const virtualAddress = `0x${masterPadded}${VIRTUAL_MAGIC}${userTagHex}`
  return { virtualAddress, userTagHex }
}

export function formatVirtualAddress(address: string) {
  if (address.length < 10) return address
  return `${address.slice(0, 10)}...${address.slice(-6)}`
}

export function isVirtualAddress(address: string) {
  const normalized = address.toLowerCase().replace('0x', '')
  return normalized.length === 40 && normalized.slice(8, 28) === VIRTUAL_MAGIC
}
