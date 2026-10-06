import { defineChain } from 'viem'

export const tempoModerate = defineChain({
  id: 42431, // Moderato endpoint reports 42431 (docs saying 268 are wrong)
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
      url: process.env.TEMPO_EXPLORER_URL || 'https://explore.testnet.tempo.xyz',
    },
  },
  testnet: true,
})

// Key protocol addresses on Tempo
export const TEMPO_ADDRESSES = {
  ACCOUNT_KEYCHAIN: '0xAAAAAAAA00000000000000000000000000000000' as `0x${string}`,
  FEE_PAYER_RELAY: process.env.TEMPO_FEE_PAYER_URL || 'https://sponsor.moderato.tempo.xyz',
  USDC: process.env.USDC_ADDRESS as `0x${string}`,
} as const

// Tempo Transaction type byte
export const TEMPO_TX_TYPE = 0x76