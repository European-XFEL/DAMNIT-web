import { useCallback, useState } from 'react'

import { pagesForRegion } from './pagination'
import type { Rectangle } from './types'

type UsePaginationOptions = {
  enabled?: boolean
  pageSize?: number
}

// Decides which pages the table wants loaded as it scrolls; rendering a
// TablePageLoader per page is what fetches them. Switching proposals remounts
// the whole subtree (see ProposalRoute's key), so the wanted set never needs
// clearing here.
export const usePagination = ({
  enabled = true,
  pageSize = 10,
}: UsePaginationOptions = {}) => {
  const [pages, setPages] = useState<number[]>([])

  const onVisibleRegionChanged = useCallback(
    (region: Rectangle) => {
      if (!enabled) {
        return
      }
      // The grid reports a zero-size region before it has laid out. That
      // measures as page 1 alone, which would drop the window to a single page
      // and unmount the loaders for everything actually on screen.
      if (region.width === 0 || region.height === 0) {
        return
      }
      setPages((current) => pagesForRegion(current, region, pageSize))
    },
    [enabled, pageSize]
  )

  return { pages, onVisibleRegionChanged }
}
