import { useEffect, useState } from 'react'

// Most tries end well under a second, and a loader for that long would only
// flicker.
export const LOADER_DELAY = 1000

// Whether `active` has held for LOADER_DELAY. It drops back as soon as `active`
// does.
export function useShownAfter(active: boolean) {
  const [shown, setShown] = useState(false)

  if (shown && !active) {
    setShown(false)
  }

  useEffect(() => {
    if (!active) {
      return
    }

    const timeout = setTimeout(() => setShown(true), LOADER_DELAY)

    return () => clearTimeout(timeout)
  }, [active])

  return shown
}
