import { useEffect, useRef, useState } from 'react'

import type { RuntimeConfig } from './types'

export function useRuntimeConfig() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>()

  useEffect(() => {
    fetch('/config/runtime')
      .then((response) => response.json())
      .then(setRuntimeConfig)
  }, [])

  return runtimeConfig
}

/**
 * Call `poll` now and then every `intervalMs`, the next call only after the
 * last one settled. While the tab is hidden nothing is polled; on return it
 * polls at once. A rejected poll doubles the wait, up to `maxIntervalMs`,
 * and the first success brings it back to `intervalMs`.
 */
export function usePolling(
  poll: () => Promise<unknown>,
  intervalMs: number,
  {
    enabled = true,
    maxIntervalMs = 60_000,
  }: { enabled?: boolean; maxIntervalMs?: number } = {}
) {
  const pollRef = useRef(poll)
  useEffect(() => {
    pollRef.current = poll
  }, [poll])

  useEffect(() => {
    if (!enabled) return
    let timer: number | undefined
    let cancelled = false
    let running = false
    let delay = intervalMs

    const schedule = () => {
      if (cancelled || document.hidden) return
      timer = window.setTimeout(tick, delay)
    }
    const tick = async () => {
      timer = undefined
      if (running || cancelled) return
      running = true
      try {
        await pollRef.current()
        delay = intervalMs
      } catch {
        delay = Math.min(delay * 2, maxIntervalMs)
      } finally {
        running = false
      }
      schedule()
    }
    const onVisibility = () => {
      if (document.hidden) {
        window.clearTimeout(timer)
        timer = undefined
      } else if (timer === undefined && !running) {
        void tick()
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    void tick()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled, intervalMs, maxIntervalMs])
}
