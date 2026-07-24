import { range } from '@mantine/hooks'

import type { Rectangle } from './types'

// The pages to ensure-loaded for a scroll window, padding half a page on each
// side so rows just outside the viewport are ready before they scroll in. The
// runs hook fetches each page once and the field policy accumulates them, so a
// page that has scrolled off stays loaded.
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
