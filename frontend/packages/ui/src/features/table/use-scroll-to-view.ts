import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { debounce } from 'lodash'
import { type DataEditorRef } from '@glideapps/glide-data-grid'

import { setActive, setViewScroll } from './table.slice'
import type { Rectangle, Scroll } from './types'
import { useAppDispatch, useAppStore } from '#src/app/store/hooks'

export function useScrollToView(ref: RefObject<DataEditorRef>) {
  const dispatch = useAppDispatch()
  const store = useAppStore() // Get values from store without watching the changes

  const initialBoundsRef = useRef<Scroll>()
  const [initialScroll] = useState<Scroll>(store.getState().table.view.scroll)

  // Use a memoized debounced handler
  const setViewScrollDebounced = useMemo(
    () =>
      debounce((scroll: Scroll) => {
        // React runs a removed subtree's parent cleanup before the child's, so
        // leaving a proposal resets this slice (clearing isActive) before this
        // flush runs. Bail so we don't resave stale scroll. A tab switch leaves
        // the proposal mounted, so isActive stays true and the scroll is kept.
        if (!store.getState().table.isActive) {
          return
        }
        dispatch(setViewScroll(scroll))
      }, 500),
    [dispatch, store]
  )

  // Mark the table active for the guard above, then on unmount (e.g. switching
  // tabs) flush any pending scroll save instead of cancelling it, so a scroll
  // followed by a fast tab switch is not lost.
  useEffect(() => {
    dispatch(setActive(true))
    return () => {
      setViewScrollDebounced.flush()
    }
  }, [dispatch, setViewScrollDebounced])

  // Don't expose the debounced function, wrap it instead
  const onVisibleRegionChanged = useCallback(
    (_: Rectangle) => {
      const bounds = ref.current?.getBounds()
      if (!bounds) {
        // Not rendered yet
        return
      }

      if (!initialBoundsRef.current) {
        initialBoundsRef.current = { x: bounds.x, y: bounds.y }
        return
      }

      const { x: x0, y: y0 } = initialBoundsRef.current
      setViewScrollDebounced({ x: x0 - bounds.x, y: y0 - bounds.y })
    },
    [setViewScrollDebounced, ref]
  )

  return {
    onVisibleRegionChanged,
    scrollX: initialScroll.x,
    scrollY: initialScroll.y,
  }
}
