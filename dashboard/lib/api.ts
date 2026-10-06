// Typed fetch wrapper for the FERAL backend.
// Demo auth: the UI stays as-is, but we silently acquire a real JWT from the
// backend (register -> fallback login) so every screen can hit the real API.
//
// Demo credentials live in .env.local (see .env.example) — never in source.
// If they are not configured, we register a throwaway identity instead, so
// the app still works (with an empty, onboarding-friendly workspace).

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL || ''
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD || ''

/** Fresh throwaway wallet — businesses.master_wallet_address is UNIQUE, so a
 *  guest session must never reuse a fixed address. */
function randomWallet(): string {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  let hex = ''
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return '0x' + hex
}

let token: string | null = null
let inflightAuth: Promise<{ token: string; businessId: string }> | null = null

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!token) token = localStorage.getItem('feral_auth_token')

  const res = await fetch(`${BASE}${path}`, {
    method: init?.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
    body: init?.body,
  })

  const text = await res.text()
  const data = text ? JSON.parse(text) : null

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status)
  }
  return data as T
}

interface AuthResponse {
  token: string
  business: { id: string; name: string; masterWalletAddress?: string }
}

/** Persist a backend session (used by the real login/register form). */
export function setSession(auth: { token: string; business: { id: string; name?: string } }): void {
  token = auth.token
  localStorage.setItem('feral_auth_token', auth.token)
  localStorage.setItem('feral_business_id', auth.business.id)
  if (auth.business.name) localStorage.setItem('feral_business_name', auth.business.name)
}

/** Acquire (or restore) a backend session. Returns the real business id. */
export async function ensureAuth(): Promise<{ token: string; businessId: string }> {
  const saved = localStorage.getItem('feral_auth_token')
  const savedBusiness = localStorage.getItem('feral_business_id')
  if (saved && savedBusiness && savedBusiness.startsWith('demo') === false) {
    token = saved
    return { token: saved, businessId: savedBusiness }
  }

  // Several hooks call this on first paint — share one handshake instead of
  // racing N registers (the losers all come back 409).
  if (!inflightAuth) {
    inflightAuth = acquireSession().finally(() => {
      inflightAuth = null
    })
  }
  return inflightAuth
}

async function acquireSession(): Promise<{ token: string; businessId: string }> {
  const name = localStorage.getItem('feral_business_name') || 'My Business'
  const masterWalletAddress = DEMO_EMAIL
    ? localStorage.getItem('feral_wallet_address') || randomWallet()
    : randomWallet()

  // Configured demo account -> stable seeded workspace. Otherwise -> a
  // throwaway identity so a fresh checkout still reaches the real API.
  const email =
    DEMO_EMAIL ||
    `guest-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@feral.local`
  const password = DEMO_PASSWORD || Math.random().toString(36).slice(2, 14)

  const store = (auth: AuthResponse) => {
    setSession(auth)
    return { token: auth.token, businessId: auth.business.id }
  }

  try {
    const auth = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, masterWalletAddress }),
    })
    return store(auth)
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const auth = await request<AuthResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      return store(auth)
    }
    throw err
  }
}

/** ensureAuth + request in one call for hooks. */
export async function authedRequest<T>(path: string, init?: RequestInit): Promise<T> {
  await ensureAuth()
  return request<T>(path, init)
}
