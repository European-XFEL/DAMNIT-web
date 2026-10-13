import { makeVar } from '@apollo/client'

// Goes up each time live updates come back after a drop, for the views a push
// does not refresh. Not in `apollo.ts`, which builds the client on import.
export const reconnectCount = makeVar(0)

export const countReconnect = () => reconnectCount(reconnectCount() + 1)

const FIRST_RETRY_DELAY = 1000
const LONGEST_RETRY_DELAY = 30_000
// Not the 5 s graphql-ws suggests: a preview read stalls the API longer.
const PONG_WAIT = 20_000

// Milliseconds to wait before reconnecting. `retries` is 0 on the first try
// after a drop.
export function retryDelay(retries: number): number {
  return Math.min(FIRST_RETRY_DELAY * 2 ** retries, LONGEST_RETRY_DELAY)
}

export function liveUpdatesListeners(terminate: () => void) {
  let pongTimeout: ReturnType<typeof setTimeout> | undefined
  let reloadPending = false

  return {
    connected: (_socket: unknown, _payload: unknown, wasRetry: boolean) => {
      reloadPending = wasRetry
    },
    // Ask again for what changed during the gap once the first push shows the
    // server has set its cursor: a restarted API sets it a second after the ack.
    message: (message: { type: string }) => {
      if (reloadPending && message.type === 'next') {
        reloadPending = false
        countReconnect()
      }
    },
    ping: (received: boolean) => {
      if (!received) {
        pongTimeout = setTimeout(terminate, PONG_WAIT)
      }
    },
    pong: (received: boolean) => {
      if (received) {
        clearTimeout(pongTimeout)
      }
    },
    closed: () => clearTimeout(pongTimeout),
  }
}
