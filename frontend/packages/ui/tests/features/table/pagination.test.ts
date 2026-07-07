import { describe, expect, test } from 'vitest'

import { Pages, pageRangeForRegion } from '@/features/table/pagination'

describe('Pages', () => {
  test('a page marked loading reads as loading, not loaded', () => {
    const pages = new Pages()
    pages.addToLoading(3)
    expect(pages.isLoading(3)).toBe(true)
    expect(pages.isLoaded(3)).toBe(false)
  })

  test('moving a page to loaded clears its loading state', () => {
    const pages = new Pages()
    pages.addToLoading(3)
    pages.addToLoaded(3)
    expect(pages.isLoaded(3)).toBe(true)
    expect(pages.isLoading(3)).toBe(false)
  })

  test('duplicate inserts are not double-counted', () => {
    const pages = new Pages()
    pages.addToLoading(3)
    pages.addToLoading(3)
    // A single loading entry means addToLoaded removes it cleanly, leaving
    // nothing behind as still-loading.
    pages.addToLoaded(3)
    expect(pages.isLoading(3)).toBe(false)
    expect(pages.isLoaded(3)).toBe(true)
  })
})

describe('pageRangeForRegion', () => {
  test('returns the padded page window for a scroll region', () => {
    // Rows 100-150 live on pages 11-16 (1-based); the window adds a page of
    // overscan on each side so rows are loaded before they scroll into view.
    expect(
      pageRangeForRegion({ x: 0, y: 100, width: 0, height: 50 }, 10)
    ).toEqual([10, 11, 12, 13, 14, 15, 16, 17])
  })

  test('pins the first page at the top boundary', () => {
    // At the top of the table the upward overscan is clamped: the window
    // never asks for a page below page 1.
    expect(
      pageRangeForRegion({ x: 0, y: 0, width: 0, height: 20 }, 10)
    ).toEqual([1, 2, 3, 4])
  })
})
