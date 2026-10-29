import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  liveUpdates,
  liveUpdatesListeners,
  nextLiveUpdates,
  reconnectCount,
  retryDelay,
  retryNow,
  waitBeforeRetry,
  type LiveUpdatesState,
} from '#src/graphql/live-updates'

// Resolves to whether the wait has ended once `ms` more have passed.
const waitEndsWithin = async (wait: Promise<void>, ms: number) => {
  let ended = false
  wait.then(() => {
    ended = true
  })
  await vi.advanceTimersByTimeAsync(ms)
  return ended
}

beforeEach(() => {
  reconnectCount(0)
  vi.useFakeTimers()
  vi.setSystemTime(0)
  liveUpdates({ status: 'connecting', since: 0 })
})

afterEach(() => {
  vi.useRealTimers()
})

test('the wait before reconnecting doubles from 1 s and stops at 30 s', () => {
  const waits = [0, 1, 2, 3, 4, 5, 6, 50].map((retries) => retryDelay(retries))

  expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
})

test('the wait before a reconnect runs its delay plus up to 1 s', async () => {
  const wait = waitBeforeRetry(2)

  expect(await waitEndsWithin(wait, 3999)).toBe(false)
  expect(await waitEndsWithin(wait, 1001)).toBe(true)
})

test('trying now ends a pending wait at once', async () => {
  const wait = waitBeforeRetry(5)

  retryNow()

  expect(await waitEndsWithin(wait, 0)).toBe(true)
})

test('a first connect goes live from the time it connected', () => {
  vi.setSystemTime(1000)
  const connecting = nextLiveUpdates(liveUpdates(), { type: 'subscribed' })
  vi.setSystemTime(1500)
  const live = nextLiveUpdates(connecting, { type: 'connected' })

  expect(connecting).toEqual({ status: 'connecting', since: 1000 })
  expect(live).toEqual({ status: 'live', since: 1500 })
})

test('a drop is lost from its first wait through every failed retry', () => {
  const listeners = liveUpdatesListeners(vi.fn())
  listeners.connected({}, undefined, false)

  // The socket drops, and graphql-ws waits before it tries again
  vi.setSystemTime(10_000)
  listeners.closed()
  waitBeforeRetry(0)
  expect(liveUpdates()).toEqual({ status: 'reconnecting', since: 10_000 })

  // A retry fails
  vi.setSystemTime(12_000)
  listeners.closed()
  waitBeforeRetry(1)
  expect(liveUpdates()).toEqual({ status: 'reconnecting', since: 10_000 })
})

test('a connect marks a try under way only while reconnecting', () => {
  const listeners = liveUpdatesListeners(vi.fn())

  // The first connect
  listeners.connecting()
  expect(liveUpdates()).toEqual({ status: 'connecting', since: 0 })

  // A drop, its wait, then the retry
  listeners.connected({}, undefined, false)
  vi.setSystemTime(10_000)
  listeners.closed()
  waitBeforeRetry(0)
  listeners.connecting()
  expect(liveUpdates()).toEqual({
    status: 'reconnecting',
    since: 10_000,
    trying: true,
  })
})

test('a try that fails ends when the next wait starts', () => {
  const listeners = liveUpdatesListeners(vi.fn())
  liveUpdates({ status: 'reconnecting', since: 10_000, trying: true })

  listeners.closed()
  waitBeforeRetry(1)

  expect(liveUpdates()).toEqual({ status: 'reconnecting', since: 10_000 })
})

test('a reconnect goes live again and keeps the last push', () => {
  const lost: LiveUpdatesState = {
    status: 'reconnecting',
    since: 10_000,
    lastPushAt: 5000,
  }

  vi.setSystemTime(20_000)
  const live = nextLiveUpdates(lost, { type: 'connected' })

  expect(live).toEqual({ status: 'live', since: 20_000, lastPushAt: 5000 })
})

test('a try that connects goes live with no try under way', () => {
  const trying: LiveUpdatesState = {
    status: 'reconnecting',
    since: 10_000,
    trying: true,
  }

  vi.setSystemTime(20_000)
  const live = nextLiveUpdates(trying, { type: 'connected' })

  expect(live).toEqual({ status: 'live', since: 20_000 })
})

test('graphql-ws closing a socket nothing uses reads as connecting, not lost', () => {
  const live: LiveUpdatesState = { status: 'live', since: 0 }

  vi.setSystemTime(3000)
  const closed = nextLiveUpdates(live, { type: 'closed' })

  expect(closed).toEqual({ status: 'connecting', since: 3000 })
})

test('a failed subscription stops live updates', () => {
  const lost: LiveUpdatesState = { status: 'reconnecting', since: 0 }

  vi.setSystemTime(3000)
  const failed = nextLiveUpdates(lost, { type: 'failed' })

  expect(failed).toEqual({ status: 'stopped', since: 3000 })
})

test('graphql-ws closing a refused socket leaves live updates stopped', () => {
  const stopped: LiveUpdatesState = { status: 'stopped', since: 3000 }

  vi.setSystemTime(3100)
  const closed = nextLiveUpdates(stopped, { type: 'closed' })

  expect(closed).toEqual(stopped)
})

test('a push records its time and leaves the status alone', () => {
  const live: LiveUpdatesState = { status: 'live', since: 0 }

  vi.setSystemTime(4000)
  const pushed = nextLiveUpdates(live, { type: 'pushed' })

  expect(pushed).toEqual({ status: 'live', since: 0, lastPushAt: 4000 })
})

test('opening a proposal on a live socket forgets the last push and counts from then', () => {
  const live: LiveUpdatesState = { status: 'live', since: 0, lastPushAt: 4000 }

  vi.setSystemTime(9000)
  const opened = nextLiveUpdates(live, { type: 'subscribed' })

  expect(opened).toEqual({ status: 'live', since: 9000 })
})

test('opening a proposal during an outage keeps when it was lost and the try under way', () => {
  const lost: LiveUpdatesState = {
    status: 'reconnecting',
    since: 10_000,
    lastPushAt: 5000,
    trying: true,
  }

  vi.setSystemTime(20_000)
  const opened = nextLiveUpdates(lost, { type: 'subscribed' })

  expect(opened).toEqual({
    status: 'reconnecting',
    since: 10_000,
    trying: true,
  })
})

test('opening a proposal after live updates stopped connects afresh', () => {
  const stopped: LiveUpdatesState = { status: 'stopped', since: 0 }

  vi.setSystemTime(9000)
  const opened = nextLiveUpdates(stopped, { type: 'subscribed' })

  expect(opened).toEqual({ status: 'connecting', since: 9000 })
})

test('a reconnect raises the reconnect count once, at its first push', () => {
  const listeners = liveUpdatesListeners(vi.fn())

  // First connect and push
  listeners.connected({}, undefined, false)
  listeners.message({ type: 'next' })
  expect(reconnectCount()).toBe(0)

  // Reconnect, with only a pong so far
  listeners.connected({}, undefined, true)
  listeners.message({ type: 'pong' })
  expect(reconnectCount()).toBe(0)

  // The first push after the reconnect
  listeners.message({ type: 'next' })
  expect(reconnectCount()).toBe(1)

  // A later push
  listeners.message({ type: 'next' })
  expect(reconnectCount()).toBe(1)
})

test('a ping left unanswered for 20 s ends the connection', () => {
  const terminate = vi.fn()
  const listeners = liveUpdatesListeners(terminate)

  listeners.ping(false)

  // Just short of 20 s
  vi.advanceTimersByTime(19_999)
  expect(terminate).not.toHaveBeenCalled()

  // At 20 s
  vi.advanceTimersByTime(1)
  expect(terminate).toHaveBeenCalledOnce()
})

test('a pong received in time keeps the connection', () => {
  const terminate = vi.fn()
  const listeners = liveUpdatesListeners(terminate)

  // A pong just before 20 s
  listeners.ping(false)
  vi.advanceTimersByTime(19_999)
  listeners.pong(true)
  vi.advanceTimersByTime(1)
  expect(terminate).not.toHaveBeenCalled()

  // The next ping goes unanswered
  listeners.ping(false)
  vi.advanceTimersByTime(20_000)
  expect(terminate).toHaveBeenCalledOnce()
})

test('a ping sent before a drop does not end the next connection', () => {
  const terminate = vi.fn()
  const listeners = liveUpdatesListeners(terminate)

  // A ping, then the drop
  listeners.ping(false)
  listeners.closed()
  vi.advanceTimersByTime(20_000)
  expect(terminate).not.toHaveBeenCalled()

  // A ping on the next connection
  listeners.ping(false)
  vi.advanceTimersByTime(20_000)
  expect(terminate).toHaveBeenCalledOnce()
})
