import { useCallback, useEffect, useRef } from 'react'

import type { Point } from '#src/features/table/types/table.types'

// Glide re-checks the hovered cell only on a mousemove. Send one at the last
// cursor point a frame from now, once whatever covered that point has gone.
export function useRehoverAtCursor() {
  const cursorRef = useRef<Point | null>(null)
  const frameRef = useRef(0)

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      cursorRef.current = { x: event.clientX, y: event.clientY }
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    return () => {
      window.removeEventListener('mousemove', onMove)
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return useCallback(() => {
    const cursor = cursorRef.current
    if (!cursor) {
      return
    }

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      const target = document.elementFromPoint(cursor.x, cursor.y)
      if (!target) {
        return
      }

      target.dispatchEvent(
        new MouseEvent('mousemove', {
          clientX: cursor.x,
          clientY: cursor.y,
          bubbles: true,
          cancelable: true,
          view: window,
        })
      )
    })
  }, [])
}
