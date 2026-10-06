'use client'

import { useState, useEffect, useCallback } from 'react'

export interface TempoWallet {
  address: string | null
  isConnected: boolean
  isLoading: boolean
  connect: () => Promise<string | null>
  disconnect: () => void
  signAndSubmitTx: (txPayload: TempoTxPayload) => Promise<string>
  getBalance: () => Promise<number>
}

export interface TempoTxPayload {
  calls: Array<{
    to: string
    value: string
    input: string
  }>
  feeToken?: string
  validAfter?: string
  validBefore?: string
  chainId: number
}

export function useTempoWallet(): TempoWallet {
  const [address, setAddress] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('feral_wallet_address')
    if (saved) setAddress(saved)
  }, [])

  const connect = useCallback(async (): Promise<string | null> => {
    setIsLoading(true)
    try {
      const mockAddress = `0x${Math.random().toString(16).slice(2).padStart(40, '0')}`
      setAddress(mockAddress)
      localStorage.setItem('feral_wallet_address', mockAddress)
      return mockAddress
    } catch (err) {
      console.error('Wallet connect failed:', err)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    localStorage.removeItem('feral_wallet_address')
  }, [])

  const signAndSubmitTx = useCallback(async (txPayload: TempoTxPayload): Promise<string> => {
    const token = localStorage.getItem('feral_auth_token')

    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/transactions/submit-owner`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ txPayload, signerAddress: address }),
    })

    if (!response.ok) {
      const err = await response.json()
      throw new Error(err.error || 'Transaction failed')
    }

    const { txHash } = await response.json()
    return txHash
  }, [address])

  const getBalance = useCallback(async (): Promise<number> => {
    if (!address) return 0
    try {
      const { getUsdcBalance } = await import('@/lib/tempo')
      return getUsdcBalance(address as `0x${string}`)
    } catch {
      return 0
    }
  }, [address])

  return {
    address,
    isConnected: !!address,
    isLoading,
    connect,
    disconnect,
    signAndSubmitTx,
    getBalance,
  }
}
