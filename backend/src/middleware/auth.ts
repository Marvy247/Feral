import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthRequest extends Request {
  businessId?: string
  walletAddress?: string
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'No token provided' })
  
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      businessId: string
      walletAddress: string
    }
    req.businessId = payload.businessId
    req.walletAddress = payload.walletAddress
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}