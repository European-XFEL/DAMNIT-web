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

  return {
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
