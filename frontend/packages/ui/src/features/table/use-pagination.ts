import { useCallback, useEffect, useRef, useState } from 'react'

import { range } from '@mantine/hooks'

import { getDeferredTable } from '../../data/table/table-data.thunks'
import { getTable } from '../../data/table'
import { useAppDispatch } from '../../redux/hooks'
import { sortedInsert, sortedSearch } from '../../utils/array'

class Pages {
  private loading: number[]
  private loaded: number[]

  constructor() {
    this.loading = []
    this.loaded = []
  }

  addToLoading(page: number) {
    sortedInsert(this.loading, page)
  }

  isLoading(page: number) {
    return sortedSearch(this.loading, page) !== -1
  }

  addToLoaded(page: number) {
    // Remove from loading
    const index = sortedSearch(this.loading, page)
    if (index !== -1) {
      this.loading.splice(index, 1)
    }

    sortedInsert(this.loaded, page)
  }

  isLoaded(page: number) {
    return sortedSearch(this.loaded, page) !== -1
  }
}

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

type UsePaginationOptions = {
  proposal: string
  enabled?: boolean
  pageSize?: number
}

export const usePagination = ({
  proposal,
  enabled = true,
  pageSize = 10,
}: UsePaginationOptions) => {
  const dispatch = useAppDispatch()

  // Reference: Loaded pages
  const pagesRef = useRef(new Pages())

  // State: Visible pages
  const [visibleRegion, setVisibleRegion] = useState<Rect>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  })

  // Callback: Handle new page
  const handleNewPage = useCallback(
    async (page: number) => {
      if (!proposal || page <= 0) {
        return false
      }

      try {
        await dispatch(getDeferredTable({ proposal, page, pageSize }))
        return true
      } catch (error) {
        console.error('Failed to load data:', error)
        return false
      }
    },
    [proposal, dispatch, pageSize]
  )

  // Callback: On visible region changed
  const onVisibleRegionChanged = useCallback((rect: Rect) => {
    setVisibleRegion(rect)
  }, [])

  const loadPage = useCallback(
    async (page: number) => {
      // TODO: Add a retry when loading pages are stuck for quite some time
      const pages = pagesRef.current

      if (pages.isLoading(page) || pages.isLoaded(page)) {
        return
      }

      pages.addToLoading(page)
      const loaded = await handleNewPage(page)
      if (loaded) {
        pages.addToLoaded(page)
      }
    },
    [handleNewPage]
  )

  // Effect: Trigger load page when visible region changes
  useEffect(() => {
    if (!proposal) {
      return
    }

    if (!enabled) {
      dispatch(getTable({ proposal, pageSize: 10000 }))
      return
    }

    if (visibleRegion.width === 0 || visibleRegion.height === 0) {
      return
    }

    const firstPage = Math.max(
      0,
      Math.floor((visibleRegion.y - pageSize / 2) / pageSize)
    )
    const lastPage = Math.floor(
      (visibleRegion.y + visibleRegion.height + pageSize / 2) / pageSize
    )
    range(firstPage + 1, lastPage + 2).map((page) => {
      if (!pagesRef.current.isLoaded(page)) {
        loadPage(page)
      }
    })
  }, [loadPage, pageSize, visibleRegion, proposal, enabled, dispatch])

  return { onVisibleRegionChanged }
}
