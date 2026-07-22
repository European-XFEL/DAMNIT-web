import { expect, test } from 'vitest'

import { pageRangeForRegion } from '#src/features/table/pagination'

const region = (y: number, height: number) => ({ x: 0, y, width: 0, height })

test('returns the padded page window for a scroll region', () => {
  // Rows 100-150 live on pages 11-16 (1-based); the window adds a page of
  // overscan on each side so rows are loaded before they scroll into view.
  expect(pageRangeForRegion(region(100, 50), 10)).toEqual([
    10, 11, 12, 13, 14, 15, 16, 17,
  ])
})

test('pins the first page at the top boundary', () => {
  // At the top of the table the upward overscan is clamped: the window never
  // asks for a page below page 1.
  expect(pageRangeForRegion(region(0, 20), 10)).toEqual([1, 2, 3, 4])
})
