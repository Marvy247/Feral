import { WebSocketServer, WebSocket } from 'ws'
import { Server } from 'http'

// Map of businessId -> set of connected WebSocket clients
const clients = new Map<string, Set<WebSocket>>()

export function initWebSocketServer(httpServer: Server) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/policy-radar' })

  wss.on('connection', (ws, req) => {
    // Client sends businessId on connect: { type: 'subscribe', businessId }
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'subscribe' && msg.businessId) {
          if (!clients.has(msg.businessId)) {
            clients.set(msg.businessId, new Set())
          }
          clients.get(msg.businessId)!.add(ws)
          ws.send(JSON.stringify({ type: 'subscribed', businessId: msg.businessId }))
        }
      } catch {}
    })

    ws.on('close', () => {
      // Remove from all business subscriptions
      clients.forEach((wsSet) => wsSet.delete(ws))
    })
  })

  console.log('Policy Radar WebSocket server ready at /ws/policy-radar')
}

export function broadcastPolicyEvent(businessId: string, event: Record<string, unknown>) {
  const businessClients = clients.get(businessId)
  if (!businessClients) return

  const message = JSON.stringify({ type: 'policy_event', data: event })
  businessClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  })
}

export function broadcastInvoicePaid(businessId: string, invoice: Record<string, unknown>) {
  const businessClients = clients.get(businessId)
  if (!businessClients) return

  const message = JSON.stringify({ type: 'invoice_paid', data: invoice })
  businessClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  })
}