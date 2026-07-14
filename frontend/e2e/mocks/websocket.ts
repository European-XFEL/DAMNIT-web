import type { Page, WebSocketRoute } from '@playwright/test'

import type { Meta, RunData } from '@damnit-frontend/shared/mocks'

// A subscription push: the run-keyed data map plus table metadata. This mirrors
// the backend's latest_data payload, which carries runs and variables but never
// tags (the reducer merges metadata, so the seed's tags survive). The mock
// stamps the timestamp at delivery, like the server, so a caller supplies only
// runs and variables. `runs` is numeric to match the seed and the backend.
export type LatestData = {
  runs: Record<string, RunData['variables']>
  metadata: { runs: number[]; variables: Meta['variables'] }
}

export type PushLatestData = (data: LatestData) => void

// Mock the app's graphql-ws connection. Playwright fully mocks the socket, so we
// play the graphql-transport-ws server by hand: acknowledge the init, remember
// the active subscription id, and answer pings. The subscription is never
// completed by us, so a test can push repeatedly onto the same id. Returns
// pushLatestData, which delivers a `next` shaped like the backend's latest_data
// payload so a test can drive a live table update.
//
// Delivery is not gated on the subscription's `since` cursor: the mock sends
// whatever is pushed, regardless of the timestamp the client subscribed with.
// The backend owns that cursor filtering and tests it directly, so it is out of
// scope here.
export async function mockWebSocket(page: Page): Promise<PushLatestData> {
  let socket: WebSocketRoute | undefined
  let activeId: string | undefined
  // Pushes made before the app has subscribed (the handshake can lag the grid
  // paint under load) wait here and are delivered in order the moment the
  // subscription opens, so a test never has to race the socket.
  const pending: LatestData[] = []

  // The backend stamps each push with an advancing epoch-ms timestamp, which the
  // app feeds back as its subscription cursor. Model that so the stored cursor
  // looks real; the exact value does not affect delivery.
  let clock = 1_700_000_000_000
  const nextTimestamp = () => (clock += 1000)

  const deliver = ({ runs, metadata }: LatestData) => {
    socket?.send(
      JSON.stringify({
        id: activeId,
        type: 'next',
        payload: {
          data: {
            latest_data: {
              runs,
              metadata: { ...metadata, timestamp: nextTimestamp() },
            },
          },
        },
      })
    )
  }

  await page.routeWebSocket('**/graphql', (ws) => {
    socket = ws
    ws.onMessage((message) => {
      const msg = JSON.parse(String(message))
      switch (msg.type) {
        case 'connection_init':
          ws.send(JSON.stringify({ type: 'connection_ack' }))
          break
        case 'subscribe':
          activeId = msg.id
          for (const data of pending.splice(0)) {
            deliver(data)
          }
          break
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }))
          break
        case 'complete':
          if (msg.id === activeId) {
            activeId = undefined
          }
          break
      }
    })
  })

  return (data) => {
    if (socket && activeId !== undefined) {
      deliver(data)
    } else {
      pending.push(data)
    }
  }
}
