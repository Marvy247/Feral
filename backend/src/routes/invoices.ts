import { Router } from 'express'
import { requireAuth, AuthRequest } from '../middleware/auth'
import { db } from '../db/client'
import { generateVirtualAddress } from '../services/virtualAddressService'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

// GET /api/invoices/:businessId
router.get('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { data } = await db
      .from('invoices')
      .select('*')
      .eq('business_id', req.params.businessId)
      .order('created_at', { ascending: false })

    res.json(data || [])
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// POST /api/invoices/:businessId — create new invoice
router.post('/:businessId', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (req.businessId !== req.params.businessId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const { clientName, amountUsdc, dueDate, description } = req.body

    // Get business masterId
    const { data: business } = await db
      .from('businesses')
      .select('master_id, id')
      .eq('id', req.params.businessId)
      .single()

    if (!business) return res.status(404).json({ error: 'Business not found' })

    // Generate invoice number
    const { count } = await db
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', req.params.businessId)

    const invoiceNumber = `INV-${String((count || 0) + 1).padStart(4, '0')}`
    const invoiceId = uuidv4()

    // Generate virtual address
    const { virtualAddress, userTag } = generateVirtualAddress(
      Buffer.from(business.master_id, 'hex'), // stored as hex text
      invoiceId
    )

    // Construct memo from invoice number (32 bytes, padded)
    const memoString = invoiceNumber.padEnd(32, '\0').slice(0, 32)
    const memo = Buffer.from(memoString)

    const { data: invoice } = await db
      .from('invoices')
      .insert({
        id: invoiceId,
        business_id: req.params.businessId,
        invoice_number: invoiceNumber,
        client_name: clientName,
        amount_usdc: amountUsdc,
        virtual_address: virtualAddress,
        user_tag: userTag.toString('hex'),
        memo: memo.toString('hex'),
        due_date: dueDate,
        description: description || null,
        status: 'pending',
      })
      .select()
      .single()

    res.json(invoice)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router