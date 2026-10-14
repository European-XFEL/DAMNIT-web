import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import {
  liveUpdatesListeners,
  reconnectCount,
  retryDelay,
} from '#src/graphql/live-updates'

beforeEach(() => {
  reconnectCount(0)
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

test('the wait before reconnecting doubles from 1 s and stops at 30 s', () => {
  const waits = [0, 1, 2, 3, 4, 5, 6, 50].map((retries) => retryDelay(retries))

  expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
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
