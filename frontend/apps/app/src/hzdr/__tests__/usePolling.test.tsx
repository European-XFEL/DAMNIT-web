import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'

import { usePolling } from '../hooks'

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  setHidden(false)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  setHidden(false)
})

describe('usePolling', () => {
  it('polls at once and then every interval', async () => {
    const poll = vi.fn(() => Promise.resolve())
    renderHook(() => usePolling(poll, 1000))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(poll).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1000))
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('stops while the tab is hidden and polls again on return', async () => {
    const poll = vi.fn(() => Promise.resolve())
    renderHook(() => usePolling(poll, 1000))
    await act(() => vi.advanceTimersByTimeAsync(0))
    act(() => setHidden(true))
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(poll).toHaveBeenCalledTimes(1)
    act(() => setHidden(false))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(poll).toHaveBeenCalledTimes(2)
  })

  it('backs off on failures, up to the limit, and recovers', async () => {
    let fail = true
    const poll = vi.fn(() =>
      fail ? Promise.reject(new Error('down')) : Promise.resolve()
    )
    renderHook(() => usePolling(poll, 1000, { maxIntervalMs: 4000 }))
    await act(() => vi.advanceTimersByTimeAsync(0)) // 1st, fails: wait 2 s
    await act(() => vi.advanceTimersByTimeAsync(1999))
    expect(poll).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1)) // 2nd, fails: wait 4 s
    await act(() => vi.advanceTimersByTimeAsync(4000)) // 3rd, capped at 4 s
    expect(poll).toHaveBeenCalledTimes(3)
    fail = false
    await act(() => vi.advanceTimersByTimeAsync(4000)) // 4th succeeds
    await act(() => vi.advanceTimersByTimeAsync(1000)) // back to 1 s
    expect(poll).toHaveBeenCalledTimes(5)
  })

  it('does nothing when disabled and stops on unmount', async () => {
    const poll = vi.fn(() => Promise.resolve())
    const { rerender, unmount } = renderHook(
      ({ enabled }) => usePolling(poll, 1000, { enabled }),
      { initialProps: { enabled: false } }
    )
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(poll).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(poll).toHaveBeenCalledTimes(1)
    unmount()
    await act(() => vi.advanceTimersByTimeAsync(5000))
    expect(poll).toHaveBeenCalledTimes(1)
  })
})
