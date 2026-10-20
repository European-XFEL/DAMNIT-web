import type { Page, WebSocketRoute } from '@playwright/test'

import {
  SEED_TIMESTAMP_MS,
  shapeMetadata,
  shapeRun,
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
  // The server's current table metadata, changed or not. Like the backend,
  // `deliver` sends it only when this subscription has not seen it yet.
  metadata: {
    runs: number[]
    variables: Meta['variables']
    tags: Meta['tags']
    groups?: Meta['groups']
  }
}

export type LiveUpdatesMock = {
  // Deliver a graphql-ws `next` as the backend does for new table data: a new
  // run, an updated cell, or a deferred image resolving.
  pushLatestData: (data: LatestData) => void
  // Close the socket the way an API restart does, so graphql-ws reconnects.
  // With `refuse`, that many reconnects are closed too and the waits grow.
  dropLiveUpdates: (options?: { refuse?: number }) => Promise<void>
  // How many sockets the app has opened, refused ones included.
  connections: () => number
  // How many subscriptions the app has opened, refused ones included.
  subscriptions: () => number
  // Refuse the subscription, and every one after it, with a GraphQL error on
  // an open socket, as the API does when it turns the session away.
  refuseLiveUpdates: () => void
  // Complete the open subscription from the server's side, as the API does
  // when its stream of updates returns.
  endLiveUpdates: () => void
}

// The metadata half of a push. The client replaces its metadata wholesale, so a
// push that carries only the run list would drop the variables and tags the
// table is drawn from. Takes them from the example under test rather than a
// fixed one, so a spec that switches examples pushes the matching snapshot.
export function fullMetadata(
  meta: Pick<Meta, 'variables' | 'tags'>,
  runs: number[]
): LatestData['metadata'] {
  return { runs, variables: meta.variables, tags: meta.tags }
}

// Mock the app's graphql-ws connection. Playwright fully mocks the socket, so we
// play the graphql-transport-ws server by hand: acknowledge the init, remember
// the active subscription id, and answer pings. The subscription stays open
// until a test ends or refuses it, so a test can push repeatedly onto it.
//
// Delivery is not gated on the subscription's `since` cursor: the mock sends
// whatever is pushed, regardless of the timestamp the client subscribed with.
// The backend owns that cursor filtering and tests it directly, so it is out of
// scope here.
export async function mockWebSocket(
  page: Page,
  proposal: string
): Promise<LiveUpdatesMock> {
  let socket: WebSocketRoute | undefined
  let activeId: string | undefined
  // Pushes made before the app has subscribed (the handshake can lag the grid
  // paint under load) wait here and are delivered in order the moment the
  // subscription opens, so a test never has to race the socket.
  const pending: LatestData[] = []
  let lastMetadata: string | undefined
  let refusalsLeft = 0
  let connections = 0
  let subscriptions = 0
  let refused = false

  // The backend stamps each push with an advancing epoch-ms timestamp, which the
  // app feeds back as its subscription cursor. Model that so the stored cursor
  // looks real; the exact value does not affect delivery.
  let clock = SEED_TIMESTAMP_MS
  const nextTimestamp = () => (clock += 1000)

  const deliver = ({ runs, metadata }: LatestData) => {
    const metadataJson = JSON.stringify(metadata)
    const metadataChanged = metadataJson !== lastMetadata
    if (Object.keys(runs).length === 0 && !metadataChanged) {
      return
    }

    lastMetadata = metadataJson
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
                shapeRun(variables, {
                  database: proposal,
                  proposal,
                  run: Number(run),
                })
              ),
              metadata: metadataChanged
                ? shapeMetadata(metadata, { proposal, timestamp })
                : null,
              timestamp,
            },
          },
        },
      })
    )
  }

  const refuseSubscription = (ws: WebSocketRoute, id: string) => {
    ws.send(
      JSON.stringify({
        id,
        type: 'error',
        payload: [{ message: 'Authentication required.' }],
      })
    )
  }

  await page.routeWebSocket('**/graphql', (ws) => {
    connections += 1
    if (refusalsLeft > 0) {
      refusalsLeft -= 1
      ws.close({ code: 1012 })
      return
    }
    socket = ws
    ws.onMessage((message) => {
      const msg = JSON.parse(String(message))
      switch (msg.type) {
        case 'connection_init':
          ws.send(JSON.stringify({ type: 'connection_ack' }))
          break
        case 'subscribe':
          subscriptions += 1
          if (refused) {
            refuseSubscription(ws, msg.id)
            break
          }

          activeId = msg.id
          lastMetadata = undefined
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

  return {
    pushLatestData: (data) => {
      if (socket && activeId !== undefined) {
        deliver(data)
      } else {
        pending.push(data)
      }
    },
    dropLiveUpdates: async ({ refuse = 0 } = {}) => {
      refusalsLeft = refuse
      activeId = undefined
      await socket?.close({ code: 1012, reason: 'Service Restart' })
    },
    connections: () => connections,
    subscriptions: () => subscriptions,
    refuseLiveUpdates: () => {
      refused = true
      if (socket && activeId !== undefined) {
        refuseSubscription(socket, activeId)
        activeId = undefined
      }
    },
    endLiveUpdates: () => {
      if (socket && activeId !== undefined) {
        socket.send(JSON.stringify({ id: activeId, type: 'complete' }))
        activeId = undefined
      }
    },
  }
}
