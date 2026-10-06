import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../db/client'

const router = Router()

// POST /api/auth/register
// Creates a new business account. In production, wallet creation happens via 
// Tempo Accounts SDK on the frontend. For the hackathon, we accept a wallet
// address that was created client-side.
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, masterWalletAddress } = req.body
    if (!name || !email || !password || !masterWalletAddress) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Generate the 4-byte masterId for virtual addresses.
    // VIRTUAL_MASTER_ID is set after a real TIP-1022 registerVirtualMaster()
    // call (32-bit PoW salt) — required for TIP-20 transfers to resolve.
    // Fallback: derived placeholder (virtual transfers would revert).
    const registeredMasterId = process.env.VIRTUAL_MASTER_ID?.toLowerCase()
    const masterId = registeredMasterId && /^[0-9a-f]{8}$/.test(registeredMasterId)
      ? Buffer.from(registeredMasterId, 'hex')
      : Buffer.from(uuidv4().replace(/-/g, '').slice(0, 8), 'hex')
    
    const passwordHash = await bcrypt.hash(password, 12)
    
    const { data: business, error } = await db
      .from('businesses')
      .insert({
        name,
        owner_email: email,
        password_hash: passwordHash,
        master_wallet_address: masterWalletAddress.toLowerCase(),
        // hex string (schema TEXT column) — Buffers JSON-serialize and cannot be stored in Postgres
        master_id: masterId.toString('hex'),
      })
      .select()
      .single()
    
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Email or wallet already registered' })
      throw error
    }
    
    const token = jwt.sign(
      { businessId: business.id, walletAddress: masterWalletAddress },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    
    res.json({ token, business: { id: business.id, name: business.name, masterWalletAddress } })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    
    const { data: business } = await db
      .from('businesses')
      .select('*')
      .eq('owner_email', email)
      .single()
    
    if (!business) return res.status(401).json({ error: 'Invalid credentials' })
    
    const valid = await bcrypt.compare(password, business.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })
    
    const token = jwt.sign(
      { businessId: business.id, walletAddress: business.master_wallet_address },
      process.env.JWT_SECRET!,
      { expiresIn: '30d' }
    )
    
    res.json({ token, business: { id: business.id, name: business.name } })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router