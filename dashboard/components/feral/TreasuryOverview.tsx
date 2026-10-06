'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function TreasuryOverview({ businessId }: { businessId: string }) {
  const [usdcBalance, setUsdcBalance] = useState(0)
  const [businessName, setBusinessName] = useState('')

  const loadBalance = () => {
    const savedAddress = localStorage.getItem('feral_wallet_address')
    if (savedAddress) {
      import('@/lib/tempo').then(({ getUsdcBalance }) => {
        getUsdcBalance(savedAddress as `0x${string}`).then(setUsdcBalance)
      })
    }
  }

  useEffect(() => {
    loadBalance()
    const storedBusiness = localStorage.getItem('feral_business_name')
    if (storedBusiness) {
      setBusinessName(storedBusiness)
    }
  }, [businessId])

  return (
    <Card>
      <CardHeader>
        <h3 className="font-medium">Treasury Overview</h3>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-sky-600">{usdcBalance.toFixed(2)}</p>
            <p className="text-sm text-slate-500">PathUSD Balance</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{businessName}</p>
            <p className="text-sm text-slate-500">Business</p>
          </div>
          <div>
            <Button onClick={loadBalance} className="flex items-center justify-center gap-2">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
              Refresh
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
