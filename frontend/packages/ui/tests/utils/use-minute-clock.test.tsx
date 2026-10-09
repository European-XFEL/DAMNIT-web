import { renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { useMinuteClock } from '#src/utils/use-minute-clock'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

test('a clock mounted after an idle hour reads the current minute', async () => {
  vi.setSystemTime(Date.UTC(2026, 9, 7, 14, 0, 30))
  const first = await renderHook(() => useMinuteClock())
  await first.unmount()
  vi.setSystemTime(Date.UTC(2026, 9, 7, 15, 0, 30))

  const { result } = await renderHook(() => useMinuteClock())

  expect(result.current).toBe(Date.UTC(2026, 9, 7, 15, 0))
})

test('a mounted clock moves on at the start of the next minute', async () => {
  // Mounted half a minute in
  vi.setSystemTime(Date.UTC(2026, 9, 7, 14, 0, 30))
  const { result } = await renderHook(() => useMinuteClock())
  expect(result.current).toBe(Date.UTC(2026, 9, 7, 14, 0))

  // Half a minute later
  await vi.advanceTimersByTimeAsync(30_000)
  expect(result.current).toBe(Date.UTC(2026, 9, 7, 14, 1))
})
