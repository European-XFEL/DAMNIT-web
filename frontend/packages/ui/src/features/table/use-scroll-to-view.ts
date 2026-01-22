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

import { setViewScroll } from './table.slice'
import type { Rectangle, Scroll } from './types'
import { useAppDispatch, useAppStore } from '../../redux/hooks'

export function useScrollToView(ref: RefObject<DataEditorRef>) {
  const dispatch = useAppDispatch()
  const store = useAppStore() // Get values from store without watching the changes

  const initialBoundsRef = useRef<Scroll>()
  const [initialScroll] = useState<Scroll>(store.getState().table.view.scroll)

  // Use a memoized debounced handler
  const setViewScrollDebounced = useMemo(
    () =>
      debounce((scroll: Scroll) => {
        dispatch(setViewScroll(scroll))
      }, 500),
    [dispatch]
  )

  // Clean up: Debounce
  useEffect(() => {
    return () => {
      setViewScrollDebounced.cancel()
    }
  }, [setViewScrollDebounced])

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
