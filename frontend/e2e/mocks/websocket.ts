import type { Page, WebSocketRoute } from '@playwright/test'

import {
  shapeCell,
  type Meta,
  type RunData,
} from '@damnit-frontend/shared/mocks'

// A subscription push, in the test's convenient shape: a run-keyed data map plus
// the table metadata. `deliver` translates it into the backend's `run_updates`
// wire payload (the identity trio on every run, run-identifier pairs, and a
// __typename on each object so Apollo normalizes it). `runs` and `metadata.runs`
// stay numeric to match the seed; `deliver` pairs them with the open proposal.
export type LatestData = {
  runs: Record<string, RunData['variables']>
  metadata: {
    runs: number[]
    variables: Meta['variables']
    tags?: Meta['tags']
  }
}

export type PushLatestData = (data: LatestData) => void

// Mock the app's graphql-ws connection. Playwright fully mocks the socket, so we
// play the graphql-transport-ws server by hand: acknowledge the init, remember
// the active subscription id, and answer pings. The subscription is never
// completed by us, so a test can push repeatedly onto the same id. Returns
// pushLatestData, which delivers a `next` shaped like the backend's run_updates
// payload so a test can drive a live table update.
//
// Delivery is not gated on the subscription's `since` cursor: the mock sends
// whatever is pushed, regardless of the timestamp the client subscribed with.
// The backend owns that cursor filtering and tests it directly, so it is out of
// scope here.
export async function mockWebSocket(
  page: Page,
  proposal: string
): Promise<PushLatestData> {
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

  const shapeRun = (run: number, variables: RunData['variables']) => ({
    __typename: 'DamnitRun',
    database: proposal,
    proposal,
    run,
    cells: Object.entries(variables).map(([name, variable]) =>
      shapeCell(name, variable)
    ),
  })

  const deliver = ({ runs, metadata }: LatestData) => {
    const timestamp = nextTimestamp()
    socket?.send(
      JSON.stringify({
        id: activeId,
        type: 'next',
        payload: {
          data: {
            run_updates: {
              __typename: 'RunUpdates',
              runs: Object.entries(runs).map(([run, variables]) =>
                shapeRun(Number(run), variables)
              ),
              metadata: {
                __typename: 'TableMeta',
                runs: metadata.runs.map((run) => ({
                  __typename: 'RunId',
                  proposal,
                  run,
                })),
                variables: metadata.variables,
                tags: metadata.tags ?? {},
                timestamp,
              },
              timestamp,
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
