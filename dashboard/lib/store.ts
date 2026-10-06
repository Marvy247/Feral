import { create } from 'zustand'

export interface FeralState {
  walletAddress: string | null
  businessId: string | null
  setWalletAddress: (addr: string | null) => void
  setBusinessId: (id: string | null) => void
}

export const useFeralStore = create<FeralState>((set) => ({
  walletAddress: null,
  businessId: null,
  setWalletAddress: (addr: string | null) => set({ walletAddress: addr }),
  setBusinessId: (id: string | null) => set({ businessId: id }),
}))
