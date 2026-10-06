import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../db/client'

const router = Router()

// GET /api/businesses/:businessId
router.get('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { data } = await db
      .from('businesses')
      .select('*')
      .eq('id', req.params.businessId)
      .single()

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router