import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { createServer } from 'http'
import { initWebSocketServer } from './websocket/policyRadar'
import { startIndexerService } from './services/indexerService'
import errorHandler from './middleware/errors'

// Routes
import authRoutes from './routes/auth'
import businessRoutes from './routes/businesses'
import teamRoutes from './routes/team'
import invoiceRoutes from './routes/invoices'
import payrollRoutes from './routes/payroll'
import transactionRoutes from './routes/transactions'

const app = express()
const httpServer = createServer(app)

// Middleware
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }))
app.use(morgan('dev'))
app.use(express.json())

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/businesses', businessRoutes)
app.use('/api/team', teamRoutes)
app.use('/api/invoices', invoiceRoutes)
app.use('/api/payroll', payrollRoutes)
app.use('/api/transactions', transactionRoutes)

// Health check
app.get('/health', (_, res) => res.json({ status: 'ok', chain: 'tempo-moderato' }))

// Error handler
app.use(errorHandler)

// WebSocket server for Policy Radar
initWebSocketServer(httpServer)

// Start TIDX event listener
startIndexerService()

const PORT = process.env.PORT || 3001
httpServer.listen(PORT, () => {
  console.log(`FERAL backend running on port ${PORT}`)
  console.log(`Connected to Tempo testnet (Moderato) chain ID ${process.env.TEMPO_CHAIN_ID || 42431}`)
})