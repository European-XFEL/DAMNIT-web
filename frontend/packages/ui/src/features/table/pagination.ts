import { range } from '@mantine/hooks'

import type { Rectangle } from './types'
import { sortedInsert, sortedSearch } from '../../utils/array'

// Tracks which table pages are in-flight or already loaded, so the pagination
// effect never requests the same page twice. Kept free of store/network
// imports so its logic can be unit-tested in Node.
export class Pages {
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

// The pages to ensure-loaded for a scroll window, padding half a page on each
// side so rows just outside the viewport are ready before they scroll in.
export function pageRangeForRegion(region: Rectangle, pageSize: number) {
  const firstPage = Math.max(
    0,
    Math.floor((region.y - pageSize / 2) / pageSize)
  )
  const lastPage = Math.floor(
    (region.y + region.height + pageSize / 2) / pageSize
  )
  return range(firstPage + 1, lastPage + 2)
}
