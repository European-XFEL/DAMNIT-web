import { makeVar } from '@apollo/client'

// Goes up each time live updates come back after a drop, for the views a push
// does not refresh. Not in `apollo.ts`, which builds the client on import.
export const reconnectCount = makeVar(0)

export const countReconnect = () => reconnectCount(reconnectCount() + 1)

export type LiveUpdatesStatus =
  'connecting' | 'live' | 'reconnecting' | 'stopped' | 'off'

export type LiveUpdatesState = {
  status: LiveUpdatesStatus
  // When the status began. Live counts from when the proposal opened instead,
  // if it opened later on a socket that was already live.
  since: number
  lastPushAt?: number
}

export type LiveUpdatesEvent =
  | { type: 'subscribed' }
  | { type: 'waiting' }
  | { type: 'connected' }
  | { type: 'closed' }
  | { type: 'pushed' }
  | { type: 'failed' }
  | { type: 'disabled' }

export const liveUpdates = makeVar<LiveUpdatesState>({
  status: 'connecting',
  since: Date.now(),
})

export function nextLiveUpdates(
  state: LiveUpdatesState,
  event: LiveUpdatesEvent
): LiveUpdatesState {
  const now = Date.now()

  // graphql-ws closes a refused socket with 1000 itself, after the failure.
  if (state.status === 'stopped' && event.type !== 'subscribed') {
    return state
  }

  switch (event.type) {
    case 'subscribed':
      // Each proposal counts its changes from when it opened. A socket still
      // retrying keeps the time it was lost; a refused one gets a fresh try.
      if (state.status === 'reconnecting') {
        return { status: 'reconnecting', since: state.since }
      }

      return {
        status: state.status === 'live' ? 'live' : 'connecting',
        since: now,
      }
    case 'waiting':
      // Each failed retry waits again, and keeps the time of the first loss.
      if (state.status === 'reconnecting') {
        return state
      }

      return { ...state, status: 'reconnecting', since: now }
    case 'closed':
      // Every loss goes through graphql-ws's retry wait. A close without one is
      // graphql-ws leaving a socket nothing uses, or reconnecting at once.
      if (state.status === 'reconnecting') {
        return state
      }

      return { ...state, status: 'connecting', since: now }
    case 'connected':
      return { ...state, status: 'live', since: now }
    case 'pushed':
      return { ...state, lastPushAt: now }
    case 'failed':
      return { ...state, status: 'stopped', since: now }
    case 'disabled':
      return { status: 'off', since: now }
  }
}

export function recordLiveUpdatesEvent(event: LiveUpdatesEvent) {
  liveUpdates(nextLiveUpdates(liveUpdates(), event))
}

const FIRST_RETRY_DELAY = 1000
export const LONGEST_RETRY_DELAY = 30_000
// Not the 5 s graphql-ws suggests: a preview read stalls the API longer.
const PONG_WAIT = 20_000

// Milliseconds to wait before reconnecting. `retries` is 0 on the first try
// after a drop.
export function retryDelay(retries: number): number {
  return Math.min(FIRST_RETRY_DELAY * 2 ** retries, LONGEST_RETRY_DELAY)
}

let endPendingWait = () => {}

export function waitBeforeRetry(retries: number): Promise<void> {
  recordLiveUpdatesEvent({ type: 'waiting' })

  return new Promise((resolve) => {
    // Up to 1 s of spread, so the open tabs do not all reconnect at once.
    setTimeout(resolve, retryDelay(retries) + Math.random() * 1000)
    endPendingWait = resolve
  })
}

export function retryNow() {
  endPendingWait()
}

export function liveUpdatesListeners(terminate: () => void) {
  let pongTimeout: ReturnType<typeof setTimeout> | undefined
  let reloadPending = false

  return {
    connected: (_socket: unknown, _payload: unknown, wasRetry: boolean) => {
      recordLiveUpdatesEvent({ type: 'connected' })
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
    closed: () => {
      clearTimeout(pongTimeout)
      recordLiveUpdatesEvent({ type: 'closed' })
    },
  }
}
