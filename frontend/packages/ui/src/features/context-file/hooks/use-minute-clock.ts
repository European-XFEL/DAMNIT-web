import { useSyncExternalStore } from 'react'

import { MINUTE } from '#src/utils/time'

const listeners = new Set<() => void>()
let timeout: ReturnType<typeof setTimeout> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (listeners.size === 1) {
    scheduleTick()
  }

  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      clearTimeout(timeout)
    }
  }
}

function scheduleTick() {
  timeout = setTimeout(tick, MINUTE - (Date.now() % MINUTE))
}

function tick() {
  scheduleTick()
  for (const listener of listeners) {
    listener()
  }
}

function getSnapshot() {
  return Math.floor(Date.now() / MINUTE) * MINUTE
}

// The current time in milliseconds, rounded down to the minute. One timer that
// every caller shares moves it on at the start of each minute.
export function useMinuteClock() {
  return useSyncExternalStore(subscribe, getSnapshot)
}
