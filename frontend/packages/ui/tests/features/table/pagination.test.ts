import { describe, expect, test } from 'vitest'

import {
  pageRangeForRegion,
  pagesForRegion,
} from '#src/features/table/pagination'

const region = (y: number, height: number) => ({ x: 0, y, width: 0, height })

describe('pageRangeForRegion', () => {
  test('returns the padded page window for a scroll region', () => {
    // Rows 100-150 live on pages 11-16 (1-based); the window adds a page of
    // overscan on each side so rows are loaded before they scroll into view.
    expect(pageRangeForRegion(region(100, 50), 10)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17,
    ])
  })

  test('pins the first page at the top boundary', () => {
    // At the top of the table the upward overscan is clamped: the window
    // never asks for a page below page 1.
    expect(pageRangeForRegion(region(0, 20), 10)).toEqual([1, 2, 3, 4])
  })
})

describe('pagesForRegion', () => {
  test('wants the pages a first scroll window needs', () => {
    expect(pagesForRegion([], region(0, 20), 10)).toEqual([1, 2, 3, 4])
  })

  test('drops the pages scrolled away from', () => {
    const top = pagesForRegion([], region(0, 20), 10)

    // Only the window is wanted. The rows left behind keep rendering from the
    // table slice, so holding their loaders mounted would buy nothing but a
    // watcher per page scrolled past for the life of the proposal.
    expect(pagesForRegion(top, region(100, 50), 10)).toEqual([
      10, 11, 12, 13, 14, 15, 16, 17,
    ])
  })

  test('returns the same array when the window is unchanged', () => {
    const pages = pagesForRegion([], region(0, 20), 10)

    // Identity, not just equality: an unchanged reference is what lets React
    // bail out instead of rebuilding every loader on each scroll event.
    expect(pagesForRegion(pages, region(1, 18), 10)).toBe(pages)
  })
})
