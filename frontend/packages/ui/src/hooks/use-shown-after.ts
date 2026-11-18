import { useEffect, useState } from 'react'

// Most tries end well under a second, and a loader for that long would only
// flicker.
export const LOADER_DELAY = 1000

// A view's code mostly lands within this, so a quick move never flashes a bar.
export const PENDING_DELAY = 150

// Whether `active` has held for `delay`. It drops back as soon as `active` does.
export function useShownAfter(active: boolean, { delay = LOADER_DELAY } = {}) {
  const [shown, setShown] = useState(false)

  if (shown && !active) {
    setShown(false)
  }

  useEffect(() => {
    if (!active) {
      return
    }

    const timeout = setTimeout(() => setShown(true), delay)

    return () => clearTimeout(timeout)
  }, [active, delay])

  return shown
}
