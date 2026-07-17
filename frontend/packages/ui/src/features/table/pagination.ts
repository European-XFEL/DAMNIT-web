import { range } from '@mantine/hooks'

import { isArrayEqual } from '#src/utils/array'

import type { Rectangle } from './types'

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

// The pages the table wants loaded: exactly the current window, nothing more.
// Rows keep rendering once scrolled away from because they live in the table
// slice, which only a proposal switch clears, so a page needs a mounted loader
// only while it is on screen. Returns the array unchanged when the window is
// the same, so React bails out of the update rather than rebuilding the loader
// list on every scroll event.
export function pagesForRegion(
  current: number[],
  region: Rectangle,
  pageSize: number
): number[] {
  const next = pageRangeForRegion(region, pageSize)
  return isArrayEqual(current, next) ? current : next
}
